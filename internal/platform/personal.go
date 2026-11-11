// Author: yunnuo <ymz@ebox.vip>
// Description: Personal profile, session-bound mailbox changes and replay-safe TOTP orchestration.
package platform

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/mailer"
	"github.com/yunnuo/unicore/internal/settings"
)

var ErrMFA = errors.New("second factor required")
var ErrMFAInvalid = errors.New("invalid or replayed second factor")
var ErrMFAEnrollment = errors.New("second factor enrollment required")

type DeviceInfo struct {
	IP, Agent string
	Passive   bool
}
type deviceKey struct{}

func WithDevice(ctx context.Context, ip, agent string) context.Context {
	return context.WithValue(ctx, deviceKey{}, DeviceInfo{IP: ip, Agent: agent})
}
func WithPassive(ctx context.Context) context.Context {
	d := DeviceFrom(ctx)
	d.Passive = true
	return context.WithValue(ctx, deviceKey{}, d)
}
func DeviceFrom(ctx context.Context) DeviceInfo {
	d, _ := ctx.Value(deviceKey{}).(DeviceInfo)
	return d
}

type PersonalState struct {
	DisplayName, Secret, Recovery, SetupSecret, SetupSession string
	LastStep, SetupExpires, SetupAttempts                    int
}
type PersonalSession struct {
	User                                           contracts.User
	State                                          PersonalState
	Expires, Created, LastSeen, Verified, Attempts int
}
type EmailChange struct {
	ID, UserID, SessionHash, ParentID, Original, Target, Digest, Payload string
	Created, Expires                                                     int
}
type PersonalStore interface {
	PersonalSession(context.Context, string) (PersonalSession, error)
	SaveAccountProfile(ctx context.Context, sessionHash, name string, avatarFileID *string) error
	UserAvatar(context.Context, string) (string, error)
	SaveTOTPSetup(context.Context, string, string, string, int) error
	CancelTOTPSetup(context.Context, string) error
	EnableTOTP(context.Context, string, string, int, string) error
	UseFactor(context.Context, string, string, int, string, bool) error
	LoginDevices(context.Context, string) (contracts.LoginDevices, error)
	RevokeDevice(context.Context, string, string, bool) error
	QueueEmailChange(context.Context, EmailChange) error
	VerifyEmailChange(context.Context, string, string, string, bool) error
}

// AvatarFiles is the optional file-service surface for avatars; nil keeps
// avatar_url empty and refuses avatar uploads.
type AvatarFiles interface {
	ValidateAvatar(ctx context.Context, actor files.Actor, fileID string) error
	Access(ctx context.Context, actor files.Actor, fileID string) (contracts.FileAccess, error)
}

type Personal struct {
	Store       PersonalStore
	Identity    *Service
	Settings    *settings.Service
	Mail        *mailer.Service
	AvatarFiles AvatarFiles
	Realm       string
}

func (p *Personal) profile(ctx context.Context, s PersonalSession) (contracts.AccountProfile, error) {
	values, err := p.Settings.Raw(ctx)
	// Privileged accounts use the management security policy on every login surface.
	administrator := HasManagementAccess(s.User)
	force2fa := settings.Force2FA(values, administrator)
	profile := contracts.AccountProfile{User: s.User, DisplayName: s.State.DisplayName, TotpEnabled: s.State.Secret != "", Force2fa: force2fa, CanDisable2fa: !force2fa && values["security.allow_disable_2fa"] != "false"}
	if p.AvatarFiles != nil {
		if fileID, avatarErr := p.Store.UserAvatar(ctx, s.User.ID); avatarErr == nil && fileID != "" {
			access, accessErr := p.AvatarFiles.Access(ctx, files.Actor{ID: s.User.ID, Realm: p.Realm}, fileID)
			if accessErr == nil {
				profile.AvatarUrl = &access.Url
			}
		}
	}
	return profile, err
}
func (p *Personal) Profile(ctx context.Context, token string) (contracts.AccountProfile, error) {
	s, err := p.Store.PersonalSession(ctx, Hash(token))
	if err != nil {
		return contracts.AccountProfile{}, err
	}
	return p.profile(ctx, s)
}

// SaveProfile validates the complete change before atomically saving it.
// Omitted avatar_file_id preserves the reference; an empty value clears it.
func (p *Personal) SaveProfile(ctx context.Context, token string, input contracts.ProfileInput) (contracts.AccountProfile, error) {
	name := strings.TrimSpace(input.DisplayName)
	if !utf8.ValidString(name) || utf8.RuneCountInString(name) > 80 || strings.ContainsAny(name, "\r\n\x00") {
		return contracts.AccountProfile{}, ErrInput
	}
	values, err := p.Settings.Raw(ctx)
	if err != nil {
		return contracts.AccountProfile{}, err
	}
	state, err := p.Store.PersonalSession(ctx, Hash(token))
	if err != nil {
		return contracts.AccountProfile{}, err
	}
	if settings.BlockedText(values["account.nickname_blacklist"], name, false) || settings.BlockedText(values["account.username_blacklist"], state.User.Username, false) {
		return contracts.AccountProfile{}, ErrInput
	}
	if input.AvatarFileID != nil {
		fileID := strings.TrimSpace(*input.AvatarFileID)
		input.AvatarFileID = &fileID
		if len(fileID) > 80 {
			return contracts.AccountProfile{}, ErrInput
		}
		if fileID != "" {
			if p.AvatarFiles == nil {
				return contracts.AccountProfile{}, ErrForbidden
			}
			if err := p.AvatarFiles.ValidateAvatar(ctx, files.Actor{ID: state.User.ID, Realm: p.Realm}, fileID); err != nil {
				return contracts.AccountProfile{}, ErrInput
			}
		}
	}
	if err := p.Store.SaveAccountProfile(ctx, Hash(token), name, input.AvatarFileID); err != nil {
		return contracts.AccountProfile{}, err
	}
	return p.Profile(ctx, token)
}

func (p *Personal) SaveName(ctx context.Context, token, name string) (contracts.AccountProfile, error) {
	return p.SaveProfile(ctx, token, contracts.ProfileInput{DisplayName: name})
}
func (p *Personal) Pending(ctx context.Context, token string) (contracts.Session, error) {
	if len(token) != 43 {
		return contracts.Session{}, ErrCredentials
	}
	s, err := p.Store.PersonalSession(ctx, Hash(token))
	if err != nil {
		return contracts.Session{}, err
	}
	if s.State.Secret == "" || s.Verified == 1 || s.Created+300 <= int(time.Now().Unix()) || s.Attempts >= 8 {
		return contracts.Session{}, ErrCredentials
	}
	return contracts.Session{User: s.User, CsrfToken: CSRF(token), ExpiresAt: s.Expires}, nil
}
func (p *Personal) BeginTOTP(ctx context.Context, token, password, ip string) (contracts.TOTPSetup, error) {
	if !p.Identity.Limiter.Allow("totp-setup:"+Hash(token)+":"+ip, 8, time.Minute) {
		return contracts.TOTPSetup{}, ErrRateLimited
	}
	s, err := p.Store.PersonalSession(ctx, Hash(token))
	if err != nil {
		return contracts.TOTPSetup{}, err
	}
	select {
	case p.Identity.loginSlots <- struct{}{}:
		defer func() { <-p.Identity.loginSlots }()
	default:
		return contracts.TOTPSetup{}, ErrRateLimited
	}
	a, err := p.Identity.Store.FindAccount(ctx, s.User.Username)
	if err != nil || a.User.ID != s.User.ID || !VerifyPassword(a.PasswordHash, password) {
		return contracts.TOTPSetup{}, ErrCredentials
	}
	secret, err := newTOTPSecret()
	if err != nil {
		return contracts.TOTPSetup{}, err
	}
	expires := int(time.Now().Unix()) + 600
	if err = p.Store.SaveTOTPSetup(ctx, Hash(token), a.PasswordHash, p.Mail.Secrets.Seal(secret), expires); err != nil {
		return contracts.TOTPSetup{}, err
	}
	return p.totpSetup(ctx, s.User.Username, secret, expires)
}

func newTOTPSecret() (string, error) {
	bytes := make([]byte, 20)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(bytes), nil
}

// PendingTOTP reveals only the unconsumed setup bound to this live session.
func (p *Personal) PendingTOTP(ctx context.Context, token string) (contracts.TOTPSetup, error) {
	s, err := p.Store.PersonalSession(ctx, Hash(token))
	if err != nil {
		return contracts.TOTPSetup{}, err
	}
	if s.State.Secret != "" || s.State.SetupSecret == "" || s.State.SetupSession != Hash(token) || s.State.SetupExpires <= int(time.Now().Unix()) || s.State.SetupAttempts >= 5 {
		return contracts.TOTPSetup{}, ErrMFAInvalid
	}
	secret, err := p.Mail.Secrets.Open(s.State.SetupSecret)
	if err != nil {
		return contracts.TOTPSetup{}, err
	}
	return p.totpSetup(ctx, s.User.Username, secret, s.State.SetupExpires)
}
func (p *Personal) totpSetup(ctx context.Context, username, secret string, expires int) (contracts.TOTPSetup, error) {
	issuer, err := p.Settings.Value(ctx, "site.name")
	if err != nil {
		return contracts.TOTPSetup{}, err
	}
	q := url.Values{"secret": {secret}, "issuer": {issuer}, "algorithm": {"SHA1"}, "digits": {"6"}, "period": {"30"}}
	return contracts.TOTPSetup{Secret: secret, OtpauthUrl: "otpauth://totp/" + url.PathEscape(issuer+":"+username) + "?" + q.Encode(), ExpiresAt: expires}, nil
}

// TOTPStep returns the accepted 30-second counter; the repository consumes it atomically.
func TOTPStep(secret, code string, now int64) int {
	if len(code) != 6 {
		return -1
	}
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	if err != nil {
		return -1
	}
	for delta := int64(-1); delta <= 1; delta++ {
		step := now/30 + delta
		var b [8]byte
		binary.BigEndian.PutUint64(b[:], uint64(step))
		h := hmac.New(sha1.New, key)
		_, _ = h.Write(b[:])
		digest := h.Sum(nil)
		offset := digest[len(digest)-1] & 15
		n := (binary.BigEndian.Uint32(digest[offset:offset+4]) & 0x7fffffff) % 1000000
		if Equal(fmt.Sprintf("%06d", n), code) {
			return int(step)
		}
	}
	return -1
}
func (p *Personal) Enable(ctx context.Context, token, code string) (contracts.RecoveryCodes, error) {
	if !p.Identity.Limiter.Allow("totp-enable:"+Hash(token), 8, time.Minute) {
		return contracts.RecoveryCodes{}, ErrRateLimited
	}
	s, err := p.Store.PersonalSession(ctx, Hash(token))
	if err != nil {
		return contracts.RecoveryCodes{}, err
	}
	secret, err := p.Mail.Secrets.Open(s.State.SetupSecret)
	if err != nil {
		return contracts.RecoveryCodes{}, ErrMFAInvalid
	}
	step := TOTPStep(secret, code, time.Now().Unix())

	codes, digests := []string{}, []string{}
	for i := 0; i < 10; i++ {
		code := Token()[:20]
		codes = append(codes, code)
		digests = append(digests, Hash(s.User.ID+":"+code))
	}
	payload, _ := json.Marshal(digests)
	if err = p.Store.EnableTOTP(ctx, Hash(token), s.State.SetupSecret, step, string(payload)); err != nil {
		return contracts.RecoveryCodes{}, err
	}
	return contracts.RecoveryCodes{Codes: codes}, nil
}
func (p *Personal) Factor(ctx context.Context, token, code, ip string, disable bool) error {
	if !disable {
		if err := p.Identity.LoginAllowed(ctx, ip); err != nil {
			return err
		}
	}
	if !p.Identity.Limiter.Allow("totp-check:"+Hash(token)+":"+ip, 8, time.Minute) {
		return ErrRateLimited
	}
	s, err := p.Store.PersonalSession(ctx, Hash(token))
	if err != nil {
		return err
	}
	if disable {
		info, err := p.profile(ctx, s)
		if err != nil {
			return err
		}
		if !info.CanDisable2fa {
			return ErrForbidden
		}
	}
	secret, err := p.Mail.Secrets.Open(s.State.Secret)
	if err != nil {
		return ErrMFAInvalid
	}
	step := TOTPStep(secret, code, time.Now().Unix())
	recovery := ""
	if !disable && step < 0 && len(code) == 20 {
		recovery = Hash(s.User.ID + ":" + code)
	}
	err = p.Store.UseFactor(ctx, Hash(token), s.State.Secret, step, recovery, disable)
	if !disable && (err == nil || errors.Is(err, ErrMFAInvalid)) {
		p.Identity.loginResult(ctx, ip, err == nil)
	}
	return err
}
func (p *Personal) RequestEmail(ctx context.Context, token, parent, email, ip string) (contracts.EmailChallenge, error) {
	s, err := p.Store.PersonalSession(ctx, Hash(token))
	if err != nil {
		return contracts.EmailChallenge{}, err
	}
	values, err := p.Settings.Raw(ctx)
	if err != nil {
		return contracts.EmailChallenge{}, err
	}
	if !settings.MailReady(values) {
		return contracts.EmailChallenge{}, settings.ErrMailNotReady
	}
	purpose := "current"
	if parent != "" {
		purpose = "new"
	}
	if !p.Identity.Limiter.Allow("email-change:"+s.User.ID+":"+purpose, 1, time.Minute) || !p.Identity.Limiter.Allow("email-change-ip:"+ip, 20, time.Minute) {
		return contracts.EmailChallenge{}, ErrRateLimited
	}
	if parent == "" {
		email = s.User.Email
	} else {
		email = strings.ToLower(strings.TrimSpace(email))
		if !settings.ValidEmail(email) || strings.EqualFold(email, s.User.Email) {
			return contracts.EmailChallenge{}, ErrInput
		}
	}
	id, code := Token(), SixDigits()
	now := int(time.Now().Unix())
	c := EmailChange{ID: id, UserID: s.User.ID, SessionHash: Hash(token), ParentID: parent, Original: s.User.Email, Target: email, Digest: p.Mail.Secrets.Digest("personal-email:" + id + ":" + code), Created: now, Expires: now + 600}
	c.Payload = p.Mail.Encrypt(mailer.Message{To: email, Subject: values["site.name"] + " · 邮箱换绑验证", Body: "你的邮箱换绑验证码是：" + code + "\n10 分钟内有效。请勿向他人提供验证码。若非本人操作，请忽略此邮件。"})
	if err = p.Store.QueueEmailChange(ctx, c); err != nil {
		return contracts.EmailChallenge{}, err
	}
	return contracts.EmailChallenge{ChallengeID: id, ExpiresIn: 600, RetryAfter: 60}, nil
}
func (p *Personal) VerifyEmail(ctx context.Context, token, id, code, ip string, finish bool) error {
	if !p.Identity.Limiter.Allow("email-change-verify:"+Hash(token)+":"+ip, 15, time.Minute) {
		return ErrRateLimited
	}
	return p.Store.VerifyEmailChange(ctx, Hash(token), id, p.Mail.Secrets.Digest("personal-email:"+id+":"+code), finish)
}
