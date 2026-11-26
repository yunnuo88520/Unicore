// Author: yunnuo <ymz@ebox.vip>
// Description: The same upgrade, token, mail retry and credential-race checks run on all dialects.
package platformsql

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	mailadapter "github.com/yunnuo/unicore/internal/adapter/mail"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/mailer"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/secret"
	"github.com/yunnuo/unicore/internal/settings"
	"github.com/yunnuo/unicore/internal/testutil"
	"github.com/yunnuo/unicore/migrations/runner"
)

func exerciseMailLifecycle(t *testing.T, ctx context.Context, store *sqlstore.Store, repository *Repository, admin contracts.User) {
	t.Helper()
	// Recreate the exact M2a schema level without touching its users, sessions or settings.
	for _, query := range []string{"DROP TABLE unicore_email_challenges", "DELETE FROM schema_migrations WHERE namespace='platform' AND version=1"} {
		if _, err := store.DB.ExecContext(ctx, query); err != nil {
			t.Fatal(err)
		}
	}
	if err := runner.Apply(ctx, store.DB, runner.Options{Dialect: store.Dialect, Profile: "web-platform"}); err != nil {
		t.Fatal("rebuild platform namespace", err)
	}
	if err := runner.Apply(ctx, store.DB, runner.Options{Dialect: store.Dialect, Profile: "web-platform"}); err != nil {
		t.Fatal("upgrade retry failed", err)
	}
	if account, err := (&Repository{Store: store, Administrators: true}).FindAccount(ctx, "admin"); err != nil || account.User.ID != admin.ID {
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
	_, err = config.Patch(ctx, contracts.SettingPatch{Changes: []contracts.SettingChange{{Key: "account.registration_enabled", Value: "true"}, {Key: "account.email_verification_required", Value: "true"}, {Key: "account.password_reset_enabled", Value: "true"}}}, admin.ID)
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
	if _, _, err = identity.Login(ctx, contracts.LoginInput{Username: input.Username, Password: input.Password}, "test", false, false, 1); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal("pending account logged in", err)
	}
	var payload string
	if err = store.Row(ctx, store.DB, "SELECT payload FROM unicore_mail_jobs LIMIT 1").Scan(&payload); err != nil {
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
	_, session, err := identity.Login(ctx, contracts.LoginInput{Username: input.Username, Password: input.Password}, "test", false, false, 1)
	if err != nil {
		t.Fatal(err)
	}
	before, err := repository.FindAccount(ctx, input.Username)
	if err != nil {
		t.Fatal(err)
	}
	request := func(email, purpose string) {
		id, answer := challenge()
		if err = accounts.Request(ctx, contracts.EmailRequest{Email: email, CaptchaID: &id, CaptchaAnswer: &answer}, "test", purpose); err != nil {
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
	if err = repository.CreateSession(ctx, platform.Hash(platform.Token()), before.User.ID, now+3600, before.PasswordHash, false); !errors.Is(err, platform.ErrCredentials) {
		t.Fatal("old-password login race created session", err)
	}
	if err = accounts.Complete(ctx, reset, "reset", "changed-password-strong", "test"); !errors.Is(err, platform.ErrAccountToken) {
		t.Fatal("reset replay succeeded", err)
	}
	if _, _, err = identity.Login(ctx, contracts.LoginInput{Username: input.Username, Password: "changed-password-strong"}, "test", false, false, 1); err != nil {
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
	firstBatch, err := repository.ClaimMails(ctx, now+21, 1)
	if err != nil || len(firstBatch) != 1 {
		t.Fatal(err)
	}
	first := firstBatch[0]
	secondBatch, err := repository.ClaimMails(ctx, now+82, 1)
	second := secondBatch[0]
	if err != nil || len(secondBatch) != 1 || first.ID != second.ID || first.Lease == second.Lease {
		t.Fatal("abandoned lease not recovered", err)
	}
	if err = repository.FinishMail(ctx, first, true, now+83); err != nil {
		t.Fatal(err)
	}
	var state string
	if err = store.Row(ctx, store.DB, "SELECT state FROM unicore_mail_jobs WHERE id=?", second.ID).Scan(&state); err != nil || state != "sending" {
		t.Fatal("stale worker committed", state, err)
	}
	for attempt := second.Attempts; attempt <= 5; attempt++ {
		if err = repository.FinishMail(ctx, second, false, now+83); err != nil {
			t.Fatal(err)
		}
		if attempt < 5 {
			retried, err := repository.ClaimMails(ctx, now+83+(1<<attempt)*5, 1)
			if err != nil || len(retried) != 1 {
				t.Fatal("retry not claimable", err)
			}
			second = retried[0]
		}
	}
	if err = store.Row(ctx, store.DB, "SELECT payload,state FROM unicore_mail_jobs WHERE id=?", second.ID).Scan(&payload, &state); err != nil || payload != "" || state != "dead" {
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

func TestClaimMailsPrioritizesAccountMail(t *testing.T) {
	ctx := context.Background()
	store, err := webdb.Open(ctx, "sqlite", "", filepath.Join(t.TempDir(), "priority.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err = runner.Apply(ctx, store.DB, runner.Options{Dialect: "sqlite", Profile: "web-platform"}); err != nil {
		t.Fatal(err)
	}
	r := &Repository{Store: store}
	if _, err = store.Exec(ctx, store.DB, "INSERT INTO unicore_install_state(id,profile,instance_id,installed_at) VALUES(1,?,?,?)", "web-platform", sqlstore.ID(), time.Now().Unix()); err != nil {
		t.Fatal(err)
	}
	now := int(time.Now().Unix())
	enqueue := func(id, tokenHash string, createdAt int) {
		if _, err = store.Exec(ctx, store.DB, "INSERT INTO unicore_mail_jobs(id,token_hash,payload,state,attempts,created_at,available_at,expires_at,lease_id,lease_until,last_error) VALUES(?,?,?,'pending',0,?,?,?,'',0,'')", id, tokenHash, "payload", createdAt, createdAt, now+3600); err != nil {
			t.Fatal(err)
		}
	}
	// The event notification enqueues first; account mail must still claim first.
	enqueue("notify-first", "", now-10)
	enqueue("account-second", platform.Hash(platform.Token()), now-5)
	jobs, err := r.ClaimMails(ctx, now, 8)
	if err != nil || len(jobs) != 2 {
		t.Fatalf("claim all: %d %v", len(jobs), err)
	}
	if jobs[0].ID != "account-second" || jobs[1].ID != "notify-first" {
		t.Fatalf("account mail must claim before event notifications: %v", []string{jobs[0].ID, jobs[1].ID})
	}
}

func TestFinishMailPersistsFailureCodes(t *testing.T) {
	ctx := context.Background()
	store, err := webdb.Open(ctx, "sqlite", "", filepath.Join(t.TempDir(), "verdicts.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err = runner.Apply(ctx, store.DB, runner.Options{Dialect: "sqlite", Profile: "web-platform"}); err != nil {
		t.Fatal(err)
	}
	r := &Repository{Store: store}
	if _, err = store.Exec(ctx, store.DB, "INSERT INTO unicore_install_state(id,profile,instance_id,installed_at) VALUES(1,?,?,?)", "web-platform", sqlstore.ID(), time.Now().Unix()); err != nil {
		t.Fatal(err)
	}
	now := int(time.Now().Unix())
	seed := func(id string) mailer.Job {
		if _, err = store.Exec(ctx, store.DB, "INSERT INTO unicore_mail_jobs(id,token_hash,payload,state,attempts,created_at,available_at,expires_at,lease_id,lease_until,last_error) VALUES(?,?,?,'pending',0,?,?,?,'',0,'')", id, "", "payload", now, now, now+3600); err != nil {
			t.Fatal(err)
		}
		claimed, err := r.ClaimMails(ctx, now, 8)
		if err != nil {
			t.Fatal(err)
		}
		for _, job := range claimed {
			if job.ID == id {
				return job
			}
		}
		t.Fatalf("job %s not claimed", id)
		return mailer.Job{}
	}
	stateOf := func(id string) (string, string) {
		var state, lastError string
		if err = store.Row(ctx, store.DB, "SELECT state,last_error FROM unicore_mail_jobs WHERE id=?", id).Scan(&state, &lastError); err != nil {
			t.Fatal(err)
		}
		return state, lastError
	}
	job := seed("auth-failed")
	if err = r.FinishMail(ctx, job, false, now); err != nil {
		t.Fatal(err)
	}
	if state, lastError := stateOf("auth-failed"); state != "pending" || lastError != mailer.FailureDeliveryFailed {
		t.Fatalf("generic failure stays retryable: %s %s", state, lastError)
	}
	job = seed("auth-dead")
	job.Failure = &mailer.DeliveryFailure{Code: mailer.FailureSMTPAuth}
	if err = r.FinishMail(ctx, job, false, now); err != nil {
		t.Fatal(err)
	}
	if state, lastError := stateOf("auth-dead"); state != "dead" || lastError != mailer.FailureSMTPAuth {
		t.Fatalf("non-retryable failure must die with its code: %s %s", state, lastError)
	}
	job = seed("rate-limited")
	job.Failure = &mailer.DeliveryFailure{Code: mailer.FailureChannelRateLimited, Retryable: true}
	if err = r.FinishMail(ctx, job, false, now); err != nil {
		t.Fatal(err)
	}
	if state, lastError := stateOf("rate-limited"); state != "pending" || lastError != mailer.FailureChannelRateLimited {
		t.Fatalf("retryable failure keeps backing off with its code: %s %s", state, lastError)
	}
	job = seed("master-off")
	job.Cancelled = true
	job.CancelReason = "MASTER_DISABLED"
	if err = r.FinishMail(ctx, job, true, now); err != nil {
		t.Fatal(err)
	}
	if state, lastError := stateOf("master-off"); state != "cancelled" || lastError != "MASTER_DISABLED" {
		t.Fatalf("cancellation must win over delivered and record its reason: %s %s", state, lastError)
	}
}
