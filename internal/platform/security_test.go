// Author: yunnuo <ymz@ebox.vip>
package platform

import (
	"testing"
	"time"
)

func TestPasswordHashAndLimits(t *testing.T) {
	password := Token()
	hash, err := HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyPassword(hash, password) || VerifyPassword(hash, "incorrect") || VerifyPassword("$argon2id$v=19$m=999999999,t=3,p=2$x$x", password) {
		t.Fatal("hash verification failed")
	}
	if _, err := HashPassword("short"); err == nil {
		t.Fatal("short password accepted")
	}
}
func TestCaptchaOneUse(t *testing.T) {
	captchas := NewCaptchas()
	id, image := captchas.Create()
	if id == "" || image == "" {
		t.Fatal("missing captcha")
	}
	captchas.mu.Lock()
	captchas.items[id] = challenge{hash: Hash("012345"), expires: time.Now().Add(time.Minute)}
	captchas.mu.Unlock()
	if !captchas.Consume(id, "012345") || captchas.Consume(id, "012345") {
		t.Fatal("captcha was replayable")
	}
}
func TestLimiter(t *testing.T) {
	limiter := NewLimiter()
	if !limiter.Allow("key", 1, time.Minute) || limiter.Allow("key", 1, time.Minute) {
		t.Fatal("rate limit not enforced")
	}
}
