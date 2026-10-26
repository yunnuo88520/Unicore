// Author: yunnuo <ymz@ebox.vip>
// Description: The same upgrade, token, mail retry and credential-race checks run on all dialects.
package platformsql

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	mailadapter "github.com/yunnuo/unicore/internal/adapter/mail"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/mailer"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/secret"
	"github.com/yunnuo/unicore/internal/settings"
	"github.com/yunnuo/unicore/internal/testutil"
)

func exerciseMailLifecycle(t *testing.T, ctx context.Context, store *sqlstore.Store, repository *Repository, admin contracts.User) {
	t.Helper()
	// Recreate the exact M2a schema level without touching its users, sessions or settings.
	for _, query := range []string{"DROP TABLE email_challenges", "DELETE FROM schema_migrations WHERE version=4", "DROP TABLE mail_jobs", "DROP TABLE account_tokens", "DELETE FROM schema_migrations WHERE version=3"} {
		if _, err := store.DB.ExecContext(ctx, query); err != nil {
			t.Fatal(err)
		}
	}
	if err := store.Migrate(ctx, true); err != nil {
		t.Fatal("M2a upgrade failed", err)
	}
	if err := store.Migrate(ctx, true); err != nil {
		t.Fatal("upgrade retry failed", err)
	}
	if account, err := repository.FindAccount(ctx, "admin"); err != nil || account.User.ID != admin.ID {
		t.Fatal("upgrade lost M2a user", err)
	}
	smtp, err := testutil.StartSMTP()
	if err != nil {
		t.Fatal(err)
	}
	defer smtp.Close()
	host, port, _ := net.SplitHostPort(smtp.Listener.Addr().String())
	key, err := secret.Open(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	config := &settings.Service{Store: store, Profile: "web-platform", Secrets: key}
	_, err = config.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "mail.host", Value: host}, {Key: "mail.port", Value: port}, {Key: "mail.tls", Value: "plain"}, {Key: "mail.from", Value: "sender@example.test"}, {Key: "mail.password", Value: "test-secret-never-returned"}}}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	mail := &mailer.Service{Store: repository, Settings: config, Secrets: key, Sender: mailadapter.SMTP{}}
	identity := platform.New(repository)
	accounts := &platform.Accounts{Identity: identity, Store: repository, Settings: config, Mail: mail, BaseURL: "http://localhost"}
	if err = mail.Test(ctx, "recipient@example.test", admin.ID); err != nil {
		t.Fatal("SMTP test failed", err)
	}
	_, err = config.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "account.registration_enabled", Value: "true"}, {Key: "account.password_reset_enabled", Value: "true"}}}, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	policy, err := accounts.Policy(ctx)
	if err != nil || !policy.RegistrationEnabled || !policy.RegisterCaptcha {
		t.Fatal("wrong policy", policy, err)
	}
	challenge := func() (string, string) {
		id, image := identity.Captchas.Create()
		data, _ := base64.StdEncoding.DecodeString(strings.Split(image, ",")[1])
		answer := ""
		for _, m := range regexp.MustCompile(`>([0-9])</text>`).FindAllStringSubmatch(string(data), -1) {
			answer += m[1]
		}
		return id, answer
	}
	id, answer := challenge()
	input := contracts.RegisterInput{Username: "newmember", Email: "newmember@example.test", Password: "new-password-strong", CaptchaID: id, CaptchaAnswer: answer}
	if err = accounts.Register(ctx, input, "test"); err != nil {
		t.Fatal(err)
	}
	if err = accounts.Register(ctx, input, "test"); !errors.Is(err, platform.ErrCaptcha) {
		t.Fatal("registration captcha replay accepted", err)
	}
	if _, _, err = identity.Login(ctx, contracts.LoginInput{Username: input.Username, Password: input.Password}, "test", false, 1); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal("pending account logged in", err)
	}
	var payload string
	if err = store.Row(ctx, store.DB, "SELECT payload FROM mail_jobs LIMIT 1").Scan(&payload); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(payload, "newmember") || strings.Contains(payload, "token=") {
		t.Fatal("mail payload persisted as plaintext")
	}
	now := int(time.Now().Unix())
	smtp.FailNext(1)
	if err = mail.Tick(ctx, now); err != nil {
		t.Fatal(err)
	}
	jobs, _ := repository.MailJobs(ctx)
	if len(jobs.Items) != 1 || jobs.Items[0].State != "pending" || jobs.Items[0].Attempts != 1 {
		t.Fatal("retry not scheduled", jobs)
	}
	if err = mail.Tick(ctx, now); err != nil {
		t.Fatal(err)
	}
	jobs, _ = repository.MailJobs(ctx)
	if jobs.Items[0].Attempts != 1 {
		t.Fatal("retried before due time")
	}
	if err = mail.Tick(ctx, now+11); err != nil {
		t.Fatal(err)
	}
	messages := smtp.Messages()
	if len(messages) != 2 {
		t.Fatal("retry failed", len(messages))
	}
	lastToken := func() string {
		messages := smtp.Messages()
		matches := regexp.MustCompile(`token=([A-Za-z0-9_-]{43})`).FindStringSubmatch(testutil.MailText(messages[len(messages)-1]))
		if len(matches) != 2 {
			t.Fatal("message link missing")
		}
		return matches[1]
	}
	verify := lastToken()
	if err = accounts.Complete(ctx, verify, "reset", "changed-password-strong", "test"); !errors.Is(err, platform.ErrAccountToken) {
		t.Fatal("token crossed purpose", err)
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for range 2 {
		wg.Add(1)
		go func() { defer wg.Done(); results <- accounts.Complete(ctx, verify, "verify", "", "test") }()
	}
	wg.Wait()
	close(results)
	winners := 0
	for result := range results {
		if result == nil {
			winners++
		} else if !errors.Is(result, platform.ErrAccountToken) {
			t.Fatal(result)
		}
	}
	if winners != 1 {
		t.Fatal("token consumed more than once", winners)
	}
	_, session, err := identity.Login(ctx, contracts.LoginInput{Username: input.Username, Password: input.Password}, "test", false, 1)
	if err != nil {
		t.Fatal(err)
	}
	before, err := repository.FindAccount(ctx, input.Username)
	if err != nil {
		t.Fatal(err)
	}
	request := func(email, purpose string) {
		id, answer := challenge()
		if err = accounts.Request(ctx, contracts.EmailRequest{Email: email, CaptchaID: id, CaptchaAnswer: answer}, "test", purpose); err != nil {
			t.Fatal(err)
		}
	}
	request("unknown@example.test", "reset")
	request(input.Email, "reset")
	if err = mail.Tick(ctx, now+12); err != nil {
		t.Fatal(err)
	}
	reset := lastToken()
	if err = accounts.Complete(ctx, reset, "reset", "changed-password-strong", "test"); err != nil {
		t.Fatal(err)
	}
	if _, err = identity.Session(ctx, session); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal("old session survived reset", err)
	}
	if err = repository.CreateSession(ctx, platform.Hash(platform.Token()), before.User.ID, now+3600, before.PasswordHash); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal("old-password login race created session", err)
	}
	if err = accounts.Complete(ctx, reset, "reset", "changed-password-strong", "test"); !errors.Is(err, platform.ErrAccountToken) {
		t.Fatal("reset replay succeeded", err)
	}
	if _, _, err = identity.Login(ctx, contracts.LoginInput{Username: input.Username, Password: "changed-password-strong"}, "test", false, 1); err != nil {
		t.Fatal("new password unusable", err)
	}
	// Expired token, stale worker completion and crash recovery are checked without sleeps.
	expired := platform.Token()
	if err = repository.QueueAccountToken(ctx, input.Email, "reset", platform.Hash(expired), now-1, mail.Encrypt(mailer.Message{To: input.Email, Subject: "expired", Body: "expired"})); err != nil {
		t.Fatal(err)
	}
	if err = accounts.Complete(ctx, expired, "reset", "changed-password-strong", "test"); !errors.Is(err, platform.ErrAccountToken) {
		t.Fatal("expired token accepted", err)
	}
	if err = mail.Tick(ctx, now+20); err != nil {
		t.Fatal(err)
	}
	if err = repository.QueueAccountToken(ctx, input.Email, "reset", platform.Hash(platform.Token()), now+3600, mail.Encrypt(mailer.Message{To: input.Email, Subject: "lease", Body: "test"})); err != nil {
		t.Fatal(err)
	}
	first, err := repository.ClaimMail(ctx, now+21)
	if err != nil || first.ID == "" {
		t.Fatal(err)
	}
	second, err := repository.ClaimMail(ctx, now+82)
	if err != nil || first.ID != second.ID || first.Lease == second.Lease {
		t.Fatal("abandoned lease not recovered", err)
	}
	if err = repository.FinishMail(ctx, first, true, now+83); err != nil {
		t.Fatal(err)
	}
	var state string
	if err = store.Row(ctx, store.DB, "SELECT state FROM mail_jobs WHERE id=?", second.ID).Scan(&state); err != nil || state != "sending" {
		t.Fatal("stale worker committed", state, err)
	}
	for attempt := second.Attempts; attempt <= 5; attempt++ {
		if err = repository.FinishMail(ctx, second, false, now+83); err != nil {
			t.Fatal(err)
		}
		if attempt < 5 {
			second, err = repository.ClaimMail(ctx, now+83+(1<<attempt)*5)
			if err != nil || second.ID == "" {
				t.Fatal("retry not claimable", err)
			}
		}
	}
	if err = store.Row(ctx, store.DB, "SELECT payload,state FROM mail_jobs WHERE id=?", second.ID).Scan(&payload, &state); err != nil || payload != "" || state != "dead" {
		t.Fatal("terminal secret retention", state, err)
	}
	list, err := repository.MailJobs(ctx)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(list)
	if strings.Contains(string(raw), "token") || strings.Contains(string(raw), "newmember") {
		t.Fatal("queue metadata disclosed secrets")
	}
	exerciseEmailCodes(t, ctx, store, repository, accounts, input.Email)
}
