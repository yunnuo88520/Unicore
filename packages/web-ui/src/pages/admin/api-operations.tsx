// Author: yunnuo <ymz@ebox.vip>
// Description: Read-only OpenAPI operation catalogue and a route to the shared role authorization editor.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, CardContent, Checkbox, Input, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@unicore/ui';
import { t, useLocale } from '../../i18n';
import { usePermissions } from '../../permissions';
import type { PageProps } from '../../router';
import type { WebClient } from '@unicore/sdk';

type Operation = Awaited<ReturnType<WebClient['apiOperations']>>['items'][number];
export function filterOperations(items: readonly Operation[], filters: Record<string, string>) {
  return items.filter(item => Object.entries(filters).every(([key, value]) => {
    const source = key === 'module' ? item.tags.join(' ') : key === 'name' ? `${item.operation_id} ${item.summary}` : key === 'permission' ? item.permissions.join(' ') : item[key as 'method' | 'path'];
    return String(source).toLowerCase().includes(value.trim().toLowerCase());
  }));
}

export function OperationCatalogue({ web, selected, onChange, realm, disabled = false }: {
  web: WebClient; selected?: string[]; onChange?: (ids: string[]) => void; realm?: string; disabled?: boolean;
}) {
  useLocale();
  const [filters, setFilters] = useState({ module: '', method: '', path: '', name: '', permission: '' });
  const list = useQuery({ queryKey: ['api-operations'], queryFn: () => web.apiOperations() });
  const items = filterOperations(list.data?.items ?? [], filters);
  return <div className="flex min-w-0 flex-col gap-3">
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Input aria-label={t('按模块筛选')} placeholder={t('按模块筛选')} value={filters.module} onChange={e => setFilters(f => ({ ...f, module: e.target.value }))} />
      <Input aria-label={t('按方法筛选')} placeholder={t('按方法筛选')} value={filters.method} onChange={e => setFilters(f => ({ ...f, method: e.target.value }))} />
      <Input aria-label={t('按路径筛选')} placeholder={t('按路径筛选')} value={filters.path} onChange={e => setFilters(f => ({ ...f, path: e.target.value }))} />
      <Input aria-label={t('按名称筛选')} placeholder={t('按名称筛选')} value={filters.name} onChange={e => setFilters(f => ({ ...f, name: e.target.value }))} />
      <Input aria-label={t('按权限筛选')} placeholder={t('按权限筛选')} value={filters.permission} onChange={e => setFilters(f => ({ ...f, permission: e.target.value }))} />
    </div>
    {list.isError && <div role="alert" className="text-sm text-danger">{t(list.error.message)} <Button variant="secondary" onClick={() => void list.refetch()}>{t('重试')}</Button></div>}
    <div className="max-h-96 min-w-0 overflow-auto rounded-lg border border-line">
      <Table className="min-w-[760px]">
        <TableHeader><TableRow>
          {onChange && <TableHead>{t('授权')}</TableHead>}
          <TableHead>{t('模块 / 名称')}</TableHead><TableHead>{t('方法 / 路径')}</TableHead><TableHead>{t('权限点')}</TableHead><TableHead>{t('安全边界')}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{items.map(item => {
          const grantable = item.grantable && (!realm || item.realm === realm || item.realm === 'both') && !item.super_admin;
          return <TableRow key={item.operation_id}>
            {onChange && <TableCell><Checkbox aria-label={item.operation_id} checked={selected?.includes(item.operation_id) ?? false} disabled={disabled || !grantable}
              onChange={checked => onChange(checked ? [...(selected ?? []), item.operation_id] : (selected ?? []).filter(id => id !== item.operation_id))} /></TableCell>}
            <TableCell><strong>{item.summary || item.operation_id}</strong><small className="block text-muted">{item.tags.join(' / ')}</small><code className="text-xs">{item.operation_id}</code></TableCell>
            <TableCell><Badge>{item.method}</Badge><code className="block text-xs">{item.path}</code></TableCell>
            <TableCell>{item.permissions.join(', ') || '—'}<small className="block text-muted">{item.permission_mode}</small></TableCell>
            <TableCell><span className="block">{t('身份域')} {item.realm}</span><span className="block">CSRF: {item.csrf ? t('是') : t('否')}</span><span className="block">superAdmin: {item.super_admin ? t('是') : t('否')}</span><span className="block">{t('可授予')}: {item.grantable ? t('是') : t('否')}</span></TableCell>
          </TableRow>;
        })}{!items.length && <TableEmpty colSpan={onChange ? 5 : 4}>{list.isPending ? t('正在加载…') : t('没有匹配的 API')}</TableEmpty>}</TableBody>
      </Table>
    </div>
  </div>;
}

export function AdminApiOperationsPage({ client, metadata }: PageProps) {
  useLocale();
  const { has } = usePermissions(metadata);
  if (!client.web) return null;
  return <Card><CardContent className="flex min-w-0 flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-md font-semibold">{t('API 操作目录')}</h2>{has('roles:write') && <a className="text-sm text-accent underline" href="roles">{t('前往角色授权')}</a>}</div>
    <p className="text-sm text-muted">{t('目录来自 OpenAPI；角色的业务权限是上界，API 授权独立收紧访问范围。')}</p>
    <OperationCatalogue web={client.web} />
  </CardContent></Card>;
}
