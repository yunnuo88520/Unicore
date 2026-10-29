// Author: yunnuo <ymz@ebox.vip>
// Description: Audit event metadata without request bodies, secrets or personal details.
package sqlstore

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"github.com/yunnuo/unicore/internal/audit"
	"strings"
	"time"
	"unicode"
)

func ID() string {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(value[:])
}
func (s *Store) Audit(ctx context.Context, r Runner, actor, action string) error {
	id := ID()
	_, err := s.Exec(ctx, r, "INSERT INTO audit_logs(id,actor_id,action,created_at) VALUES(?,?,?,?)", id, actor, action, time.Now().Unix())
	if err != nil {
		return err
	}
	if m, ok := audit.From(ctx); ok {
		clean := func(value string, max int) string {
			r := []rune(strings.Map(func(c rune) rune {
				if unicode.IsControl(c) {
					return -1
				}
				return c
			}, value))
			if len(r) > max {
				r = r[:max]
			}
			return string(r)
		}
		_, err = s.Exec(ctx, r, "INSERT INTO audit_metadata(audit_id,actor_name,realm,target,detail,ip_address) VALUES(?,?,?,?,?,?)", id, clean(m.ActorName, 64), clean(m.Realm, 32), clean(m.Target, 256), clean(m.Detail, 512), clean(m.IP, 64))
	}
	return err
}
