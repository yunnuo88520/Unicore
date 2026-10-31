// Author: yunnuo <ymz@ebox.vip>
// Description: Platform-only OIDC orchestration; identity proof stays separate from local authorization.
package platform

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
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

type OIDCConfig struct{ Issuer, ClientID, ClientSecret, Scopes, Callback string }
type OIDCClaims struct {
	Issuer, Subject, Email string
	EmailVerified          bool
}
type OIDCFlow struct {
	Mode, UserID, CredentialHash, SessionHash string
	Nonce, Verifier, Fingerprint              string
}
type OIDCProvider interface {
	Check(context.Context, OIDCConfig) error
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
	return OIDCConfig{Issuer: v["oidc.issuer"], ClientID: v["oidc.client_id"], ClientSecret: v["oidc.client_secret"], Scopes: v["oidc.scopes"], Callback: s.BaseURL + callback}, v, err
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
func (s *OIDC) Check(ctx context.Context) error {
	c, values, err := s.configuration(ctx)
	if err != nil {
		return err
	}
	if !settings.OIDCConfigured(values) {
		return ErrInput
	}
	if !settings.ValidOIDCURL(s.BaseURL) {
		return ErrInput
	}
	if err := s.Provider.Check(ctx, c); err != nil {
		return ErrOIDCUnavailable
	}
	return nil
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
	f := OIDCFlow{Mode: "login"}
	if user.ID != "" {
		f, err = s.confirm(ctx, user, password, session, clientIP)
		if err != nil {
			return "", "", err
		}
	}
	f.Nonce, f.Verifier, f.Fingerprint = Token(), Token(), settings.OIDCFingerprint(values)
	state, browser := Token(), Token()
	u, err := s.Provider.Authorize(ctx, c, state, f.Nonce, f.Verifier, f.Mode == "link")
	if err != nil {
		return "", "", ErrOIDCUnavailable
	}
	payload, _ := json.Marshal(f)
	err = s.Store.CreateOIDCFlow(ctx, Hash(state), Hash(browser), s.Secrets.Seal(string(payload)), time.Now().Add(5*time.Minute).Unix())
	return u, browser, err
}
func (s *OIDC) Complete(ctx context.Context, state, browser, code, responseIssuer string, providerError bool) (contracts.Session, string, string, error) {
	if len(state) != 43 || len(browser) != 43 {
		return contracts.Session{}, "", "login", ErrOIDC
	}
	sealed, err := s.Store.ConsumeOIDCFlow(ctx, Hash(state), Hash(browser))
	if err != nil {
		return contracts.Session{}, "", "login", ErrOIDC
	}
	payload, err := s.Secrets.Open(sealed)
	var f OIDCFlow
	if err != nil || json.Unmarshal([]byte(payload), &f) != nil {
		return contracts.Session{}, "", "login", ErrOIDC
	}
	result := func(err error) (contracts.Session, string, string, error) {
		return contracts.Session{}, "", f.Mode, err
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
	claims, err := s.Provider.Verify(ctx, c, code, f.Nonce, f.Verifier, f.Mode == "link")
	if err != nil {
		return result(ErrOIDC)
	}
	hours, _ := strconv.Atoi(values["security.session_hours"])
	if hours < 1 || hours > 168 {
		hours = 24
	}
	expires := int(time.Now().Add(time.Duration(hours) * time.Hour).Unix())
	token := Token()
	user, err := s.Store.CompleteOIDC(ctx, f, claims, Hash(token), expires)
	if err != nil {
		return result(err)
	}
	return contracts.Session{User: user, CsrfToken: CSRF(token), ExpiresAt: expires}, token, f.Mode, nil
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
	hours, _ := strconv.Atoi(v["security.session_hours"])
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
