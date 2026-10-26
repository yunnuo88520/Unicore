// Author: yunnuo <ymz@ebox.vip>
// Description: Wails-independent bridge with the same DTOs and errors as HTTP.
package desktop

import (
	"context"
	"errors"

	"github.com/yunnuo/unicore/internal/adapter/presenter"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/runtime"
	"github.com/yunnuo/unicore/internal/settings"
	"github.com/yunnuo/unicore/internal/usecase"
)

type Bridge struct {
	core     usecase.Executor
	settings *settings.Service
}

func New(core usecase.Executor) *Bridge { return &Bridge{core: core} }

func NewLocal(core usecase.Executor, service *settings.Service) *Bridge {
	return &Bridge{core: core, settings: service}
}

func (b *Bridge) Bootstrap() contracts.BootstrapResponse {
	data := runtime.Metadata(runtime.Desktop, "native")
	if b.settings != nil {
		data.Stage = "M3a"
		data.Capabilities.Database = true
		data.Capabilities.Settings = true
		if name, err := b.settings.Value(context.Background(), "site.name"); err == nil {
			data.SiteName = name
		}
		if value, err := b.settings.Value(context.Background(), "site.description"); err == nil {
			data.SiteDescription = &value
		}
		if value, err := b.settings.Value(context.Background(), "site.copyright"); err == nil {
			data.SiteCopyright = &value
		}
		if value, err := b.settings.Value(context.Background(), "appearance.theme"); err == nil {
			data.Theme = &value
		}
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
		code, message := "INTERNAL_ERROR", "无法保存设置"
		if errors.Is(err, settings.ErrInvalid) {
			code, message = "INVALID_INPUT", "请检查设置输入与范围"
		}
		return contracts.SettingsResponse{Code: code, Message: message, RequestID: requestID}
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
