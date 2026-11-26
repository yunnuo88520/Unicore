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
	"image/draw"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"runtime"
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
		if err != nil || format != "png" || cfg.Width != 1024 || cfg.Height != 512 || len(data) > maxNormalizedBytes {
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
	binary.BigEndian.PutUint32(bomb[16:20], 1000000)
	binary.BigEndian.PutUint32(bomb[29:33], crc32.ChecksumIEEE(bomb[12:29]))
	invalid := []string{"", "invalid", base64.StdEncoding.EncodeToString([]byte(`<svg onload="alert(1)"/>`))}
	for i, input := range invalid {
		if _, err := Normalize(input); !errors.Is(err, ErrInvalid) {
			t.Fatalf("invalid %d accepted: %v", i, err)
		}
	}
	if _, err := Normalize(base64.StdEncoding.EncodeToString(bomb)); !errors.Is(err, ErrImageTooLarge) {
		t.Fatalf("decode budget error was not distinguished: %v", err)
	}
	for _, normalize := range []func(string) ([]byte, error){Normalize, NormalizeIcon} {
		if _, err := normalize(base64.StdEncoding.EncodeToString(make([]byte, MaxBytes+1))); !errors.Is(err, ErrUploadTooLarge) {
			t.Fatalf("upload byte limit error was not distinguished: %v", err)
		}
	}
}

func TestNormalizeAcceptsSmallHighResolutionLogo(t *testing.T) {
	// Regress a small encoded PNG exceeding the former 16 MP limit. A palette
	// keeps the source fixture small without retaining a real uploaded logo.
	const width, height = 12228, 2227
	img := image.NewPaletted(image.Rect(0, 0, width, height), color.Palette{color.White, color.NRGBA{R: 220, A: 255}})
	draw.Draw(img, image.Rect(500, 500, width-500, height-500), image.NewUniform(img.Palette[1]), image.Point{}, draw.Src)
	var raw bytes.Buffer
	if err := png.Encode(&raw, img); err != nil {
		t.Fatal(err)
	}
	if raw.Len() > MaxBytes {
		t.Fatalf("regression input must satisfy upload limit: %d bytes", raw.Len())
	}
	data, err := Normalize(base64.StdEncoding.EncodeToString(raw.Bytes()))
	if err != nil {
		t.Fatalf("small high-resolution image rejected: %v", err)
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || format != "png" || cfg.Width != 1024 || cfg.Height != 186 || len(data) > maxNormalizedBytes {
		t.Fatalf("high-resolution logo was not normalized proportionally: %+v %s %v", cfg, format, err)
	}
}

func TestDecodeBudgetAccountsForColorDepthAndExtremeDimensions(t *testing.T) {
	for _, test := range []struct {
		name   string
		config image.Config
		want   bool
	}{
		{"8-bit accepted", image.Config{ColorModel: color.NRGBAModel, Width: 12228, Height: 2227}, true},
		{"16-bit exceeds budget", image.Config{ColorModel: color.NRGBA64Model, Width: 12228, Height: 2227}, false},
		{"huge width", image.Config{ColorModel: color.RGBAModel, Width: 1_000_000, Height: 32}, false},
		{"huge height", image.Config{ColorModel: color.RGBAModel, Width: 1, Height: 1_000_000_000}, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := withinDecodeBudget(test.config); got != test.want {
				t.Fatalf("withinDecodeBudget() = %v, want %v", got, test.want)
			}
		})
	}
}

func TestLogoScalingBoundsScratchForTallImages(t *testing.T) {
	// A narrow, tall image has a small pixel buffer but large kernel weights.
	src := image.NewNRGBA(image.Rect(0, 0, 2, 2_200_000))
	for y := 0; y < src.Bounds().Dy(); y++ {
		for x := 0; x < 2; x++ {
			i := src.PixOffset(x, y)
			stripe := uint8(y % 2 * 255)
			src.Pix[i], src.Pix[i+1], src.Pix[i+2], src.Pix[i+3] = stripe, stripe, stripe, 255
		}
	}
	dst := image.NewNRGBA(image.Rect(0, 0, 1, 1024))
	scaleLogo(dst, src, src.Bounds())
	for y := 1; y < dst.Bounds().Dy()-1; y++ {
		if got := dst.NRGBAAt(0, y); got.R < 120 || got.R > 136 || got.A != 255 {
			t.Fatalf("bounded resampling aliased fine stripes at row %d: %+v", y, got)
		}
	}
}

func TestNormalizeTrimsOnlyTransparentPNGBounds(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 300, 180))
	for y := 50; y < 130; y++ {
		for x := 100; x < 200; x++ {
			img.SetNRGBA(x, y, color.NRGBA{R: 255, G: 255, B: 255, A: 255})
		}
	}
	var raw bytes.Buffer
	if err := png.Encode(&raw, img); err != nil {
		t.Fatal(err)
	}
	data, err := Normalize(base64.StdEncoding.EncodeToString(raw.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width != 100 || cfg.Height != 80 {
		t.Fatalf("transparent padding was not removed: %+v %v", cfg, err)
	}

	white := image.NewNRGBA(image.Rect(0, 0, 300, 180))
	for y := 0; y < 180; y++ {
		for x := 0; x < 300; x++ {
			white.SetNRGBA(x, y, color.NRGBA{R: 255, G: 255, B: 255, A: 255})
		}
	}
	raw.Reset()
	if err := png.Encode(&raw, white); err != nil {
		t.Fatal(err)
	}
	data, err = Normalize(base64.StdEncoding.EncodeToString(raw.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	cfg, _, err = image.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width != 300 || cfg.Height != 180 {
		t.Fatalf("opaque white canvas was cropped: %+v %v", cfg, err)
	}
}

func TestEncodeFitBoundedRespectsOutputBudget(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 1024, 1024))
	state := uint32(1)
	for y := 0; y < 1024; y++ {
		for x := 0; x < 1024; x++ {
			state ^= state << 13
			state ^= state >> 17
			state ^= state << 5
			img.SetNRGBA(x, y, color.NRGBA{R: byte(state), G: byte(state >> 8), B: byte(state >> 16), A: 255})
		}
	}
	data, err := encodeFitBounded(img, maxLogoDimension, maxLogoDimension, maxNormalizedBytes)
	if err != nil || len(data) > maxNormalizedBytes {
		t.Fatalf("output exceeded stored asset budget: %d bytes, %v", len(data), err)
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || format != "png" || cfg.Width >= maxLogoDimension || cfg.Height >= maxLogoDimension {
		t.Fatalf("oversized encoded output was not reduced: %+v %s %v", cfg, format, err)
	}
}

func TestMailLogoPreservesAspectRatioAndBudget(t *testing.T) {
	for _, test := range []struct {
		name       string
		w, h       int
		outW, outH int
	}{
		{name: "wordmark", w: 2048, h: 512, outW: 320, outH: 80},
		{name: "mark", w: 1024, h: 1024, outW: 84, outH: 84},
	} {
		t.Run(test.name, func(t *testing.T) {
			store := &memoryStore{values: map[string]string{}}
			service := New(store, bloblocal.New(filepath.Join(t.TempDir(), "brand-assets")))
			if _, err := service.Update(context.Background(), contracts.BrandingInput{Slot: "logo", Content: imageInput(t, test.w, test.h, false)}, "actor", false); err != nil {
				t.Fatal(err)
			}
			data, err := service.Logo(context.Background())
			if err != nil || len(data) > maxMailLogoBytes {
				t.Fatalf("mail image exceeded budget: %d bytes, %v", len(data), err)
			}
			cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
			if err != nil || format != "png" || cfg.Width != test.outW || cfg.Height != test.outH {
				t.Fatalf("mail image dimensions changed: %+v %s %v", cfg, format, err)
			}
		})
	}
}

func TestNormalizeAcceptsLargeLandscapeAndPortraitLogos(t *testing.T) {
	for _, dimensions := range [][2]int{{4096, 512}, {512, 4096}, {1, 16}} {
		data, err := Normalize(imageInput(t, dimensions[0], dimensions[1], false))
		if err != nil {
			t.Fatalf("accepted size %dx%d rejected: %v", dimensions[0], dimensions[1], err)
		}
		cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
		if err != nil || format != "png" {
			t.Fatalf("normalized %dx%d image invalid: %v", dimensions[0], dimensions[1], err)
		}
		if cfg.Width*dimensions[1] != cfg.Height*dimensions[0] {
			t.Fatalf("aspect ratio changed: input %dx%d, output %dx%d", dimensions[0], dimensions[1], cfg.Width, cfg.Height)
		}
	}
}

func TestNormalizeAcceptsExactUploadByteLimit(t *testing.T) {
	raw, err := base64.StdEncoding.DecodeString(imageInput(t, 16, 16, false))
	if err != nil {
		t.Fatal(err)
	}
	raw = append(raw, make([]byte, MaxBytes-len(raw))...)
	if _, err = Normalize(base64.StdEncoding.EncodeToString(raw)); err != nil {
		t.Fatalf("image at %d-byte limit rejected: %v", MaxBytes, err)
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
	// Windows keeps no POSIX mode bits; Go only reports a synthetic 0666 there.
	if runtime.GOOS != "windows" && info.Mode().Perm() != 0600 {
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
func TestAccentSlot(t *testing.T) {
	ctx := context.Background()
	store := &memoryStore{values: map[string]string{}}
	service := New(store, bloblocal.New(filepath.Join(t.TempDir(), "brand-assets")))
	saved, err := service.Update(ctx, contracts.BrandingInput{Slot: "accent", Content: "#6662EC"}, "actor", false)
	if err != nil || saved.Accent == nil || *saved.Accent != "#6662ec" {
		t.Fatal("accent not saved normalized", saved.Accent, err)
	}
	for _, invalid := range []string{"purple", "#6662ec<script>", "6662ec", "#6662", "javascript:alert(1)"} {
		if _, err = service.Update(ctx, contracts.BrandingInput{Slot: "accent", Content: invalid}, "actor", false); !errors.Is(err, ErrInvalid) {
			t.Fatalf("invalid accent accepted: %s", invalid)
		}
	}
	snapshot, err := service.Snapshot(ctx, false)
	if err != nil || snapshot.Accent == nil || *snapshot.Accent != "#6662ec" {
		t.Fatal("snapshot lost accent", err)
	}
	if _, err = service.Update(ctx, contracts.BrandingInput{Slot: "accent"}, "actor", false); err != nil {
		t.Fatal("accent reset failed", err)
	}
	after, _ := service.Snapshot(ctx, false)
	if after.Accent != nil {
		t.Fatal("reset accent still present")
	}
}

func TestSnapshotDefaultsAndPreservesDisplayMode(t *testing.T) {
	for _, test := range []struct {
		stored string
		want   string
	}{
		{stored: "", want: "icon-title"},
		{stored: "wordmark", want: "wordmark"},
		{stored: "unknown", want: "icon-title"},
	} {
		store := &memoryStore{values: map[string]string{}}
		if test.stored != "" {
			store.values["branding.display_mode"] = test.stored
		}
		snapshot, err := New(store, bloblocal.New(filepath.Join(t.TempDir(), "brand-assets"))).Snapshot(context.Background(), false)
		if err != nil || snapshot.DisplayMode == nil || *snapshot.DisplayMode != test.want {
			t.Fatalf("display mode = %v, want %q (err %v)", snapshot.DisplayMode, test.want, err)
		}
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
			content := input
			if slot == "accent" {
				content = "#6662ec"
			}
			if _, err := service.Update(context.Background(), contracts.BrandingInput{Slot: slot, Content: content}, "actor", false); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	snapshot, _ := service.Snapshot(context.Background(), false)
	if snapshot.Logo == "" || snapshot.LogoDark == "" || snapshot.Favicon == "" || snapshot.Accent == nil {
		t.Fatal("concurrent update lost a slot")
	}
}
