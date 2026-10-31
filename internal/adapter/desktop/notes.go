// Author: yunnuo <ymz@ebox.vip>
// Description: Native notes use the same use cases and DTOs without platform or HTTP dependencies.
package desktop

import (
	"context"
	"errors"
	"github.com/yunnuo/unicore/internal/adapter/presenter"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/domain"
	"github.com/yunnuo/unicore/internal/usecase"
)

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
func (b *Bridge) ListNotes(q contracts.NoteQuery) contracts.NoteListResponse {
	if b.notes == nil {
		return contracts.NoteListResponse{Code: "NOT_AVAILABLE", Message: "笔记存储未初始化", RequestID: presenter.RequestID()}
	}
	data, err := b.notes.List(context.Background(), "local", q)
	code := noteCode(err)
	return contracts.NoteListResponse{Code: code, Message: contracts.ErrorCatalog[code].Message, Data: data, RequestID: presenter.RequestID()}
}
func (b *Bridge) CreateNote(in contracts.NoteInput) contracts.NoteResponse {
	if b.notes == nil {
		return contracts.NoteResponse{Code: "NOT_AVAILABLE", Message: "笔记存储未初始化", RequestID: presenter.RequestID()}
	}
	data, err := b.notes.Create(context.Background(), "local", in)
	code := noteCode(err)
	return contracts.NoteResponse{Code: code, Message: contracts.ErrorCatalog[code].Message, Data: data, RequestID: presenter.RequestID()}
}
func (b *Bridge) UpdateNote(id string, in contracts.NoteUpdate) contracts.NoteResponse {
	if b.notes == nil {
		return contracts.NoteResponse{Code: "NOT_AVAILABLE", Message: "笔记存储未初始化", RequestID: presenter.RequestID()}
	}
	data, err := b.notes.Update(context.Background(), "local", id, in)
	code := noteCode(err)
	return contracts.NoteResponse{Code: code, Message: contracts.ErrorCatalog[code].Message, Data: data, RequestID: presenter.RequestID()}
}
func (b *Bridge) DeleteNote(id string, in contracts.NoteVersion) contracts.ActionResultResponse {
	if b.notes == nil {
		return contracts.ActionResultResponse{Code: "NOT_AVAILABLE", Message: "笔记存储未初始化", RequestID: presenter.RequestID()}
	}
	err := b.notes.Delete(context.Background(), "local", id, in.Version)
	code := noteCode(err)
	return contracts.ActionResultResponse{Code: code, Message: contracts.ErrorCatalog[code].Message, Data: contracts.ActionResult{Success: err == nil}, RequestID: presenter.RequestID()}
}
