/** Author: yunnuo <ymz@ebox.vip>
 * Description: Scoped settings tabs retain drafts and save only the current business section.
 */
import { BrandingPanel } from './branding-panel';
import { Modal } from './modal';
import { useMessage } from './message';
import { Switch } from './switch';
import { Tabs } from './tabs';
import { ClientAppearance, ThemeChoices } from './appearance';
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
  { id: 'oidc', label: '企业登录', groups: ['oidc'] },
];

type SettingsProps = { section?:'base'|'mail'; client: AppClient; metadata: Bootstrap; onSaved: () => void; canWrite?: boolean; theme: Theme; onThemeSaved?: (theme: Theme) => void };
export function PersistentSettings(props: SettingsProps) {
  if (props.metadata.profile === 'web-platform' && !isAdministrator(props.metadata)) return <div className="settings-workspace"><ClientAppearance theme={props.theme} onSaved={props.onThemeSaved} /></div>;
  return <InstanceSettings {...props} />;
}
function InstanceSettings({ section='base', client, metadata, onSaved, canWrite = true, theme, onThemeSaved }: SettingsProps) {
  const message = useMessage();
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
    message.success('设置已保存');
    void invalidateAfter(queryClient, 'settings'); onSaved();
  } });
  if (query.isPending) return <div className="state-card" role="status">正在读取设置…</div>;
  if (query.isError) return <div className="state-card"><p role="alert">{query.error.message}</p><button className="secondary-button" onClick={() => query.refetch()}>重试</button></div>;
  const candidates=section==='mail'?[{id:'mail',label:'邮件设置',groups:['mail','account']}]:sections;
  const available = candidates.filter(item=>item.id==='appearance'&&localAppearance?true:item.id==='branding'?!!client.branding&&!!client.updateBranding:query.data.items.some(entry=>item.groups.includes(entry.group)));
  const active = available.find(section => section.id === selected) ?? available[0];
  const groups = active.groups;
  const changes = Object.entries(draft).filter(([key]) => query.data.items.some(item => item.key === key && groups.includes(item.group))).map(([key, value]) => ({ key, value, ...(clear.includes(key) ? { clear: true } : {}) }));
  const dirty = (group: string) => query.data.items.some(item => item.group === group && item.key in draft);
  return <div className="settings-workspace">
    {section==='base'&&<Tabs id="instance-settings" label="设置分组" items={available.map(section => ({ ...section, dirty: section.groups.some(dirty) }))} value={active.id} onChange={id => { setSelected(id); save.reset(); window.history.replaceState(null, '', `#site?tab=${id}`); }} />}
    {client.branding && client.updateBranding && <div role="tabpanel" id="instance-settings-panel-branding" aria-labelledby="instance-settings-tab-branding" hidden={active.id !== 'branding'}><BrandingPanel client={client} canWrite={canWrite} onSaved={onSaved} /></div>}
    {localAppearance && <div role="tabpanel" id="instance-settings-panel-appearance" aria-labelledby="instance-settings-tab-appearance" hidden={active.id !== 'appearance'}><ClientAppearance theme={theme} onSaved={onThemeSaved} /></div>}
    {active.id !== 'branding' && !(localAppearance && active.id === 'appearance') && <div role="tabpanel" id={`instance-settings-panel-${active.id}`} aria-labelledby={`instance-settings-tab-${active.id}`}>
      {active.id === 'appearance' && <section className="panel appearance-panel"><div className="panel-heading"><div><h2>界面主题</h2><p>保存实例默认主题，同时应用于当前设备</p></div><span className="subtle-badge">持久化</span></div><Form error={save.error} pending={save.isPending} className="appearance-form" onSubmit={event => { event.preventDefault(); save.mutate({ changes }); }}><ThemeChoices theme={(draft['appearance.theme'] ?? query.data.items.find(item => item.key === 'appearance.theme')?.value ?? 'system') as Theme} onChange={theme => setDraft(value => ({ ...value, 'appearance.theme': theme }))} disabled={!canWrite || save.isPending} /><div className="settings-save"><button className="primary-button" disabled={!canWrite || save.isPending || !changes.length}><Save size={14} />保存设置</button></div></Form></section>}
      {!!groups.length && active.id !== 'appearance' && <section className="panel"><div className="panel-heading"><div><h2>{active.label}</h2><p>配置保存在服务器，统一应用于整个实例</p></div><span className="subtle-badge">持久化</span></div><Form error={save.error} pending={save.isPending} className="flow-form settings-form" onSubmit={event => { event.preventDefault(); save.mutate({ changes }); }}>
      {groups.map(group => <fieldset className={`settings-group${groups.length === 1 ? ' settings-group-flat' : ''}`} key={group} disabled={!canWrite || save.isPending}><legend>{groupNames[group]}</legend>
      {group === 'account' && <p className="help-text">先保存 SMTP 配置并发送测试，成功后再开启账号邮件流程。</p>}
      {group === 'mail' && <p className="help-text">建议 STARTTLS（587）或 TLS（465）；明文仅允许本机测试。保存后点击下方“发送测试”验证连接。</p>}
      {group === 'oidc' && <p className="help-text">支持授权码 + PKCE；保存后在本页检查连接，再完成一次实际登录。</p>}
      <div className="form-grid">{query.data.items.filter(item => item.group === group).map(entry => <div className="setting-field" key={entry.key}><label htmlFor={`setting-${entry.key}`}>{entry.label}</label>{entry.value_type === 'boolean' ? <Switch id={`setting-${entry.key}`} checked={(draft[entry.key]??entry.value)==='true'} onChange={checked=>setDraft(value=>({...value,[entry.key]:String(checked)}))}/> : entry.key === 'appearance.theme' || entry.key === 'mail.tls' ? <select id={`setting-${entry.key}`} value={draft[entry.key] ?? entry.value} onChange={event => setDraft(value => ({ ...value, [entry.key]: event.target.value }))}>{(entry.key === 'mail.tls' ? [['starttls', 'STARTTLS'], ['tls', 'TLS'], ['plain', '明文（仅本机）']] : [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <input id={`setting-${entry.key}`} type={entry.sensitive ? 'password' : entry.value_type === 'integer' ? 'number' : entry.key === 'site.icp_url' ? 'url' : 'text'} autoComplete={entry.sensitive ? 'new-password' : undefined} placeholder={entry.sensitive ? entry.configured ? '已配置 · 留空保留' : '尚未配置' : undefined} value={draft[entry.key] ?? entry.value} onChange={event => { setDraft(value => ({ ...value, [entry.key]: event.target.value })); setClear(value => value.filter(key => key !== entry.key)); }} />}{entry.sensitive && entry.configured && <button className="text-button" type="button" onClick={() => { setDraft(value => ({ ...value, [entry.key]: '' })); setClear(value => [...new Set([...value, entry.key])]); }}>{clear.includes(entry.key) ? '保存时将清除' : '清除已保存密钥'}</button>}{entry.key === 'account.registration_enabled' && <small className="help-text">默认关闭。先配置并测试 SMTP，开放后用户可从注册页验证邮箱创建账号。</small>}{entry.key === 'site.icp_url' && <small className="help-text">HTTPS 查询链接；备案号留空时隐藏页脚备案信息。</small>}{entry.key === 'mail.from_name' && <small className="help-text">留空时使用邮件中的站点名称；修改别名不影响 SMTP 连通性验证。</small>}{entry.key === 'admin.path' && <small className="help-text">配置错误可用 APP_ADMIN_PATH 恢复；接口仍执行权限检查。</small>}</div>)}</div></fieldset>)}
      <div className="settings-save"><button className="primary-button" disabled={!canWrite || save.isPending || !changes.length}>{save.isPending ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />}保存设置</button></div>
      </Form></section>}
      {client.web && active.id === 'mail' && <MailTest web={client.web} canWrite={canWrite} dirty={dirty('mail')||dirty('account')} revision={query.dataUpdatedAt} />}
      {client.web && active.id === 'oidc' && <OIDCConnection key={query.dataUpdatedAt} web={client.web} dirty={dirty('oidc')} revision={query.dataUpdatedAt} />}
    </div>}
  </div>;
}

function MailTest({web,canWrite,dirty,revision}:{web:WebClient;canWrite:boolean;dirty:boolean;revision:number}) {
 const message = useMessage();
 const [open,setOpen]=useState(false),[recipient,setRecipient]=useState('');
 const policy=useQuery({queryKey:['mail-policy',revision],queryFn:()=>web.authPolicy()});
 const test=useMutation({mutationFn:()=>web.testMail(recipient),onSuccess:()=>{message.success('测试邮件已发送，可开启邮件账号流程。');setOpen(false);void policy.refetch();}});
 return <div className="mail-test-inline"><div><strong>{policy.data?.mail_ready?'SMTP 配置已通过测试':'SMTP 配置尚未通过测试'}</strong><p className="help-text">保存邮件配置后，发送一封测试邮件确认连接与模板正常。</p></div><button className="secondary-button" disabled={!canWrite||dirty} onClick={()=>{test.reset();setRecipient('');setOpen(true);}}>发送测试</button>{dirty&&<p className="help-text">请先保存设置。</p>}{open&&<Modal title="发送测试邮件" pending={test.isPending} onClose={()=>setOpen(false)}><Form schema="MailTestInput" value={{recipient}} error={test.error} pending={test.isPending} className="flow-form" onSubmit={event=>{event.preventDefault();test.mutate();}}><label>测试收件邮箱<input type="email" required value={recipient} onChange={event=>setRecipient(event.target.value)}/></label><div className="dialog-actions"><button type="button" className="secondary-button" disabled={test.isPending} onClick={()=>setOpen(false)}>关闭</button><button className="primary-button" disabled={test.isPending||dirty}>{test.isPending?'正在发送…':'发送测试邮件'}</button></div></Form></Modal>}</div>;
}
