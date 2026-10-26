/** Author: yunnuo <ymz@ebox.vip>
 * Description: Policy-aware account forms; email tokens stay out of URLs after initial capture.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Layers3, LoaderCircle, ShieldCheck } from 'lucide-react';
import type { WebClient } from '@unicore/sdk';

type Mode = 'login' | 'register' | 'forgot' | 'resend' | 'verify' | 'reset';
function initialMode(): Mode {
  if (window.location.hash.startsWith('#verify-email')) return 'verify';
  if (window.location.hash.startsWith('#reset-password')) return 'reset';
  return 'login';
}
export function LoginPage({ web, siteName, onDone }: { web: WebClient; siteName: string; onDone: () => void }) {
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
  const titles: Record<Mode, string> = { login: `登录 ${siteName}`, register: '创建账号', forgot: '找回密码', resend: '重新发送验证邮件', verify: '验证邮箱', reset: '设置新密码' };
  const labels: Record<Mode, string> = { login: '登录工作空间', register: '注册并验证邮箱', forgot: '发送重置邮件', resend: '发送验证邮件', verify: '确认验证邮箱', reset: '保存新密码' };
  return <main className="flow-page login-page"><div className="flow-brand"><span className="brand-mark"><Layers3 size={24} /></span><strong>unicore<span>.</span></strong></div><div className="login-card"><div className="login-icon"><ShieldCheck size={26} /></div><h1>{titles[mode]}</h1><p>{mode === 'reset' ? '修改后，所有设备上的旧会话都会退出。' : mode === 'verify' ? '确认后启用账号，再使用密码登录。' : '继续你的工作，连接更多可能。'}</p>
    {done ? <div className="flow-form"><p className="saved-caption" role="status"><CheckCircle2 size={18} />{mode === 'verify' ? '邮箱验证成功，现在可以登录。' : mode === 'reset' ? '密码已更新，旧会话已退出。' : '若账号符合条件，邮件将发送至该邮箱。请检查收件箱或垃圾邮件。'}</p><button className="primary-button" onClick={() => change('login')}>返回登录</button></div> : <form className="flow-form" onSubmit={event => { event.preventDefault(); submit.mutate(); }}>
      {(mode === 'login' || mode === 'register') && <label>{mode === 'login' ? '账号或邮箱' : '账号'}<input required autoComplete="username" minLength={mode === 'register' ? 3 : undefined} maxLength={254} value={username} onChange={event => setUsername(event.target.value)} /></label>}
      {(mode === 'register' || mode === 'forgot' || mode === 'resend') && <label>邮箱<input type="email" required autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>}
      {(mode === 'login' || mode === 'register' || mode === 'reset') && <label>{mode === 'reset' ? '新密码' : '密码'}<input type="password" required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? undefined : 12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>}
      {needsCaptcha && <label>图形验证码<div className="captcha-field"><input aria-label="图形验证码" inputMode="numeric" required maxLength={8} value={answer} onChange={event => setAnswer(event.target.value)} /><button type="button" aria-label="刷新验证码" onClick={() => { setAnswer(''); void captcha.refetch(); }}>{captcha.data && !captcha.isFetching && <img src={captcha.data.image} alt="四位数字验证码，点击刷新" />}</button></div></label>}
      {mode === 'register' && <p className="help-text">密码至少 12 字节。完成邮箱验证后才能登录。</p>}
      {(mode === 'verify' || mode === 'reset') && !token && <p className="form-error" role="alert">链接缺少凭据，请从最新邮件重新打开。</p>}
      {(submit.error || policy.error || (needsCaptcha && captcha.error)) && <p className="form-error" role="alert">{(submit.error ?? policy.error ?? captcha.error)?.message}</p>}
      <button className="primary-button" disabled={submit.isPending || policy.isPending || (!!needsCaptcha && (captcha.isFetching || !captcha.data)) || ((mode === 'verify' || mode === 'reset') && !token)}>{submit.isPending && <LoaderCircle size={15} className="spin" />}{labels[mode]}</button>
      <div className="account-links">{mode !== 'login' && <button type="button" className="text-button" onClick={() => change('login')}>返回登录</button>}{mode === 'login' && policy.data?.registration_enabled && <button type="button" className="text-button" onClick={() => change('register')}>注册账号</button>}{policy.data?.reset_enabled && mode !== 'forgot' && <button type="button" className="text-button" onClick={() => change('forgot')}>找回密码</button>}{policy.data?.registration_enabled && mode !== 'resend' && <button type="button" className="text-button" onClick={() => change('resend')}>重发验证邮件</button>}</div>
      {mode === 'login' && policy.data && !policy.data.registration_enabled && <p className="help-text">注册暂未开放。请联系实例管理员获取账号。</p>}
    </form>}
  </div></main>;
}
