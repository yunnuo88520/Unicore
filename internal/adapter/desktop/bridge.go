// Author: yunnuo <ymz@ebox.vip>
// Description: Wails-independent bridge with the same DTOs and errors as HTTP.
package desktop

import (
	"context"
	"errors"
	"github.com/yunnuo/unicore/internal/files"
	"io"

	"github.com/yunnuo/unicore/internal/adapter/presenter"
	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/monitor"
	"github.com/yunnuo/unicore/internal/runtime"
	"github.com/yunnuo/unicore/internal/settings"
	"github.com/yunnuo/unicore/internal/updateport"
	"github.com/yunnuo/unicore/internal/usecase"
)

// NotesAPI is the native surface a notes bridge contribution provides; the
// bridge keeps only response shaping so the core never imports the module.
type NotesAPI interface {
	List(q contracts.NoteQuery) contracts.NoteListResponse
	Create(in contracts.NoteInput) contracts.NoteResponse
	Update(id string, in contracts.NoteUpdate) contracts.NoteResponse
	Delete(id string, in contracts.NoteVersion) contracts.ActionResultResponse
}

type Bridge struct {
	updates  updateport.API
	core     usecase.Executor
	settings *settings.Service
	files    *files.Service
	saveFile func(string, io.Reader) error
	notes    NotesAPI
	monitor  *monitor.Service
}

func New(core usecase.Executor) *Bridge { return &Bridge{core: core} }

func NewLocal(core usecase.Executor, service *settings.Service, store *sqlstore.Store, fileServices ...*files.Service) *Bridge {
	b := &Bridge{core: core, settings: service}
	if len(fileServices) > 0 {
		b.files = fileServices[0]
	}
	applyBridgeContributions(b, BridgeDeps{Core: core, Settings: service, Store: store, Files: b.files})
	return b
}

// AttachNotes installs a module-provided native notes capability.
func (b *Bridge) AttachNotes(api NotesAPI) { b.notes = api }

// SetMonitor installs the runtime monitor service assembled by the desktop
// composition root; without it the snapshot method reports NOT_AVAILABLE.
func (b *Bridge) SetMonitor(service *monitor.Service) { b.monitor = service }

// MonitorSnapshot mirrors the standalone local HTTP view with the same DTO:
// desktop has no HTTP service, so its HTTP card stays not-applicable.
func (b *Bridge) MonitorSnapshot() contracts.MonitorSnapshotResponse {
	requestID := presenter.RequestID()
	if b.monitor == nil {
		return contracts.MonitorSnapshotResponse{Code: "NOT_AVAILABLE", Message: "监控尚未就绪", RequestID: requestID}
	}
	return contracts.MonitorSnapshotResponse{Code: "OK", Data: b.monitor.Snapshot(context.Background()), RequestID: requestID}
}

// MonitorEvents mirrors the standalone local events view: the same in-process
// ring buffer, memory only, reset on restart.
func (b *Bridge) MonitorEvents() contracts.MonitorEventListResponse {
	requestID := presenter.RequestID()
	if b.monitor == nil {
		return contracts.MonitorEventListResponse{Code: "NOT_AVAILABLE", Message: "监控尚未就绪", RequestID: requestID}
	}
	return contracts.MonitorEventListResponse{Code: "OK", Data: b.monitor.Events(100), RequestID: requestID}
}

func notAvailable() string { return contracts.ErrorCatalog["NOT_AVAILABLE"].Message }

func (b *Bridge) ListNotes(q contracts.NoteQuery) contracts.NoteListResponse {
	if b.notes == nil {
		return contracts.NoteListResponse{Code: "NOT_AVAILABLE", Message: notAvailable(), RequestID: presenter.RequestID()}
	}
	return b.notes.List(q)
}
func (b *Bridge) CreateNote(in contracts.NoteInput) contracts.NoteResponse {
	if b.notes == nil {
		return contracts.NoteResponse{Code: "NOT_AVAILABLE", Message: notAvailable(), RequestID: presenter.RequestID()}
	}
	return b.notes.Create(in)
}
func (b *Bridge) UpdateNote(id string, in contracts.NoteUpdate) contracts.NoteResponse {
	if b.notes == nil {
		return contracts.NoteResponse{Code: "NOT_AVAILABLE", Message: notAvailable(), RequestID: presenter.RequestID()}
	}
	return b.notes.Update(id, in)
}
func (b *Bridge) DeleteNote(id string, in contracts.NoteVersion) contracts.ActionResultResponse {
	if b.notes == nil {
		return contracts.ActionResultResponse{Code: "NOT_AVAILABLE", Message: notAvailable(), RequestID: presenter.RequestID()}
	}
	return b.notes.Delete(id, in)
}

func (b *Bridge) Bootstrap() contracts.BootstrapResponse {
	data := runtime.Metadata(runtime.Desktop, "native")
	data.Capabilities.Updater = b.updates != nil
	if b.settings != nil {
		data.Stage = "M3b"
		data.Capabilities.Database = true
		data.Capabilities.Settings = false
	}
	return contracts.BootstrapResponse{Code: "OK", Data: data, RequestID: presenter.RequestID()}
}

func (b *Bridge) Settings() contracts.SettingsResponse {
	requestID := presenter.RequestID()
	if b.settings == nil {
		return contracts.SettingsResponse{Code: "NOT_AVAILABLE", Message: "设置存储未初始化", RequestID: requestID}
	}
	data, err := b.settings.List(context.Background())
	if err != nil {
		return contracts.SettingsResponse{Code: "INTERNAL_ERROR", Message: "无法读取设置", RequestID: requestID}
	}
	return contracts.SettingsResponse{Code: "OK", Data: data, RequestID: requestID}
}
func (b *Bridge) PatchSettings(input contracts.SettingPatch) contracts.SettingsResponse {
	requestID := presenter.RequestID()
	if b.settings == nil {
		return contracts.SettingsResponse{Code: "NOT_AVAILABLE", Message: "设置存储未初始化", RequestID: requestID}
	}
	data, err := b.settings.Patch(context.Background(), input, "desktop")
	if err != nil {
		code := "INTERNAL_ERROR"
		if errors.Is(err, settings.ErrInvalid) {
			code = "INVALID_INPUT"
		}
		return contracts.SettingsResponse{Code: code, Message: contracts.ErrorCatalog[code].Message, RequestID: requestID}
	}
	return contracts.SettingsResponse{Code: "OK", Data: data, RequestID: requestID}
}

func (b *Bridge) Execute(input contracts.ExecuteInput) contracts.ExecuteResponse {
	requestID := presenter.RequestID()
	output, err := b.core.Execute(context.Background(), input)
	if err != nil {
		failure := presenter.Error(err, requestID)
		return contracts.ExecuteResponse{Code: failure.Code, Message: failure.Message, RequestID: requestID}
	}
	return contracts.ExecuteResponse{Code: "OK", Data: output, RequestID: requestID}
}
