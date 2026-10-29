// Author: yunnuo <ymz@ebox.vip>
// Description: Durable resumable uploads, immutable per-session chunk geometry and private promotion.
package files

import (
	"context"
	"io"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/yunnuo/unicore/internal/blob"
	"github.com/yunnuo/unicore/internal/contracts"
)

func (s *Service) UploadPolicy(ctx context.Context) contracts.UploadPolicy {
	return contracts.UploadPolicy{MaxSize: s.policy(ctx, "max_size_mb", 100) * 1024 * 1024, PartSize: s.policy(ctx, "part_size_mb", 8) * 1024 * 1024, Parallelism: s.policy(ctx, "parallelism", 3), ResumeHours: s.policy(ctx, "pending_hours", 24)}
}

var fingerprintPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

func (s *Service) BeginUpload(ctx context.Context, a Actor, input contracts.MultipartUploadInput) (contracts.MultipartUpload, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	invalid := contracts.FileUploadInput{OriginalName: input.OriginalName, MimeType: input.MimeType, Size: input.Size}
	policy := s.UploadPolicy(ctx)
	if !validFile(invalid) || input.Size > policy.MaxSize || !fingerprintPattern.MatchString(input.Fingerprint) {
		return contracts.MultipartUpload{}, ErrInvalid
	}
	active, e := s.active(ctx)
	if e != nil {
		return contracts.MultipartUpload{}, e
	}
	l, e := s.location(ctx, active)
	if e != nil {
		return contracts.MultipartUpload{}, e
	}
	if !l.Tested {
		return contracts.MultipartUpload{}, ErrNotReady
	}
	st, e := s.store(l)
	if e != nil {
		return contracts.MultipartUpload{}, e
	}
	mp, ok := st.(blob.Multipart)
	if !ok {
		return contracts.MultipartUpload{}, ErrUnavailable
	}
	now := s.now()
	expires := now.Add(time.Duration(policy.ResumeHours) * time.Hour).Unix()
	f := Record{FileEntry: contracts.FileEntry{FileID: id(), OriginalName: input.OriginalName, MimeType: input.MimeType, Size: input.Size, StorageType: l.Provider, LocationID: l.ID, CreatorID: a.ID, CreatorRealm: a.Realm, CreatedAt: int(now.Unix()), State: "pending"}, Key: "objects/" + id(), Staging: "multipart/" + id(), Purpose: "user", UploadExpires: expires, CleanupAt: expires}
	if days := s.policy(ctx, "retention_days", 0); days > 0 {
		f.ExpiresAt = int(now.Add(time.Duration(days) * 24 * time.Hour).Unix())
	}
	// Register cleanup before Begin: exact-key abort can recover a lost provider response/upload ID.
	if e = s.Repo.Create(ctx, f, []Job{s.job(l.ID, f.Staging, expires), s.job(l.ID, f.Key, expires)}); e != nil {
		return contracts.MultipartUpload{}, ErrUnavailable
	}
	chunk := int64(policy.PartSize)
	minimum := (int64(input.Size) + 9999) / 10000
	if chunk < minimum {
		chunk = ((minimum + (1 << 20) - 1) / (1 << 20)) * (1 << 20)
	}
	u := UploadSession{FileID: f.FileID, Fingerprint: input.Fingerprint, PartSize: chunk}
	if e = s.Repo.SaveSession(ctx, u, true); e != nil {
		return contracts.MultipartUpload{}, ErrUnavailable
	}
	u.UploadID, e = mp.BeginMultipart(ctx, f.Staging, f.MimeType)
	if e != nil || u.UploadID == "" {
		_ = s.remove(ctx, f, a.ID)
		return contracts.MultipartUpload{}, ErrUnavailable
	}
	if e = s.Repo.SaveSession(ctx, u, false); e != nil {
		return contracts.MultipartUpload{}, ErrUnavailable
	}
	return uploadView(f, u, []blob.Part{}), nil
}
func uploadView(f Record, u UploadSession, parts []blob.Part) contracts.MultipartUpload {
	v := contracts.MultipartUpload{File: f.FileEntry, Fingerprint: u.Fingerprint, PartSize: int(u.PartSize), PartCount: int((int64(f.Size) + u.PartSize - 1) / u.PartSize), ExpiresAt: int(f.CleanupAt), Parts: []contracts.UploadPart{}}
	for _, p := range parts {
		if p.Number >= 1 && p.Number <= v.PartCount && p.Size == partLength(f, u, p.Number) {
			v.Parts = append(v.Parts, contracts.UploadPart{Number: p.Number, Size: int(p.Size)})
		}
	}
	return v
}
func partLength(f Record, u UploadSession, n int) int64 {
	if n < 1 || u.PartSize < 1 {
		return 0
	}
	offset := int64(n-1) * u.PartSize
	if offset >= int64(f.Size) {
		return 0
	}
	return min(u.PartSize, int64(f.Size)-offset)
}
func (s *Service) session(ctx context.Context, a Actor, id string) (Record, UploadSession, blob.Store, blob.Multipart, error) {
	f, e := s.owned(ctx, id, a)
	if e != nil {
		return f, UploadSession{}, nil, nil, e
	}
	u, e := s.Repo.Session(ctx, id)
	if e != nil {
		return f, u, nil, nil, e
	}
	if u.PartSize < 5<<20 || u.PartSize > 64<<20 || u.UploadID == "" || f.State != "ready" && f.CleanupAt <= s.now().Unix() {
		return f, u, nil, nil, ErrBusy
	}
	l, e := s.location(ctx, f.LocationID)
	if e != nil {
		return f, u, nil, nil, e
	}
	st, e := s.store(l)
	if e != nil {
		return f, u, nil, nil, e
	}
	mp, ok := st.(blob.Multipart)
	if !ok {
		return f, u, nil, nil, ErrUnavailable
	}
	return f, u, st, mp, nil
}
func (s *Service) UploadStatus(ctx context.Context, a Actor, id string) (contracts.MultipartUpload, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	f, u, _, mp, e := s.session(ctx, a, id)
	if e != nil {
		return contracts.MultipartUpload{}, e
	}
	parts := []blob.Part{}
	if f.State == "pending" {
		parts, e = mp.ListParts(ctx, f.Staging, u.UploadID)
		if e != nil {
			return contracts.MultipartUpload{}, ErrUnavailable
		}
	}
	return uploadView(f, u, parts), nil
}
func (s *Service) UploadPartGrant(ctx context.Context, a Actor, id string, number int) (contracts.FileUploadGrant, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	f, u, _, mp, e := s.session(ctx, a, id)
	if e != nil {
		return contracts.FileUploadGrant{}, e
	}
	n := partLength(f, u, number)
	if f.State != "pending" || n < 1 || number > 10000 {
		return contracts.FileUploadGrant{}, ErrBusy
	}
	ttl := min(s.policy(ctx, "upload_ttl", 900), int(f.CleanupAt-s.now().Unix()))
	direct := f.StorageType != "local"
	g := blob.Grant{URL: "/api/v1/files/multipart/" + id + "/parts/" + strconv.Itoa(number), Method: "PUT", Headers: map[string]string{"Content-Type": "application/octet-stream"}, Fields: map[string]string{}}
	if direct {
		g, e = mp.SignPart(ctx, f.Staging, u.UploadID, number, n, time.Duration(ttl)*time.Second)
		if e != nil {
			return contracts.FileUploadGrant{}, ErrUnavailable
		}
	}
	return contracts.FileUploadGrant{FileID: id, Url: g.URL, Method: g.Method, Headers: g.Headers, Fields: g.Fields, Direct: direct, ExpiresAt: int(s.now().Add(time.Duration(ttl) * time.Second).Unix())}, nil
}
func (s *Service) ReceiveUploadPart(ctx context.Context, a Actor, id string, number int, source io.Reader, n int64) error {
	s.mu.Lock()
	f, u, st, _, e := s.session(ctx, a, id)
	if e != nil {
		s.mu.Unlock()
		return e
	}
	length := partLength(f, u, number)
	receiver, ok := st.(blob.PartReceiver)
	if !ok || f.StorageType != "local" || f.State != "pending" || length < 1 || number > 10000 {
		s.mu.Unlock()
		return ErrBusy
	}
	if n != length {
		s.mu.Unlock()
		return ErrInvalid
	}
	s.mu.Unlock()
	// Slow streams do not hold the global metadata mutex. Abort/complete never expose this staging namespace.
	if e = receiver.ReceivePart(ctx, f.Staging, u.UploadID, number, source, n); e != nil {
		return ErrUnavailable
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	current, e := s.owned(ctx, id, a)
	if e != nil {
		return e
	}
	if current.State != "pending" {
		return ErrBusy
	}
	return nil
}
func (s *Service) FinishUpload(ctx context.Context, a Actor, id string) (contracts.FileEntry, error) {
	// Serialize confirmation for one file, while allowing unrelated streams and metadata reads.
	lock := s.fileLock(id)
	lock.Lock()
	defer lock.Unlock()
	s.mu.Lock()
	f, u, st, mp, e := s.session(ctx, a, id)
	if e != nil {
		s.mu.Unlock()
		return contracts.FileEntry{}, e
	}
	if f.State == "ready" {
		s.mu.Unlock()
		return f.FileEntry, nil
	}
	previous := f.State
	f.State = "copying"
	e = s.Repo.Change(ctx, f, nil, a.ID)
	s.mu.Unlock()
	if e != nil {
		return f.FileEntry, ErrUnavailable
	}
	obj, statErr := st.Stat(ctx, f.Staging)
	if previous == "pending" || statErr != nil {
		parts, e := mp.ListParts(ctx, f.Staging, u.UploadID)
		if e != nil {
			return f.FileEntry, ErrUnavailable
		}
		sort.Slice(parts, func(i, j int) bool { return parts[i].Number < parts[j].Number })
		count := int((int64(f.Size) + u.PartSize - 1) / u.PartSize)
		if len(parts) != count {
			s.restorePending(ctx, a, id)
			return f.FileEntry, ErrInvalid
		}
		for i, p := range parts {
			if p.Number != i+1 || p.Size != partLength(f, u, p.Number) || p.ETag == "" {
				s.restorePending(ctx, a, id)
				return f.FileEntry, ErrInvalid
			}
		}
		if e = mp.CompleteMultipart(ctx, f.Staging, u.UploadID, parts); e != nil {
			return f.FileEntry, ErrUnavailable
		}
		obj, statErr = st.Stat(ctx, f.Staging)
	}
	if f.StorageType == "local" && statErr == nil && obj.ETag != u.Fingerprint {
		return f.FileEntry, ErrInvalid
	}
	if statErr != nil || obj.Size != int64(f.Size) || obj.ETag == "" || obj.MIME != "" && obj.MIME != f.MimeType {
		return f.FileEntry, ErrInvalid
	}
	if e = st.Copy(ctx, f.Staging, f.Key, obj.ETag); e != nil {
		return f.FileEntry, ErrUnavailable
	}
	confirmed, e := st.Stat(ctx, f.Key)
	if e != nil || confirmed.Size != int64(f.Size) || confirmed.ETag == "" || confirmed.MIME != "" && confirmed.MIME != f.MimeType {
		return f.FileEntry, ErrUnavailable
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	current, e := s.owned(ctx, id, a)
	if e != nil {
		return f.FileEntry, e
	}
	if current.State != "copying" {
		return f.FileEntry, ErrBusy
	}
	f.State = "ready"
	f.ETag = confirmed.ETag
	f.Staging = ""
	if e = s.Repo.Change(ctx, f, nil, a.ID); e != nil {
		return f.FileEntry, ErrUnavailable
	}
	return f.FileEntry, nil
}
func (s *Service) restorePending(ctx context.Context, a Actor, id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	f, e := s.owned(ctx, id, a)
	if e == nil && f.State == "copying" {
		f.State = "pending"
		_ = s.Repo.Change(ctx, f, nil, a.ID)
	}
}
func isMultipart(f Record) bool { return strings.HasPrefix(f.Staging, "multipart/") }
