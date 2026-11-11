// Author: yunnuo <ymz@ebox.vip>
// Description: In-memory log line broadcaster with bounded replay and non-blocking fan-out.
package logging

import (
	"fmt"
	"strings"
	"sync"
)

const (
	// broadcastCapacity bounds the replay ring; subscribers receive the most
	// recent history when they attach, and the tail endpoint pages through
	// the same buffer.
	broadcastCapacity = 2000
	// broadcastBuffer bounds each subscriber queue. It stays at or above the
	// ring so Subscribe can replay without blocking while holding the lock.
	broadcastBuffer = 2048
)

// LogEntry pairs a log line with its process-wide sequence number. A
// sequence of zero marks a synthetic subscriber notice that never enters the
// ring and never participates in cursors.
type LogEntry struct {
	Seq  int64
	Line string
}

// BroadcastWriter taps log output for live streaming. Writes are split into
// lines, appended to a bounded replay ring and fanned out to subscribers over
// individual bounded channels. A slow subscriber only loses lines and is told
// so before the next line it receives; the slog hot path never blocks.
type BroadcastWriter struct {
	mu     sync.Mutex
	frag   string
	ring   []LogEntry
	seq    int64
	subs   map[*broadcastSub]struct{}
	closed bool
}

type broadcastSub struct {
	lines   chan LogEntry
	dropped int
}

func NewBroadcastWriter() *BroadcastWriter {
	return &BroadcastWriter{subs: make(map[*broadcastSub]struct{})}
}

// Write implements io.Writer. The JSON handler emits one complete line per
// call, but a trailing fragment without a newline is held until the next
// write completes it.
func (b *BroadcastWriter) Write(payload []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		return len(payload), nil
	}
	b.frag += string(payload)
	for {
		index := strings.IndexByte(b.frag, '\n')
		if index < 0 {
			break
		}
		line := strings.TrimRight(b.frag[:index], "\r")
		b.frag = b.frag[index+1:]
		if strings.TrimSpace(line) == "" {
			continue
		}
		b.seq++
		entry := LogEntry{Seq: b.seq, Line: line}
		b.ring = append(b.ring, entry)
		if len(b.ring) > broadcastCapacity {
			b.ring = b.ring[len(b.ring)-broadcastCapacity:]
		}
		for sub := range b.subs {
			b.deliverLocked(sub, entry)
		}
	}
	return len(payload), nil
}

// deliverLocked performs non-blocking sends; overflow is counted per
// subscriber and reported ahead of the next line that subscriber receives.
func (b *BroadcastWriter) deliverLocked(sub *broadcastSub, entry LogEntry) {
	if sub.dropped > 0 {
		notice := LogEntry{Line: fmt.Sprintf("—— 已丢弃 %d 行日志（客户端消费过慢）——", sub.dropped)}
		select {
		case sub.lines <- notice:
			sub.dropped = 0
		default:
			// Channel still full; keep counting and retry on a later line.
		}
	}
	select {
	case sub.lines <- entry:
	default:
		sub.dropped++
	}
}

// Subscribe returns a channel of log lines replayed from the start of the
// ring. SubscribeFrom(after) skips every entry at or below the sequence so a
// client that already paged through the tail only receives live traffic. The
// returned cancel function detaches the subscriber and closes its channel; it
// is safe to call more than once and after Close.
func (b *BroadcastWriter) Subscribe() (<-chan LogEntry, func()) {
	return b.SubscribeFrom(0)
}

func (b *BroadcastWriter) SubscribeFrom(after int64) (<-chan LogEntry, func()) {
	sub := &broadcastSub{lines: make(chan LogEntry, broadcastBuffer)}
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		close(sub.lines)
		return sub.lines, func() {}
	}
	for _, entry := range b.ring {
		if entry.Seq <= after {
			continue
		}
		sub.lines <- entry
	}
	b.subs[sub] = struct{}{}
	return sub.lines, func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		if _, ok := b.subs[sub]; ok {
			delete(b.subs, sub)
			close(sub.lines)
		}
	}
}

// Tail pages backwards through the ring. With before <= 0 it returns the most
// recent limit entries; otherwise it returns the most recent limit entries
// strictly below the sequence. Items come back ascending together with the
// newest sequence ever written (the live cursor) and the number of ring
// entries older than the returned page.
func (b *BroadcastWriter) Tail(before int64, limit int) (items []LogEntry, latest int64, older int) {
	if limit <= 0 {
		limit = 200
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	candidates := b.ring
	if before > 0 {
		index := 0
		for index < len(candidates) && candidates[index].Seq < before {
			index++
		}
		candidates = candidates[:index]
	}
	filtered := len(candidates)
	if filtered > limit {
		candidates = candidates[filtered-limit:]
	}
	items = make([]LogEntry, len(candidates))
	copy(items, candidates)
	return items, b.seq, filtered - len(items)
}

// Close stops accepting writes and closes every subscriber channel so stream
// handlers terminate; Close is idempotent.
func (b *BroadcastWriter) Close() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		return nil
	}
	b.closed = true
	for sub := range b.subs {
		delete(b.subs, sub)
		close(sub.lines)
	}
	b.subs = nil
	return nil
}
