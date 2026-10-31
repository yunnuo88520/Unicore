// Author: yunnuo <ymz@ebox.vip>
// Description: Standards-based discovery, authorization-code PKCE and verified ID tokens.
package oidcadapter

import (
	"context"
	"crypto/tls"
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
func discover(ctx context.Context, c platform.OIDCConfig) (context.Context, *oidc.Provider, oauth2.Config, error) {
	if !settings.ValidOIDCURL(c.Issuer) {
		return ctx, nil, oauth2.Config{}, platform.ErrInput
	}
	u, _ := url.Parse(c.Issuer)
	base := http.DefaultTransport.(*http.Transport).Clone()
	base.DisableKeepAlives = true
	base.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	client := &http.Client{Timeout: 8 * time.Second, Transport: transport{base: base, issuer: u}, CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("OIDC redirects are not permitted") }}
	ctx = oidc.ClientContext(ctx, client)
	p, err := oidc.NewProvider(ctx, c.Issuer)
	if err != nil {
		return ctx, nil, oauth2.Config{}, err
	}
	var metadata struct {
		JWKS        string   `json:"jwks_uri"`
		AuthMethods []string `json:"token_endpoint_auth_methods_supported"`
	}
	if err = p.Claims(&metadata); err != nil {
		return ctx, nil, oauth2.Config{}, err
	}
	endpoint := p.Endpoint()
	for _, value := range []string{endpoint.AuthURL, endpoint.TokenURL, metadata.JWKS} {
		v, e := url.Parse(value)
		if e != nil || !settings.ValidOIDCEndpoint(value) || (v.Scheme == "http" && (u.Scheme != "http" || v.Host != u.Host)) {
			return ctx, nil, oauth2.Config{}, platform.ErrInput
		}
	}
	// A confidential client uses exactly one negotiated authentication method, not retries containing secrets.
	if c.ClientSecret != "" {
		endpoint.AuthStyle = oauth2.AuthStyleInHeader
		if len(metadata.AuthMethods) > 0 {
			basic, post := false, false
			for _, method := range metadata.AuthMethods {
				basic = basic || method == "client_secret_basic"
				post = post || method == "client_secret_post"
			}
			if !basic {
				if !post {
					return ctx, nil, oauth2.Config{}, platform.ErrInput
				}
				endpoint.AuthStyle = oauth2.AuthStyleInParams
			}
		}
	} else {
		endpoint.AuthStyle = oauth2.AuthStyleInParams
	}
	return ctx, p, oauth2.Config{ClientID: c.ClientID, ClientSecret: c.ClientSecret, RedirectURL: c.Callback, Endpoint: endpoint, Scopes: strings.Fields(c.Scopes)}, nil
}
func (Provider) Check(ctx context.Context, c platform.OIDCConfig) error {
	_, _, _, err := discover(ctx, c)
	return err
}
func (Provider) Authorize(ctx context.Context, c platform.OIDCConfig, state, nonce, verifier string, link bool) (string, error) {
	_, _, config, err := discover(ctx, c)
	if err != nil {
		return "", err
	}
	options := []oauth2.AuthCodeOption{oauth2.S256ChallengeOption(verifier), oidc.Nonce(nonce)}
	if link {
		options = append(options, oauth2.SetAuthURLParam("prompt", "login"), oauth2.SetAuthURLParam("max_age", "0"))
	}
	return config.AuthCodeURL(state, options...), nil
}
func (Provider) Verify(ctx context.Context, c platform.OIDCConfig, code, nonce, verifier string, link bool) (platform.OIDCClaims, error) {
	ctx, p, config, err := discover(ctx, c)
	if err != nil {
		return platform.OIDCClaims{}, err
	}
	token, err := config.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return platform.OIDCClaims{}, err
	}
	raw, ok := token.Extra("id_token").(string)
	if !ok || len(raw) > 65536 {
		return platform.OIDCClaims{}, platform.ErrOIDC
	}
	id, err := p.Verifier(&oidc.Config{ClientID: c.ClientID}).Verify(ctx, raw)
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
	return platform.OIDCClaims{Issuer: id.Issuer, Subject: id.Subject, Email: strings.ToLower(strings.TrimSpace(claims.Email)), EmailVerified: claims.Verified}, nil
}
