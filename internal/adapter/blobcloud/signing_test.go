// Author: yunnuo <ymz@ebox.vip>
// Description: Official SDK upload signatures must bind declared length/type; existing CORS rules need correct methods.
package blobcloud

import (
	"context"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestUploadSignatureBindsLength(t *testing.T) {
	for _, provider := range []string{"oss", "cos"} {
		t.Run(provider, func(t *testing.T) {
			c := Config{Provider: provider, Endpoint: "https://objects.example.test", Bucket: "private", Region: "cn-hangzhou", AccessKey: "test-access", SecretKey: "test-secret"}
			if provider == "cos" {
				c.Endpoint = "https://private.cos.example.test"
			}
			st, e := New(c)
			if e != nil {
				t.Fatal(e)
			}
			g, e := st.SignPut(context.Background(), "pending/random", 123, "text/plain", 5*time.Minute)
			if e != nil {
				t.Fatal(e)
			}
			u, e := url.Parse(g.URL)
			if e != nil {
				t.Fatal(e)
			}
			signed := u.Query().Get("x-oss-additional-headers")
			if provider == "cos" {
				signed = u.Query().Get("q-header-list")
			}
			if !strings.Contains(signed, "content-length") {
				t.Fatal("length omitted from signed headers")
			}
			if g.Headers["Content-Length"] != "" {
				t.Fatal("browser must set length automatically")
			}
			if g.Headers["Content-Type"] != "text/plain" {
				t.Fatal("type omitted")
			}
		})
	}
}
func TestCORSDoesNotAcceptReadOnlyRule(t *testing.T) {
	if corsReady("https://app.example.test", []string{"https://app.example.test"}, []string{"GET"}, []string{"*"}, "PUT") {
		t.Fatal("read-only rule permits upload")
	}
	if !corsReady("https://app.example.test", []string{"https://app.example.test"}, []string{"GET", "PUT"}, []string{"*"}, "PUT") {
		t.Fatal("valid rule rejected")
	}
}
