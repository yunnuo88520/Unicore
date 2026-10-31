// Author: yunnuo <ymz@ebox.vip>
// Description: Native S3/OSS/COS multipart signing, authoritative paginated parts and exact-key abort recovery.
package blobcloud

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/aliyun/aliyun-oss-go-sdk/oss"
	"github.com/minio/minio-go/v7"
	cos "github.com/tencentyun/cos-go-sdk-v5"
	"github.com/yunnuo/unicore/internal/blob"
)

func partGrant(u string) blob.Grant {
	return blob.Grant{URL: u, Method: "PUT", Headers: map[string]string{"Content-Type": "application/octet-stream"}, Fields: map[string]string{}}
}
func (s *s3Store) BeginMultipart(ctx context.Context, k, m string) (string, error) {
	return (minio.Core{Client: s.client}).NewMultipartUpload(ctx, s.config.Bucket, s.key(k), minio.PutObjectOptions{ContentType: m})
}
func (s *s3Store) SignPart(ctx context.Context, k, id string, p int, n int64, ttl time.Duration) (blob.Grant, error) {
	u, e := s.client.PresignHeader(ctx, "PUT", s.config.Bucket, s.key(k), ttl, url.Values{"uploadId": {id}, "partNumber": {strconv.Itoa(p)}}, http.Header{"Content-Type": {"application/octet-stream"}, "Content-Length": {strconv.FormatInt(n, 10)}})
	if e != nil {
		return blob.Grant{}, e
	}
	return partGrant(u.String()), nil
}
func (s *s3Store) ListParts(ctx context.Context, k, id string) ([]blob.Part, error) {
	parts := []blob.Part{}
	marker := 0
	for {
		v, e := (minio.Core{Client: s.client}).ListObjectParts(ctx, s.config.Bucket, s.key(k), id, marker, 1000)
		if e != nil {
			return nil, e
		}
		for _, p := range v.ObjectParts {
			parts = append(parts, blob.Part{Number: p.PartNumber, Size: p.Size, ETag: p.ETag})
		}
		if !v.IsTruncated {
			return parts, nil
		}
		if v.NextPartNumberMarker <= marker || len(parts) > 10000 {
			return nil, blob.ErrChanged
		}
		marker = v.NextPartNumberMarker
	}
}
func (s *s3Store) CompleteMultipart(ctx context.Context, k, id string, parts []blob.Part) error {
	v := make([]minio.CompletePart, 0, len(parts))
	for _, p := range parts {
		v = append(v, minio.CompletePart{PartNumber: p.Number, ETag: p.ETag})
	}
	_, e := (minio.Core{Client: s.client}).CompleteMultipartUpload(ctx, s.config.Bucket, s.key(k), id, v, minio.PutObjectOptions{})
	return e
}
func (s *s3Store) AbortMultipart(ctx context.Context, k string) error {
	core := minio.Core{Client: s.client}
	key, upload := "", ""
	for {
		v, e := core.ListMultipartUploads(ctx, s.config.Bucket, s.key(k), key, upload, "", 1000)
		if e != nil {
			return e
		}
		for _, u := range v.Uploads {
			if u.Key == s.key(k) {
				if e = core.AbortMultipartUpload(ctx, s.config.Bucket, u.Key, u.UploadID); e != nil && minio.ToErrorResponse(e).Code != "NoSuchUpload" {
					return e
				}
			}
		}
		if !v.IsTruncated {
			return nil
		}
		if v.NextKeyMarker == key && v.NextUploadIDMarker == upload {
			return blob.ErrChanged
		}
		key, upload = v.NextKeyMarker, v.NextUploadIDMarker
	}
}
func (s *ossStore) multipart(k, id string) oss.InitiateMultipartUploadResult {
	return oss.InitiateMultipartUploadResult{Bucket: s.config.Bucket, Key: s.key(k), UploadID: id}
}
func (s *ossStore) BeginMultipart(ctx context.Context, k, m string) (string, error) {
	v, e := s.bucket.InitiateMultipartUpload(s.key(k), oss.WithContext(ctx), oss.ContentType(m))
	return v.UploadID, e
}
func (s *ossStore) SignPart(ctx context.Context, k, id string, p int, n int64, ttl time.Duration) (blob.Grant, error) {
	u, e := s.signer.SignURL(s.key(k), oss.HTTPPut, int64(ttl.Seconds()), oss.WithContext(ctx), oss.AddParam("uploadId", id), oss.AddParam("partNumber", strconv.Itoa(p)), oss.ContentLength(n), oss.ContentType("application/octet-stream"))
	return partGrant(u), e
}
func (s *ossStore) ListParts(ctx context.Context, k, id string) ([]blob.Part, error) {
	parts := []blob.Part{}
	marker := 0
	for {
		v, e := s.bucket.ListUploadedParts(s.multipart(k, id), oss.WithContext(ctx), oss.MaxParts(1000), oss.PartNumberMarker(marker))
		if e != nil {
			return nil, e
		}
		for _, p := range v.UploadedParts {
			parts = append(parts, blob.Part{Number: p.PartNumber, Size: int64(p.Size), ETag: p.ETag})
		}
		if !v.IsTruncated {
			return parts, nil
		}
		next, _ := strconv.Atoi(v.NextPartNumberMarker)
		if next <= marker || len(parts) > 10000 {
			return nil, blob.ErrChanged
		}
		marker = next
	}
}
func (s *ossStore) CompleteMultipart(ctx context.Context, k, id string, parts []blob.Part) error {
	v := make([]oss.UploadPart, 0, len(parts))
	for _, p := range parts {
		v = append(v, oss.UploadPart{PartNumber: p.Number, ETag: p.ETag})
	}
	_, e := s.bucket.CompleteMultipartUpload(s.multipart(k, id), v, oss.WithContext(ctx))
	return e
}
func (s *ossStore) AbortMultipart(ctx context.Context, k string) error {
	key, upload := "", ""
	for {
		v, e := s.bucket.ListMultipartUploads(oss.WithContext(ctx), oss.Prefix(s.key(k)), oss.KeyMarker(key), oss.UploadIDMarker(upload), oss.MaxUploads(1000))
		if e != nil {
			return e
		}
		for _, u := range v.Uploads {
			if u.Key == s.key(k) {
				e = s.bucket.AbortMultipartUpload(s.multipart(k, u.UploadID), oss.WithContext(ctx))
				if e != nil {
					if se, ok := e.(oss.ServiceError); !ok || se.Code != "NoSuchUpload" {
						return e
					}
				}
			}
		}
		if !v.IsTruncated {
			return nil
		}
		if key == v.NextKeyMarker && upload == v.NextUploadIDMarker {
			return blob.ErrChanged
		}
		key, upload = v.NextKeyMarker, v.NextUploadIDMarker
	}
}
func (s *cosStore) BeginMultipart(ctx context.Context, k, m string) (string, error) {
	v, _, e := s.client.Object.InitiateMultipartUpload(ctx, s.key(k), &cos.InitiateMultipartUploadOptions{ObjectPutHeaderOptions: &cos.ObjectPutHeaderOptions{ContentType: m}})
	if e != nil {
		return "", e
	}
	return v.UploadID, nil
}
func (s *cosStore) SignPart(ctx context.Context, k, id string, p int, n int64, ttl time.Duration) (blob.Grant, error) {
	q := url.Values{"uploadId": {id}, "partNumber": {strconv.Itoa(p)}}
	h := http.Header{"Content-Type": {"application/octet-stream"}, "Content-Length": {strconv.FormatInt(n, 10)}}
	u, e := s.client.Object.GetPresignedURL2(ctx, "PUT", s.key(k), ttl, &cos.PresignedURLOptions{Query: &q, Header: &h})
	if e != nil {
		return blob.Grant{}, e
	}
	return partGrant(u.String()), nil
}
func (s *cosStore) ListParts(ctx context.Context, k, id string) ([]blob.Part, error) {
	parts := []blob.Part{}
	marker := ""
	for {
		v, _, e := s.client.Object.ListParts(ctx, s.key(k), id, &cos.ObjectListPartsOptions{MaxParts: "1000", PartNumberMarker: marker})
		if e != nil {
			return nil, e
		}
		for _, p := range v.Parts {
			parts = append(parts, blob.Part{Number: p.PartNumber, Size: p.Size, ETag: p.ETag})
		}
		if !v.IsTruncated {
			return parts, nil
		}
		if v.NextPartNumberMarker == marker || len(parts) > 10000 {
			return nil, fmt.Errorf("invalid part pagination")
		}
		marker = v.NextPartNumberMarker
	}
}
func (s *cosStore) CompleteMultipart(ctx context.Context, k, id string, parts []blob.Part) error {
	v := make([]cos.Object, 0, len(parts))
	for _, p := range parts {
		v = append(v, cos.Object{PartNumber: p.Number, ETag: p.ETag})
	}
	_, _, e := s.client.Object.CompleteMultipartUpload(ctx, s.key(k), id, &cos.CompleteMultipartUploadOptions{Parts: v})
	return e
}
func (s *cosStore) AbortMultipart(ctx context.Context, k string) error {
	key, upload := "", ""
	for {
		v, _, e := s.client.Bucket.ListMultipartUploads(ctx, &cos.ListMultipartUploadsOptions{Prefix: s.key(k), KeyMarker: key, UploadIDMarker: upload, MaxUploads: 1000})
		if e != nil {
			return e
		}
		for _, u := range v.Uploads {
			if u.Key == s.key(k) {
				r, e := s.client.Object.AbortMultipartUpload(ctx, u.Key, u.UploadID)
				if e != nil && (r == nil || r.StatusCode != 404) {
					return e
				}
			}
		}
		if !v.IsTruncated {
			return nil
		}
		if key == v.NextKeyMarker && upload == v.NextUploadIDMarker {
			return blob.ErrChanged
		}
		key, upload = v.NextKeyMarker, v.NextUploadIDMarker
	}
}
