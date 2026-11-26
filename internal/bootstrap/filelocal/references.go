//go:build !no_notes

// Author: yunnuo <ymz@ebox.vip>
// Description: Standalone composition for Notes attachment reference protection.
package filelocal

import (
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/files"
	"github.com/yunnuo/unicore/internal/modules/notes/storage/notessql"
)

func localFileReferenceCheckers(store *sqlstore.Store) []files.ReferenceChecker {
	return []files.ReferenceChecker{&notessql.Repository{Store: store}}
}
