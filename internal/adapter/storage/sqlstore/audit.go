// Author: yunnuo <ymz@ebox.vip>
// Description: Audit event metadata without request bodies, secrets or personal details.
package sqlstore

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"time"
)

func ID() string {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(value[:])
}
func (s *Store) Audit(ctx context.Context, r Runner, actor, action string) error {
	_, err := s.Exec(ctx, r, "INSERT INTO audit_logs(id,actor_id,action,created_at) VALUES(?,?,?,?)", ID(), actor, action, time.Now().Unix())
	return err
}
