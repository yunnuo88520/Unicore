// Author: yunnuo <ymz@ebox.vip>
// Description: Email registration and recovery use cases; all public requests avoid account disclosure.
package platform

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/mailer"
	"github.com/yunnuo/unicore/internal/settings"
)

var ErrAccountToken = errors.New("invalid or expired account token")
var ErrFlowDisabled = errors.New("account flow is disabled")

type AccountStore interface {
	RegisterAccount(context.Context, contracts.RegisterInput, string, string, int, string) error
	QueueAccountToken(context.Context, string, string, string, int, string) error
	ConsumeAccountToken(context.Context, string, string, string, int) error
}
type Accounts struct {
	Identity *Service
	Store    AccountStore
	Settings *settings.Service
	Mail     *mailer.Service
	BaseURL  string
}

func (a *Accounts) Policy(ctx context.Context) (contracts.AuthPolicy, error) {
	values, err := a.Settings.Raw(ctx)
	if err != nil {
		return contracts.AuthPolicy{}, err
	}
	ready := settings.MailReady(values)
	return contracts.AuthPolicy{RegistrationEnabled: ready && values["account.registration_enabled"] == "true", ResetEnabled: ready && values["account.password_reset_enabled"] == "true", LoginCaptcha: values["security.login_captcha"] == "true", RegisterCaptcha: values["security.register_captcha"] == "true", MailReady: ready}, nil
}
func (a *Accounts) allow(ip, email, id, answer string, captcha bool) error {
	if !a.Identity.Limiter.Allow("mail-ip:"+ip, 20, time.Minute) || !a.Identity.Limiter.Allow("mail-account:"+email, 3, 15*time.Minute) {
		return ErrRateLimited
	}
	if captcha && !a.Identity.Captchas.Consume(id, answer) {
		return ErrCaptcha
	}
	return nil
}
func (a *Accounts) payload(email, purpose, token string) string {
	path, subject := "verify-email", "Verify your Unicore email"
	if purpose == "reset" {
		path, subject = "reset-password", "Reset your Unicore password"
	}
	return a.Mail.Encrypt(mailer.Message{To: email, Subject: subject, Body: "Open this link to continue:\n" + a.BaseURL + "/#" + path + "?token=" + token + "\n\nThis link expires shortly and can be used once. If you did not request it, ignore this message."})
}
func (a *Accounts) Register(ctx context.Context, input contracts.RegisterInput, ip string) error {
	policy, err := a.Policy(ctx)
	if err != nil {
		return err
	}
	if !policy.RegistrationEnabled {
		return ErrFlowDisabled
	}
	input.Username = strings.ToLower(strings.TrimSpace(input.Username))
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	if !ValidateAccount(input.Username, input.Email, input.Password) {
		return ErrInput
	}
	if err = a.allow(ip, input.Email, input.CaptchaID, input.CaptchaAnswer, policy.RegisterCaptcha); err != nil {
		return err
	}
	select {
	case a.Identity.loginSlots <- struct{}{}:
		defer func() { <-a.Identity.loginSlots }()
	case <-ctx.Done():
		return ctx.Err()
	}
	hash, err := HashPassword(input.Password)
	if err != nil {
		return err
	}
	input.Password = ""
	token := Token()
	expires := int(time.Now().Add(30 * time.Minute).Unix())
	err = a.Store.RegisterAccount(ctx, input, hash, Hash(token), expires, a.payload(input.Email, "verify", token))
	if errors.Is(err, ErrConflict) {
		return nil
	}
	return err
}
func (a *Accounts) Request(ctx context.Context, input contracts.EmailRequest, ip, purpose string) error {
	policy, err := a.Policy(ctx)
	if err != nil {
		return err
	}
	if (purpose == "reset" && !policy.ResetEnabled) || (purpose == "verify" && !policy.RegistrationEnabled) {
		return ErrFlowDisabled
	}
	email := strings.ToLower(strings.TrimSpace(input.Email))
	if !settings.ValidEmail(email) {
		return ErrInput
	}
	captcha := policy.LoginCaptcha
	if purpose == "verify" {
		captcha = policy.RegisterCaptcha
	}
	if err = a.allow(ip, email, input.CaptchaID, input.CaptchaAnswer, captcha); err != nil {
		return err
	}
	token := Token()
	ttl := 15 * time.Minute
	if purpose == "verify" {
		ttl = 30 * time.Minute
	}
	// Store lookup and enqueue are one transaction; unknown/disabled accounts return the same success.
	return a.Store.QueueAccountToken(ctx, email, purpose, Hash(token), int(time.Now().Add(ttl).Unix()), a.payload(email, purpose, token))
}
func (a *Accounts) Complete(ctx context.Context, token, purpose, password, ip string) error {
	if !a.Identity.Limiter.Allow("token-ip:"+ip, 30, time.Minute) {
		return ErrRateLimited
	}
	if len(token) != 43 {
		return ErrAccountToken
	}
	hash := ""
	if purpose == "reset" {
		select {
		case a.Identity.loginSlots <- struct{}{}:
			defer func() { <-a.Identity.loginSlots }()
		case <-ctx.Done():
			return ctx.Err()
		}
		var err error
		hash, err = HashPassword(password)
		if err != nil {
			return err
		}
	}
	return a.Store.ConsumeAccountToken(ctx, Hash(token), purpose, hash, int(time.Now().Unix()))
}
