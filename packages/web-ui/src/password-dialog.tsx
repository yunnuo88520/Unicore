// Author: yunnuo <ymz@ebox.vip>
// Description: Self-service password change for either identity realm, on the shared dialog and control primitives.
import { t, useLocale } from './i18n';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AppError, type ChangePasswordInput, type WebClient } from '@unicore/sdk';
import { Button, Input, Modal, useMessage } from '@unicore/ui';
import { AppField, AppForm, useAppForm } from '@unicore/form';

type Values = { current_password: string; password: string };

export function PasswordDialog({ web, onClose }: { web: WebClient; onClose: () => void }) {
  useLocale();
  const message = useMessage();
  // The confirmation value stays outside the contract form: ChangePasswordInput is a strict object.
  const [confirm, setConfirm] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const change = useMutation({
    mutationFn: (values: ChangePasswordInput) => web.changePassword(values),
    onSuccess: () => { message.success(t('密码已更新，请重新登录')); onClose(); },
  });
  const form: AppForm<Values> = useAppForm<Values>({
    schema: 'ChangePasswordInput',
    defaultValues: { current_password: '', password: '' },
    onSubmit: async values => {
      if (confirm !== values.password) {
        setConfirmError(t('两次新密码不一致'));
        return;
      }
      try {
        await change.mutateAsync(values);
      } catch (error) {
        form.applyServerError(error);
      }
    },
  });
  return <Modal title={t('修改密码')} onClose={onClose} pending={change.isPending}>
    <p className="text-sm text-muted">{t('验证当前密码后设置新密码。成功后该账号的所有设备需重新登录。')}</p>
    <AppForm form={form} className="mt-4 flex flex-col gap-4">
      <AppField name="current_password" label={t('当前密码')}><Input type="password" required maxLength={128} autoComplete="current-password" /></AppField>
      <AppField name="password" label={t('新密码')}><Input type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></AppField>
      <div className="flex flex-col gap-1.5">
        <Input label={t('确认新密码')} id="confirm-password" name="confirm" type="password" required minLength={12} maxLength={128} autoComplete="new-password"
          aria-invalid={!!confirmError || undefined} aria-describedby={confirmError ? 'confirm-password-error' : undefined}
          value={confirm} onChange={event => setConfirm(event.target.value)} onBlur={() => setConfirmError(confirm && confirm !== form.getValues('password') ? t('两次新密码不一致') : '')} />
        {confirmError && <p id="confirm-password-error" role="alert" className="text-xs text-danger">{confirmError}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="secondary" disabled={change.isPending} onClick={onClose}>{t('取消')}</Button>
        <Button type="submit" pending={change.isPending}>{t('保存新密码')}</Button>
      </div>
    </AppForm>
  </Modal>;
}
