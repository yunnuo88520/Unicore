// Author: yunnuo <ymz@ebox.vip>
// Description: Authentication flows on the shared primitives: password login, six-digit email codes, registration and recovery.
import { t, useLocale } from '../i18n';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { ArrowUpRight, Building2, CheckCircle2, Layers3, LoaderCircle, Mail, ShieldCheck } from 'lucide-react';
import { AppError, type EmailChallenge, type WebClient } from '@unicore/sdk';
import { useRouteSearch, useSessionNotice, type PageProps } from '../router';
import { BrandLockup, BrandMark } from '../brand';
import { Button, Input } from '../ui';

type Mode = 'login' | 'email' | 'register' | 'forgot' | 'resend';

export function LoginPage({ client, metadata, refresh }: PageProps) {
  const notice = useSessionNotice();
  if (!client.web) return null;
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

function AuthStory({ administrator, siteName }: { administrator: boolean; siteName: string }) {
  useLocale();
  return <section className="relative flex flex-col justify-center overflow-hidden bg-primary-soft px-7 py-9 md:px-12 lg:px-16">
    <div className="flow-brand mb-7 self-start text-xl font-bold tracking-tight text-ink [&_.brand-dot]:text-primary"><BrandLockup name={siteName} /></div>
    <span className="inline-flex items-center gap-2 text-sm font-medium text-primary"><ShieldCheck size={15} aria-hidden="true" />{administrator ? t('管理控制台') : t('用户工作空间')}</span>
    <h2 className="mt-5 text-3xl font-semibold leading-snug tracking-tight text-ink md:text-4xl">
      {administrator ? <>{t('有序管理，')}<br />{t('从容掌控。')}</> : <>{t('你的灵感，')}<br />{t('从这里开始。')}</>}
    </h2>
    <p className="mt-5 max-w-90 text-sm leading-loose text-muted">{administrator ? t('在统一的控制台管理用户、配置和服务，让每一次运营有据可依。') : t('一个熟悉而专注的空间，连接你的项目、文件与每一种可能。')}</p>
    <div className="relative mt-4 hidden h-52 w-full max-w-80 place-items-center md:grid" aria-hidden="true">
      <span className="absolute size-52 rounded-full border border-line" />
      <span className="absolute inset-[26px] rounded-full border border-dashed border-line" />
      <div className="flex size-24 -rotate-6 items-center justify-center rounded-2xl border border-line bg-surface shadow-card"><BrandMark size={44} /></div>
      <span className="absolute bottom-5 start-0 inline-flex items-center gap-2.5 rounded-lg border border-line bg-surface px-5 py-3 text-sm text-primary"><Layers3 size={16} aria-hidden="true" />{administrator ? t('统一管理') : t('专注创造')}</span>
      <span className="absolute end-1 top-4 rounded-full bg-primary p-3 text-on-primary"><ArrowUpRight size={20} aria-hidden="true" /></span>
    </div>
    <small className="mt-8 hidden text-2xs tracking-[2px] text-muted md:block">ONE CORE. EVERY POSSIBILITY.</small>
  </section>;
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
      if (mode === 'register') return web.registerCode({ username, email, password, ...graphic });
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
  const labels: Record<Mode, string> = { login: t('登录工作空间'), email: t('发送登录验证码'), register: t('注册并验证邮箱'), forgot: t('发送重置验证码'), resend: t('发送邮箱验证码') };
  const fields = submit.error instanceof AppError ? submit.error.fields : {};
  const fieldList = Object.values(fields);
  useEffect(() => {
    if (!fieldList.length) return;
    const control = Array.from(form.current?.elements ?? []).find(element => Object.hasOwn(fields, element.getAttribute('name') ?? '')) as HTMLElement | undefined;
    (control ?? form.current)?.focus();
    // Dependency intentionally tracks the mutation error object only.
  }, [submit.error]);
  return <main className="flex min-h-dvh w-full flex-1 flex-col md:grid md:grid-cols-2">
    <AuthStory administrator={administrator} siteName={siteName} />
    <section className="flex flex-col items-center justify-center px-4 py-8 sm:px-6 md:px-10">
      <div className="w-full max-w-md">
        <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-primary-soft text-accent">{challenge ? <Mail size={24} aria-hidden="true" /> : <ShieldCheck size={24} aria-hidden="true" />}</div>
        <h1 className="text-2xl font-semibold text-ink">{challenge ? (purpose === 'verify' ? t('验证邮箱') : purpose === 'reset' ? t('设置新密码') : t('输入登录验证码')) : titles[mode]}</h1>
        <p className="mt-1.5 text-sm text-muted">{challenge ? t('若账号符合条件，验证码将发送至该邮箱。请检查收件箱或垃圾邮件。') : administrator ? t('使用独立的后台账号登录。') : t('继续你的工作，连接更多可能。')}</p>
        {!administrator && mode === 'register' && policy.data && !policy.data.registration_enabled && <p role="status" className="mt-3 text-sm text-muted">{t('注册暂未开放，请联系管理员获取账号。')}</p>}
        {notice && <p role="status" className="mt-3 text-sm text-muted">{t(notice)}</p>}
        {done ? <div className="mt-5 flex flex-col items-start gap-4">
          <p role="status" className="flex items-center gap-2 text-sm text-success"><CheckCircle2 size={18} aria-hidden="true" />{purpose === 'verify' ? t('邮箱验证成功，现在可以登录。') : t('密码已更新，旧会话已退出。')}</p>
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
          {!administrator && policy.data?.registration_enabled && mode !== 'resend' && <TextLink onClick={() => change('resend')}>{t('重发验证邮件')}</TextLink>}
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
  return <main className="flex min-h-dvh w-full flex-1 flex-col items-center justify-center gap-8 px-4 py-10 sm:px-6">
    <div className="text-xl font-bold tracking-tight text-ink [&_.brand-dot]:text-primary"><BrandLockup name={siteName} /></div>
    <div className="w-full max-w-md">
      <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-primary-soft text-accent"><ShieldCheck size={24} aria-hidden="true" /></div>
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
