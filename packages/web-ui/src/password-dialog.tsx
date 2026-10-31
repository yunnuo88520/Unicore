// Author: yunnuo <ymz@ebox.vip>
// Description: Self-service password change for either identity realm, on the shared dialog and control primitives.
import { t, useLocale } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AppError, type WebClient } from '@unicore/sdk';
import { Button, Input, Modal, useMessage } from './ui';

export function PasswordDialog({ web, onClose }: { web: WebClient; onClose: () => void }) {
  useLocale();
  const message = useMessage();
  const form = useRef<HTMLFormElement>(null);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const change = useMutation({
    mutationFn: async () => {
      if (password !== confirm) throw new Error(t('两次新密码不一致'));
      return web.changePassword({ current_password: current, password });
    },
    onSuccess: () => { message.success(t('密码已更新，请重新登录')); onClose(); },
  });
  const fields = change.error instanceof AppError ? change.error.fields : {};
  const fieldList = Object.values(fields);
  useEffect(() => {
    if (!fieldList.length) return;
    const control = Array.from(form.current?.elements ?? []).find(element => Object.hasOwn(fields, element.getAttribute('name') ?? '')) as HTMLElement | undefined;
    (control ?? form.current)?.focus();
    // Dependency intentionally tracks the mutation error object only.
  }, [change.error]);
  return <Modal title={t('修改密码')} onClose={onClose} pending={change.isPending}>
    <p className="text-sm text-muted">{t('验证当前密码后设置新密码。成功后该账号的所有设备需重新登录。')}</p>
    <form ref={form} className="mt-4 flex flex-col gap-4" aria-busy={change.isPending} onSubmit={event => { event.preventDefault(); if (!change.isPending) change.mutate(); }}>
      {fieldList.length > 0 && <div role="group" aria-label={t('表单校验')} tabIndex={-1} className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
        <strong className="block font-medium">{t('请检查表单输入')}</strong>
        <p>{fieldList.map(value => t(value)).join('; ')}</p>
      </div>}
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        {t('当前密码')}
        <Input name="current_password" type="password" required maxLength={128} autoComplete="current-password" aria-invalid={Object.hasOwn(fields, 'current_password') || undefined} value={current} onChange={event => setCurrent(event.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        {t('新密码')}
        <Input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" aria-invalid={Object.hasOwn(fields, 'password') || undefined} value={password} onChange={event => setPassword(event.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        {t('确认新密码')}
        <Input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} />
      </label>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="secondary" disabled={change.isPending} onClick={onClose}>{t('取消')}</Button>
        <Button type="submit" disabled={change.isPending}>{change.isPending ? t('正在保存…') : t('保存新密码')}</Button>
      </div>
    </form>
  </Modal>;
}
