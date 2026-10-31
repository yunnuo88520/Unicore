// Author: yunnuo <ymz@ebox.vip>
package cliadapter

import (
	"bytes"
	"strings"
	"testing"

	"github.com/yunnuo/unicore/internal/bootstrap"
)

func TestStdinAndInvalidInput(t *testing.T) {
	cmd := New(bootstrap.Core())
	var output bytes.Buffer
	cmd.SetIn(strings.NewReader("hello world"))
	cmd.SetOut(&output)
	cmd.SetArgs([]string{"execute"})
	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output.String(), `"characters":11`) {
		t.Fatal(output.String())
	}
	cmd = New(bootstrap.Core())
	cmd.SetArgs([]string{"execute", "--text", ""})
	if err := cmd.Execute(); err == nil {
		t.Fatal("explicit blank flag must fail without reading stdin")
	}
}
