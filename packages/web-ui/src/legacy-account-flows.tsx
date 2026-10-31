/** Author: yunnuo <ymz@ebox.vip>
 * Description: Policy-aware account forms; email tokens stay out of URLs after initial capture.
 */
import { t, useLocale } from './i18n';
import { Form } from './forms';
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, LoaderCircle, ShieldCheck } from 'lucide-react';
import { BrandLockup } from './brand';
import type { WebClient } from '@unicore/sdk';

type Mode = 'login' | 'register' | 'forgot' | 'resend' | 'verify' | 'reset';
function initialMode(): Mode {
  if (window.location.hash.startsWith('#verify-email')) return 'verify';
  if (window.location.hash.startsWith('#reset-password')) return 'reset';
  return 'login';
}
export function LegacyLoginPage({ web, siteName, onDone }: { web: WebClient; siteName: string; onDone: () => void }) {
  useLocale();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('token') ?? '');
  const [username, setUsername] = useState(''); const [email, setEmail] = useState('');
  const [password, setPassword] = useState(''); const [answer, setAnswer] = useState('');
  const [done, setDone] = useState(false);
  const policy = useQuery({ queryKey: ['auth-policy'], queryFn: () => web.authPolicy() });
  const needsCaptcha = mode === 'login' || mode === 'forgot' ? policy.data?.login_captcha : mode === 'register' || mode === 'resend' ? policy.data?.register_captcha : false;
  const captcha = useQuery({ queryKey: ['account-captcha', mode], queryFn: () => web.captcha(), enabled: !!needsCaptcha, staleTime: 0, gcTime: 0 });
  useEffect(() => {
    if (mode === 'verify' || mode === 'reset') window.history.replaceState({}, '', `${window.location.pathname}#${mode === 'verify' ? 'verify-email' : 'reset-password'}`);
  }, []);
  const submit = useMutation<unknown, Error, void>({
    mutationFn: () => {
      const challenge = { captcha_id: captcha.data?.id ?? '', captcha_answer: answer };
      if (mode === 'login') return web.login({ username, password, ...challenge });
      if (mode === 'register') return web.register({ username, email, password, ...challenge });
      if (mode === 'forgot') return web.requestPasswordReset({ email, ...challenge });
      if (mode === 'resend') return web.requestVerification({ email, ...challenge });
      if (mode === 'verify') return web.verifyEmail(token);
      return web.resetPassword({ token, password });
    },
    onSuccess: () => { setPassword(''); if (mode === 'login') onDone(); else { setDone(true); setToken(''); } },
    onError: () => { setAnswer(''); if (needsCaptcha) void captcha.refetch(); },
  });
  function change(next: Mode) {
    setMode(next); setDone(false); setPassword(''); setAnswer(''); submit.reset();
    window.history.replaceState({}, '', window.location.pathname);
    if (next === 'login') onDone();
  }
  const titles: Record<Mode, string> = { login: t("登录 {{v0}}",{v0:siteName}), register: t('创建账号'), forgot: t('找回密码'), resend: t('重新发送验证邮件'), verify: t('验证邮箱'), reset: t('设置新密码') };
  const labels: Record<Mode, string> = { login: t('登录工作空间'), register: t('注册并验证邮箱'), forgot: t('发送重置邮件'), resend: t('发送验证邮件'), verify: t('确认验证邮箱'), reset: t('保存新密码') };
  return <main className="flow-page login-page"><div className="flow-brand"><BrandLockup name={siteName} /></div><div className="login-card"><div className="login-icon"><ShieldCheck size={26} /></div><h1>{titles[mode]}</h1><p>{mode === 'reset' ? t('修改后，所有设备上的旧会话都会退出。') : mode === 'verify' ? t('确认后启用账号，再使用密码登录。') : t('继续你的工作，连接更多可能。')}</p>
    {done ? <div className="flow-form"><p className="saved-caption" role="status"><CheckCircle2 size={18} />{mode === 'verify' ? t('邮箱验证成功，现在可以登录。') : mode === 'reset' ? t('密码已更新，旧会话已退出。') : t('若账号符合条件，邮件将发送至该邮箱。请检查收件箱或垃圾邮件。')}</p><button className="primary-button" onClick={() => change('login')}>{t("返回登录")}</button></div> : <Form error={submit.error} pending={submit.isPending} className="flow-form" onSubmit={event => { event.preventDefault(); submit.mutate(); }}>
      {(mode === 'login' || mode === 'register') && <label>{mode === 'login' ? t('账号或邮箱') : t('账号')}<input required autoComplete="username" minLength={mode === 'register' ? 3 : undefined} maxLength={254} value={username} onChange={event => setUsername(event.target.value)} /></label>}
      {(mode === 'register' || mode === 'forgot' || mode === 'resend') && <label>{t("邮箱")}<input type="email" required autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>}
      {(mode === 'login' || mode === 'register' || mode === 'reset') && <label>{mode === 'reset' ? t('新密码') : t('密码')}<input type="password" required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? undefined : 12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>}
      {needsCaptcha && <label>{t("图形验证码")}<div className="captcha-field"><input aria-label={t("图形验证码")} inputMode="numeric" required maxLength={6} value={answer} onChange={event => setAnswer(event.target.value)} /><button type="button" aria-label={t("刷新验证码")} onClick={() => { setAnswer(''); void captcha.refetch(); }}>{captcha.data && !captcha.isFetching && <img src={captcha.data.image} alt={t("六位数字验证码，点击刷新")} />}</button></div></label>}
      {mode === 'register' && <p className="help-text">{t("密码至少 12 字节。完成邮箱验证后才能登录。")}</p>}
      {(mode === 'verify' || mode === 'reset') && !token && <p className="form-error" role="alert">{t("链接缺少凭据，请从最新邮件重新打开。")}</p>}
      {(policy.error || (needsCaptcha && captcha.error)) && <p className="form-error" role="alert">{t((policy.error ?? captcha.error)?.message)}</p>}
      <button className="primary-button" disabled={submit.isPending || policy.isPending || (!!needsCaptcha && (captcha.isFetching || !captcha.data)) || ((mode === 'verify' || mode === 'reset') && !token)}>{submit.isPending && <LoaderCircle size={15} className="spin" />}{labels[mode]}</button>
      <div className="account-links">{mode !== 'login' && <button type="button" className="text-button" onClick={() => change('login')}>{t("返回登录")}</button>}{mode === 'login' && policy.data?.registration_enabled && <button type="button" className="text-button" onClick={() => change('register')}>{t("注册账号")}</button>}{policy.data?.reset_enabled && mode !== 'forgot' && <button type="button" className="text-button" onClick={() => change('forgot')}>{t("找回密码")}</button>}{policy.data?.registration_enabled && mode !== 'resend' && <button type="button" className="text-button" onClick={() => change('resend')}>{t("重发验证邮件")}</button>}</div>
      {mode === 'login' && policy.data && !policy.data.registration_enabled && <p className="help-text">{t("注册暂未开放。请联系实例管理员获取账号。")}</p>}
    </Form>}
  </div></main>;
}
