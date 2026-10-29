// Author: yunnuo <ymz@ebox.vip>
// Description: Opt-in real vendor acceptance; only random test-owned keys, never public policy or bucket deletion.
package blobcloud

import (
	"bytes"
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/aliyun/aliyun-oss-go-sdk/oss"
	cos "github.com/tencentyun/cos-go-sdk-v5"
	"github.com/yunnuo/unicore/internal/blob"
)

func vendorFailure(t *testing.T, stage string, e error) {
	t.Helper()
	var oe oss.ServiceError
	if errors.As(e, &oe) {
		t.Fatalf("%s: OSS code=%s status=%d message=%s", stage, oe.Code, oe.StatusCode, safeVendorMessage(oe.Message))
	}
	var ce *cos.ErrorResponse
	if errors.As(e, &ce) {
		t.Fatalf("%s: COS code=%s status=%d message=%s", stage, ce.Code, ce.Response.StatusCode, safeVendorMessage(ce.Message))
	}
	t.Fatalf("%s: error type=%T", stage, e)
}
func TestVendorMultipart(t *testing.T) {
	for _, provider := range []string{"oss", "cos"} {
		t.Run(provider, func(t *testing.T) {
			env := func(k string) string { return os.Getenv("UNICORE_TEST_" + strings.ToUpper(provider) + "_" + k) }
			if env("ENDPOINT") == "" {
				t.Skip("vendor environment not provided")
			}
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
			defer cancel()
			st, e := New(Config{Provider: provider, Endpoint: env("ENDPOINT"), Bucket: env("BUCKET"), Region: env("REGION"), AccessKey: env("ACCESS_KEY"), SecretKey: env("SECRET_KEY"), Prefix: fmt.Sprintf("unicore-acceptance-%d", time.Now().UnixNano())})
			if e != nil {
				vendorFailure(t, "construct", e)
			}
			key := "multipart/probe"
			target := "objects/copy"
			mp := st.(blob.Multipart)
			defer func() {
				cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
				defer cancel()
				if e := mp.AbortMultipart(cleanup, key); e != nil {
					vendorFailure(t, "cleanup abort", e)
				}
				if e := st.Delete(cleanup, key); e != nil {
					vendorFailure(t, "cleanup staging", e)
				}
				if e := st.Delete(cleanup, target); e != nil {
					vendorFailure(t, "cleanup target", e)
				}
			}()
			obj, e := st.Put(ctx, key, strings.NewReader("probe"), 5, "text/plain")
			if e != nil {
				vendorFailure(t, "put", e)
			}
			if e = st.Copy(ctx, key, target, obj.ETag); e != nil {
				vendorFailure(t, "copy", e)
			}
			if e = st.Delete(ctx, key); e != nil {
				vendorFailure(t, "delete", e)
			}
			id, e := mp.BeginMultipart(ctx, key, "application/octet-stream")
			if e != nil {
				vendorFailure(t, "begin", e)
			}
			data := bytes.Repeat([]byte("a"), 5<<20)
			for number := 1; number <= 2; number++ {
				g, e := mp.SignPart(ctx, key, id, number, int64(len(data)), 5*time.Minute)
				if e != nil {
					vendorFailure(t, "sign", e)
				}
				req, _ := http.NewRequestWithContext(ctx, "PUT", g.URL, bytes.NewReader(data))
				for k, v := range g.Headers {
					req.Header.Set(k, v)
				}
				res, e := http.DefaultClient.Do(req)
				if e != nil {
					vendorFailure(t, "direct upload", e)
				}
				res.Body.Close()
				if res.StatusCode >= 300 {
					t.Fatalf("direct status=%d", res.StatusCode)
				}
			}
			parts, e := mp.ListParts(ctx, key, id)
			if e != nil {
				vendorFailure(t, "parts", e)
			}
			if len(parts) != 2 {
				t.Fatalf("parts count=%d", len(parts))
			}
			if e = mp.CompleteMultipart(ctx, key, id, parts); e != nil {
				vendorFailure(t, "complete", e)
			}
			obj, e = st.Stat(ctx, key)
			if e != nil {
				vendorFailure(t, "stat", e)
			}
			if obj.Size != int64(2*len(data)) {
				t.Fatal("size")
			}
			if e = st.Copy(ctx, key, target, obj.ETag); e != nil {
				vendorFailure(t, "promote", e)
			}
			signed, e := st.SignGet(ctx, target, "test.bin", time.Minute)
			if e != nil {
				vendorFailure(t, "sign download", e)
			}
			req, _ := http.NewRequestWithContext(ctx, "GET", signed, nil)
			res, e := http.DefaultClient.Do(req)
			if e != nil {
				vendorFailure(t, "download", e)
			}
			got, e := io.ReadAll(res.Body)
			res.Body.Close()
			if res.StatusCode != 200 {
				var service struct {
					Code    string
					Message string
				}
				_ = xml.Unmarshal(got, &service)
				t.Fatalf("signed download status=%d code=%s message=%s", res.StatusCode, service.Code, safeVendorMessage(service.Message))
			}
			if e != nil || len(got) != 2*len(data) || !bytes.Equal(got[:len(data)], data) {
				t.Fatal("download content")
			}
		})
	}
}

func safeVendorMessage(message string) string {
	for _, provider := range []string{"OSS", "COS"} {
		for _, key := range []string{"ACCESS_KEY", "SECRET_KEY"} {
			if value := os.Getenv("UNICORE_TEST_" + provider + "_" + key); value != "" {
				message = strings.ReplaceAll(message, value, "[redacted]")
			}
		}
	}
	if len(message) > 250 {
		message = message[:250]
	}
	return message
}
