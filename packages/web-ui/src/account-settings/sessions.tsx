// Author: yunnuo <ymz@ebox.vip>
// Description: Sessions page of the account settings modal: one row per login device with its activity facts,
// revoke single devices or everything else, and signing out the current device refreshes the shell session.
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Monitor, Smartphone } from 'lucide-react';
import type { AppClient } from '@unicore/sdk';
import { Badge, Button, ConfirmDialog, useMessage } from '@unicore/ui';
import { t, useLocale } from '../i18n';
import { SettingsCard } from './rows';

export function AccountSessionsPanel({ client, onSignedOut }: { client: AppClient; onSignedOut: () => void }) {
  const locale = useLocale();
  const message = useMessage();
  const web = client.web;
  const [confirm, setConfirm] = useState<{ id: string; current: boolean } | 'others'>();
  const query = useQuery({ queryKey: ['account-sessions'], queryFn: () => web!.accountSessions(), refetchInterval: 30000 });
  const revoke = useMutation({
    mutationFn: async (selected: { id: string; current: boolean } | 'others') => selected === 'others' ? web!.revokeOtherSessions() : web!.revokeAccountSession(selected.id),
    onSuccess: (_, selected) => {
      const current = selected !== 'others' && selected.current;
      setConfirm(undefined);
      message.success(t('设备会话已下线'));
      if (current) onSignedOut();
      else void query.refetch();
    },
  });
  if (!web) return null;
  const items = query.data?.items ?? [];
  return <div className="flex w-full flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2 px-3">
      <p className="text-xs text-muted">{t('查看当前有效的登录设备。发现异常时，请立即下线设备并修改密码。')}</p>
      <span className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>{t('刷新')}</Button>
        <Button variant="secondary" size="sm" disabled={!query.data || items.length <= 1} onClick={() => setConfirm('others')}>{t('下线其他设备')}</Button>
      </span>
    </div>
    {query.isPending ? <p role="status" className="px-3 py-8 text-sm text-muted">{t('正在读取登录会话…')}</p>
      : query.error ? <div role="alert" className="flex flex-col items-start gap-2 px-3 py-6">
        <p className="text-sm">{t(query.error.message)}</p>
        <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>{t('重试')}</Button>
      </div>
        : items.length === 0 ? <p className="px-3 py-8 text-sm text-muted">{t('没有有效的登录会话')}</p>
          : <SettingsCard>
            {items.map(device => {
              const mobile = device.user_agent ? /Mobile|Android|iPhone/.test(device.user_agent) : false;
              const DeviceIcon = mobile ? Smartphone : Monitor;
              return <div key={device.id} className="flex min-h-[52px] w-full items-center justify-between gap-4 border-b border-line py-2.5 pe-2.5 last:border-b-0">
                <div className="flex min-w-0 items-start gap-2.5">
                  <DeviceIcon size={17} className="mt-1 shrink-0 text-muted" aria-hidden="true" />
                  <div className="flex min-w-0 flex-col">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                      {device.user_agent ? mobile ? t('移动设备') : t('电脑或浏览器') : t('未知设备')}
                      {device.current && <Badge variant="success">{t('当前会话')}</Badge>}
                    </span>
                    <span className="break-all text-xs text-muted">{device.user_agent || t('未记录设备信息')}</span>
                    <span className="text-xs text-muted">{t('IP {{ip}} · 最近活动 {{seen}}', { ip: device.ip_address || t('未知'), seen: date(device.last_seen_at, locale) })}</span>
                    <span className="text-xs text-muted">{t('登录 {{login}} · 到期 {{expires}}', { login: date(device.created_at, locale), expires: date(device.expires_at, locale) })}</span>
                  </div>
                </div>
                <Button variant="secondary" size="sm" className="h-8" disabled={revoke.isPending} onClick={() => setConfirm({ id: device.id, current: device.current })}>{t('下线设备')}</Button>
              </div>;
            })}
          </SettingsCard>}
    {confirm && <ConfirmDialog
      title={confirm === 'others' ? t('下线其他设备') : t('下线设备')}
      description={confirm !== 'others' && confirm.current ? t('这将退出当前设备，需要重新登录。') : t('选定设备的服务端会话将立即失效。')}
      confirmLabel={t('确认下线')} cancelLabel={t('取消')} danger pending={revoke.isPending}
      onConfirm={() => revoke.mutate(confirm)} onCancel={() => setConfirm(undefined)} />}
  </div>;
}

function date(value: number, locale: string): string {
  return value ? new Date(value * 1000).toLocaleString(locale) : t('未知');
}
