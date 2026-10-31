// Author: yunnuo <ymz@ebox.vip>
// Description: Isolated signed test IdP, never composed into a Unicore production binary.
package oidcfixture

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"html/template"
	"net/http"
	"net/url"
	"sync"
	"time"

	jose "github.com/go-jose/go-jose/v4"
)

const ClientID = "unicore-test-client"
const ClientSecret = "isolated-test-secret"

type Provider struct {
	URL   string
	key   *rsa.PrivateKey
	mu    sync.Mutex
	codes map[string]url.Values
}

func New() *Provider {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(err)
	}
	return &Provider{key: key, codes: map[string]url.Values{}}
}
func (p *Provider) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	switch r.URL.Path {
	case "/.well-known/openid-configuration":
		p.write(w, map[string]any{"issuer": p.URL, "authorization_endpoint": p.URL + "/authorize", "token_endpoint": p.URL + "/token", "jwks_uri": p.URL + "/jwks", "response_types_supported": []string{"code"}, "subject_types_supported": []string{"public"}, "id_token_signing_alg_values_supported": []string{"RS256"}, "code_challenge_methods_supported": []string{"S256"}, "token_endpoint_auth_methods_supported": []string{"client_secret_basic"}})
	case "/jwks":
		p.write(w, jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &p.key.PublicKey, KeyID: "fixture", Algorithm: "RS256", Use: "sig"}}})
	case "/authorize":
		if r.Method == "POST" {
			_ = r.ParseForm()
		}
		q := r.URL.Query()
		if r.Method == "POST" {
			q = r.PostForm
		}
		if q.Get("client_id") != ClientID || q.Get("response_type") != "code" || q.Get("code_challenge_method") != "S256" || q.Get("code_challenge") == "" {
			http.Error(w, "invalid authorization", 400)
			return
		}
		if q.Get("approve") != "yes" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_ = authPage.Execute(w, q)
			return
		}
		code := random()
		p.mu.Lock()
		p.codes[code] = q
		p.mu.Unlock()
		u, err := url.Parse(q.Get("redirect_uri"))
		if err != nil {
			http.Error(w, "bad redirect", 400)
			return
		}
		v := u.Query()
		v.Set("state", q.Get("state"))
		v.Set("iss", p.URL)
		v.Set("code", code)
		u.RawQuery = v.Encode()
		http.Redirect(w, r, u.String(), 303)
	case "/token":
		if r.Method != "POST" {
			http.Error(w, "method", 405)
			return
		}
		_ = r.ParseForm()
		client, secret, _ := r.BasicAuth()
		if client != ClientID || secret != ClientSecret {
			http.Error(w, "invalid client", 401)
			return
		}
		p.mu.Lock()
		q, ok := p.codes[r.Form.Get("code")]
		delete(p.codes, r.Form.Get("code"))
		p.mu.Unlock()
		challenge := sha256.Sum256([]byte(r.Form.Get("code_verifier")))
		if !ok || q.Get("redirect_uri") != r.Form.Get("redirect_uri") || base64.RawURLEncoding.EncodeToString(challenge[:]) != q.Get("code_challenge") || r.Form.Get("grant_type") != "authorization_code" {
			http.Error(w, "invalid code or PKCE", 400)
			return
		}
		now := time.Now().Unix()
		subject := q.Get("subject")
		if subject == "" {
			subject = "employee-001"
		}
		email := q.Get("email")
		if email == "" {
			email = "employee@example.test"
		}
		claims := map[string]any{"iss": p.URL, "sub": subject, "aud": ClientID, "exp": now + 300, "iat": now, "auth_time": now, "nonce": q.Get("nonce"), "email": email, "email_verified": true, "roles": []string{"super_admin"}, "admin": true, "groups": []string{"admins"}}
		switch q.Get("scenario") {
		case "nonce":
			claims["nonce"] = "other"
		case "issuer":
			claims["iss"] = "https://other.example.test"
		case "audience":
			claims["aud"] = "other-client"
		case "expired":
			claims["exp"] = now - 3600
		case "future":
			claims["iat"] = now + 3600
		case "unverified":
			claims["email_verified"] = false
		case "stale-auth":
			claims["auth_time"] = now - 3600
		case "azp":
			claims["aud"] = []string{ClientID, "other-client"}
			claims["azp"] = "other-client"
		case "missing-subject":
			claims["sub"] = ""
		}
		key := p.key
		if q.Get("scenario") == "signature" {
			key, _ = rsa.GenerateKey(rand.Reader, 2048)
		}
		signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: key}, (&jose.SignerOptions{}).WithType("JWT").WithHeader("kid", "fixture"))
		if err != nil {
			panic(err)
		}
		data, _ := json.Marshal(claims)
		signed, err := signer.Sign(data)
		if err != nil {
			panic(err)
		}
		id, err := signed.CompactSerialize()
		if err != nil {
			panic(err)
		}
		p.write(w, map[string]any{"access_token": "test-only-access-token", "token_type": "Bearer", "expires_in": 300, "id_token": id})
	default:
		http.NotFound(w, r)
	}
}
func (p *Provider) write(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
func random() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

var authPage = template.Must(template.New("authorize").Parse(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>隔离企业身份服务</title><body><h1>测试企业登录</h1><p>仅用于本机验收，不连接真实企业账号。</p><form method="post">{{range $key,$values:=.}}{{range $values}}<input type="hidden" name="{{$key}}" value="{{.}}">{{end}}{{end}}<label>企业身份编号<input name="subject" value="employee-001"></label><label>企业邮箱<input type="email" name="email" value="employee@example.test"></label><button name="approve" value="yes">确认企业身份</button></form></body></html>`))
