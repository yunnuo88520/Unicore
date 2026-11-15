// Author: yunnuo <ymz@ebox.vip>
// Description: In-process concurrency slots and minute rate windows for MCP calls.
package mcp

import (
	"sync"
	"time"
)

// limiter bounds concurrent capability executions per instance. Slots and
// windows live in memory: a restart resets the windows, which is an accepted
// single-instance trade-off; quota sharing across replicas needs a shared
// store and is not claimed in P1. The whole limiter is rebuilt whenever the
// configured limits change, so per-actor slot capacities never go stale.
type limiter struct {
	global        chan struct{}
	userCap       int
	credentialCap int
	mu            sync.Mutex
	users         map[string]chan struct{}
	creds         map[string]chan struct{}
	windows       map[string][]int64
	now           func() int64
}

func newLimiter(limits Limits) *limiter {
	global := limits.GlobalConcurrency
	if global < 1 {
		global = 1
	}
	userCap := limits.UserConcurrency
	if userCap < 1 {
		userCap = 1
	}
	credentialCap := limits.CredentialConcurrency
	if credentialCap < 1 {
		credentialCap = 1
	}
	return &limiter{
		global:        make(chan struct{}, global),
		userCap:       userCap,
		credentialCap: credentialCap,
		users:         map[string]chan struct{}{},
		creds:         map[string]chan struct{}{},
		windows:       map[string][]int64{},
		now:           time.Now().Unix,
	}
}

func slot(capacity int) chan struct{} {
	if capacity < 1 {
		capacity = 1
	}
	return make(chan struct{}, capacity)
}

// slots acquires the global, user and credential concurrency slots in one
// step; on any failure the already-taken slots are released. The returned
// function releases everything and must be called exactly once after success.
func (l *limiter) slots(user, credential string) (func(), bool) {
	l.mu.Lock()
	userSlot, ok := l.users[user]
	if !ok {
		userSlot = slot(l.userCap)
		l.users[user] = userSlot
	}
	credentialSlot, ok := l.creds[credential]
	if !ok {
		credentialSlot = slot(l.credentialCap)
		l.creds[credential] = credentialSlot
	}
	l.mu.Unlock()
	select {
	case l.global <- struct{}{}:
	default:
		return nil, false
	}
	select {
	case userSlot <- struct{}{}:
	default:
		<-l.global
		return nil, false
	}
	select {
	case credentialSlot <- struct{}{}:
	default:
		<-userSlot
		<-l.global
		return nil, false
	}
	release := func() {
		<-credentialSlot
		<-userSlot
		<-l.global
	}
	return release, true
}

// allow consumes one rate budget entry for the keyed windows; every window
// must have room for the call to pass, and consumed entries are only kept
// when every window admitted the call.
func (l *limiter) allow(perMinute int, keys ...string) bool {
	if perMinute < 1 {
		perMinute = 1
	}
	now := l.now()
	l.mu.Lock()
	defer l.mu.Unlock()
	cutoff := now - 60
	for _, key := range keys {
		window := l.windows[key]
		keep := window[:0]
		for _, stamp := range window {
			if stamp > cutoff {
				keep = append(keep, stamp)
			}
		}
		l.windows[key] = keep
		if len(keep) >= perMinute {
			return false
		}
	}
	for _, key := range keys {
		l.windows[key] = append(l.windows[key], now)
	}
	return true
}
