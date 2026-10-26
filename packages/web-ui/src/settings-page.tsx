/** Author: yunnuo <ymz@ebox.vip>
 * Description: Grouped persistent settings, masked secrets and SMTP delivery status.
 */
import { BrandingPanel } from './branding-panel';
import { invalidateAfter } from './queries';
import { Form } from './forms';
import { OIDCConnection } from './oidc-page';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Save } from 'lucide-react';
import type { AppClient, SettingPatch, WebClient } from '@unicore/sdk';

const groupNames: Record<string, string> = { site: '站点信息', appearance: '默认外观', admin: '后台入口', security: '安全', account: '账号流程', mail: '邮件服务', oidc: '企业登录（OIDC）' };
export function PersistentSettings({ client, onSaved, canWrite = true }: { client: AppClient; onSaved: () => void; canWrite?: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['persistent-settings'], queryFn: () => client.settings!() });
  const [draft, setDraft] = useState<Record<string, string>>({}); const [clear, setClear] = useState<string[]>([]);
  const save = useMutation({ mutationFn: (patch: SettingPatch) => client.patchSettings!(patch), onSuccess: () => { setDraft({}); setClear([]); void invalidateAfter(queryClient, 'settings'); onSaved(); } });
  if (query.isPending) return <div className="state-card" role="status">正在读取设置…</div>;
  if (query.isError) return <div className="state-card"><p role="alert">{query.error.message}</p><button className="secondary-button" onClick={() => query.refetch()}>重试</button></div>;
  return <>{client.branding && client.updateBranding && <BrandingPanel client={client} canWrite={canWrite} onSaved={onSaved} />}<section className="panel"><div className="panel-heading"><div><h2>实例设置</h2><p>保存后跨重启保留；敏感值仅显示配置状态</p></div><span className="subtle-badge">持久化</span></div><Form error={save.error} pending={save.isPending} className="flow-form settings-form" onSubmit={event => { event.preventDefault(); save.mutate({ changes: Object.entries(draft).map(([key, value]) => ({ key, value, ...(clear.includes(key) ? { clear: true } : {}) })) }); }}>
    {[...new Set(query.data.items.map(item => item.group))].map(group => <fieldset className="settings-group" key={group}><legend>{groupNames[group] ?? group}</legend>{group === 'account' && <p className="help-text">先保存邮件服务配置并发送测试邮件，成功后才能开放注册或找回密码。更换 SMTP 配置前先关闭这两项。</p>}{group === 'oidc' && <p className="help-text">支持授权码 + PKCE。Issuer 使用 HTTPS；首次创建账号默认关闭，开启后仅创建普通账号。修改配置会使进行中的授权失效。</p>}{group === 'mail' && <p className="help-text">建议 STARTTLS（587）或 TLS（465）；明文仅允许本机测试服务。保存后在下方测试。</p>}<div className="form-grid">{query.data.items.filter(item => item.group === group).map(entry => <div className="setting-field" key={entry.key}><label htmlFor={`setting-${entry.key}`}>{entry.label}</label>{entry.value_type === 'boolean' || entry.key === 'appearance.theme' || entry.key === 'mail.tls' ? <select id={`setting-${entry.key}`} value={draft[entry.key] ?? entry.value} onChange={event => setDraft(value => ({ ...value, [entry.key]: event.target.value }))}>{(entry.value_type === 'boolean' ? [['true', '开启'], ['false', '关闭']] : entry.key === 'mail.tls' ? [['starttls', 'STARTTLS'], ['tls', 'TLS'], ['plain', '明文（仅本机）']] : [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <input id={`setting-${entry.key}`} type={entry.sensitive ? 'password' : entry.value_type === 'integer' ? 'number' : 'text'} autoComplete={entry.sensitive ? 'new-password' : undefined} placeholder={entry.sensitive ? entry.configured ? '已配置 · 留空保留' : '尚未配置' : undefined} value={draft[entry.key] ?? entry.value} onChange={event => { setDraft(value => ({ ...value, [entry.key]: event.target.value })); setClear(value => value.filter(key => key !== entry.key)); }} />}{entry.sensitive && entry.configured && <button className="text-button" type="button" onClick={() => { setDraft(value => ({ ...value, [entry.key]: '' })); setClear(value => [...new Set([...value, entry.key])]); }}>{clear.includes(entry.key) ? '保存时将清除' : '清除已保存密钥'}</button>}{entry.key === 'admin.path' && <small className="help-text">配置错误可用 APP_ADMIN_PATH 恢复；接口仍执行权限检查。</small>}</div>)}</div></fieldset>)}
    {save.isSuccess && <p className="saved-caption" role="status">设置已保存</p>}<button className="primary-button" disabled={!canWrite || save.isPending || Object.keys(draft).length === 0}><Save size={14} />{save.isPending && <LoaderCircle size={15} className="spin" />}保存设置</button>
  </Form></section>{client.web && query.data.items.some(item => item.group === 'mail') && <MailDelivery web={client.web} dirty={Object.keys(draft).length > 0} revision={query.dataUpdatedAt} />}{client.web && query.data.items.some(item => item.group === 'oidc') && <OIDCConnection key={query.dataUpdatedAt} web={client.web} dirty={Object.keys(draft).length > 0} revision={query.dataUpdatedAt} />}</>;
}

function MailDelivery({ web, dirty, revision }: { web: WebClient; dirty: boolean; revision: number }) {
  const [recipient, setRecipient] = useState('');
  const policy = useQuery({ queryKey: ['mail-policy', revision], queryFn: () => web.authPolicy() });
  const jobs = useQuery({ queryKey: ['mail-jobs'], queryFn: () => web.mailJobs(), refetchInterval: 5000 });
  const test = useMutation({ mutationFn: () => web.testMail(recipient), onSuccess: () => { void policy.refetch(); } });
  const states: Record<string, string> = { pending: '待发送', sending: '发送中', sent: '已发送', dead: '已终止', cancelled: '已取消' };
  return <section className="panel mail-panel"><div className="panel-heading"><div><h2>邮件投递</h2><p>{policy.data?.mail_ready ? '当前 SMTP 配置已通过测试' : '当前 SMTP 配置尚未通过测试'}</p></div></div><Form schema="MailTestInput" value={{recipient}} error={test.error} pending={test.isPending} className="flow-form inline-form" onSubmit={event => { event.preventDefault(); test.mutate(); }}><label>测试收件邮箱<input type="email" required value={recipient} onChange={event => setRecipient(event.target.value)} /></label><button className="secondary-button" disabled={test.isPending || dirty}>{test.isPending && <LoaderCircle size={15} className="spin" />}发送测试邮件</button>{dirty && <p className="help-text">请先保存设置。</p>}{test.isSuccess && <p className="saved-caption" role="status">测试邮件已发送，可开启邮件账号流程。</p>}</Form><h3>最近账号邮件</h3><p className="help-text">失败自动重试，最多 5 次；列表仅显示状态。重发账号邮件请回到登录页申请。</p>{jobs.error && <p className="form-error" role="alert">{jobs.error.message}</p>}{jobs.isPending ? <p role="status">正在读取邮件状态…</p> : !jobs.data?.items.length ? <p className="help-text">暂无邮件任务</p> : <div className="user-table-wrap"><table><thead><tr><th>状态</th><th>尝试次数</th><th>创建时间</th><th>结果</th></tr></thead><tbody>{jobs.data.items.map(job => <tr key={job.id}><td>{states[job.state] ?? job.state}</td><td>{job.attempts}</td><td>{new Date(job.created_at * 1000).toLocaleString()}</td><td>{job.last_error === 'EXPIRED' ? '验证码过期' : job.last_error ? '发送失败' : '—'}</td></tr>)}</tbody></table></div>}<MailTemplates web={web} revision={revision} /></section>;
}

function MailTemplates({ web, revision }: { web: WebClient; revision: number }) {
  const [selected, setSelected] = useState('test');
  const query = useQuery({ queryKey: ['mail-templates', revision], queryFn: () => web.mailTemplates() });
  const labels: Record<string, string> = { test: 'SMTP 测试', verify: '注册验证', login: '验证码登录', reset: '找回密码' };
  const current = query.data?.items.find(item => item.purpose === selected);
  return <div className="template-panel"><h3>邮件模板预览</h3><p className="help-text">与实际发送使用同一模板；展示码为示例，邮件内嵌品牌图片。</p>{query.isPending && <p role="status">正在读取模板…</p>}{query.error && <p role="alert" className="form-error">{query.error.message}</p>}<div className="template-tabs" role="tablist" aria-label="邮件模板">{Object.entries(labels).map(([purpose, label]) => <button type="button" role="tab" aria-selected={selected === purpose} key={purpose} className="secondary-button" onClick={() => setSelected(purpose)}>{label}</button>)}</div>{current && <><p className="template-subject">{current.subject}</p><iframe className="template-preview" title={`${labels[selected]}邮件预览`} sandbox="" srcDoc={current.html} /></>}</div>;
}
