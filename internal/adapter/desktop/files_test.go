// Author: yunnuo <ymz@ebox.vip>
// Description: Real native chunks resume after restart, preserve bytes, and reject foreign or malformed inputs.
package desktop

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"testing"

	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/bootstrap/filelocal"
	"github.com/yunnuo/unicore/internal/bootstrap/local"
	"github.com/yunnuo/unicore/internal/contracts"
)

func TestNativeFilesSurviveRestartAndSaveOnlyOwnedBytes(t *testing.T) {
	directory := t.TempDir()
	ctx := context.Background()
	store, settings, err := local.Open(ctx, directory)
	if err != nil {
		t.Fatal(err)
	}
	service, err := filelocal.New(store, directory)
	if err != nil {
		t.Fatal(err)
	}
	b := NewLocal(bootstrap.Core(), settings, store, service)
	content := []byte("persisted native attachment")
	fingerprint := fmt.Sprintf("%x", sha256.Sum256(content))
	upload := b.BeginFileUpload(contracts.MultipartUploadInput{OriginalName: "note.txt", MimeType: "text/plain", Size: len(content), Fingerprint: fingerprint})
	if upload.Code != "OK" {
		t.Fatal(upload)
	}
	id := upload.Data.File.FileID
	if got := b.ReceiveFilePart(id, 1, "***"); got.Code != "INVALID_INPUT" {
		t.Fatal(got)
	}
	if got := b.ReceiveFilePart(id, 1, base64.StdEncoding.EncodeToString(content)); got.Code != "OK" {
		t.Fatal(got)
	}
	if err = store.Close(); err != nil {
		t.Fatal(err)
	}
	store, settings, err = local.Open(ctx, directory)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	service, err = filelocal.New(store, directory)
	if err != nil {
		t.Fatal(err)
	}
	b = NewLocal(bootstrap.Core(), settings, store, service)
	if got := b.FileUploadStatus(id); got.Code != "OK" || len(got.Data.Parts) != 1 {
		t.Fatal(got)
	}
	if got := b.CompleteFileUpload(id); got.Code != "OK" {
		t.Fatal(got)
	}
	var saved []byte
	b.SetFileSaver(func(name string, source io.Reader) error {
		if name != "note.txt" {
			t.Fatal(name)
		}
		saved, err = io.ReadAll(source)
		return err
	})
	if got := b.SaveFile(id); got.Code != "OK" || !bytes.Equal(saved, content) {
		t.Fatal(got, string(saved))
	}
	if got := b.SaveFile("../foreign"); got.Code != "FILE_NOT_FOUND" {
		t.Fatal(got)
	}
	if err = service.ValidateAttachment(ctx, localFileActor, id); err != nil {
		t.Fatal(err)
	}
	if got := b.DeleteFile(id); got.Code != "OK" {
		t.Fatal(got)
	}
	if got := b.SaveFile(id); got.Code != "FILE_NOT_FOUND" {
		t.Fatal(got)
	}
}
