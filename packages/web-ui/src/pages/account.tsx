// Author: yunnuo <ymz@ebox.vip>
// Description: Account profile plus enterprise login binding; OIDC results arrive through the route search.
import { useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Link2, ShieldCheck, Unlink, UserRound } from 'lucide-react';
import type { WebClient } from '@unicore/sdk';
import { t, useLocale } from '../i18n';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, useMessage } from '../ui';
import { AppField, AppForm, StaticField, useAppForm } from '../lib/form';
import { useRouteSearch, type PageProps } from '../router';

export function AccountPage({ client, metadata, refresh }: PageProps) {
  useLocale();
  const navigate = useNavigate();
  if (!client.web || !metadata.current_user) return null;
  const user = metadata.current_user;
  return <section className="flex flex-col gap-4" aria-label={t('账号资料')}>
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle><UserRound size={17} className="text-accent" aria-hidden="true" />{t('账号资料')}</CardTitle>
          <CardDescription>{t('管理本地密码与企业登录绑定。')}</CardDescription>
        </div>
        <Badge variant="subtle">{metadata.identity_realm === 'administrator' ? t('管理员') : t('普通用户')}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <StaticField label={t('用户名')}>{user.username}</StaticField>
          <StaticField label={t('邮箱')}>{user.email}</StaticField>
        </div>
        <p className="text-xs text-subtle sm:max-w-52">{t('密码修改入口已移至顶部账号菜单。')}</p>
      </CardContent>
    </Card>
    <AccountSecurity
      web={client.web}
      userID={user.id}
      onOidcConsumed={() => { void navigate({ to: '/account', search: {}, replace: true }); }}
      onChanged={refresh}
    />
  </section>;
}

/** Enterprise login binding ported from the legacy account security panel; the shell owns password changes. */
function AccountSecurity({ web, userID, onOidcConsumed, onChanged }: {
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
      {result && <p role="alert" className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">{result}</p>}
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
