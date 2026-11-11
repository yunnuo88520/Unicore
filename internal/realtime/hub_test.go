// Author: yunnuo <ymz@ebox.vip>
// Description: Hub isolates users, tolerates slow readers and closes streams idempotently.
package realtime

import "testing"

func TestHubIsolationBackpressureAndClose(t *testing.T) {
	h := New()
	a, cancel := h.Subscribe("a")
	b, stop := h.Subscribe("b")
	defer stop()
	h.Publish("a", Event{Name: "private"})
	if got := <-a; got.Name != "private" {
		t.Fatal(got)
	}
	select {
	case got := <-b:
		t.Fatal("leaked event", got)
	default:
	}
	for i := 0; i < 100; i++ {
		h.Publish("a", Event{Name: "burst"})
	}
	cancel()
	cancel()
	h.Broadcast("refresh")
	if got := <-b; got.Name != "refresh" {
		t.Fatal(got)
	}
	h.Close()
	h.Close()
	stop()
	if _, ok := <-b; ok {
		t.Fatal("open subscriber after close")
	}
	late, release := h.Subscribe("late")
	defer release()
	if _, ok := <-late; ok {
		t.Fatal("late subscriber open after close")
	}
	h.Broadcast("ignored")
}
