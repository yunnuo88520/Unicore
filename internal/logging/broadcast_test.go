// Author: yunnuo <ymz@ebox.vip>
// Description: Broadcast replay, live fan-out, slow-subscriber drop accounting and close semantics.
package logging

import (
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestBroadcastWriterReplayAndLive(t *testing.T) {
	broadcast := NewBroadcastWriter()
	if _, err := broadcast.Write([]byte("{\"level\":\"INFO\",\"msg\":\"first\"}\n")); err != nil {
		t.Fatal(err)
	}
	// A fragment without a newline is held until the next write completes it.
	if _, err := broadcast.Write([]byte("{\"level\":\"INFO\"")); err != nil {
		t.Fatal(err)
	}
	if _, err := broadcast.Write([]byte(",\"msg\":\"second\"}\n\n")); err != nil {
		t.Fatal(err)
	}
	lines, cancel := broadcast.Subscribe()
	defer cancel()
	for _, want := range []string{"{\"level\":\"INFO\",\"msg\":\"first\"}", "{\"level\":\"INFO\",\"msg\":\"second\"}"} {
		select {
		case got := <-lines:
			if got.Line != want {
				t.Fatalf("replay %q, want %q", got.Line, want)
			}
		case <-time.After(time.Second):
			t.Fatal("replay timeout")
		}
	}
	if _, err := broadcast.Write([]byte("live\n")); err != nil {
		t.Fatal(err)
	}
	select {
	case got := <-lines:
		if got.Line != "live" {
			t.Fatalf("live %q", got.Line)
		}
	case <-time.After(time.Second):
		t.Fatal("live timeout")
	}
}

func TestBroadcastWriterSlowSubscriberDrops(t *testing.T) {
	broadcast := NewBroadcastWriter()
	lines, cancel := broadcast.Subscribe()
	defer cancel()
	total := broadcastBuffer + 20
	for i := 0; i < total; i++ {
		if _, err := broadcast.Write([]byte(fmt.Sprintf("line-%d\n", i))); err != nil {
			t.Fatal(err)
		}
	}
	// The queue only holds the head of the stream; the tail is dropped and
	// accounted. Drain the backlog first.
	for i := 0; i < broadcastBuffer; i++ {
		select {
		case got := <-lines:
			if strings.Contains(got.Line, "已丢弃") {
				t.Fatal("drop notice must not preempt buffered lines")
			}
			if got.Line != fmt.Sprintf("line-%d", i) {
				t.Fatalf("backlog %q, want line-%d", got.Line, i)
			}
		case <-time.After(time.Second):
			t.Fatal("backlog timeout")
		}
	}
	select {
	case got := <-lines:
		t.Fatalf("unexpected extra line %q", got.Line)
	case <-time.After(100 * time.Millisecond):
	}
	// The next write delivers the notice ahead of its own line.
	if _, err := broadcast.Write([]byte("after-drop\n")); err != nil {
		t.Fatal(err)
	}
	notice := fmt.Sprintf("—— 已丢弃 %d 行日志（客户端消费过慢）——", total-broadcastBuffer)
	for _, want := range []string{notice, "after-drop"} {
		select {
		case got := <-lines:
			if got.Line != want {
				t.Fatalf("got %q, want %q", got.Line, want)
			}
		case <-time.After(time.Second):
			t.Fatal("never received the post-drop notice")
		}
	}
}

func TestBroadcastWriterConcurrentWrites(t *testing.T) {
	broadcast := NewBroadcastWriter()
	lines, cancel := broadcast.Subscribe()
	defer cancel()
	const workers, each = 8, 50
	var wg sync.WaitGroup
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			for i := 0; i < each; i++ {
				if _, err := broadcast.Write([]byte(fmt.Sprintf("w%d-%d\n", w, i))); err != nil {
					t.Error(err)
					return
				}
			}
		}(w)
	}
	wg.Wait()
	seen := map[string]bool{}
	for i := 0; i < workers*each; i++ {
		select {
		case got := <-lines:
			seen[got.Line] = true
		case <-time.After(time.Second):
			t.Fatalf("missing lines after %d", i)
		}
	}
	// A draining subscriber never loses lines: every written line is complete.
	if len(seen) != workers*each {
		t.Fatalf("received %d distinct lines, want %d", len(seen), workers*each)
	}
}

func TestBroadcastWriterClose(t *testing.T) {
	broadcast := NewBroadcastWriter()
	if _, err := broadcast.Write([]byte("before\n")); err != nil {
		t.Fatal(err)
	}
	lines, cancel := broadcast.Subscribe()
	defer cancel()
	select {
	case got := <-lines:
		if got.Line != "before" {
			t.Fatalf("replay %q", got.Line)
		}
	case <-time.After(time.Second):
		t.Fatal("replay timeout")
	}
	if err := broadcast.Close(); err != nil {
		t.Fatal(err)
	}
	if err := broadcast.Close(); err != nil {
		t.Fatal("second close", err)
	}
	cancel()
	cancel()
	if _, err := broadcast.Write([]byte("ignored\n")); err != nil {
		t.Fatal("write after close", err)
	}
	if _, ok := <-lines; ok {
		t.Fatal("subscriber channel must close with the broadcast")
	}
	closed, noop := broadcast.Subscribe()
	if _, ok := <-closed; ok {
		t.Fatal("subscribe after close must not deliver")
	}
	noop()
}

func TestBroadcastWriterSequenceAndTail(t *testing.T) {
	broadcast := NewBroadcastWriter()
	for i := 1; i <= 250; i++ {
		if _, err := broadcast.Write([]byte(fmt.Sprintf("line-%d\n", i))); err != nil {
			t.Fatal(err)
		}
	}
	// The newest page comes back ascending with the live cursor and the
	// count of still-buffered older entries.
	items, latest, older := broadcast.Tail(0, 200)
	if latest != 250 || older != 50 || len(items) != 200 {
		t.Fatal("tail stats", latest, older, len(items))
	}
	if items[0].Line != "line-51" || items[0].Seq != 51 || items[199].Line != "line-250" {
		t.Fatal("tail page bounds", items[0])
	}
	// A cursor page stops strictly below the sequence.
	items, latest, older = broadcast.Tail(51, 200)
	if latest != 250 || older != 0 || len(items) != 50 || items[0].Line != "line-1" || items[49].Seq != 50 {
		t.Fatal("cursor page", latest, older, len(items))
	}
	// Subscribing from a cursor skips every replayed entry.
	lines, cancel := broadcast.SubscribeFrom(250)
	defer cancel()
	if _, err := broadcast.Write([]byte("live-251\n")); err != nil {
		t.Fatal(err)
	}
	select {
	case got := <-lines:
		if got.Seq != 251 || got.Line != "live-251" {
			t.Fatal("cursor live", got)
		}
	case <-time.After(time.Second):
		t.Fatal("cursor live timeout")
	}
	if _, err := broadcast.Write([]byte("{\"level\":\"INFO\",\"msg\":\"truncated\"}")); err != nil {
		t.Fatal(err)
	}
	select {
	case <-lines:
		t.Fatal("incomplete fragment must not stream")
	case <-time.After(100 * time.Millisecond):
	}
}
