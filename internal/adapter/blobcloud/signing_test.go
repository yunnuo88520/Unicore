// Author: yunnuo <ymz@ebox.vip>
// Description: Official SDK upload signatures must bind declared length/type; existing CORS rules need correct methods.
package blobcloud

import (
	"context"
	"github.com/yunnuo/unicore/internal/blob"
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

func TestMultipartSignaturesBindSessionAndPart(t *testing.T) {
	for _, provider := range []string{"s3", "oss", "cos"} {
		t.Run(provider, func(t *testing.T) {
			config := Config{Provider: provider, Endpoint: "https://objects.example.test", Bucket: "private", Region: "us-east-1", AccessKey: "test-access", SecretKey: "test-secret", PathStyle: true}
			if provider == "cos" {
				config.Endpoint = "https://private.cos.example.test"
			}
			st, e := New(config)
			if e != nil {
				t.Fatal(e)
			}
			g, e := st.(blob.Multipart).SignPart(context.Background(), "multipart/random", "session-id+/=", 7, 8<<20, 5*time.Minute)
			if e != nil {
				t.Fatal(e)
			}
			u, e := url.Parse(g.URL)
			if e != nil {
				t.Fatal("parse")
			}
			if u.Query().Get("uploadId") != "session-id+/=" || u.Query().Get("partNumber") != "7" || g.Method != "PUT" {
				t.Fatal("upload identity not bound")
			}
			if g.Headers["Content-Length"] != "" || g.Headers["Content-Type"] != "application/octet-stream" {
				t.Fatal("unsafe browser headers")
			}
			var signed string
			switch provider {
			case "s3":
				signed = u.Query().Get("X-Amz-SignedHeaders")
			case "oss":
				signed = u.Query().Get("x-oss-additional-headers")
			case "cos":
				signed = u.Query().Get("q-header-list")
			}
			if !strings.Contains(signed, "content-length") {
				t.Fatal("part length not signed")
			}
		})
	}
}
