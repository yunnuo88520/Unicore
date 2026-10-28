// Author: yunnuo <ymz@ebox.vip>
// Description: Business references accept ready user uploads from the exact owner and identity realm.
package files

import "context"

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
