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
	"image/color"
	"image/draw"
	_ "image/jpeg"
	"image/png"
	"io"
	"regexp"
	"strings"
	"sync"

	"github.com/yunnuo/unicore/internal/blob"
	"github.com/yunnuo/unicore/internal/contracts"
	xdraw "golang.org/x/image/draw"
)

const MaxBytes = 500 * 1024

// Bound decoded pixel storage and scanlines rather than imposing a fixed logo resolution.
const maxDecodeMemory = 128 * 1024 * 1024
const maxNormalizedBytes = 512 * 1024
const maxLogoDimension = 1024
const maxMailLogoWidth = 320
const maxMailLogoHeight = 84
const maxMailLogoBytes = 16 * 1024

var ErrInvalid = errors.New("invalid brand image")
var ErrUploadTooLarge = errors.New("brand image upload exceeds byte limit")
var ErrImageTooLarge = errors.New("brand image exceeds decode memory budget")
var normalizeMu sync.Mutex
var filename = regexp.MustCompile(`^[a-f0-9]{64}\.png$`)
var accentPattern = regexp.MustCompile(`^#[0-9a-f]{6}$`)
var Slots = []string{"logo", "logo_dark", "favicon", "accent"}

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

// ValidAccent accepts an empty value (reset) or a normalized lowercase #RRGGBB color.
func ValidAccent(value string) bool { return value == "" || accentPattern.MatchString(value) }

// Normalize validates uploaded logo pixels and preserves their aspect ratio.
func Normalize(content string) ([]byte, error) {
	return normalize(content, false)
}

func normalizeSquare(content string) ([]byte, error) {
	return normalize(content, true)
}

func normalize(content string, square bool) ([]byte, error) {
	if len(content) > base64.StdEncoding.EncodedLen(MaxBytes) {
		return nil, ErrUploadTooLarge
	}
	raw, err := base64.StdEncoding.Strict().DecodeString(content)
	if err != nil || len(raw) == 0 {
		return nil, ErrInvalid
	}
	if len(raw) > MaxBytes {
		return nil, ErrUploadTooLarge
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil || (format != "png" && format != "jpeg") || cfg.Width < 1 || cfg.Height < 1 {
		return nil, ErrInvalid
	}
	if !withinDecodeBudget(cfg) {
		return nil, ErrImageTooLarge
	}
	// Uploads are rare. Serialize the expensive allocation through normalization so
	// concurrent uploads cannot multiply the per-image decode budget.
	normalizeMu.Lock()
	defer normalizeMu.Unlock()
	src, decodedFormat, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, ErrInvalid
	}
	if decodedFormat == "png" {
		src = trimTransparentBounds(src)
	}
	if square {
		return encodeSquare(src, 256)
	}
	return encodeFitBounded(src, maxLogoDimension, maxLogoDimension, maxNormalizedBytes)
}

func withinDecodeBudget(cfg image.Config) bool {
	bytesPerPixel := 4 // Conservatively includes grayscale, paletted and JPEG images.
	switch cfg.ColorModel.Convert(color.NRGBA{}).(type) {
	case color.NRGBA64, color.RGBA64:
		bytesPerPixel = 8
	}
	// Include two scanlines, and divide before multiplying to avoid integer overflow.
	pixelBudget := maxDecodeMemory / bytesPerPixel
	return cfg.Width > 0 && cfg.Height > 0 && cfg.Height <= pixelBudget-2 && cfg.Width <= pixelBudget/(cfg.Height+2)
}

func resizeBounds(src image.Image, limit int) (int, int) {
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
	return width, height
}

func encodeFit(src image.Image, limit int) ([]byte, error) {
	bounds := src.Bounds()
	width, height := resizeBounds(src, limit)
	dst := image.NewNRGBA(image.Rect(0, 0, width, height))
	scaleLogo(dst, src, bounds)
	return encodePNG(dst)
}

func encodeFitBounded(src image.Image, maxWidth, maxHeight, maxBytes int) ([]byte, error) {
	bounds := src.Bounds()
	width, height := fitBounds(bounds.Dx(), bounds.Dy(), maxWidth, maxHeight)
	for {
		dst := image.NewNRGBA(image.Rect(0, 0, width, height))
		scaleLogo(dst, src, bounds)
		data, err := encodePNG(dst)
		if err != nil || len(data) <= maxBytes || width == 1 && height == 1 {
			return data, err
		}
		width = max(1, width*3/4)
		height = max(1, height*3/4)
	}
}

func scaleLogo(dst *image.NRGBA, src image.Image, bounds image.Rectangle) {
	// The kernel scaler stores dw*sh float64 RGBA values plus source weights.
	// Extremely tall images can otherwise allocate far more scratch memory than
	// their decoded pixels. Source dimensions already passed the decode budget,
	// and destination dimensions are bounded by 1024, so int64 cannot overflow.
	scratch := int64(dst.Bounds().Dx())*int64(bounds.Dy())*32 + (int64(bounds.Dx())+int64(bounds.Dy()))*64
	if scratch > maxDecodeMemory {
		// Halve progressively: a single very large ApproxBiLinear reduction can
		// miss fine strokes because it only samples neighbouring source pixels.
		for bounds.Dx() > 2*dst.Bounds().Dx() || bounds.Dy() > 2*dst.Bounds().Dy() {
			width, height := max(1, (bounds.Dx()+1)/2), max(1, (bounds.Dy()+1)/2)
			intermediate := image.NewNRGBA(image.Rect(0, 0, width, height))
			xdraw.ApproxBiLinear.Scale(intermediate, intermediate.Bounds(), src, bounds, draw.Src, nil)
			src, bounds = intermediate, intermediate.Bounds()
		}
	}
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), src, bounds, draw.Src, nil)
}

func fitBounds(width, height, maxWidth, maxHeight int) (int, int) {
	if width <= maxWidth && height <= maxHeight {
		return max(1, width), max(1, height)
	}
	scale := min(float64(maxWidth)/float64(width), float64(maxHeight)/float64(height))
	return max(1, int(float64(width)*scale)), max(1, int(float64(height)*scale))
}

func encodePNG(src image.Image) ([]byte, error) {
	var output bytes.Buffer
	if err := png.Encode(&output, src); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

func trimTransparentBounds(src image.Image) image.Image {
	if opaque, ok := src.(interface{ Opaque() bool }); ok && opaque.Opaque() {
		return src
	}
	bounds := src.Bounds()
	minX, minY, maxX, maxY := bounds.Max.X, bounds.Max.Y, bounds.Min.X, bounds.Min.Y
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			if color.AlphaModel.Convert(src.At(x, y)).(color.Alpha).A == 0 {
				continue
			}
			minX, minY = min(minX, x), min(minY, y)
			maxX, maxY = max(maxX, x+1), max(maxY, y+1)
		}
	}
	if minX >= maxX || minY >= maxY || minX == bounds.Min.X && minY == bounds.Min.Y && maxX == bounds.Max.X && maxY == bounds.Max.Y {
		return src
	}
	if sub, ok := src.(interface {
		SubImage(image.Rectangle) image.Image
	}); ok {
		return sub.SubImage(image.Rect(minX, minY, maxX, maxY))
	}
	dst := image.NewNRGBA(image.Rect(0, 0, maxX-minX, maxY-minY))
	draw.Draw(dst, dst.Bounds(), src, image.Pt(minX, minY), draw.Src)
	return dst
}

func encodeSquare(src image.Image, limit int) ([]byte, error) {
	bounds := src.Bounds()
	width, height := resizeBounds(src, limit)
	side := max(width, height)
	dst := image.NewNRGBA(image.Rect(0, 0, side, side))
	offsetX, offsetY := (side-width)/2, (side-height)/2
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			dst.Set(offsetX+x, offsetY+y, src.At(bounds.Min.X+x*bounds.Dx()/width, bounds.Min.Y+y*bounds.Dy()/height))
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
	if obj.Size < 1 || obj.Size > maxNormalizedBytes {
		return nil, ErrInvalid
	}
	data, err := io.ReadAll(io.LimitReader(r, maxNormalizedBytes+1))
	if err != nil || int64(len(data)) != obj.Size || len(data) > maxNormalizedBytes {
		return nil, ErrInvalid
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || format != "png" || cfg.Width < 1 || cfg.Height < 1 || cfg.Width > maxLogoDimension || cfg.Height > maxLogoDimension {
		return nil, ErrInvalid
	}
	if _, err = png.Decode(bytes.NewReader(data)); err != nil {
		return nil, ErrInvalid
	}
	hash := sha256.Sum256(data)
	if hex.EncodeToString(hash[:])+".png" != name {
		return nil, ErrInvalid
	}
	return data, nil
}
func (s *Service) snapshot(ctx context.Context, values map[string]string, embedded bool) contracts.Branding {
	urls := map[string]string{}
	for _, slot := range Slots {
		if slot == "accent" {
			continue
		}
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
	displayMode := values["branding.display_mode"]
	if displayMode != "wordmark" {
		displayMode = "icon-title"
	}
	branding := contracts.Branding{Logo: urls["logo"], LogoDark: urls["logo_dark"], Favicon: urls["favicon"], DisplayMode: &displayMode}
	if accent := strings.ToLower(values["branding.accent"]); ValidAccent(accent) && accent != "" {
		branding.Accent = &accent
	}
	return branding
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
	var result contracts.Branding
	update := func() error {
		var err error
		result, err = s.update(ctx, input, actor, embedded)
		return err
	}
	if guard, ok := s.objects.(interface {
		WithReferenceGuard(context.Context, func() error) error
	}); ok {
		if err := guard.WithReferenceGuard(ctx, update); err != nil {
			return contracts.Branding{}, err
		}
		return result, nil
	}
	if err := update(); err != nil {
		return contracts.Branding{}, err
	}
	return result, nil
}

func (s *Service) update(ctx context.Context, input contracts.BrandingInput, actor string, embedded bool) (contracts.Branding, error) {
	if !Managed("branding." + input.Slot) {
		return contracts.Branding{}, ErrInvalid
	}
	if input.Slot == "accent" {
		return s.updateAccent(ctx, input.Content, actor, embedded)
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
		stored, readErr := s.read(ctx, name)
		if readErr != nil {
			return contracts.Branding{}, readErr
		}
		if !bytes.Equal(stored, data) {
			return contracts.Branding{}, ErrInvalid
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

// updateAccent persists a validated lowercase accent color; images and cleanup never apply to it.
func (s *Service) updateAccent(ctx context.Context, content, actor string, embedded bool) (contracts.Branding, error) {
	accent := strings.ToLower(content)
	if !ValidAccent(accent) {
		return contracts.Branding{}, ErrInvalid
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	values, err := s.store.ReadSettings(ctx)
	if err != nil {
		return contracts.Branding{}, err
	}
	if err = s.store.SaveSettings(ctx, map[string]string{"branding.accent": accent}, actor); err != nil {
		return contracts.Branding{}, err
	}
	values["branding.accent"] = accent
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
	if err != nil || format != "png" || cfg.Width > maxLogoDimension || cfg.Height > maxLogoDimension {
		return nil, ErrInvalid
	}
	src, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, ErrInvalid
	}
	return encodeFitBounded(trimTransparentBounds(src), maxMailLogoWidth, maxMailLogoHeight, maxMailLogoBytes)
}
