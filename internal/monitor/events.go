// Author: yunnuo <ymz@ebox.vip>
// Description: In-process ring buffer of system events (what the process experienced, never who did it); memory only, resets on restart.
package monitor

import (
	"sync"
	"time"
)

// Event kinds and severities kept as plain strings; the contract pins them.
const (
	EventLifecycle = "lifecycle"
	EventDatabase  = "database"
	EventStorage   = "storage"
	EventTask      = "task"

	SeverityInfo    = "info"
	SeverityWarning = "warning"
	SeverityError   = "error"
)

// Event is one buffered system event: a low-frequency summary worth a human look.
type Event struct {
	ID       int64  `json:"id"`
	Type     string `json:"type"`
	Severity string `json:"severity"`
	Message  string `json:"message"`
	Detail   string `json:"detail,omitempty"`
	At       int64  `json:"at"`
}

// EventSink is the monitor event buffer: append-only ring, newest-first reads,
// never persisted (D21) and never written by anything but in-process paths.
type EventSink struct {
	mu       sync.Mutex
	capacity int
	items    []Event
	next     int64
	total    int64
}

// NewEventSink builds a bounded buffer; capacity stays small on purpose.
func NewEventSink(capacity int) *EventSink {
	if capacity < 1 {
		capacity = 1
	}
	return &EventSink{capacity: capacity, items: make([]Event, 0, capacity)}
}

// Append records one event and drops the oldest beyond capacity.
func (s *EventSink) Append(eventType, severity, message, detail string) Event {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.next++
	event := Event{ID: s.next, Type: eventType, Severity: severity, Message: message, Detail: detail, At: time.Now().Unix()}
	if len(s.items) >= s.capacity {
		s.items = s.items[1:]
	}
	s.items = append(s.items, event)
	s.total++
	return event
}

// Recent returns up to limit newest events (newest first) plus the total ever
// recorded, so the page can state that older entries were dropped.
func (s *EventSink) Recent(limit int) ([]Event, int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if limit < 0 {
		limit = 0
	}
	items := make([]Event, 0, len(s.items))
	for i := len(s.items) - 1; i >= 0 && len(items) < limit; i-- {
		items = append(items, s.items[i])
	}
	return items, s.total
}

// Capacity reports the ring size.
func (s *EventSink) Capacity() int {
	return s.capacity
}

// TaskEventTracker turns raw scheduler results into failure and recovery
// events. It keeps the small per-task failure memory so the ring buffer does
// not need one; fed from the scheduler's completion hook, it records
// transitions even while no monitor page is open.
type TaskEventTracker struct {
	mu     sync.Mutex
	failed map[string]bool
	sink   *EventSink
}

// NewTaskEventTracker binds a tracker to one sink.
func NewTaskEventTracker(sink *EventSink) *TaskEventTracker {
	return &TaskEventTracker{failed: map[string]bool{}, sink: sink}
}

// Observe consumes one scheduler completion (status "ok" or "error").
func (t *TaskEventTracker) Observe(name, status, code string) {
	failed := status == "error"
	t.mu.Lock()
	previous := t.failed[name]
	t.failed[name] = failed
	t.mu.Unlock()
	switch {
	case failed && !previous:
		t.sink.Append(EventTask, SeverityWarning, "任务执行失败："+name, code)
	case !failed && previous:
		t.sink.Append(EventTask, SeverityInfo, "任务执行恢复："+name, "")
	}
}
