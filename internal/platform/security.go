// Author: yunnuo <ymz@ebox.vip>
// Description: Argon2id hashes, opaque sessions and bounded process-local abuse controls.
package platform

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/argon2"
)

var (
	ErrInput       = errors.New("invalid account input")
	ErrCredentials = errors.New("invalid credentials")
	ErrForbidden   = errors.New("permission denied")
	ErrConflict    = errors.New("account already exists")
	ErrLastAdmin   = errors.New("cannot disable or demote the last super administrator")
	ErrRateLimited = errors.New("too many attempts")
	ErrCaptcha     = errors.New("invalid or expired captcha")
)

func Token() string {
	var data [32]byte
	if _, err := rand.Read(data[:]); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(data[:])
}
func Hash(value string) string {
	digest := sha256.Sum256([]byte(value))
	return hex.EncodeToString(digest[:])
}
func CSRF(session string) string { return Hash("unicore.csrf.v1:" + session) }
func Equal(a, b string) bool {
	return len(a) == len(b) && subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}
func HashPassword(value string) (string, error) {
	if len(value) < 12 || len(value) > 128 {
		return "", ErrInput
	}
	var salt [16]byte
	if _, err := rand.Read(salt[:]); err != nil {
		return "", err
	}
	key := argon2.IDKey([]byte(value), salt[:], 3, 64*1024, 2, 32)
	return "$argon2id$v=19$m=65536,t=3,p=2$" + base64.RawStdEncoding.EncodeToString(salt[:]) + "$" + base64.RawStdEncoding.EncodeToString(key), nil
}
func VerifyPassword(encoded, password string) bool {
	if len(password) > 128 {
		return false
	}
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" || parts[2] != "v=19" || parts[3] != "m=65536,t=3,p=2" {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) != 16 {
		return false
	}
	expected, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(expected) != 32 {
		return false
	}
	actual := argon2.IDKey([]byte(password), salt, 3, 64*1024, 2, 32)
	return subtle.ConstantTimeCompare(actual, expected) == 1
}

type bucket struct {
	count   int
	expires time.Time
}
type Limiter struct {
	mu    sync.Mutex
	items map[string]bucket
}

func NewLimiter() *Limiter { return &Limiter{items: map[string]bucket{}} }
func (l *Limiter) Allow(key string, max int, window time.Duration) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	if len(l.items) > 10000 {
		for key, item := range l.items {
			if now.After(item.expires) {
				delete(l.items, key)
			}
		}
	}
	b, ok := l.items[key]
	if !ok || now.After(b.expires) {
		if len(l.items) >= 20000 {
			return false
		}
		b = bucket{expires: now.Add(window)}
	}
	if b.count >= max {
		return false
	}
	b.count++
	l.items[key] = b
	return true
}

// Captchas are one-use, short-lived and memory-bounded. Answers never enter API data.
type Captchas struct {
	mu    sync.Mutex
	items map[string]challenge
}
type challenge struct {
	hash    string
	expires time.Time
}

func NewCaptchas() *Captchas { return &Captchas{items: map[string]challenge{}} }
func (c *Captchas) Create() (id, image string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	for key, item := range c.items {
		if now.After(item.expires) {
			delete(c.items, key)
		}
	}
	if len(c.items) >= 2000 {
		return "", ""
	}
	var digits [4]byte
	if _, err := rand.Read(digits[:]); err != nil {
		panic(err)
	}
	answer := ""
	glyphs := ""
	for i, digit := range digits {
		d := strconv.Itoa(int(digit) % 10)
		answer += d
		glyphs += fmt.Sprintf(`<text x="%d" y="32" transform="rotate(%d %d 26)">%s</text>`, 14+i*31, int(digit)%25-12, 14+i*31, d)
	}
	id = Token()
	c.items[id] = challenge{Hash(answer), now.Add(2 * time.Minute)}
	svg := `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="44"><rect width="144" height="44" fill="#f0eeff"/><path d="M0 15L144 28M0 37L144 8" stroke="#b8b0ee"/><g fill="#5147a0" font-family="monospace" font-size="27">` + glyphs + `</g></svg>`
	return id, "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(svg))
}
func (c *Captchas) Consume(id, answer string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	item, ok := c.items[id]
	delete(c.items, id)
	return ok && time.Now().Before(item.expires) && Equal(item.hash, Hash(strings.TrimSpace(answer)))
}
