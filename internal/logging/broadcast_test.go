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
			if got != want {
				t.Fatalf("replay %q, want %q", got, want)
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
		if got != "live" {
			t.Fatalf("live %q", got)
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
			if strings.Contains(got, "已丢弃") {
				t.Fatal("drop notice must not preempt buffered lines")
			}
			if got != fmt.Sprintf("line-%d", i) {
				t.Fatalf("backlog %q, want line-%d", got, i)
			}
		case <-time.After(time.Second):
			t.Fatal("backlog timeout")
		}
	}
	select {
	case got := <-lines:
		t.Fatalf("unexpected extra line %q", got)
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
			if got != want {
				t.Fatalf("got %q, want %q", got, want)
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
			seen[got] = true
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
		if got != "before" {
			t.Fatalf("replay %q", got)
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
