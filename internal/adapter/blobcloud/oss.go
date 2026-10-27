// Author: yunnuo <ymz@ebox.vip>
// Description: Aliyun OSS SDK implementation; never creates public buckets or stores permanent URLs.
package blobcloud

import (
	"context"
	"github.com/aliyun/aliyun-oss-go-sdk/oss"
	"github.com/yunnuo/unicore/internal/blob"
	"io"
	"net/url"
	"time"
)

type ossStore struct {
	client *oss.Client
	bucket *oss.Bucket
	config Config
	origin string
}

func newOSS(c Config) (Managed, error) {
	client, e := oss.New(c.Endpoint, c.AccessKey, c.SecretKey, oss.AuthVersion(oss.AuthV4), oss.Region(c.Region), oss.AdditionalHeaders([]string{"content-length"}))
	if e != nil {
		return nil, e
	}
	bucket, e := client.Bucket(c.Bucket)
	if e != nil {
		return nil, e
	}
	u, _ := url.Parse(c.Endpoint)
	return &ossStore{client, bucket, c, u.Scheme + "://" + c.Bucket + "." + u.Host}, nil
}
func (s *ossStore) key(k string) string { return prefixed(s.config.Prefix, k) }
func (s *ossStore) Origin() string      { return s.origin }
func (s *ossStore) Put(ctx context.Context, k string, r io.Reader, n int64, m string) (blob.Object, error) {
	e := s.bucket.PutObject(s.key(k), r, oss.WithContext(ctx), oss.ContentLength(n), oss.ContentType(m))
	if e != nil {
		return blob.Object{}, e
	}
	return s.Stat(ctx, k)
}
func (s *ossStore) Stat(ctx context.Context, k string) (blob.Object, error) {
	h, e := s.bucket.GetObjectDetailedMeta(s.key(k), oss.WithContext(ctx))
	return fromHeaders(h), e
}
func (s *ossStore) Open(ctx context.Context, k string) (io.ReadCloser, blob.Object, error) {
	v, e := s.Stat(ctx, k)
	if e != nil {
		return nil, v, e
	}
	r, e := s.bucket.GetObject(s.key(k), oss.WithContext(ctx))
	return r, v, e
}
func (s *ossStore) Delete(ctx context.Context, k string) error {
	return s.bucket.DeleteObject(s.key(k), oss.WithContext(ctx))
}
func (s *ossStore) Copy(ctx context.Context, a, b, etag string) error {
	_, e := s.bucket.CopyObject(s.key(a), s.key(b), oss.WithContext(ctx), oss.CopySourceIfMatch("\""+etag+"\""))
	return e
}
func (s *ossStore) SignPut(ctx context.Context, k string, n int64, m string, ttl time.Duration) (blob.Grant, error) {
	u, e := s.bucket.SignURL(s.key(k), oss.HTTPPut, int64(ttl.Seconds()), oss.WithContext(ctx), oss.ContentType(m), oss.ContentLength(n))
	return blob.Grant{URL: u, Method: "PUT", Headers: map[string]string{"Content-Type": m}, Fields: map[string]string{}}, e
}
func (s *ossStore) SignGet(ctx context.Context, k, name string, ttl time.Duration) (string, error) {
	return s.bucket.SignURL(s.key(k), oss.HTTPGet, int64(ttl.Seconds()), oss.WithContext(ctx), oss.ResponseContentDisposition(disposition(name)), oss.ResponseContentType("application/octet-stream"))
}
func (s *ossStore) Browser(ctx context.Context, origin string) error {
	v, e := s.client.GetBucketCORS(s.config.Bucket, oss.WithContext(ctx))
	if e != nil {
		if se, ok := e.(oss.ServiceError); !ok || se.Code != "NoSuchCORSConfiguration" {
			return e
		}
	}
	for _, r := range v.CORSRules {
		if corsReady(origin, r.AllowedOrigin, r.AllowedMethod, r.AllowedHeader, "PUT") {
			return nil
		}
	}
	rules := append(v.CORSRules, oss.CORSRule{AllowedOrigin: []string{origin}, AllowedMethod: []string{"GET", "HEAD", "PUT"}, AllowedHeader: []string{"*"}, ExposeHeader: []string{"ETag"}, MaxAgeSeconds: 600})
	return s.client.SetBucketCORSV2(s.config.Bucket, oss.PutBucketCORS{CORSRules: rules, ResponseVary: v.ResponseVary}, oss.WithContext(ctx))
}
