// Author: yunnuo <ymz@ebox.vip>
package secret

import (
	"strings"
	"testing"
)

func TestEncryptedConfigurationAndWrongKey(t *testing.T) {
	store, err := Open(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	encrypted := store.Seal("private-test-configuration")
	if strings.Contains(encrypted, "private") {
		t.Fatal("plaintext leaked")
	}
	value, err := store.Open(encrypted)
	if err != nil || value != "private-test-configuration" {
		t.Fatal(err)
	}
	other, err := Open(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = other.Open(encrypted); err == nil {
		t.Fatal("wrong key accepted")
	}
}
