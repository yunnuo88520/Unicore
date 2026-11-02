// Author: yunnuo <ymz@ebox.vip>
// Description: Platform-only file policy definitions; active location is changed only after storage validation.
package settings

import (
	"context"
	"github.com/yunnuo/unicore/internal/blob"
	"regexp"
	"strings"
	"unicode"
)

var StorageDefinitions = []SettingDefinition{
	{"storage.active", "string", "storage", "默认存储位置", "local", true, false, text(80)},
	{"storage.upload_paths", "string", "storage", "自定义上传路径", "", true, false, validUploadPaths},
	{"storage.allowed_extensions", "string", "storage", "允许的文件扩展名", "", true, false, validExtensions},
	{"storage.max_size_mb", "integer", "storage", "单文件上限（MiB）", "100", true, false, integer(1, 65536)},
	{"storage.part_size_mb", "integer", "storage", "分片大小（MiB）", "8", true, false, integer(5, 64)},
	{"storage.parallelism", "integer", "storage", "同时上传分片数", "3", true, false, integer(1, 6)},
	{"storage.url_ttl", "integer", "storage", "下载链接有效期（秒）", "300", true, false, integer(60, 3600)},
	{"storage.upload_ttl", "integer", "storage", "上传凭证有效期（秒）", "900", true, false, integer(60, 3600)},
	{"storage.pending_hours", "integer", "storage", "未完成上传清理（小时）", "24", true, false, integer(1, 168)},
	{"storage.retention_days", "integer", "storage", "新文件保留天数（0 为永久）", "0", true, false, integer(0, 3650)},
}

// SetStorageActive is an internal composition hook, never a generic settings PATCH.
func (s *Service) SetStorageActive(ctx context.Context, id, actor string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.Store.SaveSettings(ctx, map[string]string{"storage.active": id}, actor)
}

func validUploadPaths(value string) bool {
	if !validList(value) {
		return false
	}
	for _, line := range strings.Split(value, "\n") {
		line = strings.TrimSpace(line)
		if line != "" && (len(line) > 200 || !blob.ValidKey(line) || strings.IndexFunc(line, unicode.IsSpace) >= 0) {
			return false
		}
	}
	return true
}

var extensionPattern = regexp.MustCompile(`^\.?[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*$`)

func validExtensions(value string) bool {
	if !validList(value) {
		return false
	}
	for _, line := range PolicyLines(value) {
		if len(line) > 40 || !extensionPattern.MatchString(line) {
			return false
		}
	}
	return true
}
