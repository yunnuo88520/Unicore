// Author: yunnuo <ymz@ebox.vip>
// Description: Rotation thresholds, age/total retention and the write-safety boundary of the file sink.
package logging

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func sinkOptions(dir string, mutate func(*FileOptions)) FileOptions {
	options := FileOptions{Dir: dir, MaxSizeMB: 1, MaxTotalMB: 0}
	if mutate != nil {
		mutate(&options)
	}
	return options
}

func TestFileSinkRotatesAtSize(t *testing.T) {
	dir := t.TempDir()
	sink, err := OpenFileSink(sinkOptions(dir, nil))
	if err != nil {
		t.Fatal(err)
	}
	defer sink.Close()
	// MaxSizeMB is floored at 1MB; shrink the threshold for a fast test.
	sink.maxBytes = 64
	payload := strings.Repeat("x", 50)
	if _, err := sink.Write([]byte(payload)); err != nil {
		t.Fatal(err)
	}
	if _, err := sink.Write([]byte(payload)); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	rotated, active := 0, false
	for _, entry := range entries {
		switch {
		case entry.Name() == "unicore.log":
			active = true
		case rotatedName.MatchString(entry.Name()):
			rotated++
		}
	}
	if !active || rotated != 1 {
		t.Fatalf("expected one rotated file and an active file, got rotated=%d active=%v", rotated, active)
	}
	info, err := os.Stat(filepath.Join(dir, "unicore.log"))
	if err != nil {
		t.Fatal(err)
	}
	if info.Size() != 50 {
		t.Fatalf("active file should hold only the post-rotation write, got %d bytes", info.Size())
	}
}

func TestFileSinkSweepRespectsAgeAndTotal(t *testing.T) {
	dir := t.TempDir()
	sink, err := OpenFileSink(sinkOptions(dir, nil))
	if err != nil {
		t.Fatal(err)
	}
	defer sink.Close()
	old := filepath.Join(dir, "unicore-20200101-000000.log")
	recent := filepath.Join(dir, "unicore-20990101-000000.log")
	for _, path := range []string{old, recent} {
		if err := os.WriteFile(path, []byte("log"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	past := time.Now().AddDate(0, 0, -10)
	if err := os.Chtimes(old, past, past); err != nil {
		t.Fatal(err)
	}
	// Age limit of 7 days removes the old file; the recent one stays.
	sink.SetRetention(func() int { return 7 })
	if _, err := os.Stat(old); !os.IsNotExist(err) {
		t.Fatalf("expired file should be removed, err=%v", err)
	}
	if _, err := os.Stat(recent); err != nil {
		t.Fatalf("recent file should survive the age sweep: %v", err)
	}
	// A total cap of 1MB deletes nothing here; a zero retention keeps everything.
	sink.SetRetention(func() int { return 0 })
	if _, err := os.Stat(recent); err != nil {
		t.Fatalf("permanent retention must keep files: %v", err)
	}
}

func TestFileSinkTotalCapDeletesOldest(t *testing.T) {
	dir := t.TempDir()
	sink, err := OpenFileSink(sinkOptions(dir, nil))
	if err != nil {
		t.Fatal(err)
	}
	defer sink.Close()
	older := filepath.Join(dir, "unicore-20200101-000000.log")
	newer := filepath.Join(dir, "unicore-20200102-000000.log")
	big := strings.Repeat("y", 700)
	if err := os.WriteFile(older, []byte(big), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(newer, []byte(big), 0o600); err != nil {
		t.Fatal(err)
	}
	sink.maxBytes = 1 << 20 // keep sweep cap math independent of the write threshold
	sink.SetRetention(func() int { return 0 })
	sink.totalBytes = 800 // both files exceed it; deleting the oldest leaves room for the newest
	sink.Sweep()
	if _, err := os.Stat(older); !os.IsNotExist(err) {
		t.Fatalf("oldest file should be removed under the cap, err=%v", err)
	}
	if _, err := os.Stat(newer); err != nil {
		t.Fatalf("newest file should survive: %v", err)
	}
}

func TestFileSinkNeverTouchesForeignFiles(t *testing.T) {
	dir := t.TempDir()
	sink, err := OpenFileSink(sinkOptions(dir, nil))
	if err != nil {
		t.Fatal(err)
	}
	defer sink.Close()
	foreign := filepath.Join(dir, "operator.txt")
	if err := os.WriteFile(foreign, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	past := time.Now().AddDate(0, 0, -400)
	if err := os.Chtimes(foreign, past, past); err != nil {
		t.Fatal(err)
	}
	sink.SetRetention(func() int { return 1 })
	if _, err := os.Stat(foreign); err != nil {
		t.Fatalf("foreign files must never be removed: %v", err)
	}
	if _, err := sink.Write([]byte("after sweep")); err != nil {
		t.Fatalf("sink must stay writable: %v", err)
	}
}
