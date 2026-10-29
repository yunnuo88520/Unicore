/** Author: yunnuo <ymz@ebox.vip>
 * Description: Six-digit email registration, login and recovery with explicit challenge state.
 */
import { t, useLocale } from './i18n';
import { Form } from './forms';
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, LoaderCircle, Mail, ShieldCheck, Layers3, ArrowUpRight } from 'lucide-react';
import type { WebClient, EmailChallenge } from '@unicore/sdk';
import { BrandLockup, BrandMark } from './brand';
import { EnterpriseLogin } from './oidc-page';
import { LegacyLoginPage } from './legacy-account-flows';
type Mode = 'login' | 'email' | 'register' | 'forgot' | 'resend';
type Props = { administrator?:boolean;adminPath?:string; web: WebClient; siteName: string; onDone: () => void; notice?: string };
export function LoginPage(props: Props) {
  useLocale();
  if (/^#(verify-email|reset-password)(\?|$)/.test(window.location.hash)) return <LegacyLoginPage {...props} />;
  return <CodeLoginPage {...props} />;
}
function CodeLoginPage({ administrator=false,web, siteName, onDone, notice }: Props) {
  useLocale();
  const [mode, setMode] = useState<Mode>(!administrator && window.location.pathname==='/register'?'register':'login');
  const [username, setUsername] = useState(''); const [email, setEmail] = useState('');
  const [password, setPassword] = useState(''); const [answer, setAnswer] = useState(''); const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<EmailChallenge>(); const [retryAt, setRetryAt] = useState(0); const [now, setNow] = useState(Date.now()); const [done, setDone] = useState(false);
  const policy = useQuery({ queryKey: ['auth-policy'], queryFn: () => web.authPolicy() });
  const needsCaptcha = !challenge && (mode === 'register' || mode === 'resend' ? policy.data?.register_captcha : policy.data?.login_captcha);
  const captcha = useQuery({ queryKey: ['account-captcha', mode, !!challenge], queryFn: () => web.captcha(), enabled: !!needsCaptcha, staleTime: 0, gcTime: 0 });
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const purpose = mode === 'email' ? 'login' : mode === 'forgot' ? 'reset' : 'verify';
  const retry = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const submit = useMutation({
    mutationFn: async () => {
      const graphic = { captcha_id: captcha.data?.id ?? '', captcha_answer: answer };
      if (mode === 'login') { await web.login({ username, password, ...graphic }); return null; }
      if (challenge) { await web.completeCode(purpose, { challenge_id: challenge.challenge_id, code, password: purpose === 'reset' ? password : '' }); return null; }
      if (mode === 'register') return web.registerCode({ username, email, password, ...graphic });
      return web.requestCode(purpose, { email, ...graphic });
    },
    onSuccess: result => {
      setPassword(''); setAnswer('');
      if (mode === 'login' || (challenge && mode === 'email')) { if(!administrator)window.history.replaceState(null,'','/');onDone(); return; }
      if (result) { setChallenge(result); setRetryAt(Date.now() + result.retry_after * 1000); setNow(Date.now()); setCode(''); }
      else { setDone(true); setChallenge(undefined); setCode(''); }
    },
    onError: () => { if (needsCaptcha) { setAnswer(''); void captcha.refetch(); } },
  });
  function change(next: Mode) { if(!administrator)window.history.replaceState(null,'',next==='register'?'/register':'/login');setMode(next); setChallenge(undefined); setDone(false); setPassword(''); setCode(''); setAnswer(''); submit.reset(); }
  const titles: Record<Mode, string> = { login: administrator?t("管理员登录 · {{v0}}",{v0:siteName}):t("登录 {{v0}}",{v0:siteName}), email: t('邮箱验证码登录'), register: t('创建账号'), forgot: t('找回密码'), resend: t('重新验证邮箱') };
  const labels: Record<Mode, string> = { login: t('登录工作空间'), email: t('发送登录验证码'), register: t('注册并验证邮箱'), forgot: t('发送重置验证码'), resend: t('发送邮箱验证码') };
  return <main className={`flow-page login-page auth-split ${administrator?'auth-administrator':'auth-user'}`}><section className="auth-story"><div className="flow-brand"><BrandLockup name={siteName}/></div><span className="auth-realm"><ShieldCheck size={15}/>{administrator?t('管理控制台'):t('用户工作空间')}</span><h2>{administrator?<>{t("有序管理，")}<br/>{t("从容掌控。")}</>:<>{t("你的灵感，")}<br/>{t("从这里开始。")}</>}</h2><p>{administrator?t('在统一的控制台管理用户、配置和服务，让每一次运营有据可依。'):t('一个熟悉而专注的空间，连接你的项目、文件与每一种可能。')}</p><div className="auth-art" aria-hidden="true"><span className="auth-art-orbit"/><div className="auth-art-core"><BrandMark size={48}/></div><span className="auth-art-label"><Layers3 size={17}/>{administrator?t('统一管理'):t('专注创造')}</span><span className="auth-art-dot"><ArrowUpRight size={22}/></span></div><small>ONE CORE. EVERY POSSIBILITY.</small></section><section className="auth-form-side"><div className="login-card"><div className="login-icon">{challenge ? <Mail size={26} /> : <ShieldCheck size={26} />}</div><h1>{challenge ? purpose === 'verify' ? t('验证邮箱') : purpose === 'reset' ? t('设置新密码') : t('输入登录验证码') : titles[mode]}</h1><p>{challenge ? t('若账号符合条件，验证码将发送至该邮箱。请检查收件箱或垃圾邮件。') : administrator?t('使用独立的后台账号登录。'):t('继续你的工作，连接更多可能。')}</p>
    {!administrator && mode==='register' && policy.data && !policy.data.registration_enabled && <p role="status" className="help-text">{t("注册暂未开放，请联系管理员获取账号。")}</p>}{notice && <p className="help-text" role="status">{t(notice)}</p>}{done ? <div className="flow-form"><p className="saved-caption" role="status"><CheckCircle2 size={18} />{purpose === 'verify' ? t('邮箱验证成功，现在可以登录。') : t('密码已更新，旧会话已退出。')}</p><button className="primary-button" onClick={() => change('login')}>{t("返回登录")}</button></div> : <Form error={submit.error} pending={submit.isPending} className="flow-form" onSubmit={event => { event.preventDefault(); submit.mutate(); }}>
      {!challenge && (mode === 'login' || mode === 'register') && <label>{mode === 'login' ? t('账号或邮箱') : t('账号')}<input name="username" required autoComplete="username" minLength={mode === 'register' ? 3 : undefined} maxLength={254} value={username} onChange={event => setUsername(event.target.value)} /></label>}
      {!challenge && mode !== 'login' && <label>{t("邮箱")}<input name="email" type="email" required autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>}
      {challenge && <><p className="help-text">{t("{{email}} · 10 分钟内有效",{email})}</p><label>{t("邮箱验证码")}<input name="code" className="email-code" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder={t("6 位数字")} value={code} onChange={event => setCode(event.target.value.replace(/[^0-9]/g, ''))} /></label></>}
      {((!challenge && (mode === 'login' || mode === 'register')) || (challenge && purpose === 'reset')) && <label>{challenge ? t('新密码') : t('密码')}<input name="password" type="password" required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? undefined : 12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>}
      {challenge && purpose === 'reset' && <p className="help-text">{t("修改后所有设备上的旧会话都会退出。密码至少 12 位。")}</p>}
      {needsCaptcha && <label>{t("图形验证码")}<div className="captcha-field"><input name="captcha_answer" aria-label={t("图形验证码")} inputMode="numeric" required pattern="[0-9]{6}" maxLength={6} value={answer} onChange={event => setAnswer(event.target.value.replace(/[^0-9]/g, ''))} /><button type="button" aria-label={t("刷新验证码")} onClick={() => { setAnswer(''); void captcha.refetch(); }}>{captcha.data && !captcha.isFetching && <img src={captcha.data.image} alt={t("六位数字验证码，点击刷新")} />}</button></div></label>}
      {(policy.error || (needsCaptcha && captcha.error)) && <p className="form-error" role="alert">{t((policy.error ?? captcha.error)?.message)}</p>}
      <button className="primary-button" disabled={(!administrator && mode==='register' && !policy.data?.registration_enabled) || submit.isPending || policy.isPending || (!!needsCaptcha && (captcha.isFetching || !captcha.data))}>{submit.isPending && <LoaderCircle size={15} className="spin" />}{challenge ? purpose === 'reset' ? t('保存新密码') : purpose === 'verify' ? t('确认验证邮箱') : t('验证并登录') : labels[mode]}</button>
      {challenge && <button type="button" className="text-button" disabled={retry > 0} onClick={() => { setChallenge(undefined); setCode(''); setAnswer(''); submit.reset(); }}>{retry > 0 ? t("{{v0}} 秒后可重新获取",{v0:retry}) : t('重新获取验证码')}</button>}
      <div className="account-links">{mode !== 'login' && <button type="button" className="text-button" onClick={() => change('login')}>{t("返回登录")}</button>}{mode === 'login' && policy.data?.email_login_enabled && <button type="button" className="text-button" onClick={() => change('email')}>{t("邮箱验证码登录")}</button>}{!administrator && mode === 'login' && policy.data?.registration_enabled && <button type="button" className="text-button" onClick={() => change('register')}>{t("注册账号")}</button>}{policy.data?.reset_enabled && mode !== 'forgot' && <button type="button" className="text-button" onClick={() => change('forgot')}>{t("找回密码")}</button>}{!administrator && policy.data?.registration_enabled && mode !== 'resend' && <button type="button" className="text-button" onClick={() => change('resend')}>{t("重发验证邮件")}</button>}</div>
      {!administrator && mode === 'login' && policy.data && !policy.data.registration_enabled && <p className="help-text">{t("注册暂未开放。请联系实例管理员获取账号。")}</p>}
    </Form>}{mode === 'login' && <EnterpriseLogin web={web} />}
    {administrator && <div className="identity-entry-link"><a href="/login">{t("返回用户登录")}</a></div>}
  </div></section></main>;
}
