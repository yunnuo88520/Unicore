// Author: yunnuo <ymz@ebox.vip>
// Description: Authorization-service semantics tests over an in-memory store: consent binding, one-time codes, PKCE, rotation and replay detection.
package mcpoauth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

// memoryStore is an in-memory Store; rows are digests only, like production.
type memoryStore struct {
	mu      sync.Mutex
	clients map[string]Client
	grants  map[string]Grant
	codes   map[string]codeRow
	tokens  map[string]TokenRecord
	actor   GrantActor
	anchor  string
}

type codeRow struct {
	grantID     string
	redirectURI string
	challenge   string
	method      string
	expiresAt   int64
	consumedAt  int64
}

func newMemoryStore() *memoryStore {
	return &memoryStore{
		clients: map[string]Client{},
		grants:  map[string]Grant{},
		codes:   map[string]codeRow{},
		tokens:  map[string]TokenRecord{},
		actor:   GrantActor{User: contracts.User{ID: "user-1", Status: "active", Roles: []string{"role-a"}}},
		anchor:  platform.Hash("password-v1"),
	}
}

func (m *memoryStore) CreateClient(_ context.Context, client Client, _ string) (Client, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.clients[client.ID] = client
	return client, nil
}

func (m *memoryStore) UpdateClient(_ context.Context, expected Client, _ string, redirectURIs []string, enabled bool, _ string) (Client, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	stored, ok := m.clients[expected.ID]
	if !ok || stored.Version != expected.Version {
		return expected, ErrConflict
	}
	stored.RedirectURIs, stored.Enabled = redirectURIs, enabled
	stored.Version++
	m.clients[stored.ID] = stored
	return stored, nil
}

func (m *memoryStore) Secret(_ context.Context, clientID, secretHash string, _ bool, _ string) (Client, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	stored, ok := m.clients[clientID]
	if !ok || stored.ClientType != ClientConfidential {
		return Client{}, ErrClientNotFound
	}
	stored.SecretHash, stored.Version = secretHash, stored.Version+1
	m.clients[clientID] = stored
	return stored, nil
}

func (m *memoryStore) Clients(_ context.Context) ([]Client, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	clients := []Client{}
	for _, client := range m.clients {
		clients = append(clients, client)
	}
	sort.Slice(clients, func(i, j int) bool { return clients[i].ID < clients[j].ID })
	return clients, nil
}

func (m *memoryStore) Client(_ context.Context, id string) (Client, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	client, ok := m.clients[id]
	if !ok {
		return Client{}, ErrClientNotFound
	}
	return client, nil
}

func (m *memoryStore) CreateGrant(_ context.Context, grant Grant) (Grant, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.grants[grant.ID] = grant
	return grant, nil
}

func (m *memoryStore) Grant(_ context.Context, id string) (Grant, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	grant, ok := m.grants[id]
	if !ok {
		return Grant{}, ErrInvalidGrant
	}
	return grant, nil
}

func (m *memoryStore) GrantsForUser(_ context.Context, _ string) ([]Grant, error) { return nil, nil }
func (m *memoryStore) GrantsForClient(_ context.Context, _ string) ([]Grant, error) {
	return nil, nil
}

func (m *memoryStore) GrantViewsForClient(_ context.Context, clientID string) ([]AdminGrantView, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	views := []AdminGrantView{}
	for _, grant := range m.grants {
		if grant.ClientID == clientID && grant.Status == GrantActive {
			views = append(views, AdminGrantView{Grant: grant, Username: "user-1", RoleName: grant.RoleID})
		}
	}
	return views, nil
}

func (m *memoryStore) RevokeGrant(_ context.Context, grant Grant, _ string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	grant.Status, grant.RevokedAt = GrantRevoked, int(time.Now().Unix())
	m.grants[grant.ID] = grant
	return nil
}

func (m *memoryStore) TouchGrant(_ context.Context, id string, now int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	grant, ok := m.grants[id]
	if !ok {
		return ErrInvalidGrant
	}
	grant.LastUsedAt = int(now)
	m.grants[id] = grant
	return nil
}

func (m *memoryStore) SaveCode(_ context.Context, hash, grantID, redirectURI, challenge, method string, expiresAt int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.codes[hash] = codeRow{grantID: grantID, redirectURI: redirectURI, challenge: challenge, method: method, expiresAt: expiresAt}
	return nil
}

func (m *memoryStore) ConsumeCode(_ context.Context, hash string, now int64) (string, string, string, string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	row, ok := m.codes[hash]
	if !ok || row.consumedAt != 0 || row.expiresAt <= now {
		return "", "", "", "", ErrInvalidCode
	}
	row.consumedAt = now
	m.codes[hash] = row
	return row.grantID, row.redirectURI, row.challenge, row.method, nil
}

func (m *memoryStore) SaveToken(_ context.Context, hash, kind, grantID, familyID, parentID, scopes string, expiresAt int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, record := range m.tokens {
		if record.FamilyID == familyID && record.Revoked {
			return ErrInvalidGrant
		}
	}
	m.tokens[hash] = TokenRecord{Hash: hash, Kind: kind, GrantID: grantID, FamilyID: familyID, ParentID: parentID, Scopes: ParseScopes(scopes), ExpiresAt: expiresAt}
	return nil
}

func (m *memoryStore) FamilyDeadline(_ context.Context, familyID string) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	deadline := int64(0)
	for _, record := range m.tokens {
		if record.FamilyID == familyID && record.Kind == TokenRefresh && (deadline == 0 || record.ExpiresAt < deadline) {
			deadline = record.ExpiresAt
		}
	}
	return deadline, nil
}

func (m *memoryStore) UpdateGrantConsent(_ context.Context, grantID string, scopes []string, anchor string) (Grant, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	grant, ok := m.grants[grantID]
	if !ok || grant.Status != GrantActive {
		return Grant{}, ErrInvalidGrant
	}
	grant.Scopes, grant.SecurityAnchor = scopes, anchor
	m.grants[grantID] = grant
	return grant, nil
}

func (m *memoryStore) Token(_ context.Context, hash string) (TokenRecord, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	record, ok := m.tokens[hash]
	if !ok {
		return TokenRecord{}, ErrInvalidGrant
	}
	return record, nil
}

func (m *memoryStore) ConsumeToken(_ context.Context, hash string, now int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	record, ok := m.tokens[hash]
	if !ok || record.Kind != TokenRefresh || record.Consumed || record.Revoked || record.ExpiresAt <= now {
		return ErrInvalidGrant
	}
	record.Consumed = true
	m.tokens[hash] = record
	return nil
}

func (m *memoryStore) RevokeFamily(_ context.Context, familyID string, now int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for hash, record := range m.tokens {
		if record.FamilyID == familyID && !record.Revoked {
			record.Revoked = true
			m.tokens[hash] = record
		}
	}
	return nil
}

func (m *memoryStore) RevokeGrantTokens(_ context.Context, grantID string, now int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for hash, record := range m.tokens {
		if record.GrantID == grantID && !record.Revoked {
			record.Revoked = true
			m.tokens[hash] = record
		}
	}
	return nil
}

func (m *memoryStore) GrantActor(_ context.Context, _, _ string) (GrantActor, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.actor, nil
}

func (m *memoryStore) PasswordAnchor(_ context.Context, _ string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.anchor, nil
}

func (m *memoryStore) SweepExpired(_ context.Context, _ int64) error { return nil }

// consentedService builds one enabled confidential client, one enabled
// public client and one active read+offline grant per client.
func consentedService(t *testing.T) (*Service, *memoryStore, Client, Client, Grant, Grant) {
	t.Helper()
	store := newMemoryStore()
	service := New(store, func() string { return "https://unicore.example/mcp" })
	ctx := context.Background()
	confidential, _, err := service.CreateClient(ctx, "CLI", ClientConfidential, AuthClientSecretPost, []string{"https://app.example/cb"}, "admin")
	if err != nil {
		t.Fatalf("create confidential client: %v", err)
	}
	if _, err := service.UpdateClient(ctx, confidential.ID, "CLI", confidential.RedirectURIs, true, confidential.Version, "admin"); err != nil {
		t.Fatalf("enable confidential client: %v", err)
	}
	publicClient, _, err := service.CreateClient(ctx, "SPA", ClientPublic, "", []string{"http://127.0.0.1:8931/cb"}, "admin")
	if err != nil {
		t.Fatalf("create public client: %v", err)
	}
	if _, err := service.UpdateClient(ctx, publicClient.ID, "SPA", publicClient.RedirectURIs, true, publicClient.Version, "admin"); err != nil {
		t.Fatalf("enable public client: %v", err)
	}
	confidentialClient, _ := store.Client(ctx, confidential.ID)
	publicStored, _ := store.Client(ctx, publicClient.ID)
	scopes := []string{ScopeRead, ScopeOffline}
	confidentialGrant, err := service.CreateGrant(ctx, "user-1", confidential.ID, "role-a", scopes, []string{"role-a", "role-b"})
	if err != nil {
		t.Fatalf("create confidential grant: %v", err)
	}
	publicGrant, err := service.CreateGrant(ctx, "user-1", publicClient.ID, "role-a", scopes, []string{"role-a"})
	if err != nil {
		t.Fatalf("create public grant: %v", err)
	}
	return service, store, confidentialClient, publicStored, confidentialGrant, publicGrant
}

func pkcePair(t *testing.T) (verifier, challenge string) {
	t.Helper()
	verifier = base64.RawURLEncoding.EncodeToString([]byte(strings.Repeat("v", 48)))
	digest := sha256.Sum256([]byte(verifier))
	return verifier, base64.RawURLEncoding.EncodeToString(digest[:])
}

func TestNormalizeScopesBoundsVocabulary(t *testing.T) {
	scopes, err := NormalizeScopes([]string{" mcp.read ", "mcp.read", "offline_access"})
	if err != nil {
		t.Fatalf("normalize: %v", err)
	}
	if strings.Join(scopes, " ") != ScopeRead+" "+ScopeOffline {
		t.Fatalf("scopes = %v", scopes)
	}
	if scopes, err = NormalizeScopes([]string{ScopeWrite}); err != nil || len(scopes) != 1 || scopes[0] != ScopeWrite {
		t.Fatalf("write scope must normalize to itself, got %v / %v", scopes, err)
	}
	if _, err = NormalizeScopes([]string{"email"}); err == nil {
		t.Fatal("unknown scope must be rejected")
	}
	if scopes, _ = NormalizeScopes(nil); len(scopes) != 1 || scopes[0] != ScopeRead {
		t.Fatalf("empty request must degrade to read, got %v", scopes)
	}
	if !ScopesAllow([]string{ScopeRead}, false) || ScopesAllow([]string{ScopeRead}, true) {
		t.Fatal("scope budget must gate writes")
	}
}

func TestValidateRedirectURIs(t *testing.T) {
	if err := ValidateRedirectURIs([]string{"http://app.example/cb"}); err == nil {
		t.Fatal("plain http must be rejected")
	}
	if err := ValidateRedirectURIs([]string{"https://app.example/cb", "http://127.0.0.1:8931/cb"}); err != nil {
		t.Fatalf("https + loopback must pass: %v", err)
	}
	if err := ValidateRedirectURIs([]string{"https://user@app.example/cb"}); err == nil {
		t.Fatal("credentials must be rejected")
	}
	if err := ValidateRedirectURIs([]string{"https://app.example/*"}); err == nil {
		t.Fatal("wildcards must be rejected")
	}
	if err := ValidateRedirectURIs(nil); err == nil {
		t.Fatal("empty registration must be rejected")
	}
}

func TestExchangeCodePublicClientPKCE(t *testing.T) {
	service, _, _, publicClient, _, grant := consentedService(t)
	ctx := context.Background()
	verifier, challenge := pkcePair(t)
	code, err := service.IssueCode(ctx, grant, publicClient.RedirectURIs[0], challenge, "S256")
	if err != nil {
		t.Fatalf("issue code: %v", err)
	}
	issued, err := service.ExchangeCode(ctx, publicClient.ID, "", code, publicClient.RedirectURIs[0], verifier)
	if err != nil {
		t.Fatalf("exchange: %v", err)
	}
	if !strings.HasPrefix(issued.AccessToken, "ucm_") || issued.TokenType != "Bearer" || issued.ExpiresIn != AccessTTLSeconds {
		t.Fatalf("issued = %+v", issued)
	}
	if issued.RefreshToken == "" {
		t.Fatal("offline_access consent must yield a refresh token")
	}
	// The code burned exactly once.
	if _, err = service.ExchangeCode(ctx, publicClient.ID, "", code, publicClient.RedirectURIs[0], verifier); err != ErrInvalidCode {
		t.Fatalf("replayed code = %v, want ErrInvalidCode", err)
	}
}

func TestExchangeCodeRejectsWrongPKCEAndRedirect(t *testing.T) {
	service, _, _, publicClient, _, grant := consentedService(t)
	ctx := context.Background()
	verifier, challenge := pkcePair(t)
	code, err := service.IssueCode(ctx, grant, publicClient.RedirectURIs[0], challenge, "S256")
	if err != nil {
		t.Fatalf("issue code: %v", err)
	}
	if _, err = service.ExchangeCode(ctx, publicClient.ID, "", code, publicClient.RedirectURIs[0], strings.Repeat("w", 48)); err != ErrInvalidVerifier {
		t.Fatalf("wrong verifier = %v", err)
	}
	// The failed PKCE attempt consumed the code; a fresh one for the redirect test.
	code, err = service.IssueCode(ctx, grant, publicClient.RedirectURIs[0], challenge, "S256")
	if err != nil {
		t.Fatalf("issue code: %v", err)
	}
	if _, err = service.ExchangeCode(ctx, publicClient.ID, "", code, "https://evil.example/cb", verifier); err != ErrInvalidRedirect {
		t.Fatalf("unregistered redirect = %v", err)
	}
	// Public clients must never skip PKCE, at issuance or redemption.
	if _, err = service.IssueCode(ctx, grant, publicClient.RedirectURIs[0], "", ""); err != ErrInvalidRequest {
		t.Fatalf("issue without challenge = %v", err)
	}
}

func TestExchangeCodeConfidentialClientSecret(t *testing.T) {
	service, store, confidentialClient, _, grant, _ := consentedService(t)
	ctx := context.Background()
	code, err := service.IssueCode(ctx, grant, confidentialClient.RedirectURIs[0], "", "")
	if err != nil {
		t.Fatalf("issue code: %v", err)
	}
	// The one-time secret was dropped by the factory; recover the digest by
	// rotating and re-reading the client, then mint a fresh consent code.
	rotated, secret, err := service.RotateClientSecret(ctx, confidentialClient.ID, "admin")
	if err != nil {
		t.Fatalf("rotate secret: %v", err)
	}
	if secret == "" || rotated.SecretHash == "" {
		t.Fatal("rotation must yield a secret and a stored digest")
	}
	code, err = service.IssueCode(ctx, grant, confidentialClient.RedirectURIs[0], "", "")
	if err != nil {
		t.Fatalf("issue code: %v", err)
	}
	issued, err := service.ExchangeCode(ctx, confidentialClient.ID, secret, code, confidentialClient.RedirectURIs[0], "")
	if err != nil {
		t.Fatalf("exchange with secret: %v", err)
	}
	if issued.AccessToken == "" {
		t.Fatal("expected an access token")
	}
	if _, err = service.ExchangeCode(ctx, confidentialClient.ID, "wrong-secret", code, confidentialClient.RedirectURIs[0], ""); err != ErrInvalidClient {
		// Client authentication precedes code redemption.
		t.Fatalf("bad secret = %v", err)
	}
	if store.clients[confidentialClient.ID].SecretHash == "" {
		t.Fatal("confidential client must keep a digest")
	}
}

func TestRefreshRotationAndReplayDetection(t *testing.T) {
	service, _, _, publicClient, _, grant := consentedService(t)
	ctx := context.Background()
	verifier, challenge := pkcePair(t)
	code, _ := service.IssueCode(ctx, grant, publicClient.RedirectURIs[0], challenge, "S256")
	first, err := service.ExchangeCode(ctx, publicClient.ID, "", code, publicClient.RedirectURIs[0], verifier)
	if err != nil {
		t.Fatalf("exchange: %v", err)
	}
	second, err := service.Refresh(ctx, publicClient.ID, "", first.RefreshToken)
	if err != nil {
		t.Fatalf("refresh: %v", err)
	}
	if second.AccessToken == first.AccessToken || second.RefreshToken == first.RefreshToken {
		t.Fatal("rotation must mint fresh tokens")
	}
	// Replaying the consumed refresh token burns the whole family: both the
	// replay and the successor stop working.
	if _, err = service.Refresh(ctx, publicClient.ID, "", first.RefreshToken); err != ErrInvalidGrant {
		t.Fatalf("replay = %v", err)
	}
	if _, err = service.Refresh(ctx, publicClient.ID, "", second.RefreshToken); err != ErrInvalidGrant {
		t.Fatalf("successor after replay = %v", err)
	}
	if _, _, err = service.Resolve(ctx, second.AccessToken); err != ErrInvalidGrant {
		t.Fatalf("successor access token = %v", err)
	}
}

func TestRefreshWithoutOfflineAccessIsUnsupported(t *testing.T) {
	service, _, _, publicClient, _, _ := consentedService(t)
	ctx := context.Background()
	readGrant, err := service.CreateGrant(ctx, "user-1", publicClient.ID, "role-a", []string{ScopeRead}, []string{"role-a"})
	if err != nil {
		t.Fatalf("create read-only grant: %v", err)
	}
	verifier, challenge := pkcePair(t)
	code, _ := service.IssueCode(ctx, readGrant, publicClient.RedirectURIs[0], challenge, "S256")
	issued, err := service.ExchangeCode(ctx, publicClient.ID, "", code, publicClient.RedirectURIs[0], verifier)
	if err != nil {
		t.Fatalf("exchange: %v", err)
	}
	if issued.RefreshToken != "" {
		t.Fatal("no offline_access must mean no refresh token")
	}
}

func TestResolveChecksGrantAndAnchor(t *testing.T) {
	service, store, _, publicClient, _, grant := consentedService(t)
	ctx := context.Background()
	verifier, challenge := pkcePair(t)
	code, _ := service.IssueCode(ctx, grant, publicClient.RedirectURIs[0], challenge, "S256")
	first, err := service.ExchangeCode(ctx, publicClient.ID, "", code, publicClient.RedirectURIs[0], verifier)
	if err != nil {
		t.Fatalf("exchange: %v", err)
	}
	resolved, _, err := service.Resolve(ctx, first.AccessToken)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if resolved.RoleID != "role-a" || resolved.Resource != "https://unicore.example/mcp" {
		t.Fatalf("resolved = %+v", resolved)
	}
	// Foreign token shapes never resolve.
	if _, _, err = service.Resolve(ctx, "pat_not-an-oauth-token"); err != ErrInvalidGrant {
		t.Fatalf("PAT prefix = %v", err)
	}
	// A password change rotates the anchor and invalidates every grant.
	store.anchor = platform.Hash("password-v2")
	if _, _, err = service.Resolve(ctx, first.AccessToken); err != ErrInvalidGrant {
		t.Fatalf("stale anchor = %v", err)
	}
	store.anchor = platform.Hash("password-v1")
	// Revocation stops every token of the grant.
	if err = service.RevokeGrant(ctx, resolved, "admin"); err != nil {
		t.Fatalf("revoke grant: %v", err)
	}
	if _, _, err = service.Resolve(ctx, first.AccessToken); err != ErrInvalidGrant {
		t.Fatalf("revoked grant = %v", err)
	}
}

func TestResolveChecksAccountAndRole(t *testing.T) {
	service, store, _, publicClient, _, grant := consentedService(t)
	ctx := context.Background()
	verifier, challenge := pkcePair(t)
	code, _ := service.IssueCode(ctx, grant, publicClient.RedirectURIs[0], challenge, "S256")
	issued, err := service.ExchangeCode(ctx, publicClient.ID, "", code, publicClient.RedirectURIs[0], verifier)
	if err != nil {
		t.Fatalf("exchange: %v", err)
	}
	store.actor.User.Status = "disabled"
	if _, _, err = service.Resolve(ctx, issued.AccessToken); err != ErrInvalidGrant {
		t.Fatalf("disabled account = %v", err)
	}
	store.actor.User.Status = "active"
	store.actor.User.Roles = []string{"role-b"}
	if _, _, err = service.Resolve(ctx, issued.AccessToken); err != ErrInvalidGrant {
		t.Fatalf("dropped role = %v", err)
	}
}

func TestRevokeTokenSemantics(t *testing.T) {
	service, _, confidentialClient, _, _, grant := consentedService(t)
	ctx := context.Background()
	code, _ := service.IssueCode(ctx, grant, confidentialClient.RedirectURIs[0], "", "")
	issued, err := service.ExchangeCode(ctx, confidentialClient.ID, "", code, confidentialClient.RedirectURIs[0], "")
	if err == nil {
		t.Fatal("confidential exchange without a secret must fail")
	}
	_ = issued
	// RFC 7009: unknown tokens and bad clients still answer without error.
	if err = service.RevokeToken(ctx, "missing", "", "ucr_unknown"); err != nil {
		t.Fatalf("unknown client revoke = %v", err)
	}
}

func TestGrantRequiresHeldRoleAndEnabledClient(t *testing.T) {
	service, _, _, publicClient, _, _ := consentedService(t)
	ctx := context.Background()
	if _, err := service.CreateGrant(ctx, "user-1", publicClient.ID, "role-zz", []string{ScopeRead}, []string{"role-a"}); err != ErrForbidden {
		t.Fatalf("unheld role = %v", err)
	}
	if _, err := service.UpdateClient(ctx, publicClient.ID, publicClient.Name, publicClient.RedirectURIs, false, 2, "admin"); err != nil {
		t.Fatalf("disable client: %v", err)
	}
	if _, err := service.CreateGrant(ctx, "user-1", publicClient.ID, "role-a", []string{ScopeRead}, []string{"role-a"}); err != ErrClientDisabled {
		t.Fatalf("disabled client = %v", err)
	}
}

func TestPKCEVerifierBounds(t *testing.T) {
	verifier, challenge := pkcePair(t)
	if !verifyPKCE(challenge, verifier) {
		t.Fatal("matching pair must verify")
	}
	if verifyPKCE(challenge, strings.Repeat("v", 42)) {
		t.Fatal("short verifier must fail")
	}
	if verifyPKCE(challenge, strings.Repeat("v", 200)) {
		t.Fatal("long verifier must fail")
	}
	if verifyPKCE(challenge, "") {
		t.Fatal("empty verifier must fail")
	}
}

func TestResolveRejectsForeignResource(t *testing.T) {
	resource := "https://unicore.example/mcp"
	store := newMemoryStore()
	service := New(store, func() string { return resource })
	ctx := context.Background()
	client, _, err := service.CreateClient(ctx, "SPA", ClientPublic, "", []string{"http://127.0.0.1:8931/cb"}, "admin")
	if err != nil {
		t.Fatalf("create client: %v", err)
	}
	if _, err = service.UpdateClient(ctx, client.ID, client.Name, client.RedirectURIs, true, client.Version, "admin"); err != nil {
		t.Fatalf("enable client: %v", err)
	}
	grant, err := service.CreateGrant(ctx, "user-1", client.ID, "role-a", []string{ScopeRead}, []string{"role-a"})
	if err != nil {
		t.Fatalf("create grant: %v", err)
	}
	verifier, challenge := pkcePair(t)
	code, err := service.IssueCode(ctx, grant, client.RedirectURIs[0], challenge, "S256")
	if err != nil {
		t.Fatalf("issue code: %v", err)
	}
	issued, err := service.ExchangeCode(ctx, client.ID, "", code, client.RedirectURIs[0], verifier)
	if err != nil {
		t.Fatalf("exchange: %v", err)
	}
	if _, _, err = service.Resolve(ctx, issued.AccessToken); err != nil {
		t.Fatalf("resolve before resource change: %v", err)
	}
	// The instance moves to a new base_url: tokens minted under the previous
	// resource indicator stop working instead of following silently.
	service.Resource = func() string { return "https://moved.example/mcp" }
	if _, _, err = service.Resolve(ctx, issued.AccessToken); err != ErrInvalidGrant {
		t.Fatalf("resolve after resource change = %v, want ErrInvalidGrant", err)
	}
}

// enabledConfidentialClient registers and enables one confidential client
// with its one-time secret, the basis for cross-client and rotation tests.
func enabledConfidentialClient(t *testing.T, service *Service, name string) (Client, string, Grant) {
	t.Helper()
	client, secret, err := service.CreateClient(context.Background(), name, ClientConfidential, AuthClientSecretPost, []string{"https://app.example/cb"}, "admin")
	if err != nil {
		t.Fatalf("create %s: %v", name, err)
	}
	if _, err = service.UpdateClient(context.Background(), client.ID, client.Name, client.RedirectURIs, true, client.Version, "admin"); err != nil {
		t.Fatalf("enable %s: %v", name, err)
	}
	grant, err := service.CreateGrant(context.Background(), "user-1", client.ID, "role-a", []string{ScopeRead, ScopeOffline}, []string{"role-a"})
	if err != nil {
		t.Fatalf("grant %s: %v", name, err)
	}
	return client, secret, grant
}

func TestExchangeCodeRejectsCrossClientRedemption(t *testing.T) {
	service, store, _, _, grantA, _ := consentedService(t)
	ctx := context.Background()
	clientB, secretB, _ := enabledConfidentialClient(t, service, "Rival")
	verifier, challenge := pkcePair(t)
	code, err := service.IssueCode(ctx, grantA, "https://app.example/cb", challenge, "S256")
	if err != nil {
		t.Fatalf("issue code for A: %v", err)
	}
	// Client B redeems client A's code with its own lawful credentials.
	if _, err = service.ExchangeCode(ctx, clientB.ID, secretB, code, "https://app.example/cb", verifier); err == nil {
		t.Fatal("cross-client redemption unexpectedly succeeded")
	}
	// The failed redemption consumed the one-time code: the replay window the
	// attacker opened cannot be retried into an acceptance either.
	store.mu.Lock()
	consumed := store.codes[platform.Hash("ucx_"+code)].consumedAt
	store.mu.Unlock()
	if consumed == 0 {
		t.Fatal("cross-client redemption did not burn the code")
	}
}

func TestDisabledClientStopsIssuingAndAcceptingTokens(t *testing.T) {
	service, _, _, _, _, publicGrant := consentedService(t)
	ctx := context.Background()
	confidential, secret, grant := enabledConfidentialClient(t, service, "Vault")
	verifier, challenge := pkcePair(t)
	code, err := service.IssueCode(ctx, grant, confidential.RedirectURIs[0], challenge, "S256")
	if err != nil {
		t.Fatalf("issue code: %v", err)
	}
	issued, err := service.ExchangeCode(ctx, confidential.ID, secret, code, confidential.RedirectURIs[0], verifier)
	if err != nil {
		t.Fatalf("exchange before disable: %v", err)
	}
	if _, _, err = service.Resolve(ctx, issued.AccessToken); err != nil {
		t.Fatalf("resolve before disable: %v", err)
	}
	publicCode, err := service.IssueCode(ctx, publicGrant, "http://127.0.0.1:8931/cb", challenge, "S256")
	if err != nil {
		t.Fatalf("issue public code: %v", err)
	}
	publicVerifier := strings.Repeat("v", 48)
	publicDigest := sha256.Sum256([]byte(publicVerifier))
	publicCode, err = service.IssueCode(ctx, publicGrant, "http://127.0.0.1:8931/cb", base64.RawURLEncoding.EncodeToString(publicDigest[:]), "S256")
	if err != nil {
		t.Fatalf("reissue public code: %v", err)
	}
	publicIssued, err := service.ExchangeCode(ctx, publicGrant.ClientID, "", publicCode, "http://127.0.0.1:8931/cb", publicVerifier)
	if err != nil {
		t.Fatalf("public exchange before disable: %v", err)
	}
	if _, err = service.Refresh(ctx, publicGrant.ClientID, "", publicIssued.RefreshToken); err != nil {
		t.Fatalf("public refresh before disable: %v", err)
	}
	// The super admin disables both clients; every standing token stops and
	// public clients can no longer rotate either.
	for _, id := range []string{grant.ClientID, publicGrant.ClientID} {
		disabled, _ := storeClient(t, service, id)
		if _, err = service.UpdateClient(ctx, id, disabled.Name, disabled.RedirectURIs, false, disabled.Version, "admin"); err != nil {
			t.Fatalf("disable client: %v", err)
		}
	}
	if _, err = service.ExchangeCode(ctx, confidential.ID, secret, code, confidential.RedirectURIs[0], verifier); err != ErrClientDisabled {
		t.Fatalf("exchange after disable = %v, want ErrClientDisabled", err)
	}
	if _, _, err = service.Resolve(ctx, issued.AccessToken); err == nil {
		t.Fatal("access token of a disabled client unexpectedly resolved")
	}
	if _, err = service.Refresh(ctx, confidential.ID, secret, issued.RefreshToken); err == nil {
		t.Fatal("confidential refresh after disable unexpectedly succeeded")
	}
	if _, err = service.Refresh(ctx, publicGrant.ClientID, "", publicIssued.RefreshToken); err == nil {
		t.Fatal("public refresh after disable unexpectedly succeeded")
	}
}

func storeClient(t *testing.T, service *Service, id string) (Client, error) {
	t.Helper()
	return service.Store.Client(context.Background(), id)
}

func TestConsentSnapshotBindsLatestScopes(t *testing.T) {
	service, _, _, _, _, _ := consentedService(t)
	ctx := context.Background()
	confidential, secret, grant := enabledConfidentialClient(t, service, "Snapshot")
	// Downgrade: the standing grant carried read+offline; the new consent
	// page only offers read. The grant must shrink to the latest snapshot.
	updated, err := service.RefreshConsent(ctx, grant.ID, []string{ScopeRead})
	if err != nil {
		t.Fatalf("refresh consent downgrade: %v", err)
	}
	if strings.Join(updated.Scopes, ",") != ScopeRead {
		t.Fatalf("downgraded scopes = %v, want read only", updated.Scopes)
	}
	verifier, challenge := pkcePair(t)
	code, err := service.IssueCode(ctx, updated, confidential.RedirectURIs[0], challenge, "S256")
	if err != nil {
		t.Fatalf("issue code: %v", err)
	}
	issued, err := service.ExchangeCode(ctx, confidential.ID, secret, code, confidential.RedirectURIs[0], verifier)
	if err != nil {
		t.Fatalf("exchange: %v", err)
	}
	for _, scope := range issued.Scopes {
		if scope == ScopeWrite || scope == ScopeOffline {
			t.Fatalf("issued token carries budget beyond the consent snapshot: %v", issued.Scopes)
		}
	}
	if issued.RefreshToken != "" {
		t.Fatal("a read-only consent must not mint a refresh token")
	}
	// Upgrade: a later consent may widen again, and only then.
	upgraded, err := service.RefreshConsent(ctx, grant.ID, []string{ScopeRead, ScopeWrite, ScopeOffline})
	if err != nil {
		t.Fatalf("refresh consent upgrade: %v", err)
	}
	if !ScopesContainWrite(upgraded.Scopes) || !hasOffline(upgraded.Scopes) {
		t.Fatalf("upgraded scopes = %v, want write and offline", upgraded.Scopes)
	}
}

// chainFrom mints the initial token family for one confidential client.
func chainFrom(t *testing.T, service *Service, client Client, secret string, grant Grant) Issued {
	t.Helper()
	verifier, challenge := pkcePair(t)
	code, err := service.IssueCode(context.Background(), grant, client.RedirectURIs[0], challenge, "S256")
	if err != nil {
		t.Fatalf("issue code: %v", err)
	}
	issued, err := service.ExchangeCode(context.Background(), client.ID, secret, code, client.RedirectURIs[0], verifier)
	if err != nil {
		t.Fatalf("initial exchange: %v", err)
	}
	return issued
}

func TestRefreshReplayRevokesRotatedTokens(t *testing.T) {
	service, _, _, _, _, _ := consentedService(t)
	ctx := context.Background()
	confidential, secret, grant := enabledConfidentialClient(t, service, "Rotation")
	first := chainFrom(t, service, confidential, secret, grant)
	second, err := service.Refresh(ctx, confidential.ID, secret, first.RefreshToken)
	if err != nil {
		t.Fatalf("rotation: %v", err)
	}
	if _, _, err = service.Resolve(ctx, second.AccessToken); err != nil {
		t.Fatalf("rotated access token before replay: %v", err)
	}
	// The consumed first-generation refresh token replays: the whole family
	// dies, including the second-generation tokens minted moments ago.
	if _, err = service.Refresh(ctx, confidential.ID, secret, first.RefreshToken); err == nil {
		t.Fatal("replayed refresh unexpectedly succeeded")
	}
	if _, _, err = service.Resolve(ctx, second.AccessToken); err == nil {
		t.Fatal("rotated access token survived the family replay revocation")
	}
	if _, err = service.Refresh(ctx, confidential.ID, secret, second.RefreshToken); err == nil {
		t.Fatal("rotated refresh token survived the family replay revocation")
	}
}

func TestRefreshReplayRaceLeavesNoSurvivor(t *testing.T) {
	service, store, _, _, _, _ := consentedService(t)
	ctx := context.Background()
	confidential, secret, grant := enabledConfidentialClient(t, service, "Race")
	initial := chainFrom(t, service, confidential, secret, grant)
	// One rotation races N replays of the same token. Whichever way the
	// statements interleave, the family must end uniformly revoked or
	// uniformly alive: a racing rotation either lands inside the revoked
	// family or is refused, and replay revocation sweeps what committed.
	var wg sync.WaitGroup
	wg.Add(33)
	for i := 0; i < 33; i++ {
		go func() {
			defer wg.Done()
			_, _ = service.Refresh(ctx, confidential.ID, secret, initial.RefreshToken)
		}()
	}
	wg.Wait()
	family := familyOf(t, store, initial.RefreshToken)
	store.mu.Lock()
	revoked, live := 0, 0
	for _, record := range store.tokens {
		if record.FamilyID != family {
			continue
		}
		if record.Revoked {
			revoked++
		} else {
			live++
		}
	}
	store.mu.Unlock()
	if live > 0 && revoked > 0 {
		t.Fatalf("mixed family state: %d revoked alongside %d live", revoked, live)
	}
	if live == 0 {
		return
	}
	// The rotation won every race: exactly one live chain may remain and its
	// newest refresh must still work end to end.
	if live > 2 {
		t.Fatalf("rotation race left %d live tokens", live)
	}
}

func familyOf(t *testing.T, store *memoryStore, refreshToken string) string {
	t.Helper()
	record, err := store.Token(context.Background(), platform.Hash(refreshToken))
	if err != nil {
		t.Fatalf("locate family: %v", err)
	}
	return record.FamilyID
}

func TestRefreshCannotExtendFamilyDeadline(t *testing.T) {
	service, store, _, _, _, _ := consentedService(t)
	ctx := context.Background()
	confidential, secret, grant := enabledConfidentialClient(t, service, "Deadline")
	initial := chainFrom(t, service, confidential, secret, grant)
	deadline, err := store.FamilyDeadline(ctx, familyOf(t, store, initial.RefreshToken))
	if err != nil || deadline == 0 {
		t.Fatalf("family deadline: %v %v", deadline, err)
	}
	if int64(initial.RefreshExpiresAt) != deadline {
		t.Fatalf("initial refresh deadline %d != family deadline %d", initial.RefreshExpiresAt, deadline)
	}
	// Rotations inherit the absolute deadline instead of restarting the
	// 30-day window.
	second, err := service.Refresh(ctx, confidential.ID, secret, initial.RefreshToken)
	if err != nil {
		t.Fatalf("rotation: %v", err)
	}
	if int64(second.RefreshExpiresAt) > deadline {
		t.Fatalf("rotation extended the family deadline: %d > %d", second.RefreshExpiresAt, deadline)
	}
	third, err := service.Refresh(ctx, confidential.ID, secret, second.RefreshToken)
	if err != nil {
		t.Fatalf("second rotation: %v", err)
	}
	if int64(third.RefreshExpiresAt) > deadline {
		t.Fatalf("second rotation extended the family deadline: %d > %d", third.RefreshExpiresAt, deadline)
	}
	// Once the deadline passes the family is dead: the stored refresh expires
	// and cannot mint anything.
	expired := familyOf(t, store, second.RefreshToken)
	store.mu.Lock()
	for hash, record := range store.tokens {
		if record.FamilyID == expired && record.Kind == TokenRefresh {
			record.ExpiresAt = time.Now().Unix() - 1
			store.tokens[hash] = record
		}
	}
	store.mu.Unlock()
	if _, err = service.Refresh(ctx, confidential.ID, secret, second.RefreshToken); err == nil {
		t.Fatal("refresh past the family deadline unexpectedly succeeded")
	}
}
