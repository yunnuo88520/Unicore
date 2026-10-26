/** Author: yunnuo <ymz@ebox.vip>
 * Description: Enterprise login, explicit identity binding and provider discovery feedback.
 */
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Building2, Link2, LoaderCircle, ShieldCheck, Unlink } from 'lucide-react';
import type { WebClient } from '@unicore/sdk';

function resultMessage() {
  const status = window.location.hash.match(/(?:oidc=)([^&]+)/)?.[1];
  return status === 'failed' ? '企业身份验证未完成或已过期，请重新发起。你仍可使用本地账号登录。' : status === 'link_required' ? '请先使用本地账号登录，再到「账号安全」绑定企业账号；新用户请联系管理员。' : '';
}
export function EnterpriseLogin({ web }: { web: WebClient }) {
  const query = useQuery({ queryKey: ['oidc-public'], queryFn: () => web.oidcInfo() });
  const start = useMutation({ mutationFn: () => web.oidcStart(), onSuccess: data => window.location.assign(data.authorization_url) });
  const result = resultMessage();
  return <div className="enterprise-login">{result && <p role="alert" className="form-error">{result}</p>}{query.isPending && <p role="status" className="help-text">正在读取企业登录方式…</p>}{query.error && <p role="alert" className="form-error">{query.error.message}<button type="button" className="text-button" onClick={() => query.refetch()}>重试</button></p>}{query.data?.enabled && <><div className="flow-divider"><span>企业工作空间</span></div><button type="button" className="secondary-button" disabled={start.isPending} onClick={() => start.mutate()}>{start.isPending ? <LoaderCircle className="spin" size={17} /> : <Building2 size={17} />}使用{query.data.provider_name}登录</button><p className="help-text">将跳转到企业身份服务完成验证。</p></>}{start.error && <p role="alert" className="form-error">{start.error.message}</p>}</div>;
}

export function AccountSecurity({ web, userID, onChanged }: { web: WebClient; userID: string; onChanged: () => void }) {
  const query = useQuery({ queryKey: ['oidc-account', userID], queryFn: () => web.oidcAccount() });
  const [password, setPassword] = useState('');
  const change = useMutation({ mutationFn: async () => {
    if (query.data?.linked) { await web.oidcUnlink(password); window.history.replaceState({}, '', '/#account'); return; }
    const result = await web.oidcLink(password); window.location.assign(result.authorization_url);
  }, onSuccess: () => { setPassword(''); void query.refetch(); onChanged(); } });
  const result = resultMessage();
  if (query.isPending) return <div className="state-card" role="status">正在读取账号安全信息…</div>;
  if (query.error) return <div className="state-card"><p role="alert">{query.error.message}</p><button className="secondary-button" onClick={() => query.refetch()}>重试</button></div>;
  const info = query.data;
  return <section className="panel account-security"><div className="panel-heading"><div><h2><ShieldCheck size={20} /> 企业账号绑定</h2><p>登录方式由你管理，工作空间权限由实例管理员授予。</p></div><span className="subtle-badge">{info.linked ? '已绑定' : '未绑定'}</span></div>
    {result && <p className="form-error" role="alert">{result}</p>}{window.location.hash.includes('oidc=success') && <p className="saved-caption" role="status">企业账号已绑定，其他设备的旧会话已退出。</p>}
    <dl className="identity-details"><div><dt>企业登录</dt><dd>{info.enabled ? info.provider_name : '实例尚未启用'}</dd></div><div><dt>本地密码</dt><dd>{info.has_local_password ? '可用' : '尚未设置'}</dd></div>{info.linked && <div><dt>身份来源</dt><dd>{info.issuer}</dd></div>}</dl>
    <p className="help-text">每个账号可绑定一个企业身份。相同邮箱不会自动合并；企业角色声明不会更改本地权限。更改绑定后，其他会话及待用验证码会失效。</p>
    {!info.has_local_password ? <p className="help-text">请联系管理员开启邮件找回密码，设置本地密码后再解除绑定。</p> : (info.enabled || info.linked) && <form className="flow-form" onSubmit={event => { event.preventDefault(); change.mutate(); }}><label>确认本地密码<input type="password" required minLength={12} maxLength={128} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label><p className="help-text">{info.linked ? '解除后保留本地账号和密码，可继续正常登录。' : '下一步将重新验证企业账号，请确认选择自己的账号。'}</p>{change.error && <p role="alert" className="form-error">{change.error.message}</p>}{change.isSuccess && info.linked === false && <p className="saved-caption" role="status">企业绑定已解除，本地密码登录可用。</p>}<button className="secondary-button" disabled={change.isPending}>{change.isPending ? <LoaderCircle className="spin" size={16} /> : info.linked ? <Unlink size={16} /> : <Link2 size={16} />}{info.linked ? '确认解除绑定' : '验证并绑定企业账号'}</button></form>}
  </section>;
}

export function OIDCConnection({ web, dirty, revision }: { web: WebClient; dirty: boolean; revision: number }) {
  const info = useQuery({ queryKey: ['oidc-settings', revision], queryFn: () => web.oidcInfo() });
  const check = useMutation({ mutationFn: () => web.oidcCheck() });
  return <section className="panel oidc-connection"><div className="panel-heading"><div><h2>企业身份服务检查</h2><p>在身份服务中登记以下固定回调地址。</p></div><Building2 size={22} /></div>{info.data && <code className="oidc-callback">{info.data.callback_url}</code>}{info.error && <p role="alert" className="form-error">{info.error.message}</p>}<p className="help-text">保存配置后检查发现文档与端点。此检查不验证 Client Secret；请完成一次实际登录以确认接入。始终保留本地管理员账号。</p><button className="secondary-button" disabled={dirty || check.isPending} onClick={() => check.mutate()}>{check.isPending && <LoaderCircle size={16} className="spin" />}检查已保存的连接</button>{dirty && <p className="help-text">请先保存设置。</p>}{check.error && <p role="alert" className="form-error">{check.error.message}</p>}{check.isSuccess && <p className="saved-caption" role="status">发现文档及端点检查通过，请继续验证实际登录。</p>}</section>;
}
