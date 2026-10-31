// Author: yunnuo <ymz@ebox.vip>
// Description: Verify real inflight requests survive graceful shutdown and deadlines close connections.
package lifecycle

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"testing"
	"time"
)

func TestServeHTTPDrainsBeforeReturning(t *testing.T) {
	listener := listen(t)
	started, release := make(chan struct{}), make(chan struct{})
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(started)
		select {
		case <-release:
			_, _ = io.WriteString(w, "drained")
		case <-r.Context().Done():
			t.Error("request cancelled before drain completed")
		}
	})}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- ServeHTTP(ctx, server, listener, 2*time.Second) }()
	result := make(chan error, 1)
	go func() {
		client := &http.Client{Timeout: 3 * time.Second}
		response, err := client.Get("http://" + listener.Addr().String())
		if err == nil {
			defer response.Body.Close()
			var body []byte
			body, err = io.ReadAll(response.Body)
			if string(body) != "drained" {
				err = errors.New("inflight response lost")
			}
		}
		result <- err
	}()
	await(t, started)
	cancel()
	select {
	case err := <-done:
		t.Fatalf("returned before handler drained: %v", err)
	case <-time.After(50 * time.Millisecond):
	}
	close(release)
	if err := await(t, result); err != nil {
		t.Fatal(err)
	}
	if err := await(t, done); err != nil {
		t.Fatal(err)
	}
}

func TestServeHTTPDeadlineCancelsRequest(t *testing.T) {
	listener := listen(t)
	started, cancelled := make(chan struct{}), make(chan struct{})
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(started)
		<-r.Context().Done()
		close(cancelled)
	})}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done, requestDone := make(chan error, 1), make(chan struct{})
	go func() { done <- ServeHTTP(ctx, server, listener, 30*time.Millisecond) }()
	go func() {
		defer close(requestDone)
		client := &http.Client{Timeout: time.Second}
		response, err := client.Get("http://" + listener.Addr().String())
		if err == nil {
			response.Body.Close()
		}
	}()
	await(t, started)
	cancel()
	if err := await(t, done); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected shutdown deadline, got %v", err)
	}
	await(t, cancelled)
	await(t, requestDone)
}

func TestServeHTTPReturnsListenerFailure(t *testing.T) {
	listener := listen(t)
	listener.Close()
	if err := ServeHTTP(context.Background(), &http.Server{}, listener, time.Second); !errors.Is(err, net.ErrClosed) {
		t.Fatalf("lost listener error: %v", err)
	}
}

func listen(t *testing.T) net.Listener {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { listener.Close() })
	return listener
}

func await[T any](t *testing.T, ch <-chan T) T {
	t.Helper()
	select {
	case result := <-ch:
		return result
	case <-time.After(4 * time.Second):
		t.Fatal("timed out waiting for lifecycle event")
		var zero T
		return zero
	}
}
