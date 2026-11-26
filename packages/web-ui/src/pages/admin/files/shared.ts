// Author: yunnuo <ymz@ebox.vip>
// Description: Shared formatting and category helpers for the file governance surface.
import { defineMessages, t } from '../../../i18n';
import type { FileCatalogEntry, StorageLocation } from '@unicore/sdk';

export const stateMessages = defineMessages({
  pending: '等待处理', copying: '处理中', ready: '可用', deleted: '已删除',
});
export const purposeMessages = defineMessages({
  user: '业务文件', branding: '品牌资源',
});
const providerMessages = defineMessages({ local: '本地存储', minio: 'MinIO', s3: 'Amazon S3', oss: '阿里云 OSS', cos: '腾讯云 COS' });
const statusMessages = defineMessages({
  running: '迁移中', paused: '已暂停', completed: '已完成', failed: '失败', cancelled: '已取消',
});
const reasonMessages = defineMessages({
  FILE_NOT_FOUND: '文件不存在', INVALID_INPUT: '参数无效', FILE_BUSY: '文件正在被使用', STORAGE_NOT_READY: '目标存储未就绪', STORAGE_UNAVAILABLE: '存储暂不可用',
});

export function stateLabel(state: string): string {
  return t(stateMessages[state as keyof typeof stateMessages] ?? state);
}
export function purposeLabel(purpose: string): string {
  return t(purposeMessages[purpose as keyof typeof purposeMessages] ?? purpose);
}
export function statusLabel(status: string): string {
  return t(statusMessages[status as keyof typeof statusMessages] ?? status);
}
export function reasonLabel(reason: string): string {
  return t(reasonMessages[reason as keyof typeof reasonMessages] ?? reason);
}

export function locationLabel(location: StorageLocation): string {
  return !location.name || location.name === location.provider
    ? t(providerMessages[location.provider as keyof typeof providerMessages] ?? location.provider)
    : location.name;
}

export function locationName(locations: StorageLocation[] | undefined, id: string): string {
  if (id === 'legacy-brand') return t('旧品牌存储');
  const found = locations?.find(item => item.id === id);
  return found ? locationLabel(found) : id;
}

export function formatSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function formatDate(value: number, locale: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value * 1000));
}

export function creatorLabel(entry: FileCatalogEntry): string {
  return entry.creator_name || entry.creator_username || t(entry.file.creator_realm === 'system' ? '系统资源' : '账号已删除');
}

// MimeCategory mirrors the contract's type filter so icons and previews agree
// with server-side filtering.
export type MimeCategory = 'image' | 'document' | 'archive' | 'other';
const archiveExtensions = ['.zip', '.gz', '.tgz', '.tar', '.7z', '.rar', '.bz2', '.xz', '.apk'];
const documentExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.rtf', '.odt', '.ods', '.odp'];

export function mimeCategory(mime: string, name = ''): MimeCategory {
  const bare = (mime || '').split(';')[0].trim().toLowerCase();
  const lower = name.toLowerCase();
  if (bare.startsWith('image/') && bare !== 'image/svg+xml') return 'image';
  if (bare === 'application/pdf' || bare.startsWith('text/') || bare.startsWith('application/vnd.openxml') || bare.startsWith('application/vnd.oasis') || bare === 'application/msword' || bare === 'application/rtf' || bare === 'application/json' || bare === 'application/xml') return 'document';
  if (bare === 'application/zip' || bare.startsWith('application/gzip') || bare.startsWith('application/x-tar') || bare.startsWith('application/x-7z') || bare.startsWith('application/x-rar') || bare === 'application/vnd.rar' || bare.startsWith('application/x-bzip2') || bare.startsWith('application/x-xz') || bare === 'application/vnd.android.package-archive') return 'archive';
  if (archiveExtensions.some(ext => lower.endsWith(ext))) return 'archive';
  if (documentExtensions.some(ext => lower.endsWith(ext))) return 'document';
  return 'other';
}

// InlinePreview mirrors the backend whitelist: only these types render inline.
export function inlinePreviewable(mime: string): boolean {
  const bare = (mime || '').split(';')[0].trim().toLowerCase();
  return ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain'].includes(bare);
}
