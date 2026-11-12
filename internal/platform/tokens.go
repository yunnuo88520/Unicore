// Author: yunnuo <ymz@ebox.vip>
// Description: Native-client JWTs, rotating refresh families and scoped personal credentials.
package platform

import (
	"context"
	"errors"
	"strings"
	"time"

	jose "github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/mailer"
)

const AccessTokenSeconds = 900
const tokenAudience = "unicore-api"

// APICredential contains no plaintext bearer or refresh secret. Client session
// secrets are encrypted with the installation key; PAT secrets are never stored.
type APICredential struct {
	ID, UserID, Kind, Name, SessionHash, SessionSecret string
	RoleID, RoleName, Remark, Username                 string
	Manage                                             bool
	CreatedAt, ExpiresAt, LastUsedAt                   int
	Revoked                                            bool
}
type TokenSigningKey struct {
	ID, Secret, ActorID   string
	CreatedAt, ValidUntil int
}
type TokenStore interface {
	BindClient(context.Context, string, APICredential, string) error
	BindClientChallenge(context.Context, APICredential) error
	RotateRefresh(context.Context, string, string) (APICredential, error)
	RevokeRefresh(context.Context, string) error
	ResolveCredential(context.Context, string, string) (APICredential, contracts.User, error)
	CreatePersonalToken(context.Context, string, APICredential) (APICredential, error)
	PersonalTokens(context.Context, string, bool, string, int, int) ([]APICredential, int, error)
	PersonalTokenRoles(context.Context, string, string, bool) (contracts.RoleOptions, error)
	PersonalTokenUsers(context.Context, string, string, int, int) (contracts.UserList, error)
	RevokePersonalToken(context.Context, string, string, bool) error
	RenewPersonalToken(context.Context, string, string, int, bool) error
	TokenKey(context.Context, string, TokenSigningKey, bool) (TokenSigningKey, error)
}

type Tokens struct {
	Identity *Service
	Store    TokenStore
	Secrets  mailer.Secrets
}
type BearerIdentity struct {
	Session    contracts.Session
	RawSession string
	Credential APICredential
}
type tokenClaims struct {
	jwt.Claims
	SessionID string `json:"sid"`
}

func (t *Tokens) key(ctx context.Context, id string, rotate bool, actor ...string) (TokenSigningKey, []byte, error) {
	candidate := TokenSigningKey{}
	if id == "" {
		candidate = TokenSigningKey{ID: Token(), Secret: t.Secrets.Seal(Token()), CreatedAt: int(time.Now().Unix())}
	}
	if len(actor) > 0 {
		candidate.ActorID = actor[0]
	}
	key, err := t.Store.TokenKey(ctx, id, candidate, rotate)
	if err != nil {
		return key, nil, err
	}
	secret, err := t.Secrets.Open(key.Secret)
	return key, []byte(secret), err
}

// Exchange accepts only a fully authenticated session, never a pending factor
// or a personal token. External login adapters can reuse this same boundary.
func (t *Tokens) Exchange(ctx context.Context, sessionToken, name string) (contracts.ClientTokenPair, error) {
	session, err := t.Identity.Session(ctx, sessionToken)
	if err != nil {
		return contracts.ClientTokenPair{}, err
	}
	profile, err := t.Identity.Personal.Profile(ctx, sessionToken)
	if err != nil {
		return contracts.ClientTokenPair{}, err
	}
	if profile.Force2fa && !profile.TotpEnabled {
		return contracts.ClientTokenPair{}, ErrMFAEnrollment
	}
	privateSession := Token()
	record := APICredential{ID: Token(), UserID: session.User.ID, Kind: "client", Name: name, SessionHash: Hash(privateSession), SessionSecret: t.Secrets.Seal(privateSession), CreatedAt: int(time.Now().Unix()), ExpiresAt: session.ExpiresAt}
	refresh := Token()
	if err = t.Store.BindClient(ctx, Hash(sessionToken), record, Hash(refresh)); err != nil {
		return contracts.ClientTokenPair{}, err
	}
	pair, err := t.pair(ctx, record, refresh)
	if err != nil {
		_ = t.Store.RevokeRefresh(ctx, Hash(refresh))
	}
	return pair, err
}
func (t *Tokens) pair(ctx context.Context, record APICredential, refresh string) (contracts.ClientTokenPair, error) {
	raw, err := t.Secrets.Open(record.SessionSecret)
	if err != nil {
		return contracts.ClientTokenPair{}, err
	}
	session, err := t.Identity.Session(ctx, raw)
	if err != nil {
		return contracts.ClientTokenPair{}, err
	}
	now := int(time.Now().Unix())
	expires := min(now+AccessTokenSeconds, record.ExpiresAt, session.ExpiresAt)
	key, secret, err := t.key(ctx, "", false)
	if err != nil {
		return contracts.ClientTokenPair{}, err
	}
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.HS256, Key: secret}, (&jose.SignerOptions{}).WithType("at+jwt").WithHeader("kid", key.ID))
	if err != nil {
		return contracts.ClientTokenPair{}, err
	}
	claims := tokenClaims{Claims: jwt.Claims{Issuer: "unicore", Subject: session.User.ID, Audience: jwt.Audience{tokenAudience}, Expiry: jwt.NewNumericDate(time.Unix(int64(expires), 0)), IssuedAt: jwt.NewNumericDate(time.Unix(int64(now), 0)), NotBefore: jwt.NewNumericDate(time.Unix(int64(now), 0)), ID: Token()}, SessionID: record.ID}
	access, err := jwt.Signed(signer).Claims(claims).Serialize()
	return contracts.ClientTokenPair{AccessToken: access, RefreshToken: refresh, TokenType: "Bearer", ExpiresIn: expires - now, RefreshExpiresAt: record.ExpiresAt, User: session.User}, err
}
func (t *Tokens) Refresh(ctx context.Context, refresh string) (contracts.ClientTokenPair, error) {
	if len(refresh) != 43 {
		return contracts.ClientTokenPair{}, ErrCredentials
	}
	next := Token()
	record, err := t.Store.RotateRefresh(ctx, Hash(refresh), Hash(next))
	if err != nil {
		return contracts.ClientTokenPair{}, err
	}
	pair, err := t.pair(ctx, record, next)
	if err != nil {
		_ = t.Store.RevokeRefresh(ctx, Hash(next))
	}
	return pair, err
}
func (t *Tokens) Revoke(ctx context.Context, refresh string) error {
	if len(refresh) != 43 {
		return ErrCredentials
	}
	return t.Store.RevokeRefresh(ctx, Hash(refresh))
}
func (t *Tokens) Resolve(ctx context.Context, bearer string) (BearerIdentity, error) {
	var result BearerIdentity
	if strings.HasPrefix(bearer, "ucp_") {
		if len(bearer) != 47 {
			return result, ErrCredentials
		}
		record, user, err := t.Store.ResolveCredential(ctx, "pat", Hash(bearer))
		if err != nil {
			return result, err
		}
		result = BearerIdentity{Session: contracts.Session{User: user, ExpiresAt: record.ExpiresAt}, RawSession: bearer, Credential: record}
		return result, nil
	}
	if len(bearer) > 4096 {
		return result, ErrCredentials
	}
	parsed, err := jwt.ParseSigned(bearer, []jose.SignatureAlgorithm{jose.HS256})
	if err != nil || len(parsed.Headers) != 1 {
		return result, ErrCredentials
	}
	header := parsed.Headers[0]
	if len(header.KeyID) != 43 || header.ExtraHeaders["typ"] != "at+jwt" {
		return result, ErrCredentials
	}
	_, secret, err := t.key(ctx, header.KeyID, false)
	if err != nil {
		if errors.Is(err, ErrCredentials) {
			return result, ErrCredentials
		}
		return result, err
	}
	var claims tokenClaims
	if err = parsed.Claims(secret, &claims); err != nil {
		return result, ErrCredentials
	}
	now := time.Now()
	if claims.Expiry == nil || claims.IssuedAt == nil || claims.NotBefore == nil || claims.ID == "" || claims.Expiry.Time().Sub(claims.IssuedAt.Time()) > AccessTokenSeconds*time.Second {
		return result, ErrCredentials
	}
	if err = claims.ValidateWithLeeway(jwt.Expected{Issuer: "unicore", AnyAudience: jwt.Audience{tokenAudience}, Time: now}, 0); err != nil {
		return result, ErrCredentials
	}
	record, _, err := t.Store.ResolveCredential(ctx, "client", claims.SessionID)
	if err != nil {
		return result, err
	}
	if record.UserID != claims.Subject {
		return result, ErrCredentials
	}
	raw, err := t.Secrets.Open(record.SessionSecret)
	if err != nil {
		return result, err
	}
	session, err := t.Identity.Session(ctx, raw)
	if err != nil {
		return result, err
	}
	return BearerIdentity{Session: session, RawSession: raw, Credential: record}, nil
}
func (b BearerIdentity) Allows(operationID, path string) bool {
	// Auth and credential issuance stay on dedicated proof endpoints. A PAT
	// cannot mint more credentials or perform privileged account recovery.
	if strings.Contains(path, "/auth/") || strings.Contains(path, "/account/tokens") || strings.Contains(path, "/account/token-roles") {
		return false
	}
	if b.Credential.Kind == "client" {
		return true
	}
	op, ok := Operation(operationID)
	if !ok || !op.Grantable || op.SuperAdmin {
		return false
	}
	return OperationAllowed(b.Session.User, operationID) && PermissionsAllow(b.Session.User.Permissions, op.Permissions, op.PermissionMode)
}

// TokenExpiry uses zero for permanent credentials and computes a deadline from now.
func TokenExpiry(days int) (int, error) {
	switch days {
	case 0:
		return 0, nil
	case 1, 7, 30, 90:
		return int(time.Now().Unix()) + days*86400, nil
	}
	return 0, ErrInput
}
func (t *Tokens) CreatePAT(ctx context.Context, source string, input contracts.PersonalTokenInput, target ...string) (contracts.PersonalTokenCreated, error) {
	session, err := t.Identity.Session(ctx, source)
	if err != nil {
		return contracts.PersonalTokenCreated{}, err
	}
	if !t.Identity.Limiter.Allow("pat-create:"+session.User.ID, 30, time.Hour) {
		return contracts.PersonalTokenCreated{}, ErrRateLimited
	}
	name, remark := strings.TrimSpace(input.Name), strings.TrimSpace(input.Remark)
	expires, err := TokenExpiry(input.ExpiresInDays)
	if err != nil || name == "" || len([]rune(name)) > 80 || len([]rune(remark)) > 500 || strings.ContainsAny(name, "\x00\r\n") || strings.ContainsRune(remark, '\x00') {
		return contracts.PersonalTokenCreated{}, ErrInput
	}
	owner := session.User.ID
	if len(target) > 0 {
		owner = target[0]
	}
	raw := "ucp_" + Token()
	record := APICredential{ID: Token(), UserID: owner, Kind: "pat", Name: name, RoleID: input.RoleID, Remark: remark, Manage: len(target) > 0, SessionHash: Hash(raw), CreatedAt: int(time.Now().Unix()), ExpiresAt: expires}
	if record, err = t.Store.CreatePersonalToken(ctx, Hash(source), record); err != nil {
		return contracts.PersonalTokenCreated{}, err
	}
	return contracts.PersonalTokenCreated{Token: raw, Credential: PersonalTokenView(record)}, nil
}
func PersonalTokenView(r APICredential) contracts.PersonalToken {
	return contracts.PersonalToken{ID: r.ID, UserID: r.UserID, Username: r.Username, Name: r.Name, RoleID: r.RoleID, RoleName: r.RoleName, Remark: r.Remark, CreatedAt: r.CreatedAt, ExpiresAt: r.ExpiresAt, LastUsedAt: r.LastUsedAt, Revoked: r.Revoked}
}

// A bearer restriction follows the authenticated actor into transactional reloads.
// Other users read as resources keep their complete account projection.
type tokenRoleKey struct{}
type tokenRole struct{ UserID, RoleID string }

func WithTokenRole(ctx context.Context, user, role string) context.Context {
	return context.WithValue(ctx, tokenRoleKey{}, tokenRole{user, role})
}
func TokenRole(ctx context.Context, user string) string {
	v, _ := ctx.Value(tokenRoleKey{}).(tokenRole)
	if v.UserID == user {
		return v.RoleID
	}
	return ""
}
func (t *Tokens) RotateSigningKey(ctx context.Context, actor string) error {
	_, _, err := t.key(ctx, "", true, actor)
	return err
}

// Challenge hides the internal pending-session secret behind a separate,
// short-lived proof. Even stripping the prefix cannot produce a Cookie.
func (t *Tokens) Challenge(ctx context.Context, source string) (string, error) {
	session, err := t.Identity.Personal.Pending(ctx, source)
	if err != nil {
		return "", err
	}
	proof := "ucc_" + Token()
	now := int(time.Now().Unix())
	record := APICredential{ID: Hash(proof), UserID: session.User.ID, Kind: "challenge", Name: "client-mfa", SessionHash: Hash(source), SessionSecret: t.Secrets.Seal(source), CreatedAt: now, ExpiresAt: min(now+300, session.ExpiresAt)}
	if err = t.Store.BindClientChallenge(ctx, record); err != nil {
		return "", err
	}
	return proof, nil
}
func (t *Tokens) ChallengeSession(ctx context.Context, proof string) (string, error) {
	if len(proof) != 47 || !strings.HasPrefix(proof, "ucc_") {
		return "", ErrCredentials
	}
	record, _, err := t.Store.ResolveCredential(ctx, "challenge", Hash(proof))
	if err != nil {
		return "", err
	}
	raw, err := t.Secrets.Open(record.SessionSecret)
	if err != nil {
		return "", err
	}
	if _, err = t.Identity.Personal.Pending(ctx, raw); err != nil {
		return "", err
	}
	return raw, nil
}
