// Author: yunnuo <ymz@ebox.vip>
// Description: Isolated grants bind each access token to its authorized subject.
package oidcfixture

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestAccessTokenSubjectBinding(t *testing.T) {
	p := New()
	p.URL = "http://127.0.0.1:12345"
	// Approve both identities before exchanging in reverse order. Neither the
	// last approval nor the last exchange may determine another token's subject.
	aliceCode := authorizeCode(t, p, "alice", "alice-verifier")
	bobCode := authorizeCode(t, p, "bob", "bob-verifier")
	bob := exchangeToken(t, p, bobCode, "bob-verifier")
	alice := exchangeToken(t, p, aliceCode, "alice-verifier")
	anotherAlice := exchangeToken(t, p, authorizeCode(t, p, "alice", "another-verifier"), "another-verifier")
	defaultToken := exchangeToken(t, p, authorizeCode(t, p, "", "default-verifier"), "default-verifier")
	tokens := map[string]bool{}
	for _, token := range []string{alice, bob, anotherAlice, defaultToken} {
		if token == "" || tokens[token] {
			t.Fatal("each grant must issue a distinct nonempty access token")
		}
		tokens[token] = true
	}
	for _, identity := range []struct{ token, subject string }{
		{alice, "alice"}, {bob, "bob"}, {anotherAlice, "alice"},
		{defaultToken, "employee-001"}, {bob, "bob"}, {alice, "alice"},
	} {
		assertUserinfoSubject(t, p, identity.token, identity.subject)
	}

	p.SetUserinfoSubject("someone-else")
	assertUserinfoSubject(t, p, alice, "someone-else")
	assertUserinfoSubject(t, p, bob, "someone-else")
	p.SetUserinfoSubject("")
	assertUserinfoSubject(t, p, alice, "alice")
	assertUserinfoSubject(t, p, bob, "bob")
}

func TestUserinfoRejectsInvalidTokens(t *testing.T) {
	p := New()
	p.URL = "http://127.0.0.1:12345"
	token := exchangeToken(t, p, authorizeCode(t, p, "alice", "verifier"), "verifier")
	for _, override := range []string{"", "someone-else"} {
		p.SetUserinfoSubject(override)
		for _, header := range []string{"", "Bearer", "Bearer ", "Bearer unknown", "Bearer test-only-access-token", "Basic " + token, "Bearer " + token + "-wrong", "Bearer " + token + " extra"} {
			r := httptest.NewRequest(http.MethodGet, p.URL+"/userinfo", nil)
			r.Header.Set("Authorization", header)
			w := httptest.NewRecorder()
			p.ServeHTTP(w, r)
			if w.Code != http.StatusUnauthorized {
				t.Fatalf("invalid bearer accepted (override %q): status %d", override, w.Code)
			}
		}
	}
}

func TestAccessTokensConcurrentIdentities(t *testing.T) {
	p := New()
	p.URL = "http://127.0.0.1:12345"
	for _, subject := range []string{"alice", "bob", "carol", "dave"} {
		t.Run(subject, func(t *testing.T) {
			t.Parallel()
			token := exchangeToken(t, p, authorizeCode(t, p, subject, subject+"-verifier"), subject+"-verifier")
			for range 5 {
				assertUserinfoSubject(t, p, token, subject)
			}
		})
	}
}

func TestTokenRejectsInvalidGrants(t *testing.T) {
	p := New()
	p.URL = "http://127.0.0.1:12345"
	for _, scenario := range []string{"unknown-code", "replay", "pkce"} {
		t.Run(scenario, func(t *testing.T) {
			code := authorizeCode(t, p, "alice", "verifier")
			verifier := "verifier"
			switch scenario {
			case "unknown-code":
				code = "unknown-code"
			case "replay":
				token := exchangeToken(t, p, code, verifier)
				assertUserinfoSubject(t, p, token, "alice")
			case "pkce":
				verifier = "wrong-verifier"
			}
			w := tokenResponse(p, code, verifier)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("invalid grant accepted: status %d", w.Code)
			}
			if strings.Contains(w.Body.String(), "access_token") {
				t.Fatal("failed exchange returned an access token")
			}
		})
	}
}

func authorizeCode(t *testing.T, p *Provider, subject, verifier string) string {
	t.Helper()
	challenge := sha256.Sum256([]byte(verifier))
	q := url.Values{
		"client_id": {ClientID}, "response_type": {"code"},
		"redirect_uri": {p.URL + "/callback"}, "approve": {"yes"},
		"code_challenge_method": {"S256"},
		"code_challenge":        {base64.RawURLEncoding.EncodeToString(challenge[:])},
		"subject":               {subject}, "nonce": {"test-nonce"},
	}
	w := httptest.NewRecorder()
	p.ServeHTTP(w, httptest.NewRequest(http.MethodGet, p.URL+"/authorize?"+q.Encode(), nil))
	if w.Code != http.StatusSeeOther {
		t.Fatalf("authorization status %d", w.Code)
	}
	redirect, err := url.Parse(w.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	code := redirect.Query().Get("code")
	if code == "" {
		t.Fatal("authorization returned no code")
	}
	return code
}

func tokenResponse(p *Provider, code, verifier string) *httptest.ResponseRecorder {
	form := url.Values{"code": {code}, "code_verifier": {verifier}, "redirect_uri": {p.URL + "/callback"}, "grant_type": {"authorization_code"}}
	r := httptest.NewRequest(http.MethodPost, p.URL+"/token", strings.NewReader(form.Encode()))
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	r.SetBasicAuth(ClientID, ClientSecret)
	w := httptest.NewRecorder()
	p.ServeHTTP(w, r)
	return w
}

func exchangeToken(t *testing.T, p *Provider, code, verifier string) string {
	t.Helper()
	w := tokenResponse(p, code, verifier)
	if w.Code != http.StatusOK {
		t.Fatalf("token exchange status %d", w.Code)
	}
	var token struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		IDToken     string `json:"id_token"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &token); err != nil {
		t.Fatal(err)
	}
	if token.AccessToken == "" || token.IDToken == "" || token.TokenType != "Bearer" {
		t.Fatal("incomplete token response")
	}
	return token.AccessToken
}

func assertUserinfoSubject(t *testing.T, p *Provider, token, subject string) {
	t.Helper()
	r := httptest.NewRequest(http.MethodGet, p.URL+"/userinfo", nil)
	r.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	p.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("userinfo status %d", w.Code)
	}
	var info struct {
		Subject string `json:"sub"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &info); err != nil {
		t.Fatal(err)
	}
	if info.Subject != subject {
		t.Fatalf("userinfo subject = %q, want %q", info.Subject, subject)
	}
}
