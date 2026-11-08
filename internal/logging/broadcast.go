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
	// recent history when they attach.
	broadcastCapacity = 500
	// broadcastBuffer bounds each subscriber queue. It stays at or above the
	// ring so Subscribe can replay without blocking while holding the lock.
	broadcastBuffer = 512
)

// BroadcastWriter taps log output for live streaming. Writes are split into
// lines, appended to a bounded replay ring and fanned out to subscribers over
// individual bounded channels. A slow subscriber only loses lines and is told
// so before the next line it receives; the slog hot path never blocks.
type BroadcastWriter struct {
	mu     sync.Mutex
	frag   string
	ring   []string
	subs   map[*broadcastSub]struct{}
	closed bool
}

type broadcastSub struct {
	lines   chan string
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
		b.ring = append(b.ring, line)
		if len(b.ring) > broadcastCapacity {
			b.ring = b.ring[len(b.ring)-broadcastCapacity:]
		}
		for sub := range b.subs {
			b.deliverLocked(sub, line)
		}
	}
	return len(payload), nil
}

// deliverLocked performs non-blocking sends; overflow is counted per
// subscriber and reported ahead of the next line that subscriber receives.
func (b *BroadcastWriter) deliverLocked(sub *broadcastSub, line string) {
	if sub.dropped > 0 {
		select {
		case sub.lines <- fmt.Sprintf("—— 已丢弃 %d 行日志（客户端消费过慢）——", sub.dropped):
			sub.dropped = 0
		default:
			// Channel still full; keep counting and retry on a later line.
		}
	}
	select {
	case sub.lines <- line:
	default:
		sub.dropped++
	}
}

// Subscribe returns a channel of log lines. The replay ring is queued first,
// so the consumer sees recent history before live traffic. The returned
// cancel function detaches the subscriber and closes its channel; it is safe
// to call more than once and after Close.
func (b *BroadcastWriter) Subscribe() (<-chan string, func()) {
	sub := &broadcastSub{lines: make(chan string, broadcastBuffer)}
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		close(sub.lines)
		return sub.lines, func() {}
	}
	for _, line := range b.ring {
		sub.lines <- line
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
