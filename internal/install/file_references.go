//go:build !no_notes

// Author: yunnuo <ymz@ebox.vip>
// Description: Platform composition for the enabled Notes file-reference checker.
package install

import (
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/modules/notes/storage/notessql"
)

func notesFileReferenceChecker(store *sqlstore.Store) files.ReferenceChecker {
	return &notessql.Repository{Store: store}
}
