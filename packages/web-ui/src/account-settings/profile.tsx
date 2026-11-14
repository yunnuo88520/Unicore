// Author: yunnuo <ymz@ebox.vip>
// Description: Profile page of the account settings modal, following the eboxui settings-profile design:
// an identity card (avatar, nickname, username, mailbox) and an account card (status, 2FA shortcut, logout),
// with every row committing on its own and floating the shared saved toast.
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { KeyRound, LogOut, Mail, UserRound } from 'lucide-react';
import type { AccountProfile, AppClient, Bootstrap } from '@unicore/sdk';
import { Badge, Button, Input, Modal, useMessage } from '@unicore/ui';
import { AppField, AppForm, StaticField, useAppForm } from '@unicore/form';
import { AppOTPField } from '@unicore/form/fields';
import { t, useLocale } from '../i18n';
import { FileUploadDialog } from '../file-upload-dialog';
import { displayLabel, UserAvatar } from '../user-avatar';
import type { AccountSettingsPage } from './modal';
import { SavableInput, SettingsCard, SettingsRow, SettingsValueField } from './rows';

export function AccountProfilePage({ client, metadata, refresh, onSaved, onNavigate }: {
  client: AppClient; metadata: Bootstrap; refresh: () => void; onSaved: () => void; onNavigate: (page: AccountSettingsPage) => void;
}) {
  useLocale();
  const query = useQuery({ queryKey: ['account-profile'], queryFn: () => client.web!.accountProfile() });
  if (!client.web || !metadata.current_user) return null;
  if (query.isPending) return <p role="status" className="py-10 text-sm text-muted">{t('正在读取个人资料…')}</p>;
  if (query.error) return <div role="alert" className="flex flex-col items-start gap-3 py-8">
    <p className="text-sm">{t(query.error.message)}</p>
    <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>{t('重试')}</Button>
  </div>;
  return <div className="flex w-full flex-col gap-6">
    <IdentityCard client={client} profile={query.data} onChanged={() => { void query.refetch(); refresh(); }} onSaved={onSaved} />
    <AccountCard web={client.web} profile={query.data} administrator={metadata.identity_realm === 'administrator'} onNavigate={onNavigate} onSignedOut={refresh} />
  </div>;
}

/** Identity card: avatar, nickname (commits on blur), immutable username, mailbox with its challenge flow. */
function IdentityCard({ client, profile, onChanged, onSaved }: {
  client: AppClient; profile: AccountProfile; onChanged: () => void; onSaved: () => void;
}) {
  useLocale();
  const web = client.web!;
  const message = useMessage();
  const [emailOpen, setEmailOpen] = useState(false);
  const avatarFiles = client.businessFiles?.('avatar') ?? client.files;
  const [avatarFileID, setAvatarFileID] = useState<string | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatar = useQuery({ queryKey: ['avatar-preview', avatarFileID], queryFn: () => avatarFiles!.fileAccess(avatarFileID!), enabled: !!avatarFileID && !!avatarFiles, staleTime: 60_000 });
  const avatarURL = avatar.data?.url;
  // ProfileInput is a strict object: the nickname rides along on every save.
  const save = useMutation({
    mutationFn: (input: { display_name: string; avatar_file_id?: string }) =>
      web.saveAccountProfile({ display_name: input.display_name, ...(input.avatar_file_id ? { avatar_file_id: input.avatar_file_id } : {}) }),
    onSuccess: () => { onSaved(); onChanged(); },
    onError: error => message.error(t(error.message)),
  });
  return <SettingsCard>
    <SettingsRow label={t('头像')} description={t('支持 PNG、JPEG 或 GIF，最大 2 MB。')}>
      <span className="flex items-center gap-2.5">
        <UserAvatar name={displayLabel(profile.display_name, profile.user.username)} url={avatarURL || profile.avatar_url} className="size-8 text-[length:var(--font-11)]" alt={t('当前头像')} />
        {avatarFiles && <Button variant="secondary" size="sm" className="h-8" disabled={save.isPending} onClick={() => setAvatarOpen(true)}>{t('上传头像')}</Button>}
        {avatarFileID && <span role="status" className="text-xs text-muted">{t('头像已上传，保存后生效')}</span>}
      </span>
    </SettingsRow>
    <SettingsRow label={t('昵称')} description={t('昵称用于展示；用户名创建后不可修改。')}>
      <SavableInput
        aria-label={t('昵称')}
        initialValue={profile.display_name || ''}
        maxLength={80}
        autoComplete="nickname"
        disabled={save.isPending}
        onSaved={value => save.mutate({ display_name: value })}
      />
    </SettingsRow>
    <SettingsRow label={t('用户名')}>
      <SettingsValueField icon={UserRound}>{profile.user.username}</SettingsValueField>
    </SettingsRow>
    <SettingsRow label={t('邮箱')} description={t('需先验证当前邮箱，再验证新邮箱。')}>
      <span className="flex items-center gap-2">
        <SettingsValueField icon={Mail} muted={!profile.user.email}>{profile.user.email || t('未绑定邮箱')}</SettingsValueField>
        <Button variant="secondary" size="sm" className="h-8" onClick={() => setEmailOpen(true)}>{t('更换邮箱')}</Button>
      </span>
    </SettingsRow>
    {avatarOpen && avatarFiles && <FileUploadDialog client={{ ...client, files: avatarFiles }} title={t('上传头像')} maxSize={2 * 1024 * 1024} accept="image/png,image/jpeg,image/gif"
      onUploaded={file => { setAvatarOpen(false); setAvatarFileID(file.file_id); save.mutate({ display_name: profile.display_name || '', avatar_file_id: file.file_id }); }}
      onClose={() => setAvatarOpen(false)} />}
    {emailOpen && <EmailChangeDialog web={web} email={profile.user.email} onClose={() => setEmailOpen(false)} onChanged={() => { onChanged(); onSaved(); }} />}
  </SettingsCard>;
}

/** Account card: status badges, the 2FA shortcut and the logout action. */
function AccountCard({ web, profile, administrator, onNavigate, onSignedOut }: {
  web: NonNullable<AppClient['web']>; profile: AccountProfile; administrator: boolean; onNavigate: (page: AccountSettingsPage) => void; onSignedOut: () => void;
}) {
  useLocale();
  const navigate = useNavigate();
  const message = useMessage();
  const logout = useMutation({
    mutationFn: () => web.logout(),
    onSuccess: () => { message.success(t('已退出登录')); void navigate({ to: '/' }); onSignedOut(); },
  });
  return <SettingsCard>
    <SettingsRow label={t('账号状态')}>
      <span className="flex flex-wrap justify-end gap-1.5">
        <Badge variant="subtle">{administrator ? t('管理员') : t('普通用户')}</Badge>
        <Badge variant={profile.user.status === 'active' ? 'success' : 'subtle'}>{profile.user.status === 'active' ? t('正常') : t('已停用')}</Badge>
      </span>
    </SettingsRow>
    <SettingsRow label={t('双重验证')} description={t('使用身份验证器生成一次性验证码，为所有登录方式增加一层保护。')}>
      <span className="flex items-center gap-2">
        <Badge variant={profile.totp_enabled ? 'success' : 'subtle'}>{profile.totp_enabled ? t('已开启') : t('未开启')}</Badge>
        <Button variant="secondary" size="sm" className="h-8" onClick={() => onNavigate('security')}><KeyRound size={14} aria-hidden="true" />{t('前往安全设置')}</Button>
      </span>
    </SettingsRow>
    <SettingsRow label={t('退出登录')} description={t('退出当前设备；在登录会话页可下线其他设备。')}>
      <Button variant="secondary" size="sm" className="h-8 hover:text-danger" disabled={logout.isPending} onClick={() => logout.mutate()}><LogOut size={14} aria-hidden="true" />{t('退出登录')}</Button>
    </SettingsRow>
  </SettingsCard>;
}

/** The two-step mailbox rebind: verify the current address, then bind the new one. */
function EmailChangeDialog({ web, email, onClose, onChanged }: { web: NonNullable<AppClient['web']>; email: string; onClose: () => void; onChanged: () => void }) {
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
