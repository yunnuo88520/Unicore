// Author: yunnuo <ymz@ebox.vip>
// Description: Opt-in MinIO browser-test bucket preparation and cleanup restricted to task-owned test prefixes.
package main

import (
	"context"
	"fmt"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"net/url"
	"os"
	"strings"
	"time"
)

func main() {
	if e := run(); e != nil {
		fmt.Fprintln(os.Stderr, "Storage fixture failed:", safeCloudError(e))
		os.Exit(1)
	}
}
func run() error {
	if len(os.Args) < 2 {
		return fmt.Errorf("command required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if provider := os.Getenv("UNICORE_TEST_STORAGE_PROVIDER"); provider == "oss" || provider == "cos" {
		return cloudFixture(ctx, provider)
	}
	u, e := url.Parse(os.Getenv("UNICORE_TEST_MINIO_ENDPOINT"))
	if e != nil || u.Host == "" {
		return fmt.Errorf("endpoint required")
	}
	c, e := minio.New(u.Host, &minio.Options{Creds: credentials.NewStaticV4(os.Getenv("UNICORE_TEST_MINIO_ACCESS_KEY"), os.Getenv("UNICORE_TEST_MINIO_SECRET_KEY"), ""), Secure: u.Scheme == "https"})
	if e != nil {
		return e
	}
	bucket := os.Getenv("UNICORE_TEST_MINIO_BUCKET")
	switch os.Args[1] {
	case "prepare":
		exists, e := c.BucketExists(ctx, bucket)
		if e != nil {
			return e
		}
		if !exists {
			return c.MakeBucket(ctx, bucket, minio.MakeBucketOptions{})
		}
		return nil
	case "cleanup":
		if len(os.Args) < 3 || !strings.HasPrefix(os.Args[2], "unicore-browser-") || strings.ContainsAny(os.Args[2], "/\\") {
			return fmt.Errorf("task-owned prefix required")
		}
		for o := range c.ListIncompleteUploads(ctx, bucket, os.Args[2]+"/", true) {
			if o.Err != nil {
				return o.Err
			}
			if e = c.RemoveIncompleteUpload(ctx, bucket, o.Key); e != nil {
				return e
			}
		}
		for o := range c.ListObjects(ctx, bucket, minio.ListObjectsOptions{Prefix: os.Args[2] + "/", Recursive: true}) {
			if o.Err != nil {
				return o.Err
			}
			if e = c.RemoveObject(ctx, bucket, o.Key, minio.RemoveObjectOptions{}); e != nil {
				return e
			}
		}
		return nil
	}
	return fmt.Errorf("unknown command")
}
