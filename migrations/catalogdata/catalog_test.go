// Author: yunnuo <ymz@ebox.vip>
// Description: Cross-check generated Go descriptors, JSON projections and exact SQL file bytes without a database.
package catalogdata

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestGeneratedDescriptor(t *testing.T) {
	raw, err := os.ReadFile("../metadata.gen.json")
	if err != nil {
		t.Fatal(err)
	}
	var projected Descriptor
	if err = json.Unmarshal(raw, &projected); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(projected, Catalog) {
		t.Fatal("Go/JSON descriptor drift")
	}
	for _, namespace := range Catalog.Namespaces {
		for _, migration := range namespace.Migrations {
			for dialect, file := range migration.Files {
				bytes, err := os.ReadFile(filepath.Join("..", file.Path))
				if err != nil {
					t.Fatal(err)
				}
				if len(bytes) != file.Bytes || fmt.Sprintf("%x", sha256.Sum256(bytes)) != file.Checksum {
					t.Fatalf("raw-byte checksum drift: %s", file.Path)
				}
				if namespace.Id == Catalog.GenerationAnchor.Namespace && migration.Version == Catalog.GenerationAnchor.Version && file.Checksum != Catalog.GenerationAnchor.Checksums[dialect] {
					t.Fatal("generation anchor drift")
				}
			}
		}
	}
	cli := Catalog.Profiles["cli"]
	if len(cli.Dialects)+len(cli.Namespaces)+len(cli.Order)+len(cli.Levels) != 0 {
		t.Fatal("CLI must have no database metadata")
	}
}
