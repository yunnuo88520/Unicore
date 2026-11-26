// Author: yunnuo <ymz@ebox.vip>
// Description: Notes-owned file reference lookup, kept outside the generic file repository.
package notessql

import (
	"context"
	"strings"

	"github.com/yunnuo/unicore/internal/files"
)

var _ files.ReferenceChecker = (*Repository)(nil)

func (r *Repository) Referenced(ctx context.Context, fileID string) (bool, error) {
	rows, err := r.Store.Rows(ctx, r.Store.DB, "SELECT attachment_ids FROM unicore_example_notes WHERE attachment_ids LIKE ?", "%\""+strings.ReplaceAll(fileID, "\"", "")+"\"%")
	if err != nil {
		return false, err
	}
	defer rows.Close()
	for rows.Next() {
		var attachmentIDs string
		if err = rows.Scan(&attachmentIDs); err != nil {
			return false, err
		}
		if strings.Contains(attachmentIDs, `"`+fileID+`"`) {
			return true, nil
		}
	}
	return false, rows.Err()
}
