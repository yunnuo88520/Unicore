// Author: yunnuo <ymz@ebox.vip>
// Description: Reference writes serialize with destructive file transitions.
package files

import (
	"context"
	"testing"
	"time"
)

func TestReferenceGuardSerializesWriters(t *testing.T) {
	service := &Service{}
	entered := make(chan struct{}, 2)
	release := make(chan struct{})
	firstDone := make(chan error, 1)
	go func() {
		firstDone <- service.WithReferenceGuard(context.Background(), func() error {
			entered <- struct{}{}
			<-release
			return nil
		})
	}()
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("first guarded write did not start")
	}

	secondDone := make(chan error, 1)
	go func() {
		secondDone <- service.WithReferenceGuard(context.Background(), func() error {
			entered <- struct{}{}
			return nil
		})
	}()
	select {
	case <-entered:
		t.Fatal("second guarded write entered before the first completed")
	case <-time.After(20 * time.Millisecond):
	}
	close(release)
	if err := <-firstDone; err != nil {
		t.Fatal(err)
	}
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("second guarded write did not resume")
	}
	if err := <-secondDone; err != nil {
		t.Fatal(err)
	}
}
