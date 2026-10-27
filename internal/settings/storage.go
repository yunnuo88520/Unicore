// Author: yunnuo <ymz@ebox.vip>
// Description: Platform-only file policy definitions; active location is changed only after storage validation.
package settings

import "context"

var StorageDefinitions = []SettingDefinition{
	{"storage.active", "string", "storage", "默认存储位置", "local", true, false, text(80)},
	{"storage.max_size_mb", "integer", "storage", "单文件上限（MiB）", "100", true, false, integer(1, 1024)},
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
