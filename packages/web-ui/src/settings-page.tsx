/** Author: yunnuo <ymz@ebox.vip>
 * Description: Scoped settings tabs retain drafts and save only the current business section.
 */
import { BrandingPanel } from './branding-panel';
import { EditionPanel } from './edition-panel';
import { Tabs } from './tabs';
import { ThemeChoices } from './appearance';
import { isAdministrator } from './routes';
import type { Theme } from './theme';
import { invalidateAfter } from './queries';
import { Form } from './forms';
import { OIDCConnection } from './oidc-page';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Save } from 'lucide-react';
import type { AppClient, Bootstrap, SettingPatch, WebClient } from '@unicore/sdk';

const groupNames: Record<string, string> = { site: '站点信息', appearance: '默认外观', admin: '后台入口', security: '安全', account: '账号流程', mail: '邮件服务', oidc: '企业登录（OIDC）' };
// Keep one tab level; every task owns one visible panel.
const sections: { id: string; label: string; groups: string[]; requires?: string }[] = [
  { id: 'site', label: '基础信息', groups: ['site'] },
  { id: 'branding', label: '品牌图片', groups: [] },
  { id: 'appearance', label: '外观设置', groups: ['appearance'] },
  { id: 'security', label: '安全与控制', groups: ['security', 'admin'] },
  { id: 'mail', label: '邮件服务', groups: ['mail'] },
  { id: 'account', label: '账号流程', groups: ['account'] },
  { id: 'mail-test', label: '发送测试', groups: [], requires: 'mail' },
  { id: 'mail-jobs', label: '投递记录', groups: [], requires: 'mail' },
  { id: 'mail-templates', label: '邮件模板', groups: [], requires: 'mail' },
  { id: 'oidc', label: '企业登录', groups: ['oidc'] },
  { id: 'oidc-check', label: '连接检查', groups: [], requires: 'oidc' },
  { id: 'edition', label: '授权与升级', groups: [] },
];

type SettingsProps = { client: AppClient; metadata: Bootstrap; onSaved: () => void; canWrite?: boolean; theme: Theme; onThemeSaved?: (theme: Theme) => void };
export function PersistentSettings(props: SettingsProps) {
  if (props.metadata.profile === 'web-platform' && !isAdministrator(props.metadata)) return <div className="settings-workspace"><ClientAppearance theme={props.theme} onSaved={props.onThemeSaved} /></div>;
  return <InstanceSettings {...props} />;
}
function ClientAppearance({ theme, onSaved }: { theme: Theme; onSaved?: (theme: Theme) => void }) {
  const [draft, setDraft] = useState(theme);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setDraft(theme); }, [theme]);
  return <section className="panel appearance-panel"><div className="panel-heading"><div><h2>界面主题</h2><p>保存在当前客户端，不修改全局配置，也不影响其他用户</p></div><span className="subtle-badge">仅当前客户端</span></div><form className="appearance-form" onSubmit={event => { event.preventDefault(); onSaved?.(draft); setSaved(true); }}><ThemeChoices theme={draft} onChange={value => { setDraft(value); setSaved(false); }} disabled={false} /><div className="settings-save">{saved && <p className="saved-caption" role="status">外观已保存到当前客户端</p>}<button className="primary-button" disabled={draft === theme}><Save size={14} />保存设置</button></div></form></section>;
}
function InstanceSettings({ client, metadata, onSaved, canWrite = true, theme, onThemeSaved }: SettingsProps) {
  const localAppearance = metadata.profile === 'web-platform';
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['persistent-settings'], queryFn: () => client.settings!() });
  const [selected, setSelected] = useState(() => new URLSearchParams(window.location.hash.split('?')[1]).get('tab') ?? (window.location.hash === '#settings' ? 'appearance' : 'site'));
  useEffect(() => {
    const change = () => {
      if (window.location.hash === '#settings') setSelected('appearance');
      else if (/^#site(?:\?|$)/.test(window.location.hash)) setSelected(new URLSearchParams(window.location.hash.split('?')[1]).get('tab') ?? 'site');
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  const [draft, setDraft] = useState<Record<string, string>>({}); const [clear, setClear] = useState<string[]>([]);
  const save = useMutation({ mutationFn: (patch: SettingPatch) => client.patchSettings!(patch), onSuccess: (_, patch) => {
    const keys = new Set(patch.changes.map(change => change.key));
    setDraft(value => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.has(key)))); setClear(value => value.filter(key => !keys.has(key)));
    const theme = patch.changes.find(change => change.key === 'appearance.theme')?.value;
    if (theme === 'light' || theme === 'dark' || theme === 'system') onThemeSaved?.(theme);
    void invalidateAfter(queryClient, 'settings'); onSaved();
  } });
  if (query.isPending) return <div className="state-card" role="status">正在读取设置…</div>;
  if (query.isError) return <div className="state-card"><p role="alert">{query.error.message}</p><button className="secondary-button" onClick={() => query.refetch()}>重试</button></div>;
  const available = sections.filter(section => section.id === 'appearance' && localAppearance ? true : section.id === 'branding' ? !!client.branding && !!client.updateBranding : section.id === 'edition' ? (__FEATURE_LICENSE__ && metadata.capabilities.license) || (__FEATURE_UPDATER__ && metadata.capabilities.updater) : query.data.items.some(item => section.requires === item.group || section.groups.includes(item.group)));
  const active = available.find(section => section.id === selected) ?? available[0];
  const groups = active.groups;
  const changes = Object.entries(draft).filter(([key]) => query.data.items.some(item => item.key === key && groups.includes(item.group))).map(([key, value]) => ({ key, value, ...(clear.includes(key) ? { clear: true } : {}) }));
  const dirty = (group: string) => query.data.items.some(item => item.group === group && item.key in draft);
  return <div className="settings-workspace">
    <Tabs id="instance-settings" label="设置分组" items={available.map(section => ({ ...section, dirty: section.groups.some(dirty) }))} value={active.id} onChange={id => { setSelected(id); save.reset(); window.history.replaceState(null, '', `#site?tab=${id}`); }} />
    {client.branding && client.updateBranding && <div role="tabpanel" id="instance-settings-panel-branding" aria-labelledby="instance-settings-tab-branding" hidden={active.id !== 'branding'}><BrandingPanel client={client} canWrite={canWrite} onSaved={onSaved} /></div>}
    {localAppearance && <div role="tabpanel" id="instance-settings-panel-appearance" aria-labelledby="instance-settings-tab-appearance" hidden={active.id !== 'appearance'}><ClientAppearance theme={theme} onSaved={onThemeSaved} /></div>}
    {active.id !== 'branding' && !(localAppearance && active.id === 'appearance') && <div role="tabpanel" id={`instance-settings-panel-${active.id}`} aria-labelledby={`instance-settings-tab-${active.id}`}>
      {(__FEATURE_LICENSE__ || __FEATURE_UPDATER__) && active.id === 'edition' && <EditionPanel metadata={metadata} />}
      {active.id === 'appearance' && <section className="panel appearance-panel"><div className="panel-heading"><div><h2>界面主题</h2><p>保存实例默认主题，同时应用于当前设备</p></div><span className="subtle-badge">持久化</span></div><Form error={save.error} pending={save.isPending} className="appearance-form" onSubmit={event => { event.preventDefault(); save.mutate({ changes }); }}><ThemeChoices theme={(draft['appearance.theme'] ?? query.data.items.find(item => item.key === 'appearance.theme')?.value ?? 'system') as Theme} onChange={theme => setDraft(value => ({ ...value, 'appearance.theme': theme }))} disabled={!canWrite || save.isPending} /><div className="settings-save">{save.isSuccess && <p className="saved-caption" role="status">设置已保存</p>}<button className="primary-button" disabled={!canWrite || save.isPending || !changes.length}><Save size={14} />保存设置</button></div></Form></section>}
      {!!groups.length && active.id !== 'appearance' && <section className="panel"><div className="panel-heading"><div><h2>{active.label}</h2><p>仅保存当前分组；切换标签保留未保存内容</p></div><span className="subtle-badge">持久化</span></div><Form error={save.error} pending={save.isPending} className="flow-form settings-form" onSubmit={event => { event.preventDefault(); save.mutate({ changes }); }}>
      {groups.map(group => <fieldset className={`settings-group${groups.length === 1 ? ' settings-group-flat' : ''}`} key={group} disabled={!canWrite || save.isPending}><legend>{groupNames[group]}</legend>
      {group === 'account' && <p className="help-text">先在 SMTP 配置中保存邮件服务，再到发送测试验证；成功后才可开启账号邮件流程。</p>}
      {group === 'mail' && <p className="help-text">建议 STARTTLS（587）或 TLS（465）；明文仅允许本机测试。保存后切换到发送测试。</p>}
      {group === 'oidc' && <p className="help-text">支持授权码 + PKCE；保存后到连接检查验证服务，再完成一次实际登录。</p>}
      <div className="form-grid">{query.data.items.filter(item => item.group === group).map(entry => <div className="setting-field" key={entry.key}><label htmlFor={`setting-${entry.key}`}>{entry.label}</label>{entry.value_type === 'boolean' || entry.key === 'appearance.theme' || entry.key === 'mail.tls' ? <select id={`setting-${entry.key}`} value={draft[entry.key] ?? entry.value} onChange={event => setDraft(value => ({ ...value, [entry.key]: event.target.value }))}>{(entry.value_type === 'boolean' ? [['true', '开启'], ['false', '关闭']] : entry.key === 'mail.tls' ? [['starttls', 'STARTTLS'], ['tls', 'TLS'], ['plain', '明文（仅本机）']] : [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <input id={`setting-${entry.key}`} type={entry.sensitive ? 'password' : entry.value_type === 'integer' ? 'number' : entry.key === 'site.icp_url' ? 'url' : 'text'} autoComplete={entry.sensitive ? 'new-password' : undefined} placeholder={entry.sensitive ? entry.configured ? '已配置 · 留空保留' : '尚未配置' : undefined} value={draft[entry.key] ?? entry.value} onChange={event => { setDraft(value => ({ ...value, [entry.key]: event.target.value })); setClear(value => value.filter(key => key !== entry.key)); }} />}{entry.sensitive && entry.configured && <button className="text-button" type="button" onClick={() => { setDraft(value => ({ ...value, [entry.key]: '' })); setClear(value => [...new Set([...value, entry.key])]); }}>{clear.includes(entry.key) ? '保存时将清除' : '清除已保存密钥'}</button>}{entry.key === 'site.icp_url' && <small className="help-text">HTTPS 查询链接；备案号留空时隐藏页脚备案信息。</small>}{entry.key === 'mail.from_name' && <small className="help-text">留空时使用邮件中的站点名称；修改别名不影响 SMTP 连通性验证。</small>}{entry.key === 'admin.path' && <small className="help-text">配置错误可用 APP_ADMIN_PATH 恢复；接口仍执行权限检查。</small>}</div>)}</div></fieldset>)}
      <div className="settings-save">{save.isSuccess && <p className="saved-caption" role="status">设置已保存</p>}<button className="primary-button" disabled={!canWrite || save.isPending || !changes.length}><Save size={14} />{save.isPending && <LoaderCircle size={15} className="spin" />}保存设置</button></div>
      </Form></section>}
      {client.web && active.id.startsWith('mail-') && <MailDelivery web={client.web} section={active.id.slice(5)} canWrite={canWrite} dirty={dirty('mail') || dirty('account')} revision={query.dataUpdatedAt} />}
      {client.web && active.id === 'oidc-check' && <OIDCConnection key={query.dataUpdatedAt} web={client.web} dirty={dirty('oidc')} revision={query.dataUpdatedAt} />}
    </div>}
  </div>;
}

function MailDelivery({ web, section, canWrite, dirty, revision }: { web: WebClient; section: string; canWrite: boolean; dirty: boolean; revision: number }) {
  const [recipient, setRecipient] = useState('');
  const policy = useQuery({ queryKey: ['mail-policy', revision], queryFn: () => web.authPolicy(), enabled: section === 'test' });
  const jobs = useQuery({ queryKey: ['mail-jobs'], queryFn: () => web.mailJobs(), enabled: section === 'jobs', refetchInterval: section === 'jobs' ? 5000 : false });
  const test = useMutation({ mutationFn: () => web.testMail(recipient), onSuccess: () => { void policy.refetch(); } });
  const states: Record<string, string> = { pending: '待发送', sending: '发送中', sent: '已发送', dead: '已终止', cancelled: '已取消' };
  return <section className="panel mail-panel"><div className="panel-heading"><div><h2>{section === 'templates' ? '邮件模板' : section === 'jobs' ? '投递记录' : '发送测试'}</h2><p>{section === 'templates' ? '预览与实际发送共用的品牌邮件' : section === 'jobs' ? '查看最近任务及重试结果' : policy.isPending ? '正在检查 SMTP 状态…' : policy.data?.mail_ready ? '当前 SMTP 配置已通过测试' : '当前 SMTP 配置尚未通过测试'}</p></div></div>{section === 'test' && <Form schema="MailTestInput" value={{recipient}} error={test.error} pending={test.isPending} className="flow-form inline-form" onSubmit={event => { event.preventDefault(); test.mutate(); }}><label>测试收件邮箱<input type="email" required value={recipient} onChange={event => setRecipient(event.target.value)} /></label><button className="secondary-button" disabled={!canWrite || test.isPending || dirty}>{test.isPending && <LoaderCircle size={15} className="spin" />}发送测试邮件</button>{dirty && <p className="help-text">请先保存设置。</p>}{test.isSuccess && <p className="saved-caption" role="status">测试邮件已发送，可开启邮件账号流程。</p>}</Form>}{section === 'jobs' && <div className="mail-jobs"><h3>最近邮件任务</h3><p className="help-text">失败自动重试，最多 5 次；列表仅显示状态。重发账号邮件请回到登录页申请。</p>{jobs.error && <p className="form-error" role="alert">{jobs.error.message}</p>}{jobs.isPending ? <p role="status">正在读取邮件状态…</p> : !jobs.data?.items.length ? <p className="help-text">暂无邮件任务</p> : <div className="user-table-wrap"><table><thead><tr><th>状态</th><th>尝试次数</th><th>创建时间</th><th>结果</th></tr></thead><tbody>{jobs.data.items.map(job => <tr key={job.id}><td>{states[job.state] ?? job.state}</td><td>{job.attempts}</td><td>{new Date(job.created_at * 1000).toLocaleString()}</td><td>{job.last_error === 'EXPIRED' ? '邮件已过期' : job.last_error ? '发送失败' : '—'}</td></tr>)}</tbody></table></div>}</div>}{section === 'templates' && <MailTemplates web={web} revision={revision} />}</section>;
}

function MailTemplates({ web, revision }: { web: WebClient; revision: number }) {
  const [selected, setSelected] = useState('test');
  const query = useQuery({ queryKey: ['mail-templates', revision], queryFn: () => web.mailTemplates() });
  const labels: Record<string, string> = { test: 'SMTP 测试', verify: '注册验证', login: '验证码登录', reset: '找回密码', notification: '系统通知' };
  const current = query.data?.items.find(item => item.purpose === selected);
  return <div className="template-panel"><h3>邮件模板预览</h3><p className="help-text">与实际发送使用同一模板；展示码为示例，邮件内嵌品牌图片。</p>{query.isPending && <p role="status">正在读取模板…</p>}{query.error && <p role="alert" className="form-error">{query.error.message}</p>}<div className="template-select"><label htmlFor="mail-template-kind">模板类型</label><select id="mail-template-kind" value={selected} onChange={event => setSelected(event.target.value)}>{Object.entries(labels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>{current && <div><p className="template-subject">{current.subject}</p><iframe className="template-preview" title={`${labels[selected]}邮件预览`} sandbox="" srcDoc={current.html} /></div>}</div>;
}
