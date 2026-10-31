// Author: yunnuo <ymz@ebox.vip>
// Description: Bounded, normalized instance images stored separately from compiled package identity.
package branding

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"image"
	_ "image/jpeg"
	"image/png"
	"io"
	"regexp"
	"sync"

	"github.com/yunnuo/unicore/internal/blob"
	"github.com/yunnuo/unicore/internal/contracts"
)

const MaxBytes = 256 * 1024

var ErrInvalid = errors.New("invalid brand image")
var filename = regexp.MustCompile(`^[a-f0-9]{64}\.png$`)
var Slots = []string{"logo", "logo_dark", "favicon"}

type Store interface {
	ReadSettings(context.Context) (map[string]string, error)
	SaveSettings(context.Context, map[string]string, string) error
}
type Service struct {
	store   Store
	objects blob.Store
	mu      sync.Mutex
}

func New(store Store, objects blob.Store) *Service {
	return &Service{store: store, objects: objects}
}
func Managed(key string) bool {
	for _, slot := range Slots {
		if key == "branding."+slot {
			return true
		}
	}
	return false
}
func ValidReference(value string) bool { return value == "" || filename.MatchString(value) }

// Normalize checks dimensions before allocating pixels and re-encodes decoded pixels only.
func Normalize(content string) ([]byte, error) {
	if len(content) > base64.StdEncoding.EncodedLen(MaxBytes) {
		return nil, ErrInvalid
	}
	raw, err := base64.StdEncoding.Strict().DecodeString(content)
	if err != nil || len(raw) == 0 || len(raw) > MaxBytes {
		return nil, ErrInvalid
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil || (format != "png" && format != "jpeg") || cfg.Width < 16 || cfg.Height < 16 || cfg.Width > 2048 || cfg.Height > 2048 || cfg.Width*cfg.Height > 4*1024*1024 {
		return nil, ErrInvalid
	}
	src, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, ErrInvalid
	}
	return encode(src, 256)
}

func encode(src image.Image, limit int) ([]byte, error) {
	bounds := src.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if width > limit || height > limit {
		if width >= height {
			height = height * limit / width
			width = limit
		} else {
			width = width * limit / height
			height = limit
		}
		if width < 1 {
			width = 1
		}
		if height < 1 {
			height = 1
		}
	}
	side := max(width, height)
	dst := image.NewNRGBA(image.Rect(0, 0, side, side))
	offsetX, offsetY := (side-width)/2, (side-height)/2
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			dst.Set(offsetX+x, offsetY+y, src.At(src.Bounds().Min.X+x*bounds.Dx()/width, src.Bounds().Min.Y+y*bounds.Dy()/height))
		}
	}
	var output bytes.Buffer
	if err := png.Encode(&output, dst); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}
func (s *Service) read(ctx context.Context, name string) ([]byte, error) {
	if !filename.MatchString(name) {
		return nil, ErrInvalid
	}
	r, obj, err := s.objects.Open(ctx, name)
	if err != nil {
		return nil, err
	}
	defer r.Close()
	if obj.Size > 512*1024 {
		return nil, ErrInvalid
	}
	return io.ReadAll(io.LimitReader(r, 512*1024))
}
func (s *Service) snapshot(ctx context.Context, values map[string]string, embedded bool) contracts.Branding {
	urls := map[string]string{}
	for _, slot := range Slots {
		name := values["branding."+slot]
		if name == "" {
			continue
		}
		data, err := s.read(ctx, name)
		if err != nil {
			continue
		}
		if embedded {
			urls[slot] = "data:image/png;base64," + base64.StdEncoding.EncodeToString(data)
		} else {
			urls[slot] = "/brand-assets/" + name
		}
	}
	return contracts.Branding{Logo: urls["logo"], LogoDark: urls["logo_dark"], Favicon: urls["favicon"]}
}
func (s *Service) Snapshot(ctx context.Context, embedded bool) (contracts.Branding, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	values, err := s.store.ReadSettings(ctx)
	if err != nil {
		return contracts.Branding{}, err
	}
	return s.snapshot(ctx, values, embedded), nil
}
func (s *Service) Update(ctx context.Context, input contracts.BrandingInput, actor string, embedded bool) (contracts.Branding, error) {
	if !Managed("branding." + input.Slot) {
		return contracts.Branding{}, ErrInvalid
	}
	var data []byte
	var err error
	name := ""
	if input.Content != "" {
		if input.Slot == "favicon" {
			data, err = NormalizeIcon(input.Content)
		} else {
			data, err = Normalize(input.Content)
		}
		if err != nil {
			return contracts.Branding{}, err
		}
		hash := sha256.Sum256(data)
		name = hex.EncodeToString(hash[:]) + ".png"
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	values, err := s.store.ReadSettings(ctx)
	if err != nil {
		return contracts.Branding{}, err
	}
	if name != "" {
		if _, err = s.objects.Put(ctx, name, bytes.NewReader(data), int64(len(data)), "image/png"); err != nil {
			return contracts.Branding{}, err
		}
	}
	if err = s.store.SaveSettings(ctx, map[string]string{"branding." + input.Slot: name}, actor); err != nil {
		if confirmed, readErr := s.store.ReadSettings(ctx); readErr == nil {
			s.cleanup(ctx, confirmed)
		}
		return contracts.Branding{}, err
	}
	values["branding."+input.Slot] = name
	s.cleanup(ctx, values)
	return s.snapshot(ctx, values, embedded), nil
}

// Only remove our hash-named unreferenced files after the DB commit; queued mail carries its own snapshot.
func (s *Service) cleanup(ctx context.Context, values map[string]string) {
	keep := map[string]bool{}
	for _, slot := range Slots {
		keep[values["branding."+slot]] = true
	}
	lister, ok := s.objects.(blob.Lister)
	if !ok {
		return
	}
	entries, _ := lister.Keys(ctx)
	for _, name := range entries {
		if filename.MatchString(name) && !keep[name] {
			_ = s.objects.Delete(ctx, name)
		}
	}
}
func (s *Service) Asset(ctx context.Context, name string) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !filename.MatchString(name) {
		return nil, ErrInvalid
	}
	values, err := s.store.ReadSettings(ctx)
	if err != nil {
		return nil, err
	}
	for _, slot := range Slots {
		if values["branding."+slot] == name {
			return s.read(ctx, name)
		}
	}
	return nil, blob.ErrNotFound
}
func (s *Service) Logo(ctx context.Context) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	values, err := s.store.ReadSettings(ctx)
	if err != nil {
		return nil, err
	}
	name := values["branding.logo"]
	if name == "" {
		return nil, nil
	}
	data, err := s.read(ctx, name)
	if err != nil {
		return nil, err
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || format != "png" || cfg.Width > 256 || cfg.Height > 256 {
		return nil, ErrInvalid
	}
	src, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, ErrInvalid
	}
	// 64px is enough for the 42px mail mark and keeps encrypted JSON below MySQL TEXT's 64KiB limit.
	return encode(src, 64)
}
