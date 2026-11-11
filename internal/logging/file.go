// Author: yunnuo <ymz@ebox.vip>
// Description: Size-rotated log file sink with age and total-size retention; only touches its own files.
package logging

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"sync"
	"time"
)

// rotatedName matches only files this sink created by rotation; the active
// unicore.log and any foreign content in the directory are never removed.
var rotatedName = regexp.MustCompile(`^unicore-\d{8}-\d{6}(?:-\d+)?\.log$`)

// FileOptions bounds one sink directory; zero MaxAgeDays/MaxTotalMB disable
// the age limit and the total cap respectively.
type FileOptions struct {
	Dir        string
	MaxAgeDays int
	MaxSizeMB  int
	MaxTotalMB int
}

// Retention reports the current age limit in days and is consulted on every
// sweep, so the platform profile can apply runtime setting changes.
type Retention func() int

// FileSink writes to <dir>/unicore.log, rotating it into timestamped siblings
// when it exceeds MaxSizeMB. It is safe for concurrent use.
type FileSink struct {
	options    FileOptions
	retention  Retention
	maxBytes   int64 // rotation threshold; tests shrink it below the MB floor
	totalBytes int64 // total cap in bytes; zero means unlimited
	mu         sync.Mutex
	file       *os.File
	size       int64
}

func OpenFileSink(options FileOptions) (*FileSink, error) {
	if options.MaxSizeMB < 1 {
		return nil, errors.New("log sink requires a positive rotation size")
	}
	if err := os.MkdirAll(options.Dir, 0o700); err != nil {
		return nil, fmt.Errorf("log directory unavailable: %w", err)
	}
	sink := &FileSink{options: options, maxBytes: int64(options.MaxSizeMB) * 1024 * 1024}
	if options.MaxTotalMB > 0 {
		sink.totalBytes = int64(options.MaxTotalMB) * 1024 * 1024
	}
	if err := sink.open(); err != nil {
		return nil, err
	}
	return sink, nil
}

func (s *FileSink) open() error {
	path := filepath.Join(s.options.Dir, "unicore.log")
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return fmt.Errorf("log file unavailable: %w", err)
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return fmt.Errorf("log file stat failed: %w", err)
	}
	s.file, s.size = file, info.Size()
	return nil
}

// SetRetention installs the age limit source and sweeps once so limits from a
// previous run apply without waiting for the first rotation.
func (s *FileSink) SetRetention(retention Retention) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.retention = retention
	s.sweepLocked()
}

func (s *FileSink) Write(payload []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.file == nil {
		return 0, errors.New("log sink is closed")
	}
	if s.size > 0 && s.size+int64(len(payload)) > s.maxBytes {
		if err := s.rotateLocked(); err != nil {
			return 0, err
		}
	}
	written, err := s.file.Write(payload)
	s.size += int64(written)
	return written, err
}

func (s *FileSink) rotateLocked() error {
	stamp := time.Now().Format("20060102-150405")
	target := filepath.Join(s.options.Dir, "unicore-"+stamp+".log")
	for index := 1; ; index++ {
		if _, err := os.Stat(target); errors.Is(err, fs.ErrNotExist) {
			break
		} else if err != nil {
			return fmt.Errorf("log rotation stat failed: %w", err)
		} else {
			target = filepath.Join(s.options.Dir, fmt.Sprintf("unicore-%s-%d.log", stamp, index))
		}
	}
	if err := s.file.Close(); err != nil {
		return fmt.Errorf("log rotation close failed: %w", err)
	}
	if err := os.Rename(filepath.Join(s.options.Dir, "unicore.log"), target); err != nil {
		return fmt.Errorf("log rotation rename failed: %w", err)
	}
	if err := s.open(); err != nil {
		return err
	}
	s.sweepLocked()
	return nil
}

// Start sweeps on an interval until the context is cancelled.
func (s *FileSink) Start(ctx context.Context, interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.Sweep()
			}
		}
	}()
}

// Sweep removes rotated files beyond the age limit or total cap, oldest first.
func (s *FileSink) Sweep() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sweepLocked()
}

func (s *FileSink) sweepLocked() {
	entries, err := os.ReadDir(s.options.Dir)
	if err != nil {
		return
	}
	type rotated struct {
		path    string
		size    int64
		modTime time.Time
	}
	var files []rotated
	for _, entry := range entries {
		if entry.IsDir() || !rotatedName.MatchString(entry.Name()) {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		files = append(files, rotated{filepath.Join(s.options.Dir, entry.Name()), info.Size(), info.ModTime()})
	}
	sort.Slice(files, func(i, j int) bool { return files[i].modTime.Before(files[j].modTime) })
	remaining := s.size
	for _, file := range files {
		remaining += file.size
	}
	ageDays := 0
	if s.retention != nil {
		ageDays = s.retention()
	}
	var cutoff time.Time
	if ageDays > 0 {
		cutoff = time.Now().AddDate(0, 0, -ageDays)
	}
	for _, file := range files {
		expired := ageDays > 0 && file.modTime.Before(cutoff)
		overCap := s.totalBytes > 0 && remaining > s.totalBytes
		if !expired && !overCap {
			break
		}
		if err := os.Remove(file.path); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return
		}
		remaining -= file.size
	}
}

func (s *FileSink) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.file == nil {
		return nil
	}
	err := s.file.Close()
	s.file, s.size = nil, 0
	return err
}
