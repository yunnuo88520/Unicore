// Author: yunnuo <ymz@ebox.vip>
// Description: Bounded native file chunks and user-selected downloads reuse the durable local file service.
package desktop

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"io"

	"github.com/yunnuo/unicore/internal/adapter/presenter"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/files"
)

var localFileActor = files.Actor{ID: "local", Realm: "local"}

func fileCode(err error) string {
	switch {
	case err == nil:
		return "OK"
	case errors.Is(err, files.ErrNotFound):
		return "FILE_NOT_FOUND"
	case errors.Is(err, files.ErrInvalid):
		return "INVALID_INPUT"
	default:
		return "STORAGE_UNAVAILABLE"
	}
}
func (b *Bridge) SetFileSaver(save func(string, io.Reader) error) { b.saveFile = save }
func (b *Bridge) FileUploadPolicy() contracts.UploadPolicyResponse {
	data := contracts.UploadPolicy{}
	code := "NOT_AVAILABLE"
	if b.files != nil {
		data = b.files.UploadPolicy(context.Background())
		code = "OK"
	}
	return contracts.UploadPolicyResponse{Code: code, Message: contracts.ErrorCatalog[code].Message, Data: data, RequestID: presenter.RequestID()}
}
func (b *Bridge) ListFiles(search string, page int) contracts.FileListResponse {
	if b.files == nil {
		return contracts.FileListResponse{Code: "NOT_AVAILABLE", Message: contracts.ErrorCatalog["NOT_AVAILABLE"].Message, RequestID: presenter.RequestID()}
	}
	data, err := b.files.List(context.Background(), localFileActor, search, page, files.ScopeFilter{})
	return contracts.FileListResponse{Code: fileCode(err), Message: contracts.ErrorCatalog[fileCode(err)].Message, Data: data, RequestID: presenter.RequestID()}
}
func (b *Bridge) BeginFileUpload(input contracts.MultipartUploadInput) contracts.MultipartUploadResponse {
	if b.files == nil {
		return contracts.MultipartUploadResponse{Code: "NOT_AVAILABLE", Message: contracts.ErrorCatalog["NOT_AVAILABLE"].Message, RequestID: presenter.RequestID()}
	}
	data, err := b.files.BeginUpload(context.Background(), localFileActor, input)
	return contracts.MultipartUploadResponse{Code: fileCode(err), Message: contracts.ErrorCatalog[fileCode(err)].Message, Data: data, RequestID: presenter.RequestID()}
}
func (b *Bridge) FileUploadStatus(id string) contracts.MultipartUploadResponse {
	if b.files == nil {
		return contracts.MultipartUploadResponse{Code: "NOT_AVAILABLE", Message: contracts.ErrorCatalog["NOT_AVAILABLE"].Message, RequestID: presenter.RequestID()}
	}
	data, err := b.files.UploadStatus(context.Background(), localFileActor, id)
	return contracts.MultipartUploadResponse{Code: fileCode(err), Message: contracts.ErrorCatalog[fileCode(err)].Message, Data: data, RequestID: presenter.RequestID()}
}
func (b *Bridge) ReceiveFilePart(id string, number int, data string) contracts.ActionResultResponse {
	response := contracts.ActionResultResponse{Code: "INVALID_INPUT", Message: contracts.ErrorCatalog["INVALID_INPUT"].Message, RequestID: presenter.RequestID()}
	if b.files == nil {
		response.Code = "NOT_AVAILABLE"
		response.Message = contracts.ErrorCatalog[response.Code].Message
		return response
	}
	// Base64 expansion is bounded before allocating decoded bytes.
	if len(data) > 12<<20 {
		return response
	}
	raw, err := base64.StdEncoding.Strict().DecodeString(data)
	if err != nil {
		return response
	}
	err = b.files.ReceiveUploadPart(context.Background(), localFileActor, id, number, bytes.NewReader(raw), int64(len(raw)))
	response.Code = fileCode(err)
	response.Message = contracts.ErrorCatalog[response.Code].Message
	response.Data.Success = err == nil
	return response
}
func (b *Bridge) CompleteFileUpload(id string) contracts.FileEntryResponse {
	if b.files == nil {
		return contracts.FileEntryResponse{Code: "NOT_AVAILABLE", Message: contracts.ErrorCatalog["NOT_AVAILABLE"].Message, RequestID: presenter.RequestID()}
	}
	data, err := b.files.FinishUpload(context.Background(), localFileActor, id)
	return contracts.FileEntryResponse{Code: fileCode(err), Message: contracts.ErrorCatalog[fileCode(err)].Message, Data: data, RequestID: presenter.RequestID()}
}
func (b *Bridge) DeleteFile(id string) contracts.ActionResultResponse {
	if b.files == nil {
		return contracts.ActionResultResponse{Code: "NOT_AVAILABLE", Message: contracts.ErrorCatalog["NOT_AVAILABLE"].Message, RequestID: presenter.RequestID()}
	}
	err := b.files.Delete(context.Background(), localFileActor, id)
	return contracts.ActionResultResponse{Code: fileCode(err), Message: contracts.ErrorCatalog[fileCode(err)].Message, Data: contracts.ActionResult{Success: err == nil}, RequestID: presenter.RequestID()}
}
func (b *Bridge) SaveFile(id string) contracts.ActionResultResponse {
	response := contracts.ActionResultResponse{Code: "NOT_AVAILABLE", Message: contracts.ErrorCatalog["NOT_AVAILABLE"].Message, RequestID: presenter.RequestID()}
	if b.files == nil || b.saveFile == nil {
		return response
	}
	source, record, err := b.files.OpenOwned(context.Background(), localFileActor, id)
	if err == nil {
		defer source.Close()
		err = b.saveFile(record.OriginalName, source)
	}
	response.Code = fileCode(err)
	response.Message = contracts.ErrorCatalog[response.Code].Message
	response.Data.Success = err == nil
	return response
}
