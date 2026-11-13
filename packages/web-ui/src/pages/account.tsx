// Author: yunnuo <ymz@ebox.vip>
// Description: Personal center: profile, mailbox change, account security and active login devices.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Copy, Download, Link2, Monitor, ShieldCheck, Smartphone, Unlink, UserRound } from 'lucide-react';
import QRCode from 'qrcode';
import type { AccountProfile, AppClient, TOTPSetup, WebClient } from '@unicore/sdk';
import { t, useLocale } from '../i18n';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ConfirmDialog, Input, Modal, PageHeader, useMessage } from '@unicore/ui';
import { AppField, AppForm, StaticField, useAppForm } from '@unicore/form';
import { AppOTPField } from '@unicore/form/fields';
import { useRouteSearch, type PageProps } from '../router';
import { PasswordDialog } from '../password-dialog';
import { FileUploadDialog } from '../file-upload-dialog';

function ProfileBoundary({ web, children }: { web: WebClient; children: (profile: AccountProfile, reload: () => void) => ReactNode }) {
  useLocale();
  const query = useQuery({ queryKey: ['account-profile'], queryFn: () => web.accountProfile() });
  if (query.isPending) return <Card><CardContent className="py-10 text-sm text-muted" role="status">{t('正在读取个人资料…')}</CardContent></Card>;
  if (query.error) return <Card><CardContent className="flex flex-col items-start gap-3 py-8" role="alert"><p>{t(query.error.message)}</p><Button variant="secondary" onClick={() => void query.refetch()}>{t('重试')}</Button></CardContent></Card>;
  return children(query.data, () => { void query.refetch(); });
}
export function AccountPage({ client, metadata, refresh }: PageProps) {
  useLocale();
  if (!client.web || !metadata.current_user) return null;
  return <div className="flex min-w-0 flex-col gap-6">
    <PageHeader title={t('个人资料')} description={t('昵称用于展示；用户名创建后不可修改。')} />
    <ProfileBoundary web={client.web}>{(profile, reload) => <ProfileEditor client={client} web={client.web!} profile={profile} onChanged={() => { reload(); refresh(); }} administrator={metadata.identity_realm === 'administrator'} />}</ProfileBoundary>
  </div>;
}
function ProfileEditor({ client, web, profile, onChanged, administrator }: { client: AppClient; web: WebClient; profile: AccountProfile; onChanged: () => void; administrator: boolean }) {
  useLocale();
  const message = useMessage();
  const [emailOpen, setEmailOpen] = useState(false);
  const avatarFiles = client.businessFiles?.('avatar') ?? client.files;
  const avatarClient = { ...client, files: avatarFiles };
  const [avatarFileID, setAvatarFileID] = useState<string | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatar = useQuery({ queryKey: ['avatar-preview', avatarFileID], queryFn: () => avatarFiles!.fileAccess(avatarFileID!), enabled: !!avatarFileID && !!avatarFiles, staleTime: 60_000 });
  const avatarURL = avatar.data?.url;
  const form = useAppForm({ schema: 'ProfileInput', defaultValues: { display_name: profile.display_name }, onSubmit: values => { save.mutate(values); } });
  const save = useMutation({ mutationFn: async (values: { display_name: string }) => {
    const fileID = avatarFileID;
    return web.saveAccountProfile({ display_name: values.display_name, ...(fileID ? { avatar_file_id: fileID } : {}) });
  }, onSuccess: () => { setAvatarFileID(null); message.success(t('个人资料已保存')); onChanged(); }, onError: form.applyServerError });
  return <section aria-label={t('个人资料')} className="max-w-3xl">
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2"><Badge variant="subtle">{administrator ? t('管理员') : t('普通用户')}</Badge><Badge variant={profile.user.status === 'active' ? 'success' : 'subtle'}>{profile.user.status === 'active' ? t('正常') : t('已停用')}</Badge><Badge variant={profile.totp_enabled ? 'success' : 'subtle'}>{profile.totp_enabled ? t('双重验证已开启') : t('双重验证未开启')}</Badge></div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex size-16 items-center justify-center overflow-hidden rounded-full bg-avatar text-avatar-ink">{avatarURL || profile.avatar_url ? <img src={avatarURL || profile.avatar_url} alt={t('当前头像')} className="size-full object-cover" /> : <UserRound size={28} aria-hidden="true" />}</span>
          {avatarFiles && <Button variant="secondary" disabled={save.isPending} onClick={() => setAvatarOpen(true)}>{t('上传头像')}</Button>}
          {avatarFileID && <p role="status" className="text-xs text-muted">{t('头像已上传，保存后生效')}</p>}
        </div>
        <AppForm form={form} className="flex max-w-lg flex-col gap-4">
          <AppField name="display_name" label={t('昵称')}><Input maxLength={80} autoComplete="nickname" /></AppField>
          <div className="flex flex-col gap-1.5 text-sm font-medium"><Input label={t('用户名')} value={profile.user.username} readOnly disabled autoComplete="username" /></div>
          <div className="flex flex-col gap-1.5"><div className="flex gap-2"><Input label={t('邮箱')} id="profile-email" value={profile.user.email} readOnly disabled className="min-w-0 flex-1" /><Button type="button" variant="secondary" onClick={() => setEmailOpen(true)}>{t('更换邮箱')}</Button></div><p className="text-xs text-muted">{t('需先验证当前邮箱，再验证新邮箱。')}</p></div>
          <Button type="submit" pending={save.isPending} className="self-start">{t('保存个人资料')}</Button>
        </AppForm>
      </CardContent>
    </Card>
    {avatarOpen && <FileUploadDialog client={avatarClient} title={t('上传头像')} maxSize={2 * 1024 * 1024} accept="image/png,image/jpeg,image/gif" onUploaded={file => { setAvatarFileID(file.file_id); message.success(t('头像已上传，保存后生效')); }} onClose={() => setAvatarOpen(false)} />}
    {emailOpen && <EmailChangeDialog web={web} email={profile.user.email} onClose={() => setEmailOpen(false)} onChanged={onChanged} />}
  </section>;
}
function EmailChangeDialog({ web, email, onClose, onChanged }: { web: WebClient; email: string; onClose: () => void; onChanged: () => void }) {
  useLocale();
  const message = useMessage();
  const [step, setStep] = useState<1 | 2>(1);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const busy = useRef(false);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const form = useAppForm({ defaultValues: { email: '', code: '' }, onSubmit: values => { verify.mutate(values); } });
  const newEmail = form.watch('email');
  // Editing the destination invalidates the sent-code UI; the backend also binds each challenge to its exact destination.
  useEffect(() => { setNext(''); form.setValue('code', ''); }, [newEmail, form.setValue]);
  const send = useMutation({
    mutationFn: async () => { if (busy.current) return; busy.current = true; try { return step === 1 ? await web.requestCurrentEmail() : await web.requestNewEmail(current, form.getValues('email')); } finally { busy.current = false; } },
    onSuccess: challenge => { if (!challenge) return; if (step === 1) setCurrent(challenge.challenge_id); else setNext(challenge.challenge_id); form.setValue('code', ''); setRetryAt(Date.now() + challenge.retry_after * 1000); setNow(Date.now()); message.success(t('验证码已发送，请检查邮箱')); }, onError: form.applyServerError,
  });
  const verify = useMutation({
    mutationFn: async (values: { email: string; code: string }) => { if (step === 1) await web.verifyCurrentEmail(current, values.code); else await web.confirmNewEmail(next, values.code); },
    onSuccess: () => { form.setValue('code', ''); if (step === 1) { setStep(2); setRetryAt(0); message.success(t('当前邮箱已验证')); } else { message.success(t('邮箱已更换，其他设备已退出')); onChanged(); onClose(); } }, onError: form.applyServerError,
  });
  const pending = send.isPending || verify.isPending;
  const retry = Math.max(0, Math.ceil((retryAt - now) / 1000));
  return <Modal title={t('更换邮箱')} onClose={onClose} pending={pending}>
    <ol className="mb-4 grid grid-cols-2 gap-2 border-y border-line py-3 text-sm" aria-label={t('换绑步骤')}><li aria-current={step === 1 ? 'step' : undefined} className={step === 1 ? 'font-semibold text-accent' : 'text-muted'}>{t('1. 验证当前邮箱')}</li><li aria-current={step === 2 ? 'step' : undefined} className={step === 2 ? 'font-semibold text-accent' : 'text-muted'}>{t('2. 绑定新邮箱')}</li></ol>
    <AppForm form={form} className="flex flex-col gap-4">
      {step === 1 ? <StaticField label={t('当前邮箱')}>{email}</StaticField> : <AppField name="email" label={t('新邮箱')}><Input type="email" required maxLength={254} autoComplete="email" disabled={pending} /></AppField>}
      <div className="flex flex-wrap items-end gap-3"><AppOTPField name="code" label={t('邮箱验证码')} className="min-w-0 flex-1" disabled={pending} /><Button type="button" variant="secondary" disabled={pending || retry > 0 || (step === 2 && (!newEmail || newEmail.toLowerCase() === email.toLowerCase()))} onClick={() => { if (step === 2 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) { form.setError('email', { message: t('请输入有效邮箱') }); return; } send.mutate(); }}>{retry > 0 ? t('{{seconds}} 秒后重发', { seconds: retry }) : t('发送验证码')}</Button></div>
      <p className="text-xs text-muted">{t('验证码 10 分钟内有效。完成换绑后，其他设备的会话与待用验证码失效。')}</p>
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={pending} onClick={onClose}>{t('取消')}</Button><Button type="submit" pending={verify.isPending} disabled={pending || !(step === 1 ? current : next)}>{step === 1 ? t('验证并继续') : t('确认绑定邮箱')}</Button></div>
    </AppForm>
  </Modal>;
}
export function AccountSecurityPage({ client, metadata, refresh }: PageProps) {
  useLocale();
  const navigate = useNavigate();
  const [passwordOpen, setPasswordOpen] = useState(false);
  if (!client.web || !metadata.current_user) return null;
  return <section className="flex max-w-3xl flex-col gap-4" aria-label={t('安全设置')}>
    <Card><CardHeader><CardTitle><ShieldCheck size={18} aria-hidden="true" />{t('登录密码')}</CardTitle><CardDescription>{t('验证当前密码后设置新密码。成功后该账号的所有设备需重新登录。')}</CardDescription></CardHeader><CardContent><Button variant="secondary" onClick={() => setPasswordOpen(true)}>{t('修改密码')}</Button></CardContent></Card>
    <ProfileBoundary web={client.web}>{(profile, reload) => <Authenticator web={client.web!} profile={profile} onChanged={reload} onPolicyChanged={refresh} />}</ProfileBoundary>
    <EnterpriseAccountSecurity web={client.web} userID={metadata.current_user.id} onOidcConsumed={() => { void navigate({ to: '/account-security', search: {}, replace: true }); }} onChanged={refresh} />
    {passwordOpen && <PasswordDialog web={client.web} onClose={() => setPasswordOpen(false)} />}
  </section>;
}
function Authenticator({ web, profile, onChanged, onPolicyChanged }: { web: WebClient; profile: AccountProfile; onChanged: () => void; onPolicyChanged:()=>void }) {
  useLocale();
  const message = useMessage();
  const navigate = useNavigate();
  const { oidc } = useRouteSearch<{ oidc: string }>();
  const [enterpriseResume, setEnterpriseResume] = useState(oidc === 'totp_ready');
  const enterprise = useQuery({ queryKey: ['oidc-account', profile.user.id], queryFn: () => web.oidcAccount() });
  useEffect(() => {
    if (oidc === 'totp_failed') message.error(t('企业身份验证未完成或已过期，请重新验证后设置身份验证器。'));
    if (oidc === 'totp_ready' || oidc === 'totp_failed') void navigate({ to: '/account-security', search: {}, replace: true });
  }, [oidc, navigate, message]);
  const [setupOpen, setSetupOpen] = useState(oidc === 'totp_ready' && !profile.totp_enabled);
  const [recovery, setRecovery] = useState<string[]>([]);
  const [disableOpen, setDisableOpen] = useState(false);
  const form = useAppForm({ schema: 'SecurityCodeInput', defaultValues: { code: '' }, onSubmit: values => { disable.mutate(values.code); } });
  const disable = useMutation({ mutationFn: (code: string) => web.disableTOTP(code), onSuccess: () => { form.reset(); setDisableOpen(false); setRecovery([]); message.success(t('双重验证已关闭，其他设备已退出')); onChanged(); onPolicyChanged(); }, onError: form.applyServerError });
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); message.success(t('已复制')); } catch { message.error(t('复制失败，请手动选择并保存')); } }
  function download() { const url = URL.createObjectURL(new Blob([recovery.join('\n') + '\n'], { type: 'text/plain' })); const a = document.createElement('a'); a.href = url; a.download = 'recovery-codes.txt'; a.click(); URL.revokeObjectURL(url); }
  return <Card><CardHeader className="flex-row items-start justify-between gap-2"><div><CardTitle><Smartphone size={18} aria-hidden="true" />{t('双重验证')}</CardTitle><CardDescription>{t('使用身份验证器生成一次性验证码，为所有登录方式增加一层保护。')}</CardDescription></div><Badge variant={profile.totp_enabled ? 'success' : 'subtle'}>{profile.totp_enabled ? t('已开启') : t('未开启')}</Badge></CardHeader>
    <CardContent className="flex flex-col items-start gap-4">
      {profile.force_2fa && <p role="status" className="text-sm text-muted">{t('实例要求当前账号启用双重验证。')}</p>}
      {profile.totp_enabled ? <><Button variant="secondary" disabled={!profile.can_disable_2fa} onClick={() => setDisableOpen(true)}>{t('关闭双重验证')}</Button>{!profile.can_disable_2fa && <p className="text-xs text-muted">{t('实例策略不允许关闭双重验证。')}</p>}</> : <Button disabled={!enterprise.data} onClick={() => { setEnterpriseResume(false); setSetupOpen(true); }}>{t('设置身份验证器')}</Button>}
      {recovery.length > 0 && <div className="w-full rounded-lg border border-line bg-surface-alt p-4"><h3 className="font-semibold">{t('恢复码')}</h3><p className="mt-1 text-sm text-muted">{t('仅显示一次。每个恢复码只能使用一次，请保存在安全位置。丢失验证器时可用恢复码登录。')}</p><div className="my-4 grid gap-2 font-mono text-xs sm:grid-cols-2">{recovery.map(code => <code key={code} className="select-all break-all rounded border border-line bg-surface px-2 py-1">{code}</code>)}</div><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void copy(recovery.join('\n'))}><Copy size={15} />{t('复制恢复码')}</Button><Button variant="secondary" onClick={download}><Download size={15} />{t('下载恢复码')}</Button><Button variant="ghost" onClick={() => {setRecovery([]);onPolicyChanged();}}>{t('已保存，关闭')}</Button></div></div>}
      {setupOpen && <TOTPSetupDialog web={web} enterprise={!!enterprise.data?.linked && !enterprise.data.has_local_password} resume={enterpriseResume} onClose={() => setSetupOpen(false)} onEnabled={codes => { setRecovery(codes); setSetupOpen(false); message.success(t('双重验证已开启，其他设备已退出')); onChanged(); }} />}
      {disableOpen && <Modal title={t('关闭双重验证')} onClose={() => setDisableOpen(false)} pending={disable.isPending}><p className="mb-4 text-sm text-muted">{t('输入身份验证器的新验证码。恢复码不能用于关闭双重验证。')}</p><AppForm form={form} className="flex flex-col gap-4"><AppOTPField name="code" label={t('身份验证器验证码')} /><Button type="submit" variant="danger" pending={disable.isPending}>{t('确认关闭')}</Button></AppForm></Modal>}
    </CardContent>
  </Card>;
}
function TOTPSetupDialog({ web, enterprise, resume, onClose, onEnabled }: { web: WebClient; enterprise: boolean; resume: boolean; onClose: () => void; onEnabled: (codes: string[]) => void }) {
  useLocale();
  const message = useMessage();
  const resumed = useQuery({ queryKey: ['pending-totp'], queryFn: () => web.pendingTOTP(), enabled: enterprise && resume, gcTime: 0, retry: false });
  const [setup, setSetup] = useState<TOTPSetup>();
  const [qr, setQR] = useState('');
  const [seconds, setSeconds] = useState(30);
  const inflight = useRef(false);
  const form = useAppForm({ defaultValues: { password: '', code: '' }, onSubmit: values => { if(setup) enable.mutate(values.code); else begin.mutate(); } });
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
export function AccountSessionsPage({ client, refresh }: PageProps) {
  useLocale();
  if (!client.web) return null;
  return <LoginDevices web={client.web} onSignedOut={refresh} />;
}
function LoginDevices({ web, onSignedOut }: { web: WebClient; onSignedOut: () => void }) {
  const locale=useLocale();
  const message = useMessage();
  const [target, setTarget] = useState<{ id: string; current: boolean } | 'others'>();
  const query = useQuery({ queryKey: ['account-sessions'], queryFn: () => web.accountSessions(), refetchInterval: 30000 });
  const revoke = useMutation({ mutationFn: async (selected: {id:string;current:boolean}|'others') => selected === 'others' ? web.revokeOtherSessions() : web.revokeAccountSession(selected.id), onSuccess: (_, selected) => { const current = selected !== 'others' && selected.current; setTarget(undefined); message.success(t('设备会话已下线')); if (current) onSignedOut(); else void query.refetch(); } });
  const date = (value: number) => value ? new Date(value * 1000).toLocaleString(locale) : t('未知');
  return <div className="flex min-w-0 flex-col gap-6">
    <PageHeader title={t('登录会话')} description={t('查看当前有效的登录设备。发现异常时，请立即下线设备并修改密码。')}
      actions={<><Button variant="ghost" onClick={() => void query.refetch()} disabled={query.isFetching}>{t('刷新')}</Button><Button variant="secondary" disabled={!query.data || query.data.items.length <= 1} onClick={() => setTarget('others')}>{t('下线其他设备')}</Button></>} />
    <Card className="max-w-4xl"><CardContent className="flex flex-col gap-3">
      {query.isPending ? <p role="status" className="py-8 text-sm text-muted">{t('正在读取登录会话…')}</p> : query.error ? <div role="alert" className="flex flex-col items-start gap-2"><p>{t(query.error.message)}</p><Button onClick={() => void query.refetch()}>{t('重试')}</Button></div> : query.data.items.length === 0 ? <p className="py-8 text-sm text-muted">{t('没有有效的登录会话')}</p> : query.data.items.map(device => <div key={device.id} className="flex flex-col gap-4 rounded-lg border border-line p-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap items-center gap-2"><Monitor size={17} className="text-muted" aria-hidden="true" /><strong className="text-sm">{device.user_agent ? /Mobile|Android|iPhone/.test(device.user_agent) ? t('移动设备') : t('电脑或浏览器') : t('未知设备')}{device.current && <Badge className="ms-2" variant="success">{t('当前会话')}</Badge>}</strong></div><p className="break-all text-xs text-muted">{device.user_agent || t('未记录设备信息')}</p><dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2"><StaticField label={t('IP 地址')}>{device.ip_address || t('未知')}</StaticField><StaticField label={t('最近活动')}>{date(device.last_seen_at)}</StaticField><StaticField label={t('登录时间')}>{date(device.created_at)}</StaticField><StaticField label={t('到期时间')}>{date(device.expires_at)}</StaticField></dl></div><Button variant="secondary" disabled={revoke.isPending} onClick={() => setTarget({ id: device.id, current: device.current })}>{t('下线设备')}</Button></div>)}
      {target && <ConfirmDialog title={target === 'others' ? t('下线其他设备') : t('下线设备')} description={target !== 'others' && target.current ? t('这将退出当前设备，需要重新登录。') : t('选定设备的服务端会话将立即失效。')} confirmLabel={t('确认下线')} cancelLabel={t('取消')} danger pending={revoke.isPending} onConfirm={() => revoke.mutate(target)} onCancel={() => setTarget(undefined)} />}
    </CardContent></Card>
  </div>;
}
/** Enterprise login binding ported from the legacy account security panel; the shell owns password changes. */
function EnterpriseAccountSecurity({ web, userID, onOidcConsumed, onChanged }: {
  web: WebClient; userID: string; onOidcConsumed: () => void; onChanged: () => void;
}) {
  useLocale();
  const message = useMessage();
  const { oidc } = useRouteSearch<{ oidc: string }>();
  const result = oidc === 'failed'
    ? t('企业身份验证未完成或已过期，请重新发起。你仍可使用本地账号登录。')
    : oidc === 'link_required'
      ? t('请先使用本地账号登录，再到「账号资料」绑定企业账号；新用户请联系管理员。')
      : '';
  useEffect(() => {
    if (oidc === 'success') message.success(t('企业账号已绑定，其他设备的旧会话已退出。'));
  }, [oidc, message]);
  const query = useQuery({ queryKey: ['oidc-account', userID], queryFn: () => web.oidcAccount() });
  const form = useAppForm<{ password: string }>({
    schema: 'OIDCPasswordInput',
    defaultValues: { password: '' },
    onSubmit: values => {
      if (values.password.length < 12) { form.setError('password', { type: 'manual', message: t('至少 12 个字符') }); return; }
      change.mutate(values.password);
    },
  });
  const change = useMutation({
    mutationFn: async (password: string) => {
      if (query.data?.linked) { await web.oidcUnlink(password); onOidcConsumed(); return; }
      const start = await web.oidcLink(password);
      window.location.assign(start.authorization_url);
    },
    onSuccess: () => {
      if (query.data?.linked) message.success(t('企业绑定已解除，本地密码登录可用。'));
      form.reset({ password: '' });
      void query.refetch();
      onChanged();
    },
    onError: error => form.applyServerError(error),
  });
  if (query.isPending) return <Card><CardContent className="py-10 text-center text-sm text-muted" role="status">{t('正在读取账号安全信息…')}</CardContent></Card>;
  if (query.error) return <Card><CardContent className="flex flex-col items-center gap-2 py-10 text-center" role="alert">
    <p className="text-sm text-muted">{t(query.error.message)}</p>
    <Button variant="secondary" onClick={() => void query.refetch()}>{t('重试')}</Button>
  </CardContent></Card>;
  const info = query.data;
  const linked = !!info.linked;
  return <Card>
    <CardHeader className="flex-row items-start justify-between gap-3">
      <div>
        <CardTitle><ShieldCheck size={18} className="text-accent" aria-hidden="true" />{t('企业账号绑定')}</CardTitle>
        <CardDescription>{t('登录方式由你管理，工作空间权限由实例管理员授予。')}</CardDescription>
      </div>
      <Badge variant={linked ? 'success' : 'subtle'}>{linked ? t('已绑定') : t('未绑定')}</Badge>
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      {result && <Alert variant="danger">{result}</Alert>}
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
        <StaticField label={t('企业登录')}>{info.enabled ? info.provider_name : t('实例尚未启用')}</StaticField>
        <StaticField label={t('本地密码')}>{info.has_local_password ? t('可用') : t('尚未设置')}</StaticField>
        {linked && <StaticField label={t('身份来源')}>{info.issuer}</StaticField>}
      </dl>
      <p className="text-xs text-muted">{t('每个账号可绑定一个企业身份。相同邮箱不会自动合并；企业角色声明不会更改本地权限。更改绑定后，其他会话及待用验证码会失效。')}</p>
      {!info.has_local_password
        ? <p className="text-xs text-muted">{t('请联系管理员开启邮件找回密码，设置本地密码后再解除绑定。')}</p>
        : (info.enabled || linked) && <AppForm form={form} className="flex flex-col gap-2">
            <AppField name="password" label={t('确认本地密码')} className="max-w-sm">
              <Input type="password" required minLength={12} maxLength={128} autoComplete="current-password" />
            </AppField>
            <p className="text-xs text-muted">{linked ? t('解除后保留本地账号和密码，可继续正常登录。') : t('下一步将重新验证企业账号，请确认选择自己的账号。')}</p>
            <div>
              <Button type="submit" variant={linked ? 'secondary' : 'primary'} pending={change.isPending}>
                {!change.isPending && (linked ? <Unlink size={16} /> : <Link2 size={16} />)}
                {linked ? t('确认解除绑定') : t('验证并绑定企业账号')}
              </Button>
            </div>
          </AppForm>}
    </CardContent>
  </Card>;
}
