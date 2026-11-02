// Author: yunnuo <ymz@ebox.vip>
// Description: Consecutive failures, expiry, success reset and IP isolation without wall-clock sleeps.
package platform

import (
	"testing"
	"time"
)

func TestLoginIPBan(t *testing.T) {
	var g loginGuard
	now := time.Unix(100000, 0)
	for i := 0; i < 3; i++ {
		g.record("192.0.2.1", false, 3, 15*time.Minute, now)
	}
	if g.check("192.0.2.1", now) || !g.check("192.0.2.2", now) {
		t.Fatal("ban or isolation failed")
	}
	if !g.check("192.0.2.1", now.Add(15*time.Minute)) {
		t.Fatal("ban did not expire")
	}
	later := now.Add(16 * time.Minute)
	g.record("192.0.2.1", false, 3, time.Minute, later)
	g.record("192.0.2.1", true, 3, time.Minute, later)
	for i := 0; i < 2; i++ {
		g.record("192.0.2.1", false, 3, time.Minute, later)
	}
	if !g.check("192.0.2.1", later) {
		t.Fatal("successful login did not reset failures")
	}
	g.record("192.0.2.1", false, 3, time.Minute, later)
	if g.check("192.0.2.1", later) {
		t.Fatal("new failure sequence did not ban")
	}
}
