// Author: yunnuo <ymz@ebox.vip>
// Description: Standards-based discovery (with manual endpoint overrides), PKCE and verified ID tokens plus optional userinfo enrichment.
package oidcadapter

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/settings"
	"golang.org/x/oauth2"
)

type Provider struct{}

// tokenVerifier unifies discovered and remote-JWKS verifiers behind one Verify method.
type tokenVerifier interface {
	Verify(ctx context.Context, rawIDToken string) (*oidc.IDToken, error)
}
type boundedBody struct {
	io.Reader
	io.Closer
}
type transport struct {
	base   *http.Transport
	issuer *url.URL
}

func (t transport) RoundTrip(r *http.Request) (*http.Response, error) {
	if !settings.ValidOIDCEndpoint(r.URL.String()) || (r.URL.Scheme == "http" && (t.issuer.Scheme != "http" || r.URL.Host != t.issuer.Host)) {
		return nil, errors.New("unsafe OIDC endpoint")
	}
	resp, err := t.base.RoundTrip(r)
	if err != nil {
		return nil, err
	}
	if resp.ContentLength > 1024*1024 {
		resp.Body.Close()
		return nil, errors.New("OIDC response too large")
	}
	resp.Body = boundedBody{io.LimitReader(resp.Body, 1024*1024), resp.Body}
	return resp, nil
}

func oidcHTTPClient(issuer *url.URL) *http.Client {
	base := http.DefaultTransport.(*http.Transport).Clone()
	base.DisableKeepAlives = true
	base.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	return &http.Client{Timeout: 8 * time.Second, Transport: transport{base: base, issuer: issuer}, CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("OIDC redirects are not permitted") }}
}

// resolved carries every endpoint the flows need after discovery and manual overrides.
type resolved struct {
	verifier    tokenVerifier
	issuerURL   *url.URL
	config      oauth2.Config
	userinfoURL string
	endpoints   map[string]string
}

func negotiateAuthStyle(endpoint *oauth2.Endpoint, secret string, methods []string) error {
	if secret == "" {
		endpoint.AuthStyle = oauth2.AuthStyleInParams
		return nil
	}
	// A confidential client uses exactly one negotiated authentication method, not retries containing secrets.
	endpoint.AuthStyle = oauth2.AuthStyleInHeader
	if len(methods) == 0 {
		return nil
	}
	basic, post := false, false
	for _, method := range methods {
		basic = basic || method == "client_secret_basic"
		post = post || method == "client_secret_post"
	}
	if !basic {
		if !post {
			return platform.ErrInput
		}
		endpoint.AuthStyle = oauth2.AuthStyleInParams
	}
	return nil
}

func validateEndpoint(value string, issuer *url.URL) error {
	v, err := url.Parse(value)
	if err != nil || !settings.ValidOIDCEndpoint(value) || (v.Scheme == "http" && (issuer.Scheme != "http" || v.Host != issuer.Host)) {
		return platform.ErrInput
	}
	return nil
}

// resolve builds the effective endpoints: discovery as the base, then per-key manual
// overrides; an IdP without discovery works when every manual endpoint is present.
func resolve(ctx context.Context, c platform.OIDCConfig) (resolved, error) {
	if !settings.ValidOIDCURL(c.Issuer) {
		return resolved{}, platform.ErrInput
	}
	u, _ := url.Parse(c.Issuer)
	client := oidcHTTPClient(u)
	ctx = oidc.ClientContext(ctx, client)
	manual := c.Manual
	endpoints := map[string]string{}
	var methods []string
	p, discoveryErr := oidc.NewProvider(ctx, c.Issuer)
	if discoveryErr == nil {
		var metadata struct {
			JWKS        string   `json:"jwks_uri"`
			Userinfo    string   `json:"userinfo_endpoint"`
			AuthMethods []string `json:"token_endpoint_auth_methods_supported"`
		}
		if err := p.Claims(&metadata); err != nil {
			return resolved{}, err
		}
		endpoints["authorize"], endpoints["token"], endpoints["jwks"], endpoints["userinfo"] = p.Endpoint().AuthURL, p.Endpoint().TokenURL, metadata.JWKS, metadata.Userinfo
		methods = metadata.AuthMethods
	}
	if key, ok := manual["authorize"]; ok && key != "" {
		endpoints["authorize"] = key
	}
	if key, ok := manual["token"]; ok && key != "" {
		endpoints["token"] = key
	}
	if key, ok := manual["jwks"]; ok && key != "" {
		endpoints["jwks"] = key
	}
	if key, ok := manual["userinfo"]; ok && key != "" {
		endpoints["userinfo"] = key
	}
	for _, key := range []string{"authorize", "token", "jwks"} {
		if endpoints[key] == "" {
			// Discovery may have failed; only a fully manual configuration can proceed.
			if discoveryErr != nil {
				return resolved{}, discoveryErr
			}
			return resolved{}, platform.ErrInput
		}
		if err := validateEndpoint(endpoints[key], u); err != nil {
			return resolved{}, err
		}
	}
	if endpoints["userinfo"] != "" {
		if err := validateEndpoint(endpoints["userinfo"], u); err != nil {
			return resolved{}, err
		}
	}
	var verifier tokenVerifier
	if discoveryErr == nil && manual["jwks"] == "" {
		verifier = p.Verifier(&oidc.Config{ClientID: c.ClientID})
	} else {
		verifier = oidc.NewVerifier(c.Issuer, oidc.NewRemoteKeySet(ctx, endpoints["jwks"]), &oidc.Config{ClientID: c.ClientID})
	}
	endpoint := oauth2.Endpoint{AuthURL: endpoints["authorize"], TokenURL: endpoints["token"]}
	if discoveryErr == nil {
		// Keep the discovered auth style; manual token URL swaps keep the negotiated method.
		endpoint.AuthStyle = p.Endpoint().AuthStyle
		if err := negotiateAuthStyle(&endpoint, c.ClientSecret, methods); discoveryErr != nil {
			return resolved{}, err
		}
	} else if err := negotiateAuthStyle(&endpoint, c.ClientSecret, nil); err != nil {
		return resolved{}, err
	}
	return resolved{verifier: verifier, issuerURL: u, config: oauth2.Config{ClientID: c.ClientID, ClientSecret: c.ClientSecret, RedirectURL: c.Callback, Endpoint: endpoint, Scopes: strings.Fields(c.Scopes)}, userinfoURL: endpoints["userinfo"], endpoints: endpoints}, nil
}

func (Provider) Check(ctx context.Context, c platform.OIDCConfig) (map[string]string, error) {
	r, err := resolve(ctx, c)
	if err != nil {
		return nil, err
	}
	return r.endpoints, nil
}
func (Provider) Authorize(ctx context.Context, c platform.OIDCConfig, state, nonce, verifier string, link bool) (string, error) {
	r, err := resolve(ctx, c)
	if err != nil {
		return "", err
	}
	options := []oauth2.AuthCodeOption{oauth2.S256ChallengeOption(verifier), oidc.Nonce(nonce)}
	if link {
		options = append(options, oauth2.SetAuthURLParam("prompt", "login"), oauth2.SetAuthURLParam("max_age", "0"))
	}
	return r.config.AuthCodeURL(state, options...), nil
}

// claimPath reads a dotted path (data.email) out of a decoded userinfo payload.
func claimPath(payload map[string]any, path string) (string, bool) {
	var current any = payload
	for _, part := range strings.Split(path, ".") {
		object, ok := current.(map[string]any)
		if !ok {
			return "", false
		}
		current, ok = object[part]
		if !ok {
			return "", false
		}
	}
	value, ok := current.(string)
	return value, ok
}

func (Provider) Verify(ctx context.Context, c platform.OIDCConfig, code, nonce, verifier string, link bool) (platform.OIDCClaims, error) {
	r, err := resolve(ctx, c)
	if err != nil {
		return platform.OIDCClaims{}, err
	}
	token, err := r.config.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return platform.OIDCClaims{}, err
	}
	raw, ok := token.Extra("id_token").(string)
	if !ok || len(raw) > 65536 {
		return platform.OIDCClaims{}, platform.ErrOIDC
	}
	id, err := r.verifier.Verify(ctx, raw)
	if err != nil {
		return platform.OIDCClaims{}, err
	}
	if !platform.Equal(id.Nonce, nonce) || id.Subject == "" || len(id.Subject) > 4096 || id.IssuedAt.IsZero() || id.IssuedAt.After(time.Now().Add(time.Minute)) {
		return platform.OIDCClaims{}, platform.ErrOIDC
	}
	var claims struct {
		Email    string `json:"email"`
		Verified bool   `json:"email_verified"`
		AuthTime int64  `json:"auth_time"`
		AZP      string `json:"azp"`
		Name     string `json:"name"`
		Username string `json:"preferred_username"`
	}
	if err = id.Claims(&claims); err != nil {
		return platform.OIDCClaims{}, err
	}
	if (len(id.Audience) > 1 && claims.AZP != c.ClientID) || (claims.AZP != "" && claims.AZP != c.ClientID) {
		return platform.OIDCClaims{}, platform.ErrOIDC
	}
	if link && (claims.AuthTime < time.Now().Add(-5*time.Minute).Unix() || claims.AuthTime > time.Now().Add(time.Minute).Unix()) {
		return platform.OIDCClaims{}, platform.ErrOIDC
	}
	result := platform.OIDCClaims{Issuer: id.Issuer, Subject: id.Subject, Email: strings.ToLower(strings.TrimSpace(claims.Email)), EmailVerified: claims.Verified}
	// Userinfo enrichment fills only what the verified ID token left empty; it never overrides it.
	if c.Userinfo && r.userinfoURL != "" {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, r.userinfoURL, nil)
		if err != nil {
			return platform.OIDCClaims{}, platform.ErrOIDC
		}
		request.Header.Set("Authorization", token.Type()+" "+token.AccessToken)
		response, err := oidcHTTPClient(r.issuerURL).Do(request)
		if err != nil {
			return platform.OIDCClaims{}, platform.ErrOIDC
		}
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			return platform.OIDCClaims{}, platform.ErrOIDC
		}
		var payload map[string]any
		if err = json.NewDecoder(response.Body).Decode(&payload); err != nil {
			return platform.OIDCClaims{}, platform.ErrOIDC
		}
		if result.Email == "" {
			if email, ok := claimPath(payload, c.UserinfoEmailPath); ok {
				result.Email = strings.ToLower(strings.TrimSpace(email))
			}
		}
		if !result.EmailVerified {
			if verified, ok := payload["email_verified"].(bool); ok {
				result.EmailVerified = verified
			}
		}
		if username, ok := claimPath(payload, c.UserinfoUsernamePath); ok {
			result.Username = strings.TrimSpace(username)
		}
	}
	if result.Username == "" {
		result.Username = strings.TrimSpace(claims.Name)
	}
	if result.Username == "" {
		result.Username = strings.TrimSpace(claims.Username)
	}
	if result.Username == "" && result.Email != "" {
		result.Username = strings.SplitN(result.Email, "@", 2)[0]
	}
	return result, nil
}
