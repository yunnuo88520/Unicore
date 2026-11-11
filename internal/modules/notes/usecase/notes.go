// Author: yunnuo <ymz@ebox.vip>
// Description: Notes orchestration depends only on contracts, domain rules and repository/attachment ports.
package usecase

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/yunnuo/unicore/internal/contracts"
	coredomain "github.com/yunnuo/unicore/internal/domain"
	"github.com/yunnuo/unicore/internal/modules/notes/domain"
)

var ErrNoteNotFound = errors.New("note not found")
var ErrNoteConflict = errors.New("note version conflict")

type NoteRepository interface {
	List(context.Context, string, contracts.NoteQuery, NoteVisibility) (contracts.NoteList, error)
	Read(context.Context, string, string, NoteVisibility) (contracts.NoteEntry, error)
	Create(context.Context, string, contracts.NoteInput) (contracts.NoteEntry, error)
	Update(context.Context, string, string, contracts.NoteUpdate) (contracts.NoteEntry, error)
	Delete(context.Context, string, string, int) error
}

// NoteVisibility is the optional row-level data scope for list queries: the
// zero value keeps the personal-only behaviour, All disables owner filtering,
// Scopes lists additional scope keys (realm/userID) visible to the session.
type NoteVisibility struct {
	All    bool
	Scopes []string
}

type Notes struct {
	Repo        NoteRepository
	Attachments func(context.Context, string, string) error
}

func (n *Notes) List(ctx context.Context, scope string, q contracts.NoteQuery, visibility NoteVisibility) (contracts.NoteList, error) {
	if scope == "" || !coredomain.ValidPage(q.Page, 20) || utf8.RuneCountInString(q.Search) > 128 || (q.Status != "" && q.Status != "open" && q.Status != "done") || (q.Sort != "title" && q.Sort != "updated_at") || (q.Direction != "asc" && q.Direction != "desc") {
		return contracts.NoteList{}, domain.ErrNoteInvalid
	}
	return n.Repo.List(ctx, scope, q, visibility)
}

// Read resolves one note inside the session's visibility. It backs attachment
// authorization: a file may only ride on a note the session can actually read.
func (n *Notes) Read(ctx context.Context, scope, id string, visibility NoteVisibility) (contracts.NoteEntry, error) {
	if scope == "" || id == "" || len(id) > 64 {
		return contracts.NoteEntry{}, domain.ErrNoteInvalid
	}
	return n.Repo.Read(ctx, scope, id, visibility)
}
func (n *Notes) validate(ctx context.Context, scope string, input contracts.NoteInput) error {
	if scope == "" {
		return domain.ErrNoteInvalid
	}
	// Attachment ids are optional on creation: an omitted list is a plain note.
	attachments := []string{}
	if input.AttachmentIds != nil {
		attachments = *input.AttachmentIds
	}
	if err := domain.ValidateNote(input.Title, input.Body, input.Status, attachments); err != nil {
		return err
	}
	for _, id := range attachments {
		if n.Attachments == nil {
			return domain.ErrNoteInvalid
		}
		if err := n.Attachments(ctx, scope, id); err != nil {
			return domain.ErrNoteInvalid
		}
	}
	return nil
}
func (n *Notes) Create(ctx context.Context, scope string, input contracts.NoteInput) (contracts.NoteEntry, error) {
	input.Title = strings.TrimSpace(input.Title)
	if err := n.validate(ctx, scope, input); err != nil {
		return contracts.NoteEntry{}, err
	}
	return n.Repo.Create(ctx, scope, input)
}
func (n *Notes) Update(ctx context.Context, scope, id string, input contracts.NoteUpdate) (contracts.NoteEntry, error) {
	input.Title = strings.TrimSpace(input.Title)
	if input.Version < 1 || id == "" || len(id) > 64 {
		return contracts.NoteEntry{}, domain.ErrNoteInvalid
	}
	if err := n.validate(ctx, scope, contracts.NoteInput{Title: input.Title, Body: input.Body, Status: input.Status, AttachmentIds: &input.AttachmentIds}); err != nil {
		return contracts.NoteEntry{}, err
	}
	return n.Repo.Update(ctx, scope, id, input)
}
func (n *Notes) Delete(ctx context.Context, scope, id string, version int) error {
	if scope == "" || id == "" || len(id) > 64 || version < 1 {
		return domain.ErrNoteInvalid
	}
	return n.Repo.Delete(ctx, scope, id, version)
}
func NoteID() string { return coredomain.NewEntity(time.Now()).ID }
