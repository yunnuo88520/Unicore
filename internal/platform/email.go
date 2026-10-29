// Author: yunnuo <ymz@ebox.vip>
// Description: Six-digit email codes, keyed digests and purpose-bound one-time challenges.
package platform

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/mailer"
	"github.com/yunnuo/unicore/internal/settings"
	"math/big"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type EmailChallenge struct {
	ID, Purpose, Digest, Payload string
	Created, Expires             int
}

func SixDigits() string {
	number, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		panic(err)
	}
	return fmt.Sprintf("%06d", number.Int64())
}
func (a *Accounts) codeDigest(id, purpose, code string) string {
	return a.Mail.Secrets.Digest("unicore.email.code.v1:" + id + ":" + purpose + ":" + code)
}
func (a *Accounts) challenge(ctx context.Context, email, purpose string) (EmailChallenge, error) {
	values, err := a.Settings.Raw(ctx)
	if err != nil {
		return EmailChallenge{}, err
	}
	logo, err := a.Settings.Logo(ctx)
	if err != nil {
		return EmailChallenge{}, err
	}
	id, code := Token(), SixDigits()
	values["site.base_url"] = a.BaseURL
	message, err := mailer.RenderConfigured(values, purpose, code, email, false, logo, nil)
	if err != nil {
		return EmailChallenge{}, err
	}
	now := int(time.Now().Unix())
	return EmailChallenge{ID: id, Purpose: purpose, Digest: a.codeDigest(id, purpose, code), Payload: a.Mail.Encrypt(message), Created: now, Expires: now + 600}, nil
}
func challengeResult(c EmailChallenge) contracts.EmailChallenge {
	return contracts.EmailChallenge{ChallengeID: c.ID, ExpiresIn: 600, RetryAfter: 60}
}
func (a *Accounts) RegisterCode(ctx context.Context, input contracts.RegisterInput, ip string) (contracts.EmailChallenge, error) {
	policy, err := a.Policy(ctx)
	if err != nil {
		return contracts.EmailChallenge{}, err
	}
	if !policy.RegistrationEnabled {
		return contracts.EmailChallenge{}, ErrFlowDisabled
	}
	input.Username = strings.ToLower(strings.TrimSpace(input.Username))
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	if !ValidateAccount(input.Username, input.Email, input.Password) {
		return contracts.EmailChallenge{}, ErrInput
	}
	if err = a.allow(ip, input.Email, input.CaptchaID, input.CaptchaAnswer, policy.RegisterCaptcha); err != nil {
		return contracts.EmailChallenge{}, err
	}
	select {
	case a.Identity.loginSlots <- struct{}{}:
		defer func() { <-a.Identity.loginSlots }()
	case <-ctx.Done():
		return contracts.EmailChallenge{}, ctx.Err()
	}
	hash, err := HashPassword(input.Password)
	if err != nil {
		return contracts.EmailChallenge{}, err
	}
	input.Password = ""
	c, err := a.challenge(ctx, input.Email, "verify")
	if err != nil {
		return contracts.EmailChallenge{}, err
	}
	err = a.Store.RegisterEmailChallenge(ctx, input, hash, c)
	if errors.Is(err, ErrConflict) {
		err = nil
	}
	return challengeResult(c), err
}
func (a *Accounts) RequestCode(ctx context.Context, input contracts.EmailRequest, ip, purpose string) (contracts.EmailChallenge, error) {
	policy, err := a.Policy(ctx)
	if err != nil {
		return contracts.EmailChallenge{}, err
	}
	if (purpose == "verify" && !policy.RegistrationEnabled) || (purpose == "reset" && !policy.ResetEnabled) || (purpose == "login" && !policy.EmailLoginEnabled) {
		return contracts.EmailChallenge{}, ErrFlowDisabled
	}
	email := strings.ToLower(strings.TrimSpace(input.Email))
	if !settings.ValidEmail(email) {
		return contracts.EmailChallenge{}, ErrInput
	}
	captcha := policy.LoginCaptcha
	if purpose == "verify" {
		captcha = policy.RegisterCaptcha
	}
	if err = a.allow(ip, email, input.CaptchaID, input.CaptchaAnswer, captcha); err != nil {
		return contracts.EmailChallenge{}, err
	}
	if !a.Identity.Limiter.Allow("code-resend:"+purpose+":"+email, 1, time.Minute) {
		return contracts.EmailChallenge{}, ErrRateLimited
	}
	c, err := a.challenge(ctx, email, purpose)
	if err != nil {
		return contracts.EmailChallenge{}, err
	}
	err = a.Store.QueueEmailChallenge(ctx, email, c)
	return challengeResult(c), err
}
func (a *Accounts) CompleteCode(ctx context.Context, input contracts.EmailCodeInput, ip, purpose string) (contracts.Session, string, error) {
	if !a.Identity.Limiter.Allow("code-ip:"+ip, 30, time.Minute) {
		return contracts.Session{}, "", ErrRateLimited
	}
	if len(input.ChallengeID) != 43 || !regexp.MustCompile(`^[0-9]{6}$`).MatchString(input.Code) {
		return contracts.Session{}, "", ErrAccountToken
	}
	policy, err := a.Policy(ctx)
	if err != nil {
		return contracts.Session{}, "", err
	}
	if (purpose == "login" && !policy.EmailLoginEnabled) || (purpose == "verify" && !policy.RegistrationEnabled) || (purpose == "reset" && !policy.ResetEnabled) {
		return contracts.Session{}, "", ErrFlowDisabled
	}
	hash := ""
	if purpose == "reset" {
		select {
		case a.Identity.loginSlots <- struct{}{}:
			defer func() { <-a.Identity.loginSlots }()
		case <-ctx.Done():
			return contracts.Session{}, "", ctx.Err()
		}
		hash, err = HashPassword(input.Password)
		if err != nil {
			return contracts.Session{}, "", err
		}
	}
	values, err := a.Settings.Raw(ctx)
	if err != nil {
		return contracts.Session{}, "", err
	}
	hours, _ := strconv.Atoi(values["security.session_hours"])
	token := Token()
	expires := int(time.Now().Add(time.Duration(hours) * time.Hour).Unix())
	user, err := a.Store.ConsumeEmailChallenge(ctx, input.ChallengeID, purpose, a.codeDigest(input.ChallengeID, purpose, input.Code), hash, Hash(token), expires, int(time.Now().Unix()))
	if err != nil {
		return contracts.Session{}, "", err
	}
	return contracts.Session{User: user, CsrfToken: CSRF(token), ExpiresAt: expires}, token, nil
}
