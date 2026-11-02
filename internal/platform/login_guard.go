// Author: yunnuo <ymz@ebox.vip>
// Description: Bounded per-realm IP bans after consecutive failed login proofs; no account freezing.
package platform

import (
	"context"
	"strconv"
	"sync"
	"time"
)

type loginFailure struct {
	count       int
	until, seen time.Time
}
type loginGuard struct {
	mu    sync.Mutex
	items map[string]loginFailure
}

func (g *loginGuard) check(ip string, now time.Time) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	return !now.Before(g.items[ip].until)
}
func (g *loginGuard) record(ip string, success bool, limit int, ban time.Duration, now time.Time) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.items == nil {
		g.items = map[string]loginFailure{}
	}
	if success {
		delete(g.items, ip)
		return
	}
	if len(g.items) >= 10000 {
		for key, item := range g.items {
			if !now.Before(item.until) && now.Sub(item.seen) > 24*time.Hour {
				delete(g.items, key)
			}
		}
	}
	if len(g.items) >= 20000 {
		return
	}
	item := g.items[ip]
	if now.Before(item.until) {
		return
	}
	if now.Sub(item.seen) > 24*time.Hour {
		item.count = 0
	}
	item.count++
	item.seen = now
	if item.count >= limit {
		item.until = now.Add(ban)
		item.count = 0
	}
	g.items[ip] = item
}
func (s *Service) LoginAllowed(ctx context.Context, ip string) error {
	if err := s.AllowIP(ctx, ip); err != nil {
		return err
	}
	if !s.loginGuard.check(ip, time.Now()) {
		return ErrRateLimited
	}
	return nil
}
func (s *Service) loginResult(ctx context.Context, ip string, success bool) {
	limit, minutes := 5, 15
	if s.Settings != nil {
		if values, err := s.Settings.Raw(ctx); err == nil {
			if n, e := strconv.Atoi(values["security.login_failure_limit"]); e == nil {
				limit = n
			}
			if n, e := strconv.Atoi(values["security.ip_ban_minutes"]); e == nil {
				minutes = n
			}
		}
	}
	s.loginGuard.record(ip, success, limit, time.Duration(minutes)*time.Minute, time.Now())
}
