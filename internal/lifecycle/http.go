// Author: yunnuo <ymz@ebox.vip>
// Description: Drain HTTP requests before composition roots release workers and storage.
package lifecycle

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"time"
)

// ServeHTTP owns listener. Cancellation drains active requests within grace;
// expiration closes connections and cancels their request contexts.
// Handlers must honor context cancellation for bounded shutdown.
func ServeHTTP(ctx context.Context, server *http.Server, listener net.Listener, grace time.Duration) error {
	done := make(chan error, 1)
	go func() { done <- server.Serve(listener) }()
	var serveErr error
	select {
	case <-ctx.Done():
	case serveErr = <-done:
		// Even a listener failure can leave active requests to drain.
		done = nil
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), grace)
	defer cancel()
	shutdownErr := server.Shutdown(shutdownCtx)
	if shutdownErr != nil {
		shutdownErr = errors.Join(shutdownErr, server.Close())
	}
	if done != nil {
		serveErr = <-done
	}
	if errors.Is(serveErr, http.ErrServerClosed) {
		serveErr = nil
	}
	if shutdownErr != nil {
		return errors.Join(serveErr, fmt.Errorf("HTTP shutdown: %w", shutdownErr))
	}
	return serveErr
}
