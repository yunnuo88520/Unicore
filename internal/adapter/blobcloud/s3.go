// Author: yunnuo <ymz@ebox.vip>
// Description: Official S3/MinIO SDK adapter; private POST uploads and conditional server-side copies.
package blobcloud

import (
	"context"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/cors"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/yunnuo/unicore/internal/blob"
)

type Config struct {
	Provider, Endpoint, Bucket, Region, Prefix, AccessKey, SecretKey string
	PathStyle                                                        bool
}
type Managed interface {
	blob.Store
	Browser(context.Context, string) error
	Origin() string
}

func New(c Config) (Managed, error) {
	switch c.Provider {
	case "oss":
		return newOSS(c)
	case "cos":
		return newCOS(c)
	default:
		return newS3(c)
	}
}
func disposition(name string) string {
	return mime.FormatMediaType("attachment", map[string]string{"filename": name})
}
func fromHeaders(h http.Header) blob.Object {
	size, _ := strconv.ParseInt(h.Get("Content-Length"), 10, 64)
	return blob.Object{Size: size, MIME: h.Get("Content-Type"), ETag: strings.Trim(h.Get("ETag"), "\"")}
}
func prefixed(prefix, key string) string {
	if prefix == "" {
		return key
	}
	return prefix + "/" + key
}

type s3Store struct {
	client *minio.Client
	config Config
	origin string
}

func newS3(c Config) (Managed, error) {
	u, err := url.Parse(c.Endpoint)
	if err != nil {
		return nil, err
	}
	lookup := minio.BucketLookupDNS
	if c.PathStyle || c.Provider == "minio" {
		lookup = minio.BucketLookupPath
	}
	client, err := minio.New(u.Host, &minio.Options{Creds: credentials.NewStaticV4(c.AccessKey, c.SecretKey, ""), Secure: u.Scheme == "https", Region: c.Region, BucketLookup: lookup})
	if err != nil {
		return nil, err
	}
	origin := u.Scheme + "://" + u.Host
	if lookup == minio.BucketLookupDNS {
		origin = u.Scheme + "://" + c.Bucket + "." + u.Host
	}
	return &s3Store{client, c, origin}, nil
}
func (s *s3Store) key(k string) string { return prefixed(s.config.Prefix, k) }
func (s *s3Store) Origin() string      { return s.origin }
func (s *s3Store) Put(ctx context.Context, k string, r io.Reader, n int64, m string) (blob.Object, error) {
	v, e := s.client.PutObject(ctx, s.config.Bucket, s.key(k), r, n, minio.PutObjectOptions{ContentType: m})
	return blob.Object{Size: v.Size, MIME: m, ETag: v.ETag}, e
}
func (s *s3Store) Open(ctx context.Context, k string) (io.ReadCloser, blob.Object, error) {
	o, e := s.client.GetObject(ctx, s.config.Bucket, s.key(k), minio.GetObjectOptions{})
	if e != nil {
		return nil, blob.Object{}, e
	}
	v, e := o.Stat()
	if e != nil {
		o.Close()
		return nil, blob.Object{}, e
	}
	return o, blob.Object{Size: v.Size, MIME: v.ContentType, ETag: v.ETag}, nil
}
func (s *s3Store) Stat(ctx context.Context, k string) (blob.Object, error) {
	v, e := s.client.StatObject(ctx, s.config.Bucket, s.key(k), minio.StatObjectOptions{})
	return blob.Object{Size: v.Size, MIME: v.ContentType, ETag: v.ETag}, e
}
func (s *s3Store) Delete(ctx context.Context, k string) error {
	return s.client.RemoveObject(ctx, s.config.Bucket, s.key(k), minio.RemoveObjectOptions{})
}
func (s *s3Store) Copy(ctx context.Context, a, b, etag string) error {
	_, e := s.client.CopyObject(ctx, minio.CopyDestOptions{Bucket: s.config.Bucket, Object: s.key(b)}, minio.CopySrcOptions{Bucket: s.config.Bucket, Object: s.key(a), MatchETag: etag})
	return e
}
func (s *s3Store) SignPut(ctx context.Context, k string, n int64, m string, ttl time.Duration) (blob.Grant, error) {
	p := minio.NewPostPolicy()
	p.SetBucket(s.config.Bucket)
	p.SetKey(s.key(k))
	p.SetExpires(time.Now().Add(ttl))
	p.SetContentType(m)
	p.SetContentLengthRange(n, n)
	p.SetSuccessStatusAction("204")
	u, f, e := s.client.PresignedPostPolicy(ctx, p)
	if e != nil {
		return blob.Grant{}, e
	}
	return blob.Grant{URL: u.String(), Method: "POST", Headers: map[string]string{}, Fields: f}, nil
}
func (s *s3Store) SignGet(ctx context.Context, k, name string, ttl time.Duration) (string, error) {
	q := url.Values{"response-content-disposition": {disposition(name)}, "response-content-type": {"application/octet-stream"}}
	u, e := s.client.PresignedGetObject(ctx, s.config.Bucket, s.key(k), ttl, q)
	if e != nil {
		return "", e
	}
	return u.String(), nil
}
func (s *s3Store) Browser(ctx context.Context, origin string) error {
	if s.config.Provider == "minio" && s.browserReady(ctx, origin) {
		return nil
	}
	c, e := s.client.GetBucketCors(ctx, s.config.Bucket)
	if e != nil {
		v := minio.ToErrorResponse(e)
		if s.config.Provider == "minio" && v.Code == "NotImplemented" {
			return blob.ErrUnsupported
		}
		if v.Code != "NoSuchCORSConfiguration" {
			return e
		}
		c = &cors.Config{}
	}
	if c == nil {
		c = &cors.Config{}
	}
	for _, r := range c.CORSRules {
		if corsReady(origin, r.AllowedOrigin, r.AllowedMethod, r.AllowedHeader, "POST") {
			return nil
		}
	}
	c.CORSRules = append(c.CORSRules, cors.Rule{AllowedOrigin: []string{origin}, AllowedMethod: []string{"GET", "HEAD", "POST", "PUT"}, AllowedHeader: []string{"*"}, ExposeHeader: []string{"ETag"}, MaxAgeSeconds: 600})
	return s.client.SetBucketCors(ctx, s.config.Bucket, c)
}

func (s *s3Store) browserReady(ctx context.Context, origin string) bool {
	request, e := http.NewRequestWithContext(ctx, "OPTIONS", s.origin+"/"+s.config.Bucket, nil)
	if e != nil {
		return false
	}
	request.Header.Set("Origin", origin)
	request.Header.Set("Access-Control-Request-Method", "POST")
	response, e := (&http.Client{Timeout: 10 * time.Second}).Do(request)
	if e != nil {
		return false
	}
	defer response.Body.Close()
	allowed := response.Header.Get("Access-Control-Allow-Origin")
	return response.StatusCode < 300 && (allowed == origin || allowed == "*") && strings.Contains(response.Header.Get("Access-Control-Allow-Methods"), "POST")
}

func corsReady(origin string, origins, methods, headers []string, method string) bool {
	allowed := false
	for _, v := range origins {
		if v == origin || v == "*" {
			allowed = true
		}
	}
	if !allowed {
		return false
	}
	allowed = false
	for _, v := range methods {
		if v == method {
			allowed = true
		}
	}
	if !allowed {
		return false
	}
	for _, v := range headers {
		if v == "*" || strings.EqualFold(v, "content-type") {
			return true
		}
	}
	return false
}
