// Author: yunnuo <ymz@ebox.vip>
// Description: Platform-only OIDC orchestration; identity proof stays separate from local authorization.
package platform

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/settings"
)

var (
	ErrOIDC               = errors.New("OIDC verification failed")
	ErrOIDCUnavailable    = errors.New("OIDC provider unavailable")
	ErrOIDCLinkRequired   = errors.New("sign in locally and link the enterprise identity")
	ErrLocalLoginRequired = errors.New("a local password is required for this operation")
)

type OIDCConfig struct {
	Issuer, ClientID, ClientSecret, Scopes, Callback string
	Userinfo                                         bool
	UserinfoEmailPath, UserinfoUsernamePath          string
	Manual                                           map[string]string
}
type OIDCClaims struct {
	Issuer, Subject, Email, Username string
	EmailVerified                    bool
}
// OIDCPendingBind carries an unlinked enterprise identity back to the login page so the
// visitor can prove local account possession instead of starting a second bind flow.
// It unwraps to ErrOIDCLinkRequired so existing failure handling keeps working.
type OIDCPendingBind struct {
	Issuer, Subject, Email, Username string
}

func (e *OIDCPendingBind) Error() string { return ErrOIDCLinkRequired.Error() }
func (e *OIDCPendingBind) Unwrap() error { return ErrOIDCLinkRequired }

type OIDCFlow struct {
	Mode, UserID, CredentialHash, SessionHash string
	Nonce, Verifier, Fingerprint              string
	SetupSecret                               string
	Issuer, Subject, Email, Username          string
}
type OIDCComplete struct {
	Session                contracts.Session
	Token, Mode            string
	BindState, BindBrowser string
}
type OIDCProvider interface {
	Check(context.Context, OIDCConfig) (map[string]string, error)
	Authorize(context.Context, OIDCConfig, string, string, string, bool) (string, error)
	Verify(context.Context, OIDCConfig, string, string, string, bool) (OIDCClaims, error)
}
type OIDCStore interface {
	CreateOIDCFlow(context.Context, string, string, string, int64) error
	ConsumeOIDCFlow(context.Context, string, string) (string, error)
	CompleteOIDC(context.Context, OIDCFlow, OIDCClaims, string, int) (contracts.User, error)
	OIDCAccount(context.Context, string) (contracts.OIDCInfo, error)
	UnlinkOIDC(context.Context, OIDCFlow, string, int) (contracts.User, error)
}
type OIDC struct {
	Store        OIDCStore
	Identity     *Service
	Settings     *settings.Service
	Secrets      settings.Secrets
	Provider     OIDCProvider
	BaseURL      string
	CallbackPath string
}

func (s *OIDC) configuration(ctx context.Context) (OIDCConfig, map[string]string, error) {
	v, err := s.Settings.Raw(ctx)
	callback := s.CallbackPath
	if callback == "" {
		callback = "/api/v1/auth/oidc/callback"
	}
	return OIDCConfig{Issuer: v["oidc.issuer"], ClientID: v["oidc.client_id"], ClientSecret: v["oidc.client_secret"], Scopes: v["oidc.scopes"], Callback: s.BaseURL + callback, Userinfo: v["oidc.userinfo_enabled"] == "true", UserinfoEmailPath: v["oidc.userinfo_email_path"], UserinfoUsernamePath: v["oidc.userinfo_username_path"], Manual: settings.OIDCManualEndpoints(v)}, v, err
}
func (s *OIDC) Info(ctx context.Context, userID string) (contracts.OIDCInfo, error) {
	c, values, err := s.configuration(ctx)
	if err != nil {
		return contracts.OIDCInfo{}, err
	}
	info := contracts.OIDCInfo{Enabled: values["oidc.enabled"] == "true", ProviderName: values["oidc.provider_name"], CallbackUrl: c.Callback}
	if userID != "" {
		account, err := s.Store.OIDCAccount(ctx, userID)
		if err != nil {
			return info, err
		}
		info.Linked, info.Issuer, info.HasLocalPassword = account.Linked, account.Issuer, account.HasLocalPassword
	}
	return info, nil
}
func (s *OIDC) Check(ctx context.Context) (map[string]string, error) {
	c, values, err := s.configuration(ctx)
	if err != nil {
		return nil, err
	}
	if !settings.OIDCConfigured(values) {
		return nil, ErrInput
	}
	if !settings.ValidOIDCURL(s.BaseURL) {
		return nil, ErrInput
	}
	endpoints, err := s.Provider.Check(ctx, c)
	if err != nil {
		return nil, ErrOIDCUnavailable
	}
	return endpoints, nil
}
func (s *OIDC) confirm(ctx context.Context, user contracts.User, password, session, clientIP string) (OIDCFlow, error) {
	if !s.Identity.Limiter.Allow("oidc-password:"+user.ID+":"+clientIP, 6, time.Minute) {
		return OIDCFlow{}, ErrRateLimited
	}
	if len(password) < 12 || len(password) > 128 {
		return OIDCFlow{}, ErrCredentials
	}
	select {
	case s.Identity.loginSlots <- struct{}{}:
		defer func() { <-s.Identity.loginSlots }()
	default:
		return OIDCFlow{}, ErrRateLimited
	}
	a, err := s.Identity.Store.FindAccount(ctx, user.Username)
	if err != nil || a.User.ID != user.ID || a.User.Status != "active" {
		return OIDCFlow{}, ErrCredentials
	}
	if a.PasswordHash == "" {
		return OIDCFlow{}, ErrLocalLoginRequired
	}
	if !VerifyPassword(a.PasswordHash, password) {
		return OIDCFlow{}, ErrCredentials
	}
	return OIDCFlow{Mode: "link", UserID: user.ID, CredentialHash: a.PasswordHash, SessionHash: Hash(session)}, nil
}
func (s *OIDC) Start(ctx context.Context, user contracts.User, password, session, clientIP string) (string, string, error) {
	if !s.Identity.Limiter.Allow("oidc-start:"+clientIP, 20, time.Minute) {
		return "", "", ErrRateLimited
	}
	f := OIDCFlow{Mode: "login"}
	var err error
	if user.ID != "" {
		f, err = s.confirm(ctx, user, password, session, clientIP)
		if err != nil {
			return "", "", err
		}
	}
	return s.startFlow(ctx, f)
}

// StartTOTP proves the already linked identity again; it cannot create or link accounts.
func (s *OIDC) StartTOTP(ctx context.Context, user contracts.User, session, clientIP string) (string, string, error) {
	if !s.Identity.Limiter.Allow("oidc-totp:"+user.ID+":"+clientIP, 8, time.Minute) {
		return "", "", ErrRateLimited
	}
	current, err := s.Identity.Session(ctx, session)
	if err != nil || current.User.ID != user.ID || current.User.TotpEnabled {
		return "", "", ErrCredentials
	}
	info, err := s.Store.OIDCAccount(ctx, user.ID)
	if err != nil || !info.Linked || info.HasLocalPassword {
		return "", "", ErrCredentials
	}
	return s.startFlow(ctx, OIDCFlow{Mode: "totp", UserID: user.ID, SessionHash: Hash(session)})
}

func (s *OIDC) startFlow(ctx context.Context, f OIDCFlow) (string, string, error) {
	c, values, err := s.configuration(ctx)
	if err != nil {
		return "", "", err
	}
	if values["oidc.enabled"] != "true" {
		return "", "", ErrFlowDisabled
	}
	if !settings.ValidOIDCURL(s.BaseURL) {
		return "", "", ErrInput
	}
	f.Nonce, f.Verifier, f.Fingerprint = Token(), Token(), settings.OIDCFingerprint(values)
	state, browser := Token(), Token()
	u, err := s.Provider.Authorize(ctx, c, state, f.Nonce, f.Verifier, f.Mode != "login")
	if err != nil {
		return "", "", ErrOIDCUnavailable
	}
	payload, _ := json.Marshal(f)
	err = s.Store.CreateOIDCFlow(ctx, Hash(state), Hash(browser), s.Secrets.Seal(string(payload)), time.Now().Add(5*time.Minute).Unix())
	return u, browser, err
}
func (s *OIDC) Complete(ctx context.Context, state, browser, code, responseIssuer string, providerError bool, currentSession string) (OIDCComplete, error) {
	if len(state) != 43 || len(browser) != 43 {
		return OIDCComplete{Mode: "login"}, ErrOIDC
	}
	sealed, err := s.Store.ConsumeOIDCFlow(ctx, Hash(state), Hash(browser))
	if err != nil {
		return OIDCComplete{Mode: "login"}, ErrOIDC
	}
	payload, err := s.Secrets.Open(sealed)
	var f OIDCFlow
	if err != nil || json.Unmarshal([]byte(payload), &f) != nil {
		return OIDCComplete{Mode: f.Mode}, ErrOIDC
	}
	result := func(err error) (OIDCComplete, error) {
		return OIDCComplete{Mode: f.Mode}, err
	}
	if providerError || code == "" || len(code) > 2048 {
		return result(ErrOIDC)
	}
	c, values, err := s.configuration(ctx)
	if err != nil {
		return result(err)
	}
	if values["oidc.enabled"] != "true" || settings.OIDCFingerprint(values) != f.Fingerprint || (responseIssuer != "" && responseIssuer != c.Issuer) {
		return result(ErrOIDC)
	}
	if f.Mode == "totp" && (len(currentSession) != 43 || !Equal(Hash(currentSession), f.SessionHash)) {
		return result(ErrCredentials)
	}
	claims, err := s.Provider.Verify(ctx, c, code, f.Nonce, f.Verifier, f.Mode != "login")
	if err != nil {
		return result(ErrOIDC)
	}
	if f.Mode == "totp" {
		secret, err := newTOTPSecret()
		if err != nil {
			return result(err)
		}
		f.SetupSecret = s.Secrets.Seal(secret)
		// The consumed authorization becomes a ten-minute, current-session setup only.
		user, err := s.Store.CompleteOIDC(ctx, f, claims, "", int(time.Now().Unix())+600)
		if err != nil {
			return result(err)
		}
		return OIDCComplete{Session: contracts.Session{User: user}, Mode: f.Mode}, nil
	}
	var sessionPolicy settings.SessionPolicy
	if err := settings.Bind(values, &sessionPolicy); err != nil {
		return result(err)
	}
	hours := sessionPolicy.SessionHours
	if hours < 1 || hours > 168 {
		hours = 24
	}
	expires := int(time.Now().Add(time.Duration(hours) * time.Hour).Unix())
	token := Token()
	user, err := s.Store.CompleteOIDC(ctx, f, claims, Hash(token), expires)
	if err != nil {
		var pending *OIDCPendingBind
		// A colliding or unverified identity becomes a one-shot bind offer instead of a dead end.
		if errors.As(err, &pending) {
			bind := OIDCFlow{Mode: "bindlogin", Fingerprint: f.Fingerprint, Issuer: pending.Issuer, Subject: pending.Subject, Email: pending.Email, Username: pending.Username}
			payload, _ := json.Marshal(bind)
			bindState, bindBrowser := Token(), Token()
			if err := s.Store.CreateOIDCFlow(ctx, Hash(bindState), Hash(bindBrowser), s.Secrets.Seal(string(payload)), time.Now().Add(5*time.Minute).Unix()); err != nil {
				return result(err)
			}
			return OIDCComplete{Mode: f.Mode, BindState: bindState, BindBrowser: bindBrowser}, nil
		}
		return result(err)
	}
	return OIDCComplete{Session: contracts.Session{User: user, CsrfToken: CSRF(token), ExpiresAt: expires}, Token: token, Mode: f.Mode}, nil
}

// BindLogin links the pending enterprise identity to the colliding local account after a
// password proof, then signs the visitor in; identity ownership conflicts still refuse.
func (s *OIDC) BindLogin(ctx context.Context, state, browser, email, password, clientIP string) (contracts.Session, string, error) {
	if !s.Identity.Limiter.Allow("oidc-bind:"+clientIP, 10, time.Minute) {
		return contracts.Session{}, "", ErrRateLimited
	}
	if len(state) != 43 || len(browser) != 43 {
		return contracts.Session{}, "", ErrOIDC
	}
	sealed, err := s.Store.ConsumeOIDCFlow(ctx, Hash(state), Hash(browser))
	if err != nil {
		return contracts.Session{}, "", ErrOIDC
	}
	payload, err := s.Secrets.Open(sealed)
	var f OIDCFlow
	if err != nil || json.Unmarshal([]byte(payload), &f) != nil || f.Mode != "bindlogin" {
		return contracts.Session{}, "", ErrOIDC
	}
	_, values, err := s.configuration(ctx)
	if err != nil {
		return contracts.Session{}, "", err
	}
	if values["oidc.enabled"] != "true" || settings.OIDCFingerprint(values) != f.Fingerprint {
		return contracts.Session{}, "", ErrOIDC
	}
	if !Equal(strings.ToLower(strings.TrimSpace(email)), f.Email) {
		return contracts.Session{}, "", ErrCredentials
	}
	if !s.Identity.Limiter.Allow("oidc-password:"+f.Email+":"+clientIP, 6, time.Minute) {
		return contracts.Session{}, "", ErrRateLimited
	}
	if len(password) < 12 || len(password) > 128 {
		return contracts.Session{}, "", ErrCredentials
	}
	select {
	case s.Identity.loginSlots <- struct{}{}:
		defer func() { <-s.Identity.loginSlots }()
	default:
		return contracts.Session{}, "", ErrRateLimited
	}
	a, err := s.Identity.Store.FindAccount(ctx, strings.ToLower(strings.TrimSpace(email)))
	if err != nil || a.User.Status != "active" {
		return contracts.Session{}, "", ErrCredentials
	}
	if a.PasswordHash == "" {
		return contracts.Session{}, "", ErrLocalLoginRequired
	}
	if !VerifyPassword(a.PasswordHash, password) {
		return contracts.Session{}, "", ErrCredentials
	}
	var sessionPolicy settings.SessionPolicy
	if err := settings.Bind(values, &sessionPolicy); err != nil {
		return contracts.Session{}, "", err
	}
	hours := sessionPolicy.SessionHours
	if hours < 1 || hours > 168 {
		hours = 24
	}
	expires := int(time.Now().Add(time.Duration(hours) * time.Hour).Unix())
	token := Token()
	f.Mode, f.UserID, f.CredentialHash, f.SessionHash = "bindlogin", a.User.ID, a.PasswordHash, Hash(token)
	claims := OIDCClaims{Issuer: f.Issuer, Subject: f.Subject, Email: f.Email, Username: f.Username, EmailVerified: true}
	user, err := s.Store.CompleteOIDC(ctx, f, claims, Hash(token), expires)
	if err != nil {
		return contracts.Session{}, "", err
	}
	return contracts.Session{User: user, CsrfToken: CSRF(token), ExpiresAt: expires}, token, nil
}
func (s *OIDC) Unlink(ctx context.Context, user contracts.User, password, session, clientIP string) (contracts.Session, string, error) {
	f, err := s.confirm(ctx, user, password, session, clientIP)
	if err != nil {
		return contracts.Session{}, "", err
	}
	_, v, err := s.configuration(ctx)
	if err != nil {
		return contracts.Session{}, "", err
	}
	var sessionPolicy settings.SessionPolicy
	if err := settings.Bind(v, &sessionPolicy); err != nil {
		return contracts.Session{}, "", err
	}
	hours := sessionPolicy.SessionHours
	if hours < 1 || hours > 168 {
		hours = 24
	}
	expires := int(time.Now().Add(time.Duration(hours) * time.Hour).Unix())
	token := Token()
	u, err := s.Store.UnlinkOIDC(ctx, f, Hash(token), expires)
	if err != nil {
		return contracts.Session{}, "", err
	}
	return contracts.Session{User: u, CsrfToken: CSRF(token), ExpiresAt: expires}, token, nil
}
