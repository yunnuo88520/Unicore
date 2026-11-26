//go:build no_notes

// Author: yunnuo <ymz@ebox.vip>
// Description: Standalone files have no Notes reference source when that edition is excluded.
package filelocal

import (
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/files"
)

func localFileReferenceCheckers(*sqlstore.Store) []files.ReferenceChecker { return nil }
