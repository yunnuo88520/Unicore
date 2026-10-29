// Author: yunnuo <ymz@ebox.vip>
// Description: Vendor acceptance cleanup limited to generated prefixes and the temporary browser origin.
package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/aliyun/aliyun-oss-go-sdk/oss"
	cos "github.com/tencentyun/cos-go-sdk-v5"
)

func cloudFixture(ctx context.Context, provider string) error {
	env := func(k string) string { return os.Getenv("UNICORE_TEST_" + strings.ToUpper(provider) + "_" + k) }
	endpoint, bucket, access, secret := env("ENDPOINT"), env("BUCKET"), env("ACCESS_KEY"), env("SECRET_KEY")
	if endpoint == "" || bucket == "" {
		return fmt.Errorf("vendor environment missing")
	}
	if os.Args[1] == "prepare" {
		return nil
	}
	if os.Args[1] != "cleanup" || len(os.Args) < 3 || !strings.HasPrefix(os.Args[2], "unicore-browser-") || strings.ContainsAny(os.Args[2], "/\\") {
		return fmt.Errorf("task-owned prefix required")
	}
	prefix := os.Args[2] + "/"
	origin := ""
	if len(os.Args) == 4 {
		origin = os.Args[3]
		u, e := url.Parse(origin)
		if e != nil || u.Scheme != "http" || u.Hostname() != "127.0.0.1" || u.Port() == "" || u.Path != "" {
			return fmt.Errorf("temporary origin required")
		}
	}
	if provider == "oss" {
		client, e := oss.New(endpoint, access, secret, oss.AuthVersion(oss.AuthV4), oss.Region(env("REGION")))
		if e != nil {
			return e
		}
		b, e := client.Bucket(bucket)
		if e != nil {
			return e
		}
		key, upload := "", ""
		for {
			v, e := b.ListMultipartUploads(oss.WithContext(ctx), oss.Prefix(prefix), oss.KeyMarker(key), oss.UploadIDMarker(upload))
			if e != nil {
				return e
			}
			for _, u := range v.Uploads {
				if strings.HasPrefix(u.Key, prefix) {
					if e = b.AbortMultipartUpload(oss.InitiateMultipartUploadResult{Bucket: bucket, Key: u.Key, UploadID: u.UploadID}, oss.WithContext(ctx)); e != nil {
						return e
					}
				}
			}
			if !v.IsTruncated {
				break
			}
			key, upload = v.NextKeyMarker, v.NextUploadIDMarker
		}
		marker := ""
		for {
			v, e := b.ListObjects(oss.WithContext(ctx), oss.Prefix(prefix), oss.Marker(marker))
			if e != nil {
				return e
			}
			for _, o := range v.Objects {
				if strings.HasPrefix(o.Key, prefix) {
					if e = b.DeleteObject(o.Key, oss.WithContext(ctx)); e != nil {
						return e
					}
				}
			}
			if !v.IsTruncated {
				break
			}
			marker = v.NextMarker
		}
		if origin != "" {
			v, e := client.GetBucketCORS(bucket, oss.WithContext(ctx))
			if e != nil {
				var se oss.ServiceError
				if errors.As(e, &se) && se.Code == "NoSuchCORSConfiguration" {
					return nil
				}
				return e
			}
			rules := []oss.CORSRule{}
			changed := false
			for _, r := range v.CORSRules {
				r.AllowedOrigin, changed = withoutOrigin(r.AllowedOrigin, origin, changed)
				if len(r.AllowedOrigin) > 0 {
					rules = append(rules, r)
				}
			}
			if changed {
				if len(rules) == 0 {
					return client.DeleteBucketCORS(bucket, oss.WithContext(ctx))
				}
				return client.SetBucketCORSV2(bucket, oss.PutBucketCORS{CORSRules: rules, ResponseVary: v.ResponseVary}, oss.WithContext(ctx))
			}
		}
		return nil
	}
	u, e := url.Parse(endpoint)
	if e != nil {
		return e
	}
	client := cos.NewClient(&cos.BaseURL{BucketURL: u}, &http.Client{Transport: &cos.AuthorizationTransport{SecretID: access, SecretKey: secret}})
	key, upload := "", ""
	for {
		v, _, e := client.Bucket.ListMultipartUploads(ctx, &cos.ListMultipartUploadsOptions{Prefix: prefix, KeyMarker: key, UploadIDMarker: upload})
		if e != nil {
			return e
		}
		for _, u := range v.Uploads {
			if strings.HasPrefix(u.Key, prefix) {
				if _, e = client.Object.AbortMultipartUpload(ctx, u.Key, u.UploadID); e != nil {
					return e
				}
			}
		}
		if !v.IsTruncated {
			break
		}
		key, upload = v.NextKeyMarker, v.NextUploadIDMarker
	}
	marker := ""
	for {
		v, _, e := client.Bucket.Get(ctx, &cos.BucketGetOptions{Prefix: prefix, Marker: marker})
		if e != nil {
			return e
		}
		for _, o := range v.Contents {
			if strings.HasPrefix(o.Key, prefix) {
				if _, e = client.Object.Delete(ctx, o.Key); e != nil {
					return e
				}
			}
		}
		if !v.IsTruncated {
			break
		}
		marker = v.NextMarker
	}
	if origin != "" {
		v, response, e := client.Bucket.GetCORS(ctx)
		if e != nil {
			if response != nil && response.StatusCode == 404 {
				return nil
			}
			return e
		}
		rules := []cos.BucketCORSRule{}
		changed := false
		for _, r := range v.Rules {
			r.AllowedOrigins, changed = withoutOrigin(r.AllowedOrigins, origin, changed)
			if len(r.AllowedOrigins) > 0 {
				rules = append(rules, r)
			}
		}
		if changed {
			if len(rules) == 0 {
				_, e = client.Bucket.DeleteCORS(ctx)
			} else {
				_, e = client.Bucket.PutCORS(ctx, &cos.BucketPutCORSOptions{Rules: rules})
			}
			return e
		}
	}
	return nil
}
func withoutOrigin(values []string, origin string, changed bool) ([]string, bool) {
	out := []string{}
	for _, v := range values {
		if v == origin {
			changed = true
		} else {
			out = append(out, v)
		}
	}
	return out, changed
}

func safeCloudError(e error) string {
	var oe oss.ServiceError
	if errors.As(e, &oe) {
		return fmt.Sprintf("OSS code=%s status=%d", oe.Code, oe.StatusCode)
	}
	var ce *cos.ErrorResponse
	if errors.As(e, &ce) {
		return fmt.Sprintf("COS code=%s status=%d", ce.Code, ce.Response.StatusCode)
	}
	return fmt.Sprintf("type=%T", e)
}
