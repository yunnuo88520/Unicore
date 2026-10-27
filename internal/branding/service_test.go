// Author: yunnuo <ymz@ebox.vip>
// Description: Verify image trust boundaries, atomic persistence, cleanup and concurrent slot replacement.
package branding

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/yunnuo/unicore/internal/adapter/bloblocal"
	"github.com/yunnuo/unicore/internal/contracts"
)

type memoryStore struct {
	values map[string]string
	fail   bool
}

func (m *memoryStore) ReadSettings(context.Context) (map[string]string, error) {
	out := map[string]string{}
	for k, v := range m.values {
		out[k] = v
	}
	return out, nil
}
func (m *memoryStore) SaveSettings(_ context.Context, values map[string]string, _ string) error {
	if m.fail {
		return errors.New("unavailable")
	}
	for k, v := range values {
		m.values[k] = v
	}
	return nil
}
func imageInput(t *testing.T, w, h int, jpg bool) string {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.NRGBA{R: uint8(x), G: 150, B: 100, A: 180})
		}
	}
	var data bytes.Buffer
	if jpg {
		_ = jpeg.Encode(&data, img, nil)
	} else {
		_ = png.Encode(&data, img)
	}
	return base64.StdEncoding.EncodeToString(data.Bytes())
}
func TestNormalizeBoundaries(t *testing.T) {
	for _, jpg := range []bool{false, true} {
		raw := imageInput(t, 1024, 512, jpg)
		data, err := Normalize(raw)
		if err != nil {
			t.Fatal(err)
		}
		cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
		if err != nil || format != "png" || cfg.Width != 256 || cfg.Height != 256 {
			t.Fatal(cfg, format, err)
		}
	}
	valid, _ := base64.StdEncoding.DecodeString(imageInput(t, 32, 32, false))
	trailing := append(append([]byte{}, valid...), []byte("<script>payload</script>")...)
	normalized, err := Normalize(base64.StdEncoding.EncodeToString(trailing))
	if err != nil || bytes.Contains(normalized, []byte("script")) {
		t.Fatal("trailing payload survived", err)
	}
	bomb := append([]byte{}, valid...)
	binary.BigEndian.PutUint32(bomb[16:20], 100000)
	binary.BigEndian.PutUint32(bomb[29:33], crc32.ChecksumIEEE(bomb[12:29]))
	invalid := []string{"", "invalid", base64.StdEncoding.EncodeToString([]byte(`<svg onload="alert(1)"/>`)), base64.StdEncoding.EncodeToString(bomb), imageInput(t, 15, 32, false), imageInput(t, 2049, 16, false), base64.StdEncoding.EncodeToString(make([]byte, MaxBytes+1))}
	for i, input := range invalid {
		if _, err := Normalize(input); !errors.Is(err, ErrInvalid) {
			t.Fatalf("invalid %d accepted: %v", i, err)
		}
	}
}
func TestPersistenceFailureAndCleanup(t *testing.T) {
	ctx := context.Background()
	store := &memoryStore{values: map[string]string{}}
	directory := t.TempDir()
	service := New(store, bloblocal.New(filepath.Join(directory, "brand-assets")))
	original := imageInput(t, 32, 32, false)
	first, err := service.Update(ctx, contracts.BrandingInput{Slot: "logo", Content: original}, "actor", false)
	if err != nil || first.Logo == "" {
		t.Fatal(first, err)
	}
	name := strings.TrimPrefix(first.Logo, "/brand-assets/")
	data, err := service.Asset(ctx, name)
	if err != nil {
		t.Fatal(err)
	}
	info, _ := os.Stat(filepath.Join(directory, "brand-assets", name))
	if info.Mode().Perm() != 0600 {
		t.Fatal("unsafe permissions")
	}
	store.fail = true
	if _, err = service.Update(ctx, contracts.BrandingInput{Slot: "logo", Content: imageInput(t, 64, 64, true)}, "actor", false); err == nil {
		t.Fatal("failed DB save reported success")
	}
	after, _ := service.Snapshot(ctx, false)
	if after.Logo != first.Logo {
		t.Fatal("failed save replaced brand")
	}
	entries, _ := os.ReadDir(filepath.Join(directory, "brand-assets"))
	if len(entries) != 1 {
		t.Fatal("failed save leaked asset")
	}
	store.fail = false
	restarted := New(store, bloblocal.New(filepath.Join(directory, "brand-assets")))
	snapshot, err := restarted.Snapshot(ctx, true)
	if err != nil || snapshot.Logo != "data:image/png;base64,"+base64.StdEncoding.EncodeToString(data) {
		t.Fatal("restart lost brand", err)
	}
	for _, name := range []string{"../secret.key", "/tmp/x", strings.Repeat("a", 64) + ".svg", strings.Repeat("a", 64) + ".png"} {
		if _, err := service.Asset(ctx, name); err == nil {
			t.Fatal("unexpected asset", name)
		}
	}
	_, _ = service.Update(ctx, contracts.BrandingInput{Slot: "logo_dark", Content: original}, "actor", false)
	_, _ = service.Update(ctx, contracts.BrandingInput{Slot: "logo"}, "actor", false)
	if _, err := service.Asset(ctx, name); err != nil {
		t.Fatal("shared dark asset removed", err)
	}
	_, _ = service.Update(ctx, contracts.BrandingInput{Slot: "logo_dark"}, "actor", false)
	entries, _ = os.ReadDir(filepath.Join(directory, "brand-assets"))
	if len(entries) != 0 {
		t.Fatal("reset leaked files")
	}
	if _, err := service.Update(ctx, contracts.BrandingInput{Slot: "../x", Content: original}, "actor", false); !errors.Is(err, ErrInvalid) {
		t.Fatal("invalid slot accepted")
	}
}
func TestConcurrentSlots(t *testing.T) {
	store := &memoryStore{values: map[string]string{}}
	service := New(store, bloblocal.New(filepath.Join(t.TempDir(), "brand-assets")))
	input := imageInput(t, 64, 64, false)
	var wg sync.WaitGroup
	for _, slot := range Slots {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := service.Update(context.Background(), contracts.BrandingInput{Slot: slot, Content: input}, "actor", false); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	snapshot, _ := service.Snapshot(context.Background(), false)
	if snapshot.Logo == "" || snapshot.LogoDark == "" || snapshot.Favicon == "" {
		t.Fatal("concurrent update lost a slot")
	}
}
