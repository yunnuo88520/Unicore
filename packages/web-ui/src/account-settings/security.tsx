// Author: yunnuo <ymz@ebox.vip>
// Description: Security page of the account settings modal: password change, TOTP enrollment with its
// recovery codes, and the enterprise identity binding, consuming the shell's one-shot OIDC callback result.
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Copy, Download, Link2, Unlink } from 'lucide-react';
import QRCode from 'qrcode';
import type { AppClient, Bootstrap, OIDCInfo, TOTPSetup } from '@unicore/sdk';
import { Badge, Button, Input, Modal, useMessage } from '@unicore/ui';
import { AppField, AppForm, useAppForm } from '@unicore/form';
import { AppOTPField } from '@unicore/form/fields';
import { t, useLocale } from '../i18n';
import { PasswordDialog } from '../password-dialog';
import { SettingsCard, SettingsRow, SettingsValueField } from './rows';

export function AccountSecurityPanel({ client, metadata, refresh, oidc, onSaved }: {
  client: AppClient; metadata: Bootstrap; refresh: () => void; oidc?: string; onSaved: () => void;
}) {
  useLocale();
  const message = useMessage();
  const web = client.web;
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [recovery, setRecovery] = useState<string[]>([]);
  const profile = useQuery({ queryKey: ['account-profile'], queryFn: () => web!.accountProfile() });
  const enterprise = useQuery({ queryKey: ['oidc-account', metadata.current_user?.id], queryFn: () => web!.oidcAccount() });
  // The shell hands over the OIDC callback result once; announce it and chain
  // into the flows the account security page used to own.
  const consumed = useRef(false);
  useEffect(() => {
    if (!oidc || consumed.current) return;
    consumed.current = true;
    if (oidc === 'bind_success') { message.success(t('企业账号已绑定，其他设备的旧会话已退出。')); void enterprise.refetch(); }
    if (oidc === 'bind_failed' || oidc === 'totp_failed') message.error(t('企业身份验证未完成或已过期，请重新验证后设置身份验证器。'));
    if (oidc === 'bind_link_required') message.error(t('请先使用本地账号登录，再到「账号资料」绑定企业账号；新用户请联系管理员。'));
    if (oidc === 'totp_ready') setSetupOpen(true);
    // enterprise only participates through its refetch above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oidc, message]);
  if (!web) return null;
  return <div className="flex w-full flex-col gap-6">
    <SettingsCard>
      <SettingsRow label={t('登录密码')} description={t('验证当前密码后设置新密码。成功后该账号的所有设备需重新登录。')}>
        <Button variant="secondary" size="sm" className="h-8" onClick={() => setPasswordOpen(true)}>{t('修改密码')}</Button>
      </SettingsRow>
    </SettingsCard>
    <SettingsCard>
      <SettingsRow label={t('双重验证')} description={t('使用身份验证器生成一次性验证码，为所有登录方式增加一层保护。')}>
        <span className="flex items-center gap-2">
          <Badge variant={profile.data?.totp_enabled ? 'success' : 'subtle'}>{profile.data?.totp_enabled ? t('已开启') : t('未开启')}</Badge>
          {profile.data?.totp_enabled
            ? <Button variant="secondary" size="sm" className="h-8" disabled={!profile.data.can_disable_2fa} onClick={() => setDisableOpen(true)}>{t('关闭双重验证')}</Button>
            : <Button variant="secondary" size="sm" className="h-8" disabled={!enterprise.data} onClick={() => setSetupOpen(true)}>{t('设置身份验证器')}</Button>}
        </span>
      </SettingsRow>
      {profile.data?.force_2fa && !profile.data.totp_enabled && <p role="status" className="border-b border-line py-2 pe-2.5 text-xs text-muted last:border-b-0">{t('实例要求当前账号启用双重验证。')}</p>}
      {profile.data?.totp_enabled && !profile.data.can_disable_2fa && <p className="border-b border-line py-2 pe-2.5 text-xs text-muted last:border-b-0">{t('实例策略不允许关闭双重验证。')}</p>}
    </SettingsCard>
    <EnterpriseBindingCard web={web} enterprise={enterprise.data} enterpriseError={enterprise.error} onRetry={() => void enterprise.refetch()} onChanged={refresh} />
    {recovery.length > 0 && <div className="w-full rounded-2xl border border-line bg-surface-soft p-4">
      <h3 className="text-sm font-semibold text-ink">{t('恢复码')}</h3>
      <p className="mt-1 text-xs text-muted">{t('仅显示一次。每个恢复码只能使用一次，请保存在安全位置。丢失验证器时可用恢复码登录。')}</p>
      <div className="my-4 grid gap-2 font-mono text-xs sm:grid-cols-2">{recovery.map(code => <code key={code} className="select-all break-all rounded border border-line bg-surface px-2 py-1">{code}</code>)}</div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => void navigator.clipboard.writeText(recovery.join('\n')).then(() => message.success(t('已复制')), () => message.error(t('复制失败，请手动选择并保存')))}><Copy size={14} />{t('复制恢复码')}</Button>
        <Button variant="secondary" size="sm" onClick={() => { const url = URL.createObjectURL(new Blob([recovery.join('\n') + '\n'], { type: 'text/plain' })); const a = document.createElement('a'); a.href = url; a.download = 'recovery-codes.txt'; a.click(); URL.revokeObjectURL(url); }}><Download size={14} />{t('下载恢复码')}</Button>
        <Button variant="ghost" size="sm" onClick={() => { setRecovery([]); refresh(); }}>{t('已保存，关闭')}</Button>
      </div>
    </div>}
    {passwordOpen && <PasswordDialog web={web} onClose={() => setPasswordOpen(false)} />}
    {setupOpen && profile.data && <TOTPSetupDialog web={web} enterprise={!!enterprise.data?.linked && !enterprise.data.has_local_password} resume={oidc === 'totp_ready'} onClose={() => setSetupOpen(false)}
      onEnabled={codes => { setRecovery(codes); setSetupOpen(false); message.success(t('双重验证已开启，其他设备已退出')); onSaved(); void profile.refetch(); refresh(); }} />}
    {disableOpen && profile.data && <DisableTOTPDialog web={web} onClose={() => setDisableOpen(false)}
      onDisabled={() => { onSaved(); void profile.refetch(); refresh(); }} />}
  </div>;
}

/** TOTP enrollment: enterprise identities resume their pending setup, local passwords verify first. */
function TOTPSetupDialog({ web, enterprise, resume, onClose, onEnabled }: { web: NonNullable<AppClient['web']>; enterprise: boolean; resume: boolean; onClose: () => void; onEnabled: (codes: string[]) => void }) {
  useLocale();
  const message = useMessage();
  const resumed = useQuery({ queryKey: ['pending-totp'], queryFn: () => web.pendingTOTP(), enabled: enterprise && resume, gcTime: 0, retry: false });
  const [setup, setSetup] = useState<TOTPSetup>();
  const [qr, setQR] = useState('');
  const [seconds, setSeconds] = useState(30);
  const inflight = useRef(false);
  const form = useAppForm({ defaultValues: { password: '', code: '' }, onSubmit: values => { if (setup) enable.mutate(values.code); else begin.mutate(); } });
  useEffect(() => { if (resumed.data) setSetup(resumed.data); }, [resumed.data]);
  const begin = useMutation({
    mutationFn: async () => { if (inflight.current) return; inflight.current = true; try { if (enterprise) { const start = await web.oidcTOTP(); window.location.assign(start.authorization_url); return; } return await web.beginTOTP(form.getValues('password')); } finally { inflight.current = false; } },
    onSuccess: result => { if (!result) return; setSetup(result); setQR(''); form.setValue('code', ''); setSeconds(30); }, onError: form.applyServerError,
  });
  const enable = useMutation({ mutationFn: (code: string) => web.enableTOTP(code), onSuccess: result => { form.reset(); onEnabled(result.codes); }, onError: form.applyServerError });
  const cancel = useMutation({ mutationFn: () => web.cancelTOTP(), onSuccess: () => { form.reset(); onClose(); } });
  const pending = begin.isPending || enable.isPending || cancel.isPending || resumed.isFetching;
  useEffect(() => { if (!setup) return; let disposed = false; void QRCode.toDataURL(setup.otpauth_url, { width: 256, margin: 4 }).then(image => { if (!disposed) setQR(image); }).catch(() => { if (!disposed) message.error(t('二维码生成失败，请使用手动密钥')); }); return () => { disposed = true; }; }, [setup, message]);
  useEffect(() => { if (!setup) return; const timer = window.setInterval(() => setSeconds(30 - Math.floor(Date.now() / 1000) % 30), 1000); return () => window.clearInterval(timer); }, [setup]);
  return <Modal title={t('设置身份验证器')} onClose={() => cancel.mutate()} pending={pending}>
    <AppForm form={form} className="flex flex-col gap-4">
      {!setup && enterprise ? <><p className="text-sm text-muted">{t('此账号使用企业登录。重新验证已绑定的企业身份后，即可设置身份验证器，无需本地密码或邮件。')}</p>{resumed.isFetching && <p role="status">{t('正在读取身份验证器设置…')}</p>}{resumed.error && <p role="alert">{t(resumed.error.message)}</p>}<Button type="button" pending={begin.isPending} disabled={pending} onClick={() => begin.mutate()}>{t('验证企业身份并继续')}</Button></> : !setup ? <><p className="text-sm text-muted">{t('先验证当前密码，再使用身份验证器扫描二维码。')}</p><AppField name="password" label={t('当前密码')}><Input type="password" required maxLength={128} autoComplete="current-password" /></AppField><Button type="submit" pending={begin.isPending}>{t('验证并开始设置')}</Button></> : <>
        <p className="text-sm text-muted">{t('使用 Google Authenticator、Microsoft Authenticator 或其他兼容应用扫描二维码，也可手动输入密钥，再填写 6 位验证码。')}</p>
        <div className="flex flex-wrap items-center gap-4">{qr ? <img src={qr} width={256} height={256} alt={t('身份验证器设置二维码')} className="max-w-full shrink-0 rounded-lg border border-line" /> : <p role="status">{t('正在生成二维码…')}</p>}<div className="flex flex-col items-start gap-2 text-sm text-muted"><span>{t('验证码每 30 秒更新，{{seconds}} 秒后进入下一周期', { seconds })}</span><span>{t('绑定密钥 10 分钟内有效；刷新会使旧二维码失效。')}</span><Button type="button" variant="secondary" disabled={pending} onClick={() => begin.mutate()}>{t('立即刷新')}</Button></div></div>
        <div className="flex flex-col gap-1.5 text-sm font-medium"><Input label={t('手动密钥')} value={setup.secret} readOnly className="font-mono text-xs" /></div>
        <Button type="button" variant="ghost" className="self-start" onClick={() => { void navigator.clipboard.writeText(setup.secret).then(() => message.success(t('已复制')), () => message.error(t('复制失败，请手动选择并保存'))); }}><Copy size={15} />{t('复制密钥')}</Button>
        <AppOTPField name="code" label={t('身份验证器验证码')} disabled={pending} />
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={pending} onClick={() => cancel.mutate()}>{t('取消设置')}</Button><Button type="submit" pending={enable.isPending} disabled={pending || seconds === 0}>{t('开启双重验证')}</Button></div>
      </>}
    </AppForm>
  </Modal>;
}

/** Disable confirmation keeps the shared Modal + OTP field recipe; the panel refreshes the shared profile query afterwards. */
function DisableTOTPDialog({ web, onClose, onDisabled }: { web: NonNullable<AppClient['web']>; onClose: () => void; onDisabled: () => void }) {
  useLocale();
  const message = useMessage();
  const form = useAppForm({ schema: 'SecurityCodeInput', defaultValues: { code: '' }, onSubmit: values => { disable.mutate(values.code); } });
  const disable = useMutation({
    mutationFn: (code: string) => web.disableTOTP(code),
    onSuccess: () => { form.reset(); message.success(t('双重验证已关闭，其他设备已退出')); onDisabled(); onClose(); },
    onError: form.applyServerError,
  });
  return <Modal title={t('关闭双重验证')} onClose={onClose} pending={disable.isPending}>
    <p className="mb-4 text-sm text-muted">{t('输入身份验证器的新验证码。恢复码不能用于关闭双重验证。')}</p>
    <AppForm form={form} className="flex flex-col gap-4">
      <AppOTPField name="code" label={t('身份验证器验证码')} />
      <Button type="submit" variant="danger" pending={disable.isPending}>{t('确认关闭')}</Button>
    </AppForm>
  </Modal>;
}

/** Enterprise binding: the login method stays yours while the workspace grants come from the instance. */
function EnterpriseBindingCard({ web, enterprise, enterpriseError, onRetry, onChanged }: {
  web: NonNullable<AppClient['web']>; enterprise?: OIDCInfo; enterpriseError: unknown; onRetry: () => void; onChanged: () => void;
}) {
  useLocale();
  const message = useMessage();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const busy = useRef(false);
  const linked = !!enterprise?.linked;
  const change = useMutation({
    mutationFn: async (secret: string) => {
      if (busy.current) return null;
      busy.current = true;
      try {
        if (linked) { await web.oidcUnlink(secret); return 'unlinked' as const; }
        const start = await web.oidcLink(secret);
        window.location.assign(start.authorization_url);
        return 'redirect' as const;
      } finally { busy.current = false; }
    },
    onSuccess: result => {
      if (result !== 'unlinked') return;
      message.success(t('企业绑定已解除，本地密码登录可用。'));
      setPassword('');
      onChanged();
    },
    onError: err => setError(t(err.message)),
  });
  const submit = () => {
    setError('');
    if (password.length < 12) { setError(t('至少 12 个字符')); return; }
    change.mutate(password);
  };
  if (!enterprise) {
    return <SettingsCard>
      <SettingsRow label={t('企业账号绑定')} description={enterpriseError
        ? <span role="alert" className="text-xs text-danger">{t((enterpriseError as Error).message)}</span>
        : t('正在读取账号安全信息…')}>
        {!!enterpriseError && <Button variant="secondary" size="sm" className="h-8" onClick={onRetry}>{t('重试')}</Button>}
      </SettingsRow>
    </SettingsCard>;
  }
  return <SettingsCard>
    <SettingsRow label={t('企业账号绑定')} description={t('登录方式由你管理，工作空间权限由实例管理员授予。')}>
      <Badge variant={linked ? 'success' : 'subtle'}>{linked ? t('已绑定') : t('未绑定')}</Badge>
    </SettingsRow>
    <SettingsRow label={t('企业登录')}>
      <SettingsValueField muted={!enterprise.enabled}>{enterprise.enabled ? enterprise.provider_name : t('实例尚未启用')}</SettingsValueField>
    </SettingsRow>
    <SettingsRow label={t('本地密码')}>
      <SettingsValueField muted={!enterprise.has_local_password}>{enterprise.has_local_password ? t('可用') : t('尚未设置')}</SettingsValueField>
    </SettingsRow>
    {linked && <SettingsRow label={t('身份来源')}>
      <SettingsValueField>{enterprise.issuer}</SettingsValueField>
    </SettingsRow>}
    <div className="flex flex-col gap-2 py-2.5 pe-2.5">
      <p className="text-xs text-muted">{t('每个账号可绑定一个企业身份。相同邮箱不会自动合并；企业角色声明不会更改本地权限。更改绑定后，其他会话及待用验证码会失效。')}</p>
      {!enterprise.has_local_password
        ? <p className="text-xs text-muted">{t('请联系管理员开启邮件找回密码，设置本地密码后再解除绑定。')}</p>
        : (enterprise.enabled || linked) && <>
          <p className="text-xs text-muted">{linked ? t('解除后保留本地账号和密码，可继续正常登录。') : t('下一步将重新验证企业账号，请确认选择自己的账号。')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="password" required minLength={12} maxLength={128} autoComplete="current-password" aria-label={t('确认本地密码')} placeholder={t('确认本地密码')}
              value={password} onChange={event => setPassword(event.target.value)} disabled={change.isPending} className="w-[202px] shrink-0" />
            <Button variant={linked ? 'secondary' : 'primary'} size="sm" className="h-8" pending={change.isPending} onClick={submit}>
              {!change.isPending && (linked ? <Unlink size={14} aria-hidden="true" /> : <Link2 size={14} aria-hidden="true" />)}
              {linked ? t('确认解除绑定') : t('验证并绑定企业账号')}
            </Button>
          </div>
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        </>}
    </div>
  </SettingsCard>;
}
