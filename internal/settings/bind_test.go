// Author: yunnuo <ymz@ebox.vip>
// Description: Typed binding covers parse failures, defaults, missing keys and malformed targets.
package settings

import (
	"strings"
	"testing"
)

type bindFixture struct {
	Name    string `setting:"site.name"`
	Enabled bool   `setting:"security.login_captcha" default:"true"`
	Hours   int    `setting:"security.session_hours" default:"24"`
}

func TestBindParsesTypedValues(t *testing.T) {
	var target bindFixture
	if err := Bind(map[string]string{"site.name": "Unicore", "security.login_captcha": "false", "security.session_hours": "36"}, &target); err != nil {
		t.Fatal(err)
	}
	if target.Name != "Unicore" || target.Enabled || target.Hours != 36 {
		t.Fatalf("unexpected bind result: %+v", target)
	}
}

func TestBindAppliesDefaultsForMissingKeys(t *testing.T) {
	var target bindFixture
	if err := Bind(map[string]string{"site.name": "Unicore"}, &target); err != nil {
		t.Fatal(err)
	}
	if !target.Enabled || target.Hours != 24 {
		t.Fatalf("defaults not applied: %+v", target)
	}
}

func TestBindLeavesZeroValuesWithoutDefaults(t *testing.T) {
	var target struct {
		Missing int `setting:"no.such_key"`
	}
	if err := Bind(map[string]string{}, &target); err != nil {
		t.Fatal(err)
	}
	if target.Missing != 0 {
		t.Fatalf("expected zero value, got %d", target.Missing)
	}
}

func TestBindReportsParseFailures(t *testing.T) {
	var target bindFixture
	err := Bind(map[string]string{"security.session_hours": "soon"}, &target)
	if err == nil || !strings.Contains(err.Error(), "security.session_hours") {
		t.Fatalf("want keyed parse error, got %v", err)
	}
	err = Bind(map[string]string{"security.login_captcha": "maybe"}, &target)
	if err == nil || !strings.Contains(err.Error(), "security.login_captcha") {
		t.Fatalf("want keyed bool error, got %v", err)
	}
}

func TestBindRejectsMalformedTargets(t *testing.T) {
	var untagged struct {
		Name string
	}
	if err := Bind(map[string]string{}, &untagged); err == nil {
		t.Fatal("untagged fields must be rejected")
	}
	if err := Bind(map[string]string{}, bindFixture{}); err == nil {
		t.Fatal("non-pointer targets must be rejected")
	}
	var nilPointer *bindFixture
	if err := Bind(map[string]string{}, nilPointer); err == nil {
		t.Fatal("nil targets must be rejected")
	}
	var unsupported struct {
		Ratio float64 `setting:"x.ratio"`
	}
	if err := Bind(map[string]string{"x.ratio": "1.5"}, &unsupported); err == nil {
		t.Fatal("unsupported kinds must be rejected")
	}
}

func TestSessionPolicyBindsFromRegistryValues(t *testing.T) {
	var policy SessionPolicy
	if err := Bind(Defaults("web-platform"), &policy); err != nil {
		t.Fatal(err)
	}
	if !policy.LoginCaptcha || policy.SessionHours != 24 {
		t.Fatalf("registry defaults bind wrong: %+v", policy)
	}
}
