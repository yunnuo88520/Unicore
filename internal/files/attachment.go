// Author: yunnuo <ymz@ebox.vip>
// Description: Business references accept ready user uploads from the exact owner and identity realm.
package files

import (
	"bytes"
	"context"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
)

// ValidateAvatar checks actual private object bytes, rather than trusting upload metadata.
func (s *Service) ValidateAvatar(ctx context.Context, a Actor, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	f, err := s.Repo.Get(ctx, id)
	if err != nil {
		return err
	}
	if f.State != "ready" || f.Purpose != "user" || f.CreatorID != a.ID || f.CreatorRealm != a.Realm || f.Size <= 0 || f.Size > 2<<20 || (f.ExpiresAt > 0 && int64(f.ExpiresAt) <= s.now().Unix()) {
		return ErrInvalid
	}
	location, err := s.location(ctx, f.LocationID)
	if err != nil {
		return err
	}
	store, err := s.store(location)
	if err != nil {
		return err
	}
	source, _, err := store.Open(ctx, f.Key)
	if err != nil {
		return ErrUnavailable
	}
	defer source.Close()
	data, err := io.ReadAll(io.LimitReader(source, (2<<20)+1))
	if err != nil {
		return ErrUnavailable
	}
	if len(data) != f.Size || len(data) > 2<<20 {
		return ErrInvalid
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width <= 0 || config.Height <= 0 || config.Width > 4096 || config.Height > 4096 || int64(config.Width)*int64(config.Height) > 16<<20 {
		return ErrInvalid
	}
	if (format != "png" && format != "jpeg" && format != "gif") || f.MimeType != "image/"+format {
		return ErrInvalid
	}
	if _, _, err = image.Decode(bytes.NewReader(data)); err != nil {
		return ErrInvalid
	}
	return nil
}

func (s *Service) ValidateAttachment(ctx context.Context, a Actor, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	f, err := s.Repo.Get(ctx, id)
	if err != nil {
		return err
	}
	if f.State != "ready" || f.Purpose != "user" || f.CreatorID != a.ID || f.CreatorRealm != a.Realm || (f.ExpiresAt > 0 && int64(f.ExpiresAt) <= s.now().Unix()) {
		return ErrNotFound
	}
	return nil
}
