//go:build no_notes

// Author: yunnuo <ymz@ebox.vip>
// Description: No Notes references are assembled when the Notes edition is excluded.
package install

import (
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/files"
)

func notesFileReferenceChecker(*sqlstore.Store) files.ReferenceChecker { return nil }
