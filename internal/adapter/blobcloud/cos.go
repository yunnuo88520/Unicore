// Author: yunnuo <ymz@ebox.vip>
// Description: Tencent COS official SDK adapter with expiring grants and conditional copies.
package blobcloud

import (
	"context"
	cos "github.com/tencentyun/cos-go-sdk-v5"
	"github.com/yunnuo/unicore/internal/blob"
	"io"
	"net/http"
	"net/url"
	"time"
)

type cosStore struct {
	client *cos.Client
	config Config
	origin string
}

func newCOS(c Config) (Managed, error) {
	u, e := url.Parse(c.Endpoint)
	if e != nil {
		return nil, e
	}
	client := cos.NewClient(&cos.BaseURL{BucketURL: u}, &http.Client{Transport: &cos.AuthorizationTransport{SecretID: c.AccessKey, SecretKey: c.SecretKey}, Timeout: 0})
	return &cosStore{client, c, u.Scheme + "://" + u.Host}, nil
}
func (s *cosStore) key(k string) string { return prefixed(s.config.Prefix, k) }
func (s *cosStore) Origin() string      { return s.origin }
func (s *cosStore) Put(ctx context.Context, k string, r io.Reader, n int64, m string) (blob.Object, error) {
	_, e := s.client.Object.Put(ctx, s.key(k), r, &cos.ObjectPutOptions{ObjectPutHeaderOptions: &cos.ObjectPutHeaderOptions{ContentType: m, ContentLength: n}})
	if e != nil {
		return blob.Object{}, e
	}
	return s.Stat(ctx, k)
}
func (s *cosStore) Stat(ctx context.Context, k string) (blob.Object, error) {
	r, e := s.client.Object.Head(ctx, s.key(k), nil)
	if e != nil {
		return blob.Object{}, e
	}
	return fromHeaders(r.Header), nil
}
func (s *cosStore) Open(ctx context.Context, k string) (io.ReadCloser, blob.Object, error) {
	r, e := s.client.Object.Get(ctx, s.key(k), nil)
	if e != nil {
		return nil, blob.Object{}, e
	}
	return r.Body, fromHeaders(r.Header), nil
}
func (s *cosStore) Delete(ctx context.Context, k string) error {
	_, e := s.client.Object.Delete(ctx, s.key(k))
	return e
}
func (s *cosStore) Copy(ctx context.Context, a, b, etag string) error {
	o, e := s.Stat(ctx, a)
	if e != nil {
		return e
	}
	if o.Size > 1<<30 {
		return s.largeCopy(ctx, a, b, etag, o)
	}

	u := s.origin + "/" + s.key(a)
	_, _, e = s.client.Object.Copy(ctx, s.key(b), u, &cos.ObjectCopyOptions{ObjectCopyHeaderOptions: &cos.ObjectCopyHeaderOptions{XCosCopySourceIfMatch: "\"" + etag + "\""}})
	return e
}
func (s *cosStore) SignPut(ctx context.Context, k string, n int64, m string, ttl time.Duration) (blob.Grant, error) {
	u, e := s.client.Object.GetPresignedURL2(ctx, http.MethodPut, s.key(k), ttl, &cos.ObjectPutOptions{ObjectPutHeaderOptions: &cos.ObjectPutHeaderOptions{ContentType: m, ContentLength: n}})
	if e != nil {
		return blob.Grant{}, e
	}
	return blob.Grant{URL: u.String(), Method: "PUT", Headers: map[string]string{"Content-Type": m}, Fields: map[string]string{}}, nil
}
func (s *cosStore) SignGet(ctx context.Context, k, name string, ttl time.Duration) (string, error) {
	u, e := s.client.Object.GetPresignedURL2(ctx, http.MethodGet, s.key(k), ttl, &cos.ObjectGetOptions{ResponseContentDisposition: disposition(name), ResponseContentType: "application/octet-stream"})
	if e != nil {
		return "", e
	}
	return u.String(), nil
}
func (s *cosStore) Browser(ctx context.Context, origin string) error {
	v, r, e := s.client.Bucket.GetCORS(ctx)
	if e != nil {
		if r == nil || r.StatusCode != 404 {
			return e
		}
		v = &cos.BucketGetCORSResult{}
	}
	if v == nil {
		v = &cos.BucketGetCORSResult{}
	}
	for _, r := range v.Rules {
		if corsReady(origin, r.AllowedOrigins, r.AllowedMethods, r.AllowedHeaders, "PUT") {
			return nil
		}
	}
	_, e = s.client.Bucket.PutCORS(ctx, &cos.BucketPutCORSOptions{Rules: append(v.Rules, cos.BucketCORSRule{AllowedOrigins: []string{origin}, AllowedMethods: []string{"GET", "HEAD", "PUT"}, AllowedHeaders: []string{"*"}, ExposeHeaders: []string{"ETag"}, MaxAgeSeconds: 600})})
	return e
}
