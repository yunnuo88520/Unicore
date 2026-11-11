// Author: yunnuo <ymz@ebox.vip>
// Description: In-process per-user event hub for server-sent events; single-instance semantics.
package realtime

import (
	"sync"
)

// Event is one server-sent payload; Name selects the frontend handler.
type Event struct {
	Name string `json:"name"`
	Data string `json:"data,omitempty"`
}

// Hub keeps per-user subscriber channels. It is deliberately in-process: a
// single self-hosted binary is the deployment unit, and multi-instance
// deployments would need an external broadcast bus (see ADR-0034).
type Hub struct {
	mu     sync.Mutex
	subs   map[string]map[chan Event]struct{}
	closed bool
}

func New() *Hub {
	return &Hub{subs: map[string]map[chan Event]struct{}{}}
}

// Subscribe registers a channel for one user; the returned cancel removes it.
func (h *Hub) Subscribe(userID string) (<-chan Event, func()) {
	ch := make(chan Event, 8)
	h.mu.Lock()
	if h.closed {
		close(ch)
		h.mu.Unlock()
		return ch, func() {}
	}
	if h.subs[userID] == nil {
		h.subs[userID] = map[chan Event]struct{}{}
	}
	h.subs[userID][ch] = struct{}{}
	h.mu.Unlock()
	return ch, func() {
		h.mu.Lock()
		delete(h.subs[userID], ch)
		if len(h.subs[userID]) == 0 {
			delete(h.subs, userID)
		}
		h.mu.Unlock()
	}
}

// Publish delivers an event to every live subscription of one user. Slow
// subscribers drop the event rather than blocking the publisher; the client
// recovers through its next bootstrap or window focus refetch.
func (h *Hub) Publish(userID string, event Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs[userID] {
		select {
		case ch <- event:
		default:
		}
	}
}

// Broadcast delivers a named event to every subscription regardless of user;
// used for audience=all announcements so the frontend refreshes its feed.
func (h *Hub) Broadcast(event string) {
	h.BroadcastEvent(Event{Name: event})
}

// BroadcastEvent delivers a full payload to every subscription.
func (h *Hub) BroadcastEvent(event Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, subs := range h.subs {
		for ch := range subs {
			select {
			case ch <- event:
			default:
			}
		}
	}
}

// Close terminates active streams before HTTP shutdown drains requests.
func (h *Hub) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		return
	}
	h.closed = true
	for _, subscribers := range h.subs {
		for ch := range subscribers {
			close(ch)
		}
	}
	h.subs = map[string]map[chan Event]struct{}{}
}

// BroadcastMany delivers to several users at once (announcement audiences).
func (h *Hub) PublishMany(userIDs []string, event Event) {
	for _, id := range userIDs {
		h.Publish(id, event)
	}
}
