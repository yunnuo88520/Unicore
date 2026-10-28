// Author: yunnuo <ymz@ebox.vip>
// Description: Notes orchestration depends only on contracts, domain rules and repository/attachment ports.
package usecase

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/domain"
	"strings"
	"unicode/utf8"
)

var ErrNoteNotFound = errors.New("note not found")
var ErrNoteConflict = errors.New("note version conflict")

type NoteRepository interface {
	List(context.Context, string, contracts.NoteQuery) (contracts.NoteList, error)
	Create(context.Context, string, contracts.NoteInput) (contracts.NoteEntry, error)
	Update(context.Context, string, string, contracts.NoteUpdate) (contracts.NoteEntry, error)
	Delete(context.Context, string, string, int) error
}
type Notes struct {
	Repo        NoteRepository
	Attachments func(context.Context, string, string) error
}

func (n *Notes) List(ctx context.Context, scope string, q contracts.NoteQuery) (contracts.NoteList, error) {
	if scope == "" || q.Page < 1 || q.Page > 100000 || utf8.RuneCountInString(q.Search) > 128 || (q.Status != "" && q.Status != "open" && q.Status != "done") || (q.Sort != "title" && q.Sort != "updated_at") || (q.Direction != "asc" && q.Direction != "desc") {
		return contracts.NoteList{}, domain.ErrNoteInvalid
	}
	return n.Repo.List(ctx, scope, q)
}
func (n *Notes) validate(ctx context.Context, scope string, input contracts.NoteInput) error {
	if scope == "" {
		return domain.ErrNoteInvalid
	}
	if err := domain.ValidateNote(input.Title, input.Body, input.Status, input.AttachmentIds); err != nil {
		return err
	}
	for _, id := range input.AttachmentIds {
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
	if err := n.validate(ctx, scope, contracts.NoteInput{Title: input.Title, Body: input.Body, Status: input.Status, AttachmentIds: input.AttachmentIds}); err != nil {
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
func NoteID() string {
	var raw [24]byte
	if _, err := rand.Read(raw[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(raw[:])
}
