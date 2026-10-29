// Author: yunnuo <ymz@ebox.vip>
// Description: Private file use cases, immutable location targets, staged uploads and expiring access.
package files

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/yunnuo/unicore/internal/blob"
	"github.com/yunnuo/unicore/internal/contracts"
)

func id() string {
	var b [24]byte
	if _, e := rand.Read(b[:]); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b[:])
}
func (s *Service) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}
func (s *Service) policy(ctx context.Context, key string, def int) int {
	v, e := s.Settings.Value(ctx, "storage."+key)
	if e != nil {
		return def
	}
	n, e := strconv.Atoi(v)
	if e != nil {
		return def
	}
	return n
}
func (s *Service) active(ctx context.Context) (string, error) {
	v, e := s.Settings.Value(ctx, "storage.active")
	if e != nil {
		return "", ErrUnavailable
	}
	if v == "" {
		v = "local"
	}
	return v, nil
}
func (s *Service) location(ctx context.Context, id string) (Location, error) {
	ls, e := s.Repo.Locations(ctx)
	if e != nil {
		return Location{}, ErrUnavailable
	}
	for _, l := range ls {
		if l.ID == id {
			return l, nil
		}
	}
	return Location{}, ErrNotFound
}
func (s *Service) store(l Location) (blob.Store, error) {
	var c Credentials
	if l.Credentials != "" {
		v, e := s.Secrets.Open(l.Credentials)
		if e != nil {
			return nil, ErrUnavailable
		}
		if json.Unmarshal([]byte(v), &c) != nil {
			return nil, ErrUnavailable
		}
	}
	v, e := s.Factory(l, c)
	if e != nil {
		return nil, ErrUnavailable
	}
	return v, nil
}
func (s *Service) Locations(ctx context.Context) (contracts.StorageLocationList, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	active, e := s.active(ctx)
	if e != nil {
		return contracts.StorageLocationList{}, e
	}
	ls, e := s.Repo.Locations(ctx)
	if e != nil {
		return contracts.StorageLocationList{}, ErrUnavailable
	}
	v := contracts.StorageLocationList{Items: []contracts.StorageLocation{}, ActiveID: active}
	for _, l := range ls {
		if l.ID == "legacy-brand" {
			continue
		}
		l.Active = l.ID == active
		l.Configured = l.Provider == "local" || l.Credentials != ""
		l.FileCount, e = s.Repo.CountLocation(ctx, l.ID)
		if e != nil {
			return v, ErrUnavailable
		}
		v.Items = append(v.Items, l.StorageLocation)
	}
	return v, nil
}

var bucketPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9.-]{1,126}[a-z0-9]$`)

func validLocation(in contracts.StorageLocationInput) bool {
	if strings.TrimSpace(in.Name) == "" || len([]rune(in.Name)) > 80 || strings.IndexFunc(in.Name, unicode.IsControl) >= 0 {
		return false
	}
	if in.Provider != "minio" && in.Provider != "s3" && in.Provider != "oss" && in.Provider != "cos" {
		return false
	}
	if in.Provider == "oss" && in.Region == "" {
		return false
	}
	u, e := url.Parse(in.Endpoint)
	if e != nil || u.Hostname() == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" || strings.ContainsAny(in.Endpoint, " \t\r\n'\";\\") {
		return false
	}
	if in.Provider == "cos" && !strings.HasPrefix(u.Hostname(), in.Bucket+".") {
		return false
	}
	return bucketPattern.MatchString(in.Bucket) && !strings.ContainsAny(in.Region, " \t\r\n/;'\"") && len(in.Region) <= 128 && (in.Prefix == "" || blob.ValidKey(in.Prefix)) && len(in.Prefix) <= 200
}
func (s *Service) SaveLocation(ctx context.Context, input contracts.StorageLocationInput, locationID, actor string) (contracts.StorageLocation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !validLocation(input) {
		return contracts.StorageLocation{}, ErrInvalid
	}
	create := locationID == ""
	l := Location{StorageLocation: contracts.StorageLocation{ID: id(), Name: input.Name, Provider: input.Provider, Endpoint: input.Endpoint, Bucket: input.Bucket, Region: input.Region, Prefix: input.Prefix, PathStyle: input.PathStyle, CreatedAt: int(s.now().Unix())}}
	if !create {
		old, e := s.location(ctx, locationID)
		if e != nil {
			return l.StorageLocation, e
		}
		if old.Provider == "local" || old.Provider != input.Provider || old.Endpoint != input.Endpoint || old.Bucket != input.Bucket || old.Region != input.Region || old.Prefix != input.Prefix || old.PathStyle != input.PathStyle {
			return l.StorageLocation, ErrInvalid
		}
		l = old
		l.Name = input.Name
	}
	var c Credentials
	if l.Credentials != "" {
		v, e := s.Secrets.Open(l.Credentials)
		if e != nil || json.Unmarshal([]byte(v), &c) != nil {
			return l.StorageLocation, ErrUnavailable
		}
	}
	changed := false
	if input.AccessKey != "" {
		c.AccessKey = input.AccessKey
		changed = true
	}
	if input.SecretKey != "" {
		c.SecretKey = input.SecretKey
		changed = true
	}
	if c.AccessKey == "" || c.SecretKey == "" || len(c.AccessKey) > 512 || len(c.SecretKey) > 512 || strings.ContainsAny(c.AccessKey+c.SecretKey, "\r\n\x00") {
		return l.StorageLocation, ErrInvalid
	}
	if changed {
		raw, _ := json.Marshal(c)
		l.Credentials = s.Secrets.Seal(string(raw))
		l.Tested = false
	}
	if !create && changed {
		n, e := s.Repo.CountLocation(ctx, l.ID)
		if e != nil {
			return l.StorageLocation, ErrUnavailable
		}
		a, e := s.active(ctx)
		if e != nil {
			return l.StorageLocation, e
		}
		if n > 0 || a == l.ID {
			if e = s.probe(ctx, l); e != nil {
				return l.StorageLocation, e
			}
			l.Tested = true
		}
	}
	if e := s.Repo.SaveLocation(ctx, l, create, actor); e != nil {
		return l.StorageLocation, ErrUnavailable
	}
	l.Configured = true
	return l.StorageLocation, nil
}
func (s *Service) probe(ctx context.Context, l Location) error {
	st, e := s.store(l)
	if e != nil {
		return e
	}
	k := "multipart/probe-" + id()
	target := k + "-copy"
	jobs := []Job{s.job(l.ID, k, s.now().Add(time.Hour).Unix()), s.job(l.ID, target, s.now().Add(time.Hour).Unix())}
	if e = s.Repo.Queue(ctx, jobs); e != nil {
		return ErrUnavailable
	}
	data := []byte("Unicore storage verification " + id())
	obj, e := st.Put(ctx, k, bytes.NewReader(data), int64(len(data)), "application/octet-stream")
	if e != nil {
		return ErrUnavailable
	}
	defer st.Delete(ctx, k)
	defer st.Delete(ctx, target)
	if e = st.Copy(ctx, k, target, obj.ETag); e != nil {
		return ErrUnavailable
	}
	r, info, e := st.Open(ctx, target)
	if e != nil {
		return ErrUnavailable
	}
	got, e := io.ReadAll(io.LimitReader(r, int64(len(data)+1)))
	r.Close()
	if e != nil || info.Size != int64(len(data)) || !bytes.Equal(got, data) {
		return ErrUnavailable
	}
	if e = st.Delete(ctx, target); e != nil {
		return ErrUnavailable
	}
	if e = st.Delete(ctx, k); e != nil {
		return ErrUnavailable
	}
	if mp, ok := st.(blob.Multipart); ok {
		upload, e := mp.BeginMultipart(ctx, k, "application/octet-stream")
		if e != nil {
			return ErrUnavailable
		}
		if _, e = mp.ListParts(ctx, k, upload); e != nil {
			return ErrUnavailable
		}
		if e = mp.AbortMultipart(ctx, k); e != nil {
			return ErrUnavailable
		}
	}
	for _, j := range jobs {
		if e = s.Repo.JobDone(ctx, j, true); e != nil {
			return ErrUnavailable
		}
	}
	return nil
}
func (s *Service) Test(ctx context.Context, locationID, actor string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	l, e := s.location(ctx, locationID)
	if e != nil {
		return e
	}
	if l.Provider != "local" {
		if e = s.probe(ctx, l); e != nil {
			return e
		}
	}
	l.Tested = true
	return s.Repo.SaveLocation(ctx, l, false, actor)
}
func (s *Service) ActivateLocation(ctx context.Context, locationID, actor string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	l, e := s.location(ctx, locationID)
	if e != nil {
		return e
	}
	if l.ID == "legacy-brand" || !l.Tested {
		return ErrNotReady
	}
	return s.Activate(ctx, l.ID, actor)
}
func (s *Service) RemoveLocation(ctx context.Context, locationID, actor string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	l, e := s.location(ctx, locationID)
	if e != nil {
		return e
	}
	active, e := s.active(ctx)
	if e != nil {
		return e
	}
	busy, e := s.Repo.BusyLocation(ctx, l.ID)
	if e != nil {
		return ErrUnavailable
	}
	if l.Provider == "local" || l.ID == active || busy {
		return ErrBusy
	}
	return s.Repo.RemoveLocation(ctx, l.ID, actor)
}
func (s *Service) Browser(ctx context.Context, locationID, origin string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	u, e := url.Parse(origin)
	if e != nil || u.Hostname() == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" {
		return ErrInvalid
	}
	l, e := s.location(ctx, locationID)
	if e != nil {
		return e
	}
	st, e := s.store(l)
	if e != nil {
		return e
	}
	v, ok := st.(BrowserStore)
	if !ok {
		return ErrInvalid
	}
	if e = v.Browser(ctx, origin); e != nil {
		return ErrUnavailable
	}
	return nil
}
func (s *Service) Origins(ctx context.Context) []string {
	ls, e := s.Repo.Locations(ctx)
	if e != nil {
		return nil
	}
	result := []string{}
	for _, l := range ls {
		if l.Provider == "local" {
			continue
		}
		st, e := s.store(l)
		if e == nil {
			if b, ok := st.(BrowserStore); ok {
				result = append(result, b.Origin())
			}
		}
	}
	return result
}
func validFile(in contracts.FileUploadInput) bool {
	if strings.TrimSpace(in.OriginalName) == "" || len([]rune(in.OriginalName)) > 255 || strings.ContainsAny(in.OriginalName, "/\\") || strings.IndexFunc(in.OriginalName, unicode.IsControl) >= 0 || in.Size < 1 || int64(in.Size) > 64<<30 {
		return false
	}
	m, _, e := mime.ParseMediaType(in.MimeType)
	return e == nil && m == in.MimeType && len(m) <= 160
}
func (s *Service) job(location, key string, due int64) Job {
	return Job{ID: id(), LocationID: location, Key: key, Due: due}
}
func (s *Service) owned(ctx context.Context, fileID string, a Actor) (Record, error) {
	f, e := s.Repo.Get(ctx, fileID)
	if e != nil {
		return f, e
	}
	if f.Purpose != "user" || f.State == "deleted" || (!a.Admin && (f.CreatorID != a.ID || f.CreatorRealm != a.Realm)) || f.ExpiresAt > 0 && f.ExpiresAt <= int(s.now().Unix()) {
		return f, ErrNotFound
	}
	return f, nil
}
func (s *Service) List(ctx context.Context, a Actor, search string, page int) (contracts.FileList, error) {
	if page < 1 || page > 100000 || len(search) > 255 {
		return contracts.FileList{}, ErrInvalid
	}
	return s.Repo.List(ctx, a, search, page)
}
func (s *Service) Upload(ctx context.Context, a Actor, input contracts.FileUploadInput) (contracts.FileUploadGrant, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !validFile(input) || input.Size > 1<<30 || input.Size > s.policy(ctx, "max_size_mb", 100)*1024*1024 {
		return contracts.FileUploadGrant{}, ErrInvalid
	}
	active, e := s.active(ctx)
	if e != nil {
		return contracts.FileUploadGrant{}, e
	}
	l, e := s.location(ctx, active)
	if e != nil {
		return contracts.FileUploadGrant{}, e
	}
	if !l.Tested {
		return contracts.FileUploadGrant{}, ErrNotReady
	}
	st, e := s.store(l)
	if e != nil {
		return contracts.FileUploadGrant{}, e
	}
	now := s.now()
	ttl := s.policy(ctx, "upload_ttl", 900)
	f := Record{FileEntry: contracts.FileEntry{FileID: id(), OriginalName: input.OriginalName, MimeType: input.MimeType, Size: input.Size, StorageType: l.Provider, LocationID: l.ID, CreatorID: a.ID, CreatorRealm: a.Realm, CreatedAt: int(now.Unix()), State: "pending"}, Key: "objects/" + id(), Staging: "pending/" + id(), Purpose: "user", UploadExpires: now.Add(time.Duration(ttl) * time.Second).Unix()}
	retention := s.policy(ctx, "retention_days", 0)
	if retention > 0 {
		f.ExpiresAt = int(now.Add(time.Duration(retention) * 24 * time.Hour).Unix())
	}
	cleanup := now.Add(time.Duration(s.policy(ctx, "pending_hours", 24)) * time.Hour).Unix()
	if cleanup < f.UploadExpires+60 {
		cleanup = f.UploadExpires + 60
	}
	f.CleanupAt = cleanup
	grant := blob.Grant{URL: "/api/v1/files/uploads/" + f.FileID + "/content", Method: "PUT", Headers: map[string]string{"Content-Type": "application/octet-stream"}, Fields: map[string]string{}}
	direct := l.Provider != "local"
	if direct {
		grant, e = st.SignPut(ctx, f.Staging, int64(f.Size), f.MimeType, time.Duration(ttl)*time.Second)
		if e != nil {
			return contracts.FileUploadGrant{}, ErrUnavailable
		}
	}
	jobs := []Job{s.job(l.ID, f.Staging, cleanup), s.job(l.ID, f.Key, cleanup)}
	if e = s.Repo.Create(ctx, f, jobs); e != nil {
		return contracts.FileUploadGrant{}, ErrUnavailable
	}
	return contracts.FileUploadGrant{FileID: f.FileID, Url: grant.URL, Method: grant.Method, Headers: grant.Headers, Fields: grant.Fields, Direct: direct, ExpiresAt: int(now.Add(time.Duration(ttl) * time.Second).Unix())}, nil
}
func (s *Service) Receive(ctx context.Context, a Actor, fileID string, source io.Reader, n int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	f, e := s.owned(ctx, fileID, a)
	if e != nil {
		return e
	}
	if isMultipart(f) || f.State != "pending" || f.StorageType != "local" || f.UploadExpires <= s.now().Unix() {
		return ErrBusy
	}
	if n != int64(f.Size) {
		return ErrInvalid
	}
	l, e := s.location(ctx, f.LocationID)
	if e != nil {
		return e
	}
	st, e := s.store(l)
	if e != nil {
		return e
	}
	_, e = st.Put(ctx, f.Staging, source, n, f.MimeType)
	if e != nil {
		return ErrUnavailable
	}
	return nil
}
func (s *Service) Complete(ctx context.Context, a Actor, fileID string) (contracts.FileEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	f, e := s.owned(ctx, fileID, a)
	if e != nil {
		return f.FileEntry, e
	}
	if f.State == "ready" {
		return f.FileEntry, nil
	}
	if isMultipart(f) {
		return f.FileEntry, ErrBusy
	}
	if f.CleanupAt <= s.now().Unix() {
		return f.FileEntry, ErrBusy
	}
	l, e := s.location(ctx, f.LocationID)
	if e != nil {
		return f.FileEntry, e
	}
	st, e := s.store(l)
	if e != nil {
		return f.FileEntry, e
	}
	obj, e := st.Stat(ctx, f.Staging)
	if e != nil {
		return f.FileEntry, ErrUnavailable
	}
	if obj.Size != int64(f.Size) || obj.ETag == "" || (obj.MIME != "" && obj.MIME != f.MimeType) {
		return f.FileEntry, ErrInvalid
	}
	f.State = "copying"
	if e = s.Repo.Change(ctx, f, nil, a.ID); e != nil {
		return f.FileEntry, ErrUnavailable
	}
	if e = st.Copy(ctx, f.Staging, f.Key, obj.ETag); e != nil {
		return f.FileEntry, ErrUnavailable
	}
	confirmed, e := st.Stat(ctx, f.Key)
	if e != nil || confirmed.Size != obj.Size || (confirmed.MIME != "" && confirmed.MIME != f.MimeType) {
		return f.FileEntry, ErrUnavailable
	}
	f.State = "ready"
	f.ETag = confirmed.ETag
	f.Staging = ""
	if e = s.Repo.Change(ctx, f, nil, a.ID); e != nil {
		return f.FileEntry, ErrUnavailable
	}
	return f.FileEntry, nil
}
func (s *Service) Access(ctx context.Context, a Actor, fileID string) (contracts.FileAccess, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	f, e := s.owned(ctx, fileID, a)
	if e != nil {
		return contracts.FileAccess{}, e
	}
	if f.State != "ready" {
		return contracts.FileAccess{}, ErrBusy
	}
	ttl := s.policy(ctx, "url_ttl", 300)
	if f.ExpiresAt > 0 {
		ttl = min(ttl, f.ExpiresAt-int(s.now().Unix()))
	}
	expires := s.now().Add(time.Duration(ttl) * time.Second).Unix()
	l, e := s.location(ctx, f.LocationID)
	if e != nil {
		return contracts.FileAccess{}, e
	}
	st, e := s.store(l)
	if e != nil {
		return contracts.FileAccess{}, e
	}
	var target string
	if l.Provider == "local" {
		payload := fmt.Sprintf("%s:%s:%d", f.FileID, f.Key, expires)
		target = "/api/v1/files/" + f.FileID + "/content?expires=" + strconv.FormatInt(expires, 10) + "&signature=" + url.QueryEscape(s.Secrets.Seal(payload))
	} else {
		target, e = st.SignGet(ctx, f.Key, f.OriginalName, time.Duration(ttl)*time.Second)
		if e != nil {
			return contracts.FileAccess{}, ErrUnavailable
		}
	}
	return contracts.FileAccess{Url: target, ExpiresAt: int(expires)}, nil
}
func (s *Service) Download(ctx context.Context, fileID, signature string, expires int64) (io.ReadCloser, Record, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	f, e := s.Repo.Get(ctx, fileID)
	if e != nil {
		return nil, f, ErrNotFound
	}
	now := s.now().Unix()
	if f.Purpose != "user" || f.State != "ready" || f.StorageType != "local" || expires <= now || expires > now+3600 || f.ExpiresAt > 0 && int64(f.ExpiresAt) <= now {
		return nil, f, ErrNotFound
	}
	raw, e := s.Secrets.Open(signature)
	expected := fmt.Sprintf("%s:%s:%d", f.FileID, f.Key, expires)
	if e != nil || subtle.ConstantTimeCompare([]byte(raw), []byte(expected)) != 1 {
		return nil, f, ErrNotFound
	}
	l, e := s.location(ctx, f.LocationID)
	if e != nil {
		return nil, f, e
	}
	st, e := s.store(l)
	if e != nil {
		return nil, f, e
	}
	r, _, e := st.Open(ctx, f.Key)
	if e != nil {
		return nil, f, ErrNotFound
	}
	return r, f, nil
}
func (s *Service) remove(ctx context.Context, f Record, actor string) error {
	jobs := []Job{}
	due := s.now().Add(3660 * time.Second).Unix()
	if f.Key != "" {
		jobs = append(jobs, s.job(f.LocationID, f.Key, due))
	}
	if f.Staging != "" {
		jobs = append(jobs, s.job(f.LocationID, f.Staging, max(due, f.UploadExpires)))
	}
	f.State = "deleted"
	return s.Repo.Change(ctx, f, jobs, actor)
}
func (s *Service) Delete(ctx context.Context, a Actor, fileID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	f, e := s.owned(ctx, fileID, a)
	if e != nil {
		return e
	}
	return s.remove(ctx, f, a.ID)
}
func (s *Service) Cleanup(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	expired, e := s.Repo.Expired(ctx, s.now().Unix())
	if e != nil {
		return ErrUnavailable
	}
	for _, f := range expired {
		if e = s.remove(ctx, f, "system"); e != nil {
			return ErrUnavailable
		}
	}
	jobs, e := s.Repo.Jobs(ctx, s.now().Unix())
	if e != nil {
		return ErrUnavailable
	}
	for _, j := range jobs {
		ref, e := s.Repo.Referenced(ctx, j.LocationID, j.Key, s.now().Unix())
		if e != nil {
			return ErrUnavailable
		}
		ok := ref
		if !ref {
			l, e := s.location(ctx, j.LocationID)
			if e == nil {
				st, e := s.store(l)
				if e == nil {
					ok = true
					if strings.HasPrefix(j.Key, "multipart/") || strings.HasPrefix(j.Key, "objects/") {
						mp, exists := st.(blob.Multipart)
						ok = exists && mp.AbortMultipart(ctx, j.Key) == nil
					}
					if ok {
						ok = st.Delete(ctx, j.Key) == nil
					}
				}
			}
		}
		if e = s.Repo.JobDone(ctx, j, ok); e != nil {
			return ErrUnavailable
		}
	}
	return nil
}

// Migrate streams between providers; cloud-internal upload confirmation uses Copy instead.
func (s *Service) Migrate(ctx context.Context, a Actor, fileID, target string) (contracts.FileEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !a.Admin {
		return contracts.FileEntry{}, ErrNotFound
	}
	f, e := s.owned(ctx, fileID, a)
	if e != nil {
		return f.FileEntry, e
	}
	if f.State != "ready" {
		return f.FileEntry, ErrBusy
	}
	if f.LocationID == target {
		return f.FileEntry, nil
	}
	source, e := s.location(ctx, f.LocationID)
	if e != nil {
		return f.FileEntry, e
	}
	dest, e := s.location(ctx, target)
	if e != nil {
		return f.FileEntry, e
	}
	if !dest.Tested || target == "legacy-brand" {
		return f.FileEntry, ErrNotReady
	}
	from, e := s.store(source)
	if e != nil {
		return f.FileEntry, e
	}
	to, e := s.store(dest)
	if e != nil {
		return f.FileEntry, e
	}
	key := "objects/" + id()
	orphan := s.job(target, key, s.now().Add(2*time.Hour).Unix())
	if e = s.Repo.Queue(ctx, []Job{orphan}); e != nil {
		return f.FileEntry, ErrUnavailable
	}
	r, obj, e := from.Open(ctx, f.Key)
	if e != nil {
		return f.FileEntry, ErrUnavailable
	}
	defer r.Close()
	h := sha256.New()
	written, e := to.Put(ctx, key, io.TeeReader(r, h), int64(f.Size), f.MimeType)
	if e != nil || written.Size != int64(f.Size) || obj.Size != int64(f.Size) {
		return f.FileEntry, ErrUnavailable
	}
	verify, info, e := to.Open(ctx, key)
	if e != nil {
		return f.FileEntry, ErrUnavailable
	}
	h2 := sha256.New()
	n, e := io.Copy(h2, io.LimitReader(verify, int64(f.Size)+1))
	verify.Close()
	if e != nil || n != int64(f.Size) || info.Size != n || !bytes.Equal(h.Sum(nil), h2.Sum(nil)) {
		return f.FileEntry, ErrUnavailable
	}
	old := s.job(f.LocationID, f.Key, s.now().Add(3660*time.Second).Unix())
	f.LocationID = dest.ID
	f.StorageType = dest.Provider
	f.Key = key
	f.ETag = written.ETag
	if e = s.Repo.Change(ctx, f, []Job{old}, a.ID); e != nil {
		return f.FileEntry, ErrUnavailable
	}
	return f.FileEntry, nil
}
