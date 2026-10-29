// Author: yunnuo <ymz@ebox.vip>
// Description: Server-side ranged copies avoid provider single-copy limits without proxying bytes.
package blobcloud

import (
	"context"
	"fmt"
	"github.com/aliyun/aliyun-oss-go-sdk/oss"
	cos "github.com/tencentyun/cos-go-sdk-v5"
	"github.com/yunnuo/unicore/internal/blob"
	"strings"
)

func multipartCopy(ctx context.Context, mp blob.Multipart, source, target, mime string, size int64, part func(string, int, int64, int64) (blob.Part, error)) error {
	upload, e := mp.BeginMultipart(ctx, target, mime)
	if e != nil {
		return e
	}
	parts := []blob.Part{}
	for start := int64(0); start < size; start += 256 << 20 {
		n := min(int64(256<<20), size-start)
		p, e := part(upload, len(parts)+1, start, n)
		if e != nil {
			return e
		}
		parts = append(parts, p)
	}
	// The caller already registered cleanup for target; exact-key abort also recovers lost copy upload IDs.
	return mp.CompleteMultipart(ctx, target, upload, parts)
}
func (s *ossStore) largeCopy(ctx context.Context, a, b, etag string, o blob.Object) error {
	return multipartCopy(ctx, s, a, b, o.MIME, o.Size, func(id string, n int, start, size int64) (blob.Part, error) {
		p, e := s.bucket.UploadPartCopy(s.multipart(b, id), s.config.Bucket, s.key(a), start, size, n, oss.WithContext(ctx), oss.CopySourceIfMatch("\""+etag+"\""))
		return blob.Part{Number: n, Size: size, ETag: p.ETag}, e
	})
}
func (s *cosStore) largeCopy(ctx context.Context, a, b, etag string, o blob.Object) error {
	return multipartCopy(ctx, s, a, b, o.MIME, o.Size, func(id string, n int, start, size int64) (blob.Part, error) {
		source := strings.TrimPrefix(strings.TrimPrefix(s.origin, "https://"), "http://") + "/" + s.key(a)
		p, _, e := s.client.Object.CopyPart(ctx, s.key(b), id, n, source, &cos.ObjectCopyPartOptions{XCosCopySourceRange: fmt.Sprintf("bytes=%d-%d", start, start+size-1), XCosCopySourceIfMatch: "\"" + etag + "\""})
		if e != nil {
			return blob.Part{}, e
		}
		return blob.Part{Number: n, Size: size, ETag: p.ETag}, nil
	})
}
