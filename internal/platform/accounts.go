// Author: yunnuo <ymz@ebox.vip>
// Description: Email registration and recovery use cases; all public requests avoid account disclosure.
package platform

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/yunnuo/unicore/internal/buildinfo"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/mailer"
	"github.com/yunnuo/unicore/internal/settings"
)

var ErrAccountToken = errors.New("invalid or expired account token")
var ErrFlowDisabled = errors.New("account flow is disabled")

type AccountStore interface {
	RegisterEmailChallenge(context.Context, contracts.RegisterInput, string, EmailChallenge) error
	QueueEmailChallenge(context.Context, string, EmailChallenge) error
	ConsumeEmailChallenge(context.Context, string, string, string, string, string, int, int) (contracts.User, error)
	RegisterActiveAccount(context.Context, contracts.RegisterInput, string) error
	RegisterAccount(context.Context, contracts.RegisterInput, string, string, int, string) error
	QueueAccountToken(context.Context, string, string, string, int, string) error
	ConsumeAccountToken(context.Context, string, string, string, int) error
}
type Accounts struct {
	Administrator bool
	Identity      *Service
	Store         AccountStore
	Settings      *settings.Service
	Mail          *mailer.Service
	BaseURL       string
}

func (a *Accounts) Policy(ctx context.Context) (contracts.AuthPolicy, error) {
	values, err := a.Settings.Raw(ctx)
	if err != nil {
		return contracts.AuthPolicy{}, err
	}
	ready := settings.MailReady(values)
	provider := values["security.human_check_provider"]
	humanCheckRegion := values["security.tencent_captcha_region"]
	if provider == "alibaba" {
		humanCheckRegion = values["security.aliyun_captcha_region"]
	}
	return contracts.AuthPolicy{
		EmailLoginEnabled:         ready && values["account.email_login_enabled"] == "true",
		EmailVerificationRequired: values["account.email_verification_required"] == "true",
		RegistrationEnabled:       !a.Administrator && values["account.registration_enabled"] == "true",
		ResetEnabled:              ready && values["account.password_reset_enabled"] == "true",
		LoginCaptcha:              values["security.login_captcha"] == "true",
		RegisterCaptcha:           values["security.register_captcha"] == "true",
		MailReady:                 ready,
		PhoneRequired:             values["account.phone_required"] == "true",
		HumanCheckEnabled:         values["security.human_check_enabled"] == "true",
		HumanCheckProvider:        provider,
		HumanCheckSiteKey:         strPtr(humanCheckSiteKey(values)),
		HumanCheckRegion:          strPtr(humanCheckRegion),
	}, nil
}

func strPtr(value string) *string { return &value }

// humanCheckSiteKey exposes only the public widget identifier of the selected provider.
func humanCheckSiteKey(values map[string]string) string {
	switch values["security.human_check_provider"] {
	case "tencent":
		return values["security.tencent_captcha_app_id"]
	case "alibaba":
		return values["security.aliyun_captcha_scene_id"]
	default:
		return values["security.turnstile_site_key"]
	}
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
func (a *Accounts) payload(ctx context.Context, email, purpose, token string) string {
	path, subject := "verify-email", "Verify your "+buildinfo.ProductName+" email"
	if purpose == "reset" {
		path, subject = "reset-password", "Reset your "+buildinfo.ProductName+" password"
	}
	entry := "/"
	if a.Administrator {
		entry, _ = a.Settings.Value(ctx, "admin.path")
	}
	baseURL := a.BaseURL
	if value, err := a.Settings.Value(ctx, "site.base_url"); err == nil && settings.ValidBaseURL(value) {
		baseURL = strings.TrimRight(value, "/")
	}
	return a.Mail.Encrypt(mailer.Message{To: email, Subject: subject, Body: "Open this link to continue:\n" + baseURL + strings.TrimSuffix(entry, "/") + "/" + path + "?token=" + token + "\n\nThis link expires shortly and can be used once. If you did not request it, ignore this message."})
}
func (a *Accounts) Register(ctx context.Context, input contracts.RegisterInput, ip string) error {
	policy, err := a.Policy(ctx)
	if err != nil {
		return err
	}
	if !policy.RegistrationEnabled {
		return ErrFlowDisabled
	}
	if policy.HumanCheckEnabled {
		if err := a.Identity.verifyHumanCheck(ctx, derefString(input.HumanCheckToken), derefString(input.HumanCheckRandstr), ip); err != nil {
			return err
		}
	}
	input.Username = strings.ToLower(strings.TrimSpace(input.Username))
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	if !ValidateAccount(input.Username, input.Email, input.Password) {
		return ErrInput
	}
	if err = bindPhone(&input, policy.PhoneRequired); err != nil {
		return err
	}
	if err = a.registrationAllowed(ctx, input, ip); err != nil {
		return err
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
	if !policy.EmailVerificationRequired {
		err = a.Store.RegisterActiveAccount(ctx, input, hash)
		return err
	}
	if !policy.MailReady {
		return settings.ErrMailNotReady
	}
	token := Token()
	expires := int(time.Now().Add(30 * time.Minute).Unix())
	err = a.Store.RegisterAccount(ctx, input, hash, Hash(token), expires, a.payload(ctx, input.Email, "verify", token))
	return err
}
func (a *Accounts) Request(ctx context.Context, input contracts.EmailRequest, ip, purpose string) error {
	policy, err := a.Policy(ctx)
	if err != nil {
		return err
	}
	if (purpose == "reset" && !policy.ResetEnabled) || (purpose == "verify" && (!policy.RegistrationEnabled || !policy.EmailVerificationRequired)) {
		return ErrFlowDisabled
	}
	email := strings.ToLower(strings.TrimSpace(input.Email))
	if err = a.emailAllowed(ctx, email, ip, purpose == "verify"); err != nil {
		return err
	}
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
	return a.Store.QueueAccountToken(ctx, email, purpose, Hash(token), int(time.Now().Add(ttl).Unix()), a.payload(ctx, email, purpose, token))
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
		if err := a.Identity.passwordAllowed(ctx, password); err != nil {
			return err
		}
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

func (a *Accounts) emailAllowed(ctx context.Context, email, ip string, restrictDomain bool) error {
	values, err := a.Settings.Raw(ctx)
	if err != nil {
		return err
	}
	if (restrictDomain && !settings.EmailAllowed(values, email)) || settings.IPBlocked(values, ip) {
		return ErrInput
	}
	return nil
}
func (a *Accounts) registrationAllowed(ctx context.Context, input contracts.RegisterInput, ip string) error {
	values, err := a.Settings.Raw(ctx)
	if err != nil {
		return err
	}
	if !settings.EmailAllowed(values, input.Email) || settings.IPBlocked(values, ip) || settings.BlockedText(values["account.username_blacklist"], input.Username, false) || settings.BlockedText(values["account.nickname_blacklist"], input.Username, false) || settings.BlockedText(values["account.password_blacklist"], input.Password, true) {
		return ErrInput
	}
	max, minutes := registerRateLimit(values)
	if !a.Identity.Limiter.Allow("register-ip:"+ip, max, time.Duration(minutes)*time.Minute) {
		return ErrRateLimited
	}
	return nil
}

// registerRateLimit reads the per-IP registration window; missing or stale values fall back to the shipped defaults.
func registerRateLimit(values map[string]string) (max int, minutes int) {
	max, minutes = 5, 1
	if value, err := strconv.Atoi(values["account.register_rate_max"]); err == nil && value >= 1 && value <= 1000 {
		max = value
	}
	if value, err := strconv.Atoi(values["account.register_rate_minutes"]); err == nil && value >= 1 && value <= 1440 {
		minutes = value
	}
	return max, minutes
}

// bindPhone normalizes the optional registration phone; binding is enforced only when the instance requires it.
func bindPhone(input *contracts.RegisterInput, phoneRequired bool) error {
	if input.Phone != nil {
		phone := strings.TrimSpace(*input.Phone)
		if phone == "" {
			input.Phone = nil
		} else if !ValidPhone(phone) {
			return ErrInput
		} else {
			input.Phone = &phone
		}
	}
	if phoneRequired && input.Phone == nil {
		return ErrInput
	}
	return nil
}
