// Author: yunnuo <ymz@ebox.vip>
// Description: Verify the TOTP implementation against independent RFC 4226/6238 vectors and time windows.
package platform

import "testing"

func TestTOTPRFCVectors(t *testing.T) {
	const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
	for _, item := range []struct {
		now  int64
		code string
		step int
	}{
		{59, "287082", 1},
		{1111111109, "081804", 37037036},
		{1111111111, "050471", 37037037},
		{1234567890, "005924", 41152263},
		{2000000000, "279037", 66666666},
		{20000000000, "353130", 666666666},
	} {
		if step := TOTPStep(secret, item.code, item.now); step != item.step {
			t.Fatalf("RFC counter %d: got %d", item.step, step)
		}
	}
	if TOTPStep(secret, "287082", 120) != -1 {
		t.Fatal("expired code accepted")
	}
	for _, code := range []string{"", "28708", "x87082", "２８７０８２", "2870820"} {
		if TOTPStep(secret, code, 59) != -1 {
			t.Fatal("invalid code accepted")
		}
	}
	if TOTPStep("not a base32 secret", "287082", 59) != -1 {
		t.Fatal("invalid secret accepted")
	}
}
