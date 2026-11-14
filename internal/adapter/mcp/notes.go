//go:build !no_notes

// Author: yunnuo <ymz@ebox.vip>
// Description: Notes read-only MCP sample tools: the module owns the data, the adapter projects the principal scope onto the use case.
package mcp

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/mcp"
	"github.com/yunnuo/unicore/internal/modules/notes/domain"
	notesnotessql "github.com/yunnuo/unicore/internal/modules/notes/storage/notessql"
	notesusecase "github.com/yunnuo/unicore/internal/modules/notes/usecase"
	"github.com/yunnuo/unicore/internal/platform/mcpauth"
	"github.com/yunnuo/unicore/internal/runtime"
)

// Both tools bind the delegable notes read operation: the authorizer grants
// them with exactly the listNotes surface, and the use case applies the same
// row-level visibility as the HTTP surface.
const notesReadOperation = "listNotes"

// The write tool binds the delegable notes update operation; its permission
// points and operation grant ride the same authorizer as the HTTP surface.
const notesWriteOperation = "updateNote"

type notesDeps struct {
	manager *install.Manager
}

// notesSession rebuilds the module service from the current request: the
// store, the actor scope and the row-level visibility resolve per call and
// are never cached across requests.
func (d notesDeps) session(ctx context.Context, principal mcp.Principal) (*notesusecase.Notes, string, notesusecase.NoteVisibility, error) {
	store, _, _, profile := d.manager.Services()
	if store == nil || profile != runtime.WebPlatform {
		return nil, "", notesusecase.NoteVisibility{}, mcp.ErrDisabled("storage unavailable")
	}
	actor, ok := principal.(*mcpauth.Principal)
	if !ok {
		return nil, "", notesusecase.NoteVisibility{}, mcp.ErrInternal("unexpected principal implementation")
	}
	filter, err := actor.Scope(ctx, "notes:access")
	if err != nil {
		return nil, "", notesusecase.NoteVisibility{}, mcp.ErrForbidden("data scope unavailable")
	}
	service := &notesusecase.Notes{Repo: &notesnotessql.Repository{Store: store}}
	return service, "user/" + actor.ActorID(), notesusecase.VisibilityFor("user", filter.All, filter.UserIDs), nil
}

type notesSearchInput struct {
	Search *string `json:"search"`
	Status *string `json:"status"`
	Page   *int    `json:"page"`
}

type notesGetInput struct {
	ID string `json:"id"`
}

type notesUpdateInput struct {
	ID            string   `json:"id"`
	Title         string   `json:"title"`
	Body          string   `json:"body"`
	Status        string   `json:"status"`
	AttachmentIds []string `json:"attachment_ids"`
	Version       int      `json:"version"`
}

func notesError(err error) error {
	switch {
	case errors.Is(err, domain.ErrNoteInvalid):
		return mcp.BusinessError("NOTE_INVALID", "note query is invalid")
	case errors.Is(err, notesusecase.ErrNoteNotFound):
		return mcp.BusinessError("NOTE_NOT_FOUND", "note not found")
	case errors.Is(err, notesusecase.ErrNoteConflict):
		return mcp.BusinessError("NOTE_CONFLICT", "note version conflict")
	default:
		return err
	}
}

// RegisterNotes contributes the Notes read-only sample tools; the no_notes
// build provides an empty contribution instead of this file.
func RegisterNotes(registry *mcp.Registry, manager *install.Manager, operations mcp.OperationResolver) error {
	deps := notesDeps{manager: manager}
	if err := registry.Register(mcp.ToolDefinition{
		Name: "notes.search", Module: "notes", Version: "1.0", ImplVersion: "1",
		TitleZh: "搜索笔记", TitleEn: "Search notes",
		DescriptionZh: "按关键字与状态搜索当前调用者可见的笔记，返回分页摘要；范围与网页端一致",
		DescriptionEn: "Search notes visible to the caller by keyword and status with a paged summary; the scope matches the web surface",
		InputSchema: json.RawMessage(`{"type":"object","additionalProperties":false,"properties":{
			"search":{"type":"string","maxLength":128,"description":"关键字；留空列出全部"},
			"status":{"type":"string","maxLength":8,"enum":["open","done"],"description":"状态过滤"},
			"page":{"type":"integer","minimum":1,"maximum":1000,"description":"页码，从 1 开始"}}}`),
		OutputSchema: json.RawMessage(`{"type":"object","additionalProperties":false,"properties":{
			"total":{"type":"integer","maximum":10000000},
			"page":{"type":"integer","maximum":1000},
			"page_size":{"type":"integer","maximum":100},
			"items":{"type":"array","maxItems":100,"items":{"type":"object","additionalProperties":false,"properties":{
				"id":{"type":"string","maxLength":64},
				"title":{"type":"string","maxLength":120},
				"status":{"type":"string","maxLength":8},
				"version":{"type":"integer","maximum":2000000000},
				"updated_at":{"type":"integer","maximum":20000000000000}}}}}}`),
		OperationIDs: []string{notesReadOperation}, Effect: mcp.EffectRead, Confirmation: mcp.ConfirmationNone,
		Handler: mcp.ToolHandlerFunc(func(ctx context.Context, principal mcp.Principal, arguments json.RawMessage) (any, error) {
			service, scope, visibility, err := deps.session(ctx, principal)
			if err != nil {
				return nil, err
			}
			var input notesSearchInput
			if err := json.Unmarshal(arguments, &input); err != nil {
				return nil, mcp.ErrInput("arguments are not valid")
			}
			query := contracts.NoteQuery{Search: derefString(input.Search), Status: derefString(input.Status), Sort: "updated_at", Direction: "desc", Page: derefInt(input.Page, 1)}
			list, err := service.List(ctx, scope, query, visibility)
			if err != nil {
				return nil, notesError(err)
			}
			items := []map[string]any{}
			for _, entry := range list.Items {
				items = append(items, map[string]any{"id": entry.ID, "title": entry.Title, "status": entry.Status, "version": entry.Version, "updated_at": entry.UpdatedAt})
			}
			return map[string]any{"total": list.Total, "page": list.Page, "page_size": list.PageSize, "items": items}, nil
		}),
	}, operations); err != nil {
		return err
	}
	if err := registry.Register(mcp.ToolDefinition{
		Name: "notes.get", Module: "notes", Version: "1.0", ImplVersion: "1",
		TitleZh: "读取笔记", TitleEn: "Read note",
		DescriptionZh: "按 ID 读取一条当前调用者可见的笔记全文",
		DescriptionEn: "Read one note visible to the caller by identifier",
		InputSchema: json.RawMessage(`{"type":"object","additionalProperties":false,"properties":{
			"id":{"type":"string","maxLength":64,"description":"笔记 ID"}},"required":["id"]}`),
		OutputSchema: json.RawMessage(`{"type":"object","additionalProperties":false,"properties":{
			"id":{"type":"string","maxLength":64},
			"title":{"type":"string","maxLength":120},
			"body":{"type":"string","maxLength":5000},
			"status":{"type":"string","maxLength":8},
			"version":{"type":"integer","maximum":2000000000},
			"attachment_ids":{"type":"array","maxItems":5,"items":{"type":"string","maxLength":80}},
			"created_at":{"type":"integer","maximum":20000000000000},
			"updated_at":{"type":"integer","maximum":20000000000000}}}`),
		OperationIDs: []string{notesReadOperation}, Effect: mcp.EffectRead, Confirmation: mcp.ConfirmationNone,
		Handler: mcp.ToolHandlerFunc(func(ctx context.Context, principal mcp.Principal, arguments json.RawMessage) (any, error) {
			service, scope, visibility, err := deps.session(ctx, principal)
			if err != nil {
				return nil, err
			}
			var input notesGetInput
			if err := json.Unmarshal(arguments, &input); err != nil {
				return nil, mcp.ErrInput("arguments are not valid")
			}
			entry, err := service.Read(ctx, scope, input.ID, visibility)
			if err != nil {
				return nil, notesError(err)
			}
			attachments := []string{}
			if entry.AttachmentIds != nil {
				attachments = entry.AttachmentIds
			}
			return map[string]any{"id": entry.ID, "title": entry.Title, "body": entry.Body, "status": entry.Status, "version": entry.Version, "attachment_ids": attachments, "created_at": entry.CreatedAt, "updated_at": entry.UpdatedAt}, nil
		}),
	}, operations); err != nil {
		return err
	}
	return registry.Register(mcp.ToolDefinition{
		Name: "notes.update", Module: "notes", Version: "1.0", ImplVersion: "1",
		TitleZh: "更新笔记", TitleEn: "Update note",
		DescriptionZh: "按 ID 与版本号更新当前调用者自己的笔记；版本冲突时拒绝，写效果需要开放写阶段并携带 mcp.write 授权",
		DescriptionEn: "Update one note owned by the caller by identifier and version; conflicts are refused, and write effects require the write phase plus the mcp.write grant",
		InputSchema: json.RawMessage(`{"type":"object","additionalProperties":false,"properties":{
			"id":{"type":"string","maxLength":64,"description":"笔记 ID"},
			"title":{"type":"string","minLength":1,"maxLength":120},
			"body":{"type":"string","maxLength":5000},
			"status":{"type":"string","maxLength":8,"enum":["open","done"]},
			"version":{"type":"integer","minimum":1,"maximum":2000000000,"description":"乐观锁版本号"}},"required":["id","title","body","status","version"]}`),
		OutputSchema: json.RawMessage(`{"type":"object","additionalProperties":false,"properties":{
			"id":{"type":"string","maxLength":64},
			"title":{"type":"string","maxLength":120},
			"status":{"type":"string","maxLength":8},
			"version":{"type":"integer","maximum":2000000000},
			"updated_at":{"type":"integer","maximum":20000000000000}},"required":["id","title","status","version","updated_at"]}`),
		OperationIDs: []string{notesWriteOperation}, Effect: mcp.EffectWrite, Confirmation: mcp.ConfirmationRequired,
		Handler: mcp.ToolHandlerFunc(func(ctx context.Context, principal mcp.Principal, arguments json.RawMessage) (any, error) {
			service, scope, _, err := deps.session(ctx, principal)
			if err != nil {
				return nil, err
			}
			var input notesUpdateInput
			if err := json.Unmarshal(arguments, &input); err != nil {
				return nil, mcp.ErrInput("arguments are not valid")
			}
			entry, err := service.Update(ctx, scope, input.ID, contracts.NoteUpdate{Title: input.Title, Body: input.Body, Status: input.Status, AttachmentIds: input.AttachmentIds, Version: input.Version})
			if err != nil {
				return nil, notesError(err)
			}
			return map[string]any{"id": entry.ID, "title": entry.Title, "status": entry.Status, "version": entry.Version, "updated_at": entry.UpdatedAt}, nil
		}),
	}, operations)
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func derefInt(value *int, fallback int) int {
	if value == nil {
		return fallback
	}
	return *value
}
