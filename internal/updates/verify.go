// Author: yunnuo <ymz@ebox.vip>
// Description: Strict publisher trust, application/target binding, expiry and anti-downgrade checks.
package updates

import (
	"bytes"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"strings"
	"time"
)

var versionPattern = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`)
var artifactPattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]*\.tar\.gz$`)

func Compare(a, b string) int {
	if !versionPattern.MatchString(a) || !versionPattern.MatchString(b) {
		return 0
	}
	aa, bb := strings.Split(a, "."), strings.Split(b, ".")
	for i := range aa {
		if len(aa[i]) != len(bb[i]) {
			if len(aa[i]) > len(bb[i]) {
				return 1
			}
			return -1
		}
		if aa[i] > bb[i] {
			return 1
		}
		if aa[i] < bb[i] {
			return -1
		}
	}
	return 0
}
func decodeStrict(raw []byte, destination any) error {
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if err := d.Decode(destination); err != nil {
		return err
	}
	if d.Decode(&struct{}{}) != io.EOF {
		return ErrRejected
	}
	return nil
}
func Verify(raw, signature []byte, trust Trust, currentVersion, expectedVersion string, target Target, now time.Time) (Manifest, Artifact, error) {
	reject := func() (Manifest, Artifact, error) { return Manifest{}, Artifact{}, ErrRejected }
	if !ValidVersion(currentVersion) || len(raw) == 0 || len(raw) > 256*1024 || len(signature) > 4096 || !versionPattern.MatchString(expectedVersion) || Compare(expectedVersion, currentVersion) <= 0 {
		return reject()
	}
	var sig Signature
	if decodeStrict(signature, &sig) != nil || sig.Algorithm != "ed25519" {
		return reject()
	}
	pub, e := base64.StdEncoding.DecodeString(trust.Keys[sig.KeyID])
	if e != nil || len(pub) != ed25519.PublicKeySize {
		return reject()
	}
	signed, e := base64.StdEncoding.DecodeString(sig.Value)
	if e != nil || !ed25519.Verify(pub, raw, signed) {
		return reject()
	}
	var m Manifest
	if decodeStrict(raw, &m) != nil || m.Schema != 1 || m.Application != trust.Application || m.Version != expectedVersion || len(m.Commit) != 40 || m.IssuedAt.After(now.Add(5*time.Minute)) || !m.ExpiresAt.After(now) || !m.ExpiresAt.After(m.IssuedAt) || m.ExpiresAt.Sub(m.IssuedAt) > 2*365*24*time.Hour {
		return reject()
	}
	if _, e := hex.DecodeString(m.Commit); e != nil {
		return reject()
	}
	if len(m.Artifacts) == 0 || len(m.Artifacts) > 64 {
		return reject()
	}
	seen := map[string]bool{}
	names := map[string]bool{}
	var chosen *Artifact
	for _, a := range m.Artifacts {
		identity := fmt.Sprintf("%s/%s/%s", a.Profile, a.OS, a.Arch)
		if seen[identity] || names[a.Name] || !artifactPattern.MatchString(a.Name) || len(a.SHA256) != 64 || a.Size < 1 || a.Size > 512*1024*1024 {
			return reject()
		}
		seen[identity] = true
		names[a.Name] = true
		if a.PlatformSignature != "unsigned" && a.PlatformSignature != "developer-id-notarized" && a.PlatformSignature != "authenticode" {
			return reject()
		}
		if a.PlatformSignature == "developer-id-notarized" && (a.Profile != "desktop" || a.OS != "darwin") || a.PlatformSignature == "authenticode" && (a.Profile != "desktop" || a.OS != "windows") {
			return reject()
		}
		if _, e := hex.DecodeString(a.SHA256); e != nil {
			return reject()
		}
		if a.Target == target {
			copy := a
			chosen = &copy
		}
	}
	if chosen == nil {
		return reject()
	}
	if target.Profile == "desktop" && target.OS != "linux" && !trust.AllowUnsignedPlatform && chosen.PlatformSignature == "unsigned" {
		return reject()
	}
	return m, *chosen, nil
}
func ValidVersion(s string) bool { return len(s) <= 40 && versionPattern.MatchString(s) }

// Numeric tags are used by the framework's single VERSION source; prerelease is channel metadata.
func TagVersion(tag string) string {
	v := strings.TrimPrefix(tag, "v")
	if !ValidVersion(v) {
		return ""
	}
	return v
}

// VerifyPayload binds cached/planned selectors back to the signed bytes before any filesystem work.
func VerifyPayload(p Payload, trust Trust, current string, target Target, now time.Time) error {
	m, a, e := Verify(p.Manifest, p.Signature, trust, current, p.Version, target, now)
	if e != nil {
		return e
	}
	if a != p.Artifact || m.Commit != p.Commit {
		return ErrRejected
	}
	return nil
}
