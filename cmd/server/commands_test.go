// Author: yunnuo <ymz@ebox.vip>
// Description: Management commands operate without opening an installation or database.
package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yunnuo/unicore/assets/theme"
)

func TestManagement(t *testing.T) {
	t.Setenv("APP_DATA_DIR", filepath.Join(t.TempDir(), "must-not-exist"))
	for _, command := range []string{"help", "--help", "-h", "unicorehelp", "version"} {
		var output bytes.Buffer
		if handled, err := management([]string{command}, &output); !handled || err != nil || !strings.Contains(output.String(), theme.Current.Brand.Name) {
			t.Fatal(command, handled, err, output.String())
		}
	}
	if _, err := os.Stat(os.Getenv("APP_DATA_DIR")); !os.IsNotExist(err) {
		t.Fatal("management opened an instance")
	}
	for _, command := range [][]string{{"config", "generate"}, {"generate-config"}} {
		path := filepath.Join(t.TempDir(), "unicore.json")
		args := append(command, "--output", path)
		var output bytes.Buffer
		if handled, err := management(args, &output); !handled || err != nil {
			t.Fatal(handled, err)
		}
		if _, err := management(args, &output); err == nil {
			t.Fatal("configuration overwritten")
		}
	}
	for _, args := range [][]string{{"config"}, {"config", "delete"}, {"generate-config", "unexpected"}} {
		if handled, err := management(args, &bytes.Buffer{}); !handled || err == nil {
			t.Fatal(args, handled, err)
		}
	}
	if handled, _ := management(nil, &bytes.Buffer{}); handled {
		t.Fatal("no-argument startup intercepted")
	}
	if handled, _ := management([]string{"--listen", "127.0.0.1:0"}, &bytes.Buffer{}); handled {
		t.Fatal("startup flags intercepted")
	}
}

func TestManagementUsesApplicationBrand(t *testing.T) {
	previous := theme.Current.Brand.Name
	t.Cleanup(func() { theme.Current.Brand.Name = previous })
	theme.Current.Brand.Name = "Derived Application"
	for _, command := range []string{"help", "version"} {
		var output bytes.Buffer
		if _, err := management([]string{command}, &output); err != nil || !strings.Contains(output.String(), "Derived Application") {
			t.Fatal(command, err, output.String())
		}
	}
}
