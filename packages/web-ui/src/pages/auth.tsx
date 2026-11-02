// Author: yunnuo <ymz@ebox.vip>
// Description: Authentication flows on the shared primitives: password login, six-digit email codes, registration and recovery.
import { t, useLocale } from '../i18n';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { ArrowUpRight, Building2, CheckCircle2, Layers3, LoaderCircle, Mail, ShieldCheck, FolderOpen } from 'lucide-react';
import { AppError, type EmailChallenge, type WebClient } from '@unicore/sdk';
import { useRouteSearch, useSessionNotice, type PageProps } from '../router';
import { BrandLockup } from '../brand';
import { Button, Input } from '../ui';
import { AppField, AppForm, useAppForm } from '../lib/form';

type Mode = 'login' | 'email' | 'register' | 'forgot' | 'resend';

export function LoginPage({ client, metadata, refresh }: PageProps) {
  const notice = useSessionNotice();
  if (!client.web) return null;
  if (metadata.mfa_pending) return <MFAFlow web={client.web} onDone={refresh} />;
  return <AuthFlow web={client.web} siteName={metadata.site_name} administrator={metadata.identity_realm === 'administrator'} notice={notice} onDone={refresh} />;
}

export function VerifyEmailPage({ client, metadata, refresh }: PageProps) {
  if (!client.web) return null;
  return <TokenFlow kind="verify" web={client.web} siteName={metadata.site_name} onDone={refresh} />;
}

export function ResetPasswordPage({ client, metadata, refresh }: PageProps) {
  if (!client.web) return null;
  return <TokenFlow kind="reset" web={client.web} siteName={metadata.site_name} onDone={refresh} />;
}

function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button type="button" className="text-start text-accent underline-offset-2 hover:underline" onClick={onClick}>{children}</button>;
}

function AuthField({ label, children }: { label: ReactNode; children: ReactNode }) {
  return <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
    {label}
    {children}
  </label>;
}

function AuthStory({ administrator, siteName, registering }: { administrator: boolean; siteName: string; registering: boolean }) {
  useLocale();
  return <section className="relative hidden flex-col justify-center overflow-hidden bg-primary-soft px-10 py-16 lg:flex lg:px-14" style={{ backgroundImage: 'radial-gradient(ellipse at top left, var(--color-primary-soft), transparent 65%), linear-gradient(145deg, var(--color-surface-alt), var(--color-primary-soft))' }}>
    <span className="text-sm font-semibold tracking-widest text-accent">{registering ? t('快速开始') : administrator ? t('管理控制台') : t('用户工作空间')}</span>
    <h2 className="mt-5 text-balance text-4xl font-semibold leading-snug tracking-tight text-ink">{registering ? t('创建账户，开启你的工作空间') : t('安全、便捷地连接每一种可能')}</h2>
    <p className="mt-5 text-sm leading-loose text-muted">{registering ? t('完成几步设置，即可开始管理你的项目、文件与账号。') : t('一个熟悉而专注的空间，连接你的项目、文件与每一种可能。')}</p>
    <div className="mt-10 flex flex-col gap-6">
      {registering ? <ol className="grid grid-cols-3 gap-2 rounded-2xl border border-line bg-surface/80 p-5 text-center text-xs" aria-label={t('注册步骤')}>{[t('创建账号'),t('完成验证'),t('开始使用')].map((label,index) => <li key={label} className="flex flex-col items-center gap-3"><span className="flex size-9 items-center justify-center rounded-full border border-primary-line bg-primary-soft font-semibold text-accent">{index+1}</span>{label}</li>)}</ol> : <>
        <AuthBenefit icon={<Layers3 size={19} />} title={t('统一工作空间')} detail={t('项目、笔记与文件，集中管理。')} />
        <AuthBenefit icon={<ShieldCheck size={19} />} title={t('两步验证防护')} detail={t('动态验证码与恢复码，守护账号安全。')} />
        <AuthBenefit icon={<FolderOpen size={19} />} title={t('私有文件管理')} detail={t('安全上传，按需授权访问。')} />
      </>}
    </div>
  </section>;
}
function AuthBenefit({icon,title,detail}:{icon:ReactNode;title:string;detail:string}){return <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface text-accent">{icon}</span><div><strong className="text-sm text-ink">{title}</strong><p className="mt-1 text-xs leading-relaxed text-muted">{detail}</p></div></div>;

}

function AuthFlow({ administrator = false, web, siteName, onDone, notice }: { administrator?: boolean; web: WebClient; siteName: string; onDone: () => void; notice?: string }) {
  useLocale();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState(''); const [email, setEmail] = useState('');
  const [password, setPassword] = useState(''); const [answer, setAnswer] = useState(''); const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<EmailChallenge>(); const [retryAt, setRetryAt] = useState(0); const [now, setNow] = useState(Date.now()); const [done, setDone] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const policy = useQuery({ queryKey: ['auth-policy'], queryFn: () => web.authPolicy() });
  const needsCaptcha = !challenge && (mode === 'register' || mode === 'resend' ? policy.data?.register_captcha : policy.data?.login_captcha);
  const captcha = useQuery({ queryKey: ['account-captcha', mode, !!challenge], queryFn: () => web.captcha(), enabled: !!needsCaptcha, staleTime: 0, gcTime: 0 });
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const purpose = mode === 'email' ? 'login' : mode === 'forgot' ? 'reset' : 'verify';
  const retry = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const submit = useMutation({
    mutationFn: async (): Promise<EmailChallenge | null> => {
      const graphic = { captcha_id: captcha.data?.id ?? '', captcha_answer: answer };
      if (mode === 'login') { await web.login({ username, password, ...graphic }); return null; }
      if (challenge) { await web.completeCode(purpose, { challenge_id: challenge.challenge_id, code, password: purpose === 'reset' ? password : '' }); return null; }
      if (mode === 'register') { const result = await web.registerCode({ username, email, password, ...graphic }); return result.registration_complete ? null : result; }
      return web.requestCode(purpose, { email, ...graphic });
    },
    onSuccess: result => {
      setPassword(''); setAnswer('');
      if (mode === 'login' || (challenge && mode === 'email')) { onDone(); void router.navigate({ to: '/' }); return; }
      if (result) { setChallenge(result); setRetryAt(Date.now() + result.retry_after * 1000); setNow(Date.now()); setCode(''); }
      else { setDone(true); setChallenge(undefined); setCode(''); }
    },
    onError: () => { if (needsCaptcha) { setAnswer(''); void captcha.refetch(); } },
  });
  function change(next: Mode) { setMode(next); setChallenge(undefined); setDone(false); setPassword(''); setCode(''); setAnswer(''); submit.reset(); }
  const titles: Record<Mode, string> = { login: administrator ? t('管理员登录 · {{v0}}', { v0: siteName }) : t('登录 {{v0}}', { v0: siteName }), email: t('邮箱验证码登录'), register: t('创建账号'), forgot: t('找回密码'), resend: t('重新验证邮箱') };
  const labels: Record<Mode, string> = { login: t('登录工作空间'), email: t('发送登录验证码'), register: policy.data?.email_verification_required ? t('注册并验证邮箱') : t('注册'), forgot: t('发送重置验证码'), resend: t('发送邮箱验证码') };
  const fields = submit.error instanceof AppError ? submit.error.fields : {};
  const fieldList = Object.values(fields);
  useEffect(() => {
    if (!fieldList.length) return;
    const control = Array.from(form.current?.elements ?? []).find(element => Object.hasOwn(fields, element.getAttribute('name') ?? '')) as HTMLElement | undefined;
    (control ?? form.current)?.focus();
    // Dependency intentionally tracks the mutation error object only.
  }, [submit.error]);
  return <main className="relative flex w-full flex-1 flex-col lg:grid lg:min-h-[700px] lg:grid-cols-[0.45fr_0.55fr]">
    <div className="flow-brand absolute start-5 top-6 z-10 flex max-w-[calc(100%-7rem)] items-center gap-2.5 text-xl font-bold tracking-tight text-ink lg:start-14 lg:top-14 lg:max-w-[35%]"><BrandLockup name={siteName} /></div>
    <AuthStory administrator={administrator} siteName={siteName} registering={mode === 'register'} />
    <section className="flex flex-col items-center justify-center px-5 pb-8 pt-20 sm:px-10 lg:py-20">
      <div className="w-full max-w-sm [&_input]:h-12 [&_input]:rounded-xl [&_button[type=submit]]:h-12 [&_button[type=submit]]:w-full [&_button[type=submit]]:rounded-xl">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-primary-soft text-accent">{challenge ? <Mail size={24} aria-hidden="true" /> : <ShieldCheck size={24} aria-hidden="true" />}</div>
        <h1 className="text-center text-2xl font-semibold text-ink">{challenge ? (purpose === 'verify' ? t('验证邮箱') : purpose === 'reset' ? t('设置新密码') : t('输入登录验证码')) : titles[mode]}</h1>
        <p className="mt-2 text-center text-sm text-muted">{challenge ? t('若账号符合条件，验证码将发送至该邮箱。请检查收件箱或垃圾邮件。') : administrator ? t('使用独立的后台账号登录。') : t('继续你的工作，连接更多可能。')}</p>
        {!administrator && mode === 'register' && policy.data && !policy.data.registration_enabled && <p role="status" className="mt-3 text-sm text-muted">{t('注册暂未开放，请联系管理员获取账号。')}</p>}
        {notice && <p role="status" className="mt-3 text-sm text-muted">{t(notice)}</p>}
        {done ? <div className="mt-5 flex flex-col items-start gap-4">
          <p role="status" className="flex items-center gap-2 text-sm text-success"><CheckCircle2 size={18} aria-hidden="true" />{purpose === 'verify' ? mode === 'register' && !policy.data?.email_verification_required ? t('账号已创建，现在可以登录。') : t('邮箱验证成功，现在可以登录。') : t('密码已更新，旧会话已退出。')}</p>
          <Button onClick={() => change('login')}>{t('返回登录')}</Button>
        </div> : <form ref={form} className="mt-5 flex flex-col gap-4" aria-busy={submit.isPending} onSubmit={event => { event.preventDefault(); if (!submit.isPending) submit.mutate(); }}>
          {fieldList.length > 0 && <div role="group" aria-label={t('表单校验')} tabIndex={-1} className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
            <strong className="block font-medium">{t('请检查表单输入')}</strong>
            <p>{fieldList.map(value => t(value)).join('; ')}</p>
          </div>}
          {submit.error && fieldList.length === 0 && <p role="alert" className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">{t(submit.error.message)}</p>}
          {!challenge && (mode === 'login' || mode === 'register') && <AuthField label={mode === 'login' ? t('账号或邮箱') : t('账号')}>
            <Input name="username" required autoComplete="username" minLength={mode === 'register' ? 3 : undefined} maxLength={254} value={username} onChange={event => setUsername(event.target.value)} />
          </AuthField>}
          {!challenge && mode !== 'login' && <AuthField label={t('邮箱')}>
            <Input name="email" type="email" required autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} />
          </AuthField>}
          {challenge && <>
            <p className="text-sm text-muted">{t('{{email}} · 10 分钟内有效', { email })}</p>
            <AuthField label={t('邮箱验证码')}>
              <Input name="code" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder={t('6 位数字')} value={code} onChange={event => setCode(event.target.value.replace(/[^0-9]/g, ''))} />
            </AuthField>
          </>}
          {((!challenge && (mode === 'login' || mode === 'register')) || (challenge && purpose === 'reset')) && <AuthField label={challenge ? t('新密码') : t('密码')}>
            <Input name="password" type="password" required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? undefined : 12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} />
          </AuthField>}
          {challenge && purpose === 'reset' && <p className="text-sm text-muted">{t('修改后所有设备上的旧会话都会退出。密码至少 12 位。')}</p>}
          {needsCaptcha && <AuthField label={t('图形验证码')}>
            <span className="flex items-stretch gap-2">
              <Input name="captcha_answer" aria-label={t('图形验证码')} inputMode="numeric" required pattern="[0-9]{6}" maxLength={6} value={answer} onChange={event => setAnswer(event.target.value.replace(/[^0-9]/g, ''))} />
              <button type="button" aria-label={t('刷新验证码')} onClick={() => { setAnswer(''); void captcha.refetch(); }} className="flex h-9 w-32 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-surface-alt transition-colors hover:bg-surface">
                {captcha.data && !captcha.isFetching && <img src={captcha.data.image} alt={t('六位数字验证码，点击刷新')} />}
              </button>
            </span>
          </AuthField>}
          {(policy.error || (needsCaptcha && captcha.error)) && <p role="alert" className="text-sm text-danger">{t((policy.error ?? captcha.error)?.message)}</p>}
          <Button type="submit" className="mt-1 self-start" disabled={(!administrator && mode === 'register' && !policy.data?.registration_enabled) || submit.isPending || policy.isPending || (!!needsCaptcha && (captcha.isFetching || !captcha.data))}>
            {submit.isPending && <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />}
            {challenge ? purpose === 'reset' ? t('保存新密码') : purpose === 'verify' ? t('确认验证邮箱') : t('验证并登录') : labels[mode]}
          </Button>
          {challenge && <button type="button" className="self-start text-sm text-accent underline-offset-2 hover:underline disabled:opacity-55 disabled:hover:no-underline" disabled={retry > 0} onClick={() => { setChallenge(undefined); setCode(''); setAnswer(''); submit.reset(); }}>
            {retry > 0 ? t('{{v0}} 秒后可重新获取', { v0: retry }) : t('重新获取验证码')}
          </button>}
        </form>}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
          {mode !== 'login' && <TextLink onClick={() => change('login')}>{t('返回登录')}</TextLink>}
          {mode === 'login' && policy.data?.email_login_enabled && <TextLink onClick={() => change('email')}>{t('邮箱验证码登录')}</TextLink>}
          {!administrator && mode === 'login' && policy.data?.registration_enabled && <TextLink onClick={() => change('register')}>{t('注册账号')}</TextLink>}
          {policy.data?.reset_enabled && mode !== 'forgot' && <TextLink onClick={() => change('forgot')}>{t('找回密码')}</TextLink>}
          {!administrator && policy.data?.registration_enabled && policy.data?.email_verification_required && mode !== 'resend' && <TextLink onClick={() => change('resend')}>{t('重发验证邮件')}</TextLink>}
        </div>
        {!administrator && mode === 'login' && policy.data && !policy.data.registration_enabled && <p className="mt-3 text-sm text-muted">{t('注册暂未开放。请联系实例管理员获取账号。')}</p>}
        {mode === 'login' && <EnterpriseLoginBlock web={web} />}
        {administrator && <div className="mt-6 text-sm"><a className="text-accent underline-offset-2 hover:underline" href="/login">{t('返回用户登录')}</a></div>}
      </div>
    </section>
  </main>;
}

/** Enterprise single sign-on entry, including the OIDC result notice carried by the route search. */
function EnterpriseLoginBlock({ web }: { web: WebClient }) {
  useLocale();
  const search = useRouteSearch<{ oidc: string }>();
  const result = search.oidc === 'failed' ? t('企业身份验证未完成或已过期，请重新发起。你仍可使用本地账号登录。')
    : search.oidc === 'link_required' ? t('请先使用本地账号登录，再到「账号资料」绑定企业账号；新用户请联系管理员。') : '';
  const query = useQuery({ queryKey: ['oidc-public'], queryFn: () => web.oidcInfo() });
  const start = useMutation({ mutationFn: () => web.oidcStart(), onSuccess: data => window.location.assign(data.authorization_url) });
  return <div className="mt-5 flex flex-col gap-2">
    {result && <p role="alert" className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">{result}</p>}
    {query.isPending && <p role="status" className="text-sm text-muted">{t('正在读取企业登录方式…')}</p>}
    {query.error && <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-danger">{t(query.error.message)}
      <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={() => query.refetch()}>{t('重试')}</button>
    </p>}
    {query.data?.enabled && <>
      <div className="my-1 flex items-center gap-3 text-2xs text-muted" role="separator">
        <span className="h-px flex-1 bg-line" /><span>{t('企业工作空间')}</span><span className="h-px flex-1 bg-line" />
      </div>
      <Button type="button" variant="secondary" className="self-start" pending={start.isPending} onClick={() => start.mutate()}>
        {!start.isPending && <Building2 size={16} aria-hidden="true" />}{t('使用{{provider}}登录', { provider: query.data.provider_name })}
      </Button>
      <p className="text-xs text-muted">{t('将跳转到企业身份服务完成验证。')}</p>
    </>}
  </div>;
}

/** Token flows from the verification and reset mails; the token arrives as a route search parameter. */
function TokenFlow({ kind, web, siteName, onDone }: { kind: 'verify' | 'reset'; web: WebClient; siteName: string; onDone: () => void }) {
  useLocale();
  const router = useRouter();
  const { token = '' } = useRouteSearch<{ token: string }>();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const policy = useQuery({ queryKey: ['auth-policy'], queryFn: () => web.authPolicy() });
  const submit = useMutation({
    mutationFn: async () => (kind === 'verify' ? web.verifyEmail(token) : web.resetPassword({ token, password })),
    onSuccess: () => { if (kind === 'reset') setPassword(''); setDone(true); },
  });
  return <main className="flex min-h-[600px] w-full flex-1 flex-col items-center justify-center gap-8 px-4 py-10 sm:px-6">
    <div className="flex items-center gap-2.5 self-start text-xl font-bold tracking-tight text-ink [&_.brand-dot]:text-primary"><BrandLockup name={siteName} /></div>
    <div className="w-full max-w-md">
      <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-primary-soft text-accent"><ShieldCheck size={24} aria-hidden="true" /></div>
      <h1 className="text-2xl font-semibold text-ink">{kind === 'verify' ? t('验证邮箱') : t('设置新密码')}</h1>
      <p className="mt-1.5 text-sm text-muted">{kind === 'reset' ? t('修改后，所有设备上的旧会话都会退出。') : t('确认后启用账号，再使用密码登录。')}</p>
      {done ? <div className="mt-5 flex flex-col items-start gap-4">
        <p role="status" className="flex items-center gap-2 text-sm text-success"><CheckCircle2 size={18} aria-hidden="true" />{kind === 'verify' ? t('邮箱验证成功，现在可以登录。') : t('密码已更新，旧会话已退出。')}</p>
        <Button onClick={() => { onDone(); void router.navigate({ to: '/login' }); }}>{t('返回登录')}</Button>
      </div> : <form className="mt-5 flex flex-col items-start gap-4" aria-busy={submit.isPending} onSubmit={event => { event.preventDefault(); if (!submit.isPending) submit.mutate(); }}>
        {kind === 'reset' && <label className="flex w-full flex-col gap-1.5 text-sm font-medium text-ink">
          {t('新密码')}
          <Input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} />
        </label>}
        {!token && <p role="alert" className="text-sm text-danger">{t('链接缺少凭据，请从最新邮件重新打开。')}</p>}
        {policy.error && <p role="alert" className="text-sm text-danger">{t(policy.error.message)}</p>}
        <Button type="submit" disabled={submit.isPending || policy.isPending || !token}>
          {submit.isPending && <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />}{kind === 'verify' ? t('确认验证邮箱') : t('保存新密码')}
        </Button>
        <button type="button" className="text-sm text-accent underline-offset-2 hover:underline" onClick={() => { onDone(); void router.navigate({ to: '/login' }); }}>{t('返回登录')}</button>
      </form>}
    </div>
  </main>;
}

function MFAFlow({web,onDone}:{web:WebClient;onDone:()=>void}) {
 useLocale();
 const [recovery,setRecovery]=useState(false);
 const form=useAppForm({schema:'SecurityCodeInput',defaultValues:{code:''},onSubmit:values=>{verify.mutate(values.code);}});
 const verify=useMutation({mutationFn:(code:string)=>web.verifyMFA(code),onSuccess:()=>{form.reset();onDone();},onError:form.applyServerError});
 const cancel=useMutation({mutationFn:()=>web.cancelMFA(),onSuccess:onDone});
 return <main className="flex min-h-[600px] items-center justify-center p-4"><section className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-card"><ShieldCheck size={28} className="mb-4 text-accent"/><h1 className="text-xl font-semibold">{t('双重验证')}</h1><p className="mt-2 mb-5 text-sm text-muted">{t('登录凭据已验证，请在 5 分钟内完成双重验证。')}</p><AppForm form={form} className="flex flex-col gap-4"><AppField name="code" label={recovery?t('恢复码'):t('身份验证器验证码')}><Input required minLength={recovery?20:6} maxLength={recovery?20:6} pattern={recovery?undefined:'[0-9]{6}'} inputMode={recovery?'text':'numeric'} autoComplete="one-time-code"/></AppField><Button type="submit" pending={verify.isPending}>{t('验证并登录')}</Button><Button type="button" variant="ghost" disabled={verify.isPending||cancel.isPending} onClick={()=>{setRecovery(value=>!value);form.reset();}}>{recovery?t('使用身份验证器'):t('使用恢复码')}</Button><Button type="button" variant="secondary" pending={cancel.isPending} disabled={verify.isPending} onClick={()=>cancel.mutate()}>{t('返回登录')}</Button></AppForm></section></main>;
}
