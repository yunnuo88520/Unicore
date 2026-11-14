// Author: yunnuo <ymz@ebox.vip>
// Description: Linked authentication pages with shared forms, confirmed passwords and real email recovery.
import { t, useLocale, defineMessages } from '../i18n';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, Navigate, useRouter, useRouterState } from '@tanstack/react-router';
import { ArrowRight, Building2, Check, CheckCircle2, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { AppError, validate, type EmailChallenge, type WebClient } from '@unicore/sdk';
import { useRouteSearch, useSessionNotice, type PageProps } from '../router';
import { BrandLockup } from '../brand';
import { HumanCheck, type HumanCheckProvider } from '../human-check';
import { Alert, Button, Input } from '@unicore/ui';
import { buttonVariants } from '@unicore/ui';
import { AppField, AppForm, useAppForm } from '@unicore/form';
import { AppOTPField } from '@unicore/form/fields';
import { cn } from '@unicore/ui/cn';

type Mode = 'login' | 'email' | 'register' | 'forgot' | 'resend';
type AuthValues = { username: string; email: string; phone: string; password: string; confirm_password: string; code: string; captcha_answer: string };
const AUTH_PATHS: Record<Mode, string> = { login: '/login', register: '/register', forgot: '/forgot-password', email: '/email-login', resend: '/resend-verification' };
const EMPTY_AUTH: AuthValues = { username: '', email: '', phone: '', password: '', confirm_password: '', code: '', captcha_answer: '' };
const AUTH_MESSAGES = defineMessages({
  invalid: '请检查表单输入',
  mismatch: '两次输入的密码不一致',
  confirmation: '请再次输入密码',
  password: '密码至少 12 个字符，且不超过 128 字节',
  captcha: '请输入 6 位图形验证码',
  code: '请先获取邮箱验证码',
  phone: '请输入有效的手机号',
});

function modeForPath(pathname: string): Mode {
  return (Object.keys(AUTH_PATHS) as Mode[]).find(mode => AUTH_PATHS[mode] === pathname) ?? (pathname === '/registration-success' ? 'register' : 'login');
}

export function LoginPage({ client, metadata, refresh }: PageProps) {
  const notice = useSessionNotice();
  if (!client.web) return null;
  if (metadata.mfa_pending) return <MFAFlow web={client.web} onDone={refresh} />;
  if (metadata.current_user) return <Navigate to="/" replace />;
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

function AuthLink({ children, to, onNavigate, disabled = false }: { children: ReactNode; to: string; onNavigate?: () => void; disabled?: boolean }) {
  const className = 'inline-flex items-center gap-1 font-medium text-accent underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus';
  if (disabled) return <span aria-disabled="true" className={cn(className, 'opacity-50')}>{children}</span>;
  return <Link to={to} className={className} onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) onNavigate?.(); }}>{children}</Link>;
}


function AuthIllustration({ kind, step, verifyEmail }: { kind: 'login' | 'register' | 'forgot'; step: number; verifyEmail: boolean }) {
  useLocale();
  if (kind === 'register') {
    const steps = [t('创建账号'), verifyEmail ? t('验证邮箱') : t('准备就绪'), t('开始使用')];
    return <div className="mt-10 rounded-2xl border border-line bg-surface/80 px-7 py-8 shadow-card">
      <ol className="relative grid grid-cols-3 gap-2 text-center text-xs" aria-label={t('注册步骤')}>
        <span aria-hidden="true" className="absolute inset-x-[17%] top-6 h-0.5 bg-primary-line" />
        {steps.map((label, index) => <li key={label} aria-current={index + 1 === step ? 'step' : undefined} className="relative flex flex-col items-center gap-3">
          <span className={cn('flex size-12 items-center justify-center rounded-full border-4 border-surface font-semibold ring-1 ring-line', index + 1 < step ? 'bg-success-soft text-success' : index + 1 === step ? 'bg-primary-soft text-accent ring-primary-line' : 'bg-surface-alt text-muted')}>
            {index + 1 < step ? <Check size={18} aria-hidden="true" /> : index + 1}
          </span><span className="font-medium text-ink">{label}</span>
        </li>)}
      </ol>
      <div aria-hidden="true" className="mx-auto mt-6 h-1.5 w-28 overflow-hidden rounded-full bg-primary-soft"><div className="h-full rounded-full bg-success" style={{ width: String(step / 3 * 100) + '%' }} /></div>
    </div>;
  }
  const recovering = kind === 'forgot';
  return <div className="relative mt-10 flex min-h-48 items-center justify-center overflow-hidden rounded-2xl border border-line bg-surface/80 p-7 shadow-card" aria-hidden="true">
    <div className="absolute inset-x-12 top-1/2 border-t-2 border-dashed border-primary-line" />
    <span className="absolute start-10 top-1/2 -translate-y-1/2 rounded-full bg-primary-soft p-1 text-accent"><Check size={13} /></span>
    <span className="absolute end-10 top-1/2 -translate-y-1/2 rounded-full bg-success-soft p-1 text-success"><Check size={13} /></span>
    <div className="relative flex w-48 flex-col items-center gap-3 rounded-2xl border border-line bg-surface px-7 py-5">
      <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-accent">{recovering ? <LockKeyhole size={29} strokeWidth={1.7} /> : <UserRound size={27} strokeWidth={1.7} />}</span>
      <span className="h-2 w-full rounded-full bg-line" /><span className="h-2 w-3/4 rounded-full bg-line" />
      <span className="mt-1 text-center text-2xs text-muted">{recovering ? t('验证身份并重置密码') : t('安全连接你的工作空间')}</span>
    </div>
  </div>;
}

function AuthLayout({ siteName, administrator = false, mode, success = false, challenge = false, verifyEmail = true, children }: {
  siteName: string; administrator?: boolean; mode: Mode; success?: boolean; challenge?: boolean; verifyEmail?: boolean; children: ReactNode;
}) {
  useLocale();
  const recovering = mode === 'forgot';
  const registering = mode === 'register';
  return <main className="relative grid w-full flex-1 lg:min-h-[740px] lg:grid-cols-[0.45fr_0.55fr]">
    <div className="flow-brand absolute start-6 top-6 z-10 flex max-w-[calc(100%-8rem)] items-center gap-2 text-lg font-semibold text-ink lg:start-12 lg:top-10 lg:max-w-[35%]"><BrandLockup name={siteName} /></div>
    <section className="relative hidden flex-col justify-center overflow-hidden border-e border-line/40 px-10 py-28 lg:flex xl:px-14"
      style={{ backgroundImage: 'radial-gradient(ellipse at top left, var(--color-primary-soft), transparent 70%), linear-gradient(145deg, var(--color-surface-alt), var(--color-primary-soft))' }}>
      <p className="text-xs font-semibold tracking-[0.22em] text-accent">{recovering ? t('账户恢复') : registering ? success ? t('准备就绪') : t('快速开始') : administrator ? t('管理控制台') : t('用户工作空间')}</p>
      <h2 className="mt-6 text-balance text-[clamp(2.1rem,3.3vw,3rem)] font-semibold leading-[1.3] tracking-tight text-ink">
        {recovering ? t('安全地找回你的账户访问权限') : registering ? success ? t('账户已就绪') : t('创建你的账户') : t('登录你的工作空间')}
      </h2>
      <p className="mt-6 text-sm leading-7 text-muted">{recovering ? t('通过注册邮箱确认身份，重新设置密码，安心回到工作空间。') : registering ? success ? t('从一个账号出发，让项目、文件与想法有序连接。') : t('只需完成几步，即可开始管理项目、文件与账号。') : t('使用熟悉的账号，回到属于你的项目、文件与想法。')}</p>
      <AuthIllustration kind={recovering ? 'forgot' : registering ? 'register' : 'login'} step={success ? 3 : challenge ? 2 : 1} verifyEmail={verifyEmail} />
    </section>
    <section className="flex min-w-0 flex-col items-center justify-center px-6 pb-10 pt-28 sm:px-12 lg:px-12 lg:py-20 xl:px-16">
      <div className="w-full max-w-md">{children}</div>
    </section>
  </main>;
}

function passwordErrors(password: string, confirmation: string): Record<string, string> {
  const fields: Record<string, string> = {};
  if (Array.from(password).length < 12 || new TextEncoder().encode(password).length > 128) fields.password = AUTH_MESSAGES.password;
  if (!confirmation) fields.confirm_password = AUTH_MESSAGES.confirmation;
  else if (password !== confirmation) fields.confirm_password = AUTH_MESSAGES.mismatch;
  return fields;
}

function AuthFlow({ administrator = false, web, siteName, onDone, notice }: { administrator?: boolean; web: WebClient; siteName: string; onDone: () => void; notice?: string }) {
  useLocale();
  const router = useRouter();
  const location = useRouterState({ select: state => state.location });
  const mode = administrator && (location.pathname === '/register' || location.pathname === '/registration-success') ? 'login' : modeForPath(location.pathname);
  const search = useRouteSearch<{ oidc: string; state: string }>();
  const bindState = !administrator && mode === 'login' && search.oidc === 'bind' && search.state?.length === 43 ? search.state : '';
  const successKind = 'authSuccess' in location.state ? location.state.authSuccess : undefined;
  const registrationSuccess = location.pathname === '/registration-success' && (successKind === 'registered' || successKind === 'verified');
  const generation = useRef({ path: location.pathname, value: 0 });
  if (generation.current.path !== location.pathname) generation.current = { path: location.pathname, value: generation.current.value + 1 };
  const [challenge, setChallenge] = useState<EmailChallenge>();
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [done, setDone] = useState(false);
  const policy = useQuery({ queryKey: ['auth-policy'], queryFn: () => web.authPolicy() });
  const needsCaptcha = !challenge && (mode === 'register' || mode === 'resend' ? policy.data?.register_captcha : policy.data?.login_captcha);
  // Click-through human verification guards user login, email-code login and registration.
  const humanRequired = !challenge && !administrator && !!policy.data?.human_check_enabled;
  const humanWidget = { provider: (policy.data?.human_check_provider ?? 'turnstile') as HumanCheckProvider, siteKey: policy.data?.human_check_site_key ?? '', region: policy.data?.human_check_region ?? '', prefix: policy.data?.human_check_prefix ?? '' };
  const [humanToken, setHumanToken] = useState({ token: '', randstr: '' });
  const [humanReset, setHumanReset] = useState(0);
  const onHumanToken = useCallback((token: string, randstr: string) => setHumanToken({ token, randstr }), []);
  useEffect(() => { setHumanToken({ token: '', randstr: '' }); }, [mode]);
  const humanFields = () => humanToken.token ? { human_check_token: humanToken.token, human_check_randstr: humanToken.randstr } : {};
  const captcha = useQuery({ queryKey: ['account-captcha', mode, !!challenge], queryFn: () => web.captcha(), enabled: !!needsCaptcha && !registrationSuccess, staleTime: 0, gcTime: 0 });
  useEffect(() => { if (retryAt <= Date.now()) return; const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, [retryAt]);
  useEffect(() => { if (location.pathname === '/registration-success' && !registrationSuccess) void router.navigate({ to: '/register', replace: true }); }, [location.pathname, registrationSuccess, router]);
  const purpose = mode === 'email' ? 'login' : mode === 'forgot' ? 'reset' : 'verify';
  const retry = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const form = useAppForm<AuthValues>({ defaultValues: EMPTY_AUTH, onSubmit: async raw => {
    const values = { ...raw, username: raw.username.trim(), email: raw.email.trim().toLowerCase() };
    const graphic = { captcha_id: captcha.data?.id ?? '', captcha_answer: values.captcha_answer };
    let fields: Record<string, string>;
    if (challenge) fields = validate('EmailCodeInput', { challenge_id: challenge.challenge_id, code: values.code, password: purpose === 'reset' ? values.password : '' });
    else if (mode === 'login') fields = validate('LoginInput', { username: values.username, password: values.password, ...graphic });
    else if (mode === 'register') fields = validate('RegisterInput', { username: values.username, email: values.email, password: values.password, phone: values.phone.trim(), ...graphic });
    else fields = validate('EmailRequest', { email: values.email, ...graphic });
    if ((!challenge && mode === 'register') || (challenge && purpose === 'reset')) Object.assign(fields, passwordErrors(values.password, values.confirm_password));
    if (mode === 'register' && policy.data?.phone_required && !/^\+?[0-9]{5,20}$/.test(values.phone.trim())) fields.phone = AUTH_MESSAGES.phone;
    if (needsCaptcha && !/^[0-9]{6}$/.test(values.captcha_answer)) fields.captcha_answer = AUTH_MESSAGES.captcha;
    if (mode === 'forgot' && !challenge) fields.code = AUTH_MESSAGES.code;
    form.clearErrors();
    if (Object.keys(fields).length) { form.applyServerError(new AppError('INVALID_INPUT', AUTH_MESSAGES.invalid, '', fields)); return; }
    await submit.mutateAsync().catch(() => {});
  } });
  const values = form.watch();
  function validateRegistrationPassword(name: 'password' | 'confirm_password') {
    const current = form.getValues();
    const message = current[name] ? passwordErrors(current.password, current.confirm_password)[name] : undefined;
    if (message) form.setError(name, { type: 'password-rule', message });
    else form.clearErrors(name);
  }
  function passwordField(event: React.SyntheticEvent<HTMLFormElement>) {
    if (mode !== 'register' || challenge || !(event.target instanceof HTMLInputElement)) return;
    const name = event.target.name;
    if (name !== 'password' && name !== 'confirm_password') return;
    if (event.type !== 'blur') return;
    validateRegistrationPassword(name);
    if (name === 'password' && (form.formState.touchedFields.confirm_password || form.getFieldState('confirm_password').error)) validateRegistrationPassword('confirm_password');
  }
  function clearSecrets() { form.setValue('password', ''); form.setValue('confirm_password', ''); form.setValue('captcha_answer', ''); }
  function acceptChallenge(result: EmailChallenge) {
    setChallenge(result); setRetryAt(Date.now() + result.retry_after * 1000); setNow(Date.now()); form.setValue('code', ''); clearSecrets(); form.clearErrors();
  }
  const submit = useMutation({
    mutationFn: async () => {
      const version = generation.current.value;
      const current = { ...form.getValues(), username: form.getValues('username').trim(), email: form.getValues('email').trim().toLowerCase() };
      const graphic = { captcha_id: captcha.data?.id ?? '', captcha_answer: current.captcha_answer };
      let result: EmailChallenge | null = null;
      if (mode === 'login') await web.login({ username: current.username, password: current.password, ...graphic, ...humanFields() });
      else if (challenge) await web.completeCode(purpose, { challenge_id: challenge.challenge_id, code: current.code, password: purpose === 'reset' ? current.password : '' });
      else if (mode === 'register') { const response = await web.registerCode({ username: current.username, email: current.email, password: current.password, phone: current.phone.trim(), ...graphic, ...humanFields() }); result = response.registration_complete ? null : response; }
      else result = await web.requestCode(purpose, { email: current.email, ...graphic, ...humanFields() });
      return { result, version };
    },
    onSuccess: ({ result, version }) => {
      if (version !== generation.current.value) return;
      clearSecrets();
      if (mode === 'login' || (challenge && mode === 'email')) { onDone(); void router.navigate({ to: '/' }); return; }
      if (result) acceptChallenge(result);
      else if (mode === 'register') {
        setChallenge(undefined); form.setValue('code', '');
        void router.navigate({ to: '/registration-success', replace: true, state: previous => ({ ...previous, authSuccess: challenge ? 'verified' : 'registered' }) });
      } else { setDone(true); setChallenge(undefined); form.setValue('code', ''); }
    },
    onError: error => {
      form.applyServerError(error);
      if (needsCaptcha) { form.setValue('captcha_answer', ''); void captcha.refetch(); }
      if (error instanceof AppError && error.code === 'HUMAN_CHECK_FAILED') setHumanReset(value => value + 1);
    },
  });
  const sendReset = useMutation({
    mutationFn: async () => {
      const current = { ...form.getValues(), username: form.getValues('username').trim(), email: form.getValues('email').trim().toLowerCase() };
      const graphic = { captcha_id: captcha.data?.id ?? '', captcha_answer: current.captcha_answer };
      const version = generation.current.value;
      return { result: await web.requestCode('reset', { email: current.email, ...graphic }), version };
    },
    onSuccess: ({ result, version }) => { if (version === generation.current.value) acceptChallenge(result); },
    onError: error => { form.applyServerError(error); if (needsCaptcha) { form.setValue('captcha_answer', ''); void captcha.refetch(); } },
  });
  const busy = submit.isPending || sendReset.isPending;
  useEffect(() => {
    setChallenge(undefined); setDone(false); setRetryAt(0); clearSecrets(); form.setValue('code', ''); form.clearErrors(); submit.reset(); sendReset.reset();
    // URL changes own the flow; language/theme changes must preserve form drafts.
  }, [mode]);
  function beforeNavigation() { clearSecrets(); setDone(false); form.clearErrors(); }
  function requestReset() {
    if (challenge && policy.data?.login_captcha) {
      setChallenge(undefined); clearSecrets(); form.setValue('code', ''); form.clearErrors(); return;
    }
    const current = { ...form.getValues(), username: form.getValues('username').trim(), email: form.getValues('email').trim().toLowerCase() };
    const fields = validate('EmailRequest', { email: current.email, captcha_id: captcha.data?.id ?? '', captcha_answer: current.captcha_answer });
    if (needsCaptcha && !/^[0-9]{6}$/.test(current.captcha_answer)) fields.captcha_answer = AUTH_MESSAGES.captcha;
    form.clearErrors();
    if (Object.keys(fields).length) { form.applyServerError(new AppError('INVALID_INPUT', AUTH_MESSAGES.invalid, '', fields)); return; }
    sendReset.mutate();
  }
  const complete = done || registrationSuccess;
  const titles: Record<Mode, string> = { login: administrator ? t('管理员登录 · {{v0}}', { v0: siteName }) : t('登录 {{v0}}', { v0: siteName }), email: t('邮箱验证码登录'), register: t('创建账号'), forgot: t('找回密码'), resend: t('重新验证邮箱') };
  const title = registrationSuccess ? t('注册成功') : done ? purpose === 'reset' ? t('密码已重置') : t('邮箱验证成功') : challenge ? purpose === 'verify' ? t('验证邮箱') : purpose === 'reset' ? t('设置新密码') : t('输入登录验证码') : titles[mode];
  const registrationClosed = mode === 'register' && !!policy.data && !policy.data.registration_enabled && !registrationSuccess;
  const resetClosed = mode === 'forgot' && !!policy.data && !policy.data.reset_enabled;
  const labels: Record<Mode, string> = { login: t('登录工作空间'), email: t('发送登录验证码'), register: policy.data?.email_verification_required ? t('注册并验证邮箱') : t('注册'), forgot: t('验证并重置密码'), resend: t('发送邮箱验证码') };
  const error = submit.error ?? sendReset.error;
  useEffect(() => {
    // Mutation callbacks run while the fieldset can still be disabled. Focus
    // after that state has committed, rather than racing a disabled input.
    if (busy || !(error instanceof AppError)) return;
    const field = Object.keys(error.fields).find(name => Object.hasOwn(EMPTY_AUTH, name));
    if (field) form.setFocus(field as keyof AuthValues);
  }, [busy, error]);
  return <AuthLayout siteName={siteName} administrator={administrator} mode={mode} success={registrationSuccess} challenge={!!challenge} verifyEmail={!!policy.data?.email_verification_required}>
    <header className={cn('text-center', complete ? 'mb-8' : 'mb-9')}>
      {complete && <span className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-success-soft text-success"><CheckCircle2 size={33} strokeWidth={1.6} aria-hidden="true" /></span>}
      <h1 tabIndex={-1} className="text-balance text-[clamp(1.6rem,2.5vw,2rem)] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
      <p role={complete ? "status" : undefined} className="mt-3 text-sm leading-6 text-muted">{registrationSuccess ? successKind === 'verified' ? t('邮箱验证成功，现在可以登录。') : t('账号已创建，现在可以登录。') : done ? purpose === 'reset' ? t('密码已更新，旧会话已退出。') : t('邮箱验证成功，现在可以登录。') : mode === 'forgot' ? t('通过注册邮箱验证身份，重新设置登录密码。') : mode === 'register' ? t('填写账号信息，创建属于你的工作空间。') : challenge ? t('输入邮件中的 6 位验证码以继续。') : administrator ? t('使用独立的后台账号登录。') : t('使用账号或邮箱，继续你的工作。')}</p>
    </header>
    {notice && !complete && <p role="status" className="mb-5 rounded-xl bg-primary-soft px-4 py-3 text-sm text-ink">{t(notice)}</p>}
    {bindState && !complete && <BindLoginCard web={web} state={bindState} onDone={onDone} />}
    {complete ? <div className="flex flex-col items-center gap-6">
      <Link to="/login" replace onClick={beforeNavigation} className={cn(buttonVariants(), 'h-12 w-full rounded-xl shadow-tint')}>{t('返回登录')}<ArrowRight size={17} aria-hidden="true" /></Link>
    </div> : <>
      {registrationClosed || resetClosed ? <p role="status" className="mb-6 rounded-xl border border-line bg-surface-alt p-5 text-sm leading-7 text-muted">{registrationClosed ? t('注册暂未开放，请联系管理员获取账号。') : t('本站暂未开放邮件找回密码，请联系管理员协助恢复账号。')}</p> :
        <AppForm form={form} requiredMode="optional" className="flex flex-col gap-5" onBlur={passwordField}>
          {/* Non-field auth errors render through the AppForm summary banner; field-carrying
              errors (duplicate account) surface inline next to their controls. */}
          <fieldset disabled={busy} className="contents">
            {!challenge && (mode === 'login' || mode === 'register') && <AppField<AuthValues> name="username" label={mode === 'login' ? t('账号或邮箱') : t('账号')}>
              <Input required autoComplete="username" maxLength={mode === 'register' ? 64 : 254} placeholder={mode === 'login' ? t('请输入用户名或邮箱') : t('请输入用户名')} />
            </AppField>}
            {!challenge && (mode === 'login' || mode === 'register') && <AppField<AuthValues> name="password" label={t('密码')} hint={mode === 'register' ? t(AUTH_MESSAGES.password) : undefined}>
              <Input type="password" key={mode} label={t('密码')} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} maxLength={128} placeholder={t('请输入密码')} />
            </AppField>}
            {!challenge && mode === 'register' && <AppField<AuthValues> name="confirm_password" label={t('确认密码')}>
              <Input type="password" label={t('确认密码')} required autoComplete="new-password" maxLength={128} placeholder={t('请再次输入密码')} />
            </AppField>}
            {!challenge && mode === 'register' && policy.data?.phone_required && <AppField<AuthValues> name="phone" label={t('手机号')}>
              <Input type="tel" inputMode="tel" required autoComplete="tel" maxLength={21} placeholder={t('请输入手机号')} />
            </AppField>}
            {(!challenge && mode !== 'login' || mode === 'forgot') && <AppField<AuthValues> name="email" label={t('邮箱')}>
              <Input type="email" required autoComplete="email" maxLength={254} placeholder="name@example.com" readOnly={!!challenge} />
            </AppField>}
            {(challenge || mode === 'forgot') && <div>
              <div className={cn('gap-2', mode === 'forgot' && 'flex flex-wrap items-end')}>
                <AppOTPField<AuthValues> name="code" label={t('邮箱验证码')} disabled={!challenge} hint={challenge ? t('请输入 6 位邮箱验证码') : t('请先发送验证码')} />
                {mode === 'forgot' && <Button type="button" variant="secondary" aria-label={t('发送重置验证码')} className="mb-7 h-12 px-4" pending={sendReset.isPending} disabled={retry > 0 || policy.isPending} onClick={requestReset}>{retry > 0 ? t('{{v0}} 秒后重发', { v0: retry }) : t('发送验证码')}</Button>}
              </div>
              {challenge && <p className="mt-3 text-xs leading-5 text-muted">{t('若账号符合条件，验证码将发送至该邮箱。请检查收件箱或垃圾邮件。')}</p>}
            </div>}
            {challenge && purpose === 'reset' && <>
              <AppField<AuthValues> name="password" label={t('新密码')} hint={t(AUTH_MESSAGES.password)}><Input type="password" label={t('新密码')} required autoComplete="new-password" maxLength={128} placeholder={t('设置新密码，至少 12 个字符')} /></AppField>
              <AppField<AuthValues> name="confirm_password" label={t('确认新密码')}><Input type="password" label={t('确认新密码')} required autoComplete="new-password" maxLength={128} placeholder={t('再次输入新密码')} /></AppField>
              <p className="text-xs leading-5 text-muted">{t('修改后所有设备上的旧会话都会退出。密码至少 12 位。')}</p>
            </>}
            {needsCaptcha && <div className="grid grid-cols-[minmax(0,1fr)_7rem] items-start gap-3">
              <AppField<AuthValues> name="captcha_answer" label={t('图形验证码')} hint={t('请输入 6 位图形验证码')}>
                <Input required inputMode="numeric" autoComplete="off" minLength={6} maxLength={6} />
              </AppField>
              <button type="button" aria-label={t('刷新验证码')} disabled={captcha.isFetching} onClick={() => { form.setValue('captcha_answer', ''); void captcha.refetch(); }} className="mt-6 flex h-11 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-alt focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50">{captcha.data && !captcha.isFetching && <img src={captcha.data.image} alt={t('六位数字验证码，点击刷新')} />}</button>
            </div>}
            {humanRequired && <HumanCheck widget={humanWidget} required token={humanToken.token} onToken={onHumanToken} resetSignal={humanReset} />}
            {(policy.error || (needsCaptcha && captcha.error)) && <p role="alert" className="text-sm text-danger">{t((policy.error ?? captcha.error)?.message)}</p>}
            <Button type="submit" className="mt-1 h-12 w-full rounded-xl text-sm shadow-tint" pending={submit.isPending} disabled={policy.isPending || mode === 'forgot' && !challenge || humanRequired && !humanToken.token || !!needsCaptcha && (captcha.isFetching || !captcha.data)}>
              {challenge ? purpose === 'reset' ? t('保存新密码') : purpose === 'verify' ? t('确认验证邮箱') : t('验证并登录') : labels[mode]}
            </Button>
            {challenge && mode !== 'forgot' && <button type="button" className="text-center text-sm font-medium text-accent disabled:opacity-50" disabled={retry > 0} onClick={() => { setChallenge(undefined); form.setValue('code', ''); form.setValue('captcha_answer', ''); form.clearErrors(); submit.reset(); }}>{retry > 0 ? t('{{v0}} 秒后可重新获取', { v0: retry }) : t('重新获取验证码')}</button>}
          </fieldset>
        </AppForm>}
      <div className="mt-6 text-sm">
        {mode === 'login' ? <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          {!administrator ? <span className="text-muted">{t('没有账号？')} <AuthLink to="/register" disabled={busy} onNavigate={beforeNavigation}>{t('注册账号')}</AuthLink></span> : <span />}
          <AuthLink to="/forgot-password" disabled={busy} onNavigate={beforeNavigation}>{t('找回密码')}</AuthLink>
        </div> : <p className="text-center text-muted">{mode === 'register' ? t('已有账号？') : ''} <AuthLink to="/login" disabled={busy} onNavigate={beforeNavigation}>{t('返回登录')}</AuthLink></p>}
      </div>
      {mode === 'login' && <div className="mt-5 flex flex-col items-center gap-4">
        {policy.data?.email_login_enabled && <AuthLink to="/email-login" disabled={busy} onNavigate={beforeNavigation}>{t('邮箱验证码登录')}</AuthLink>}
        {!administrator && policy.data?.registration_enabled && policy.data?.email_verification_required && <AuthLink to="/resend-verification" disabled={busy} onNavigate={beforeNavigation}>{t('重发验证邮件')}</AuthLink>}
      </div>}
      {mode === 'login' && <EnterpriseLoginBlock web={web} />}
    </>}
  </AuthLayout>;
}

/** One-shot bind offer: the enterprise identity matches a local account, so a local
 *  password proof links it and signs in; the offer expires with its 5-minute flow. */
function BindLoginCard({ web, state, onDone }: { web: WebClient; state: string; onDone: () => void }) {
  useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await web.oidcBindLogin({ state, email: email.trim(), password });
      onDone();
    } catch (e) {
      setError(t((e as AppError).message));
    } finally {
      setPending(false);
    }
  }
  return <form onSubmit={submit} className="mb-6 flex flex-col gap-4 rounded-xl border border-primary-line bg-primary-soft p-5 text-start">
    <div>
      <strong className="text-sm font-semibold text-ink">{t('绑定企业账号并登录')}</strong>
      <p className="mt-1 text-xs leading-5 text-muted">{t('检测到与你本地账号同邮箱的企业身份。验证该账号的本地密码后即可完成绑定并直接登录。')}</p>
    </div>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <div className="flex flex-col gap-1.5">

      <Input label={t('邮箱')} type="email" required autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" />
    </div>
    <div className="flex flex-col gap-1.5">

      <Input label={t('密码')} type="password" required autoComplete="current-password" maxLength={128} value={password} onChange={event => setPassword(event.target.value)} placeholder={t('请输入密码')} />
    </div>
    <Button type="submit" pending={pending} className="h-11 w-full rounded-xl shadow-tint">{t('绑定并登录')}</Button>
    <p className="text-2xs leading-4 text-muted">{t('绑定邀请 5 分钟内有效。成功后该账号的其他会话将被退出。')}</p>
  </form>;
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
    {result && <Alert variant="danger">{result}</Alert>}
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
  const { token = '' } = useRouteSearch<{ token: string }>();
  const [done, setDone] = useState(false);
  const policy = useQuery({ queryKey: ['auth-policy'], queryFn: () => web.authPolicy() });
  const form = useAppForm({ defaultValues: { password: '', confirm_password: '' }, onSubmit: async values => {
    form.clearErrors();
    const fields = kind === 'reset' ? passwordErrors(values.password, values.confirm_password) : {};
    if (Object.keys(fields).length) { form.applyServerError(new AppError('INVALID_INPUT', AUTH_MESSAGES.invalid, '', fields)); return; }
    await submit.mutateAsync().catch(() => {});
  } });
  const submit = useMutation({
    mutationFn: () => kind === 'verify' ? web.verifyEmail(token) : web.resetPassword({ token, password: form.getValues('password') }),
    onSuccess: () => { form.reset(); setDone(true); },
    onError: (error: Error) => form.applyServerError(error),
  });
  return <AuthLayout siteName={siteName} mode={kind === 'reset' ? 'forgot' : 'resend'} success={done}>
    <header className="mb-9 text-center">
      {done && <CheckCircle2 size={48} className="mx-auto mb-5 text-success" aria-hidden="true" />}
      <h1 className="text-3xl font-semibold text-ink">{done ? kind === 'reset' ? t('密码已重置') : t('邮箱验证成功') : kind === 'verify' ? t('验证邮箱') : t('设置新密码')}</h1>
      <p className="mt-3 text-sm leading-6 text-muted">{kind === 'reset' ? t('修改后，所有设备上的旧会话都会退出。') : t('确认后启用账号，再使用密码登录。')}</p>
    </header>
    {done ? <div className="flex flex-col items-center gap-6">
      <p role="status" className="text-center text-sm text-muted">{kind === 'verify' ? t('邮箱验证成功，现在可以登录。') : t('密码已更新，旧会话已退出。')}</p>
      <Link to="/login" className={cn(buttonVariants(), 'h-12 w-full rounded-xl')} onClick={onDone}>{t('返回登录')}</Link>
    </div> : <AppForm form={form} requiredMode="optional" className="flex flex-col gap-5">
      {kind === 'reset' && <>
        <AppField name="password" label={t('新密码')} hint={t(AUTH_MESSAGES.password)}><Input type="password" label={t('新密码')} required autoComplete="new-password" maxLength={128} placeholder={t('设置新密码，至少 12 个字符')} /></AppField>
        <AppField name="confirm_password" label={t('确认新密码')}><Input type="password" label={t('确认新密码')} required autoComplete="new-password" maxLength={128} placeholder={t('再次输入新密码')} /></AppField>
      </>}
      {!token && <p role="alert" className="text-sm text-danger">{t('链接缺少凭据，请从最新邮件重新打开。')}</p>}
      {(submit.error || policy.error) && <p role="alert" className="text-sm text-danger">{t((submit.error ?? policy.error)?.message)}</p>}
      <Button type="submit" className="h-12 w-full rounded-xl" pending={submit.isPending} disabled={policy.isPending || !token}>{kind === 'verify' ? t('确认验证邮箱') : t('保存新密码')}</Button>
      <p className="text-center text-sm"><AuthLink to="/login" disabled={submit.isPending} onNavigate={onDone}>{t('返回登录')}</AuthLink></p>
    </AppForm>}
  </AuthLayout>;
}

function MFAFlow({web,onDone}:{web:WebClient;onDone:()=>void}) {
 useLocale();
 const [recovery,setRecovery]=useState(false);
 const form=useAppForm({schema:'SecurityCodeInput',defaultValues:{code:''},onSubmit:values=>{verify.mutate(values.code);}});
 const verify=useMutation({mutationFn:(code:string)=>web.verifyMFA(code),onSuccess:()=>{form.reset();onDone();},onError:form.applyServerError});
 const cancel=useMutation({mutationFn:()=>web.cancelMFA(),onSuccess:onDone});
 return <main className="flex min-h-[600px] items-center justify-center p-4"><section className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-card"><ShieldCheck size={28} className="mb-4 text-accent"/><h1 className="text-xl font-semibold">{t('双重验证')}</h1><p className="mt-2 mb-5 text-sm text-muted">{t('登录凭据已验证，请在 5 分钟内完成双重验证。')}</p><AppForm form={form} className="flex flex-col gap-4">{recovery ? <AppField name="code" label={t('恢复码')}><Input required minLength={20} maxLength={20} autoComplete="off" /></AppField> : <AppOTPField name="code" label={t('身份验证器验证码')} />}<Button type="submit" pending={verify.isPending}>{t('验证并登录')}</Button><Button type="button" variant="ghost" disabled={verify.isPending||cancel.isPending} onClick={()=>{setRecovery(value=>!value);form.reset();}}>{recovery?t('使用身份验证器'):t('使用恢复码')}</Button><Button type="button" variant="secondary" pending={cancel.isPending} disabled={verify.isPending} onClick={()=>cancel.mutate()}>{t('返回登录')}</Button></AppForm></section></main>;
}
