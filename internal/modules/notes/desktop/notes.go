//go:build !no_notes

// Author: yunnuo <ymz@ebox.vip>
// Description: Native notes capability for the desktop bridge: same use cases and DTOs without platform or HTTP dependencies.
package desktop

import (
	"context"
	"errors"
	"github.com/yunnuo/unicore/internal/files"

	bridge "github.com/yunnuo/unicore/internal/adapter/desktop"
	"github.com/yunnuo/unicore/internal/adapter/presenter"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/modules/notes/domain"
	"github.com/yunnuo/unicore/internal/modules/notes/storage/notessql"
	"github.com/yunnuo/unicore/internal/modules/notes/usecase"
)

func init() {
	bridge.RegisterBridgeContribution("notes", func(b *bridge.Bridge, deps bridge.BridgeDeps) {
		if deps.Store == nil {
			return
		}
		notes := &usecase.Notes{Repo: &notessql.Repository{Store: deps.Store}}
		if deps.Files != nil {
			notes.Attachments = func(ctx context.Context, _ string, id string) error {
				return deps.Files.ValidateAttachment(ctx, files.Actor{ID: "local", Realm: "local"}, id)
			}
		}
		b.AttachNotes(&Responses{notes: notes})
	})
}

// Responses adapts the notes use case to the bridge response shapes, including
// the short error-code mapping the native surface guarantees.
type Responses struct {
	notes *usecase.Notes
}

func noteCode(err error) string {
	switch {
	case err == nil:
		return "OK"
	case errors.Is(err, domain.ErrNoteInvalid):
		return "NOTE_INVALID"
	case errors.Is(err, usecase.ErrNoteNotFound):
		return "NOTE_NOT_FOUND"
	case errors.Is(err, usecase.ErrNoteConflict):
		return "NOTE_CONFLICT"
	default:
		return "INTERNAL_ERROR"
	}
}

func (r *Responses) List(q contracts.NoteQuery) contracts.NoteListResponse {
	data, err := r.notes.List(context.Background(), "local", q, usecase.NoteVisibility{})
	code := noteCode(err)
	return contracts.NoteListResponse{Code: code, Message: contracts.ErrorCatalog[code].Message, Data: data, RequestID: presenter.RequestID()}
}
func (r *Responses) Create(in contracts.NoteInput) contracts.NoteResponse {
	data, err := r.notes.Create(context.Background(), "local", in)
	code := noteCode(err)
	return contracts.NoteResponse{Code: code, Message: contracts.ErrorCatalog[code].Message, Data: data, RequestID: presenter.RequestID()}
}
func (r *Responses) Update(id string, in contracts.NoteUpdate) contracts.NoteResponse {
	data, err := r.notes.Update(context.Background(), "local", id, in)
	code := noteCode(err)
	return contracts.NoteResponse{Code: code, Message: contracts.ErrorCatalog[code].Message, Data: data, RequestID: presenter.RequestID()}
}
func (r *Responses) Delete(id string, in contracts.NoteVersion) contracts.ActionResultResponse {
	err := r.notes.Delete(context.Background(), "local", id, in.Version)
	code := noteCode(err)
	return contracts.ActionResultResponse{Code: code, Message: contracts.ErrorCatalog[code].Message, Data: contracts.ActionResult{Success: err == nil}, RequestID: presenter.RequestID()}
}
