/** Author: yunnuo <ymz@ebox.vip>
 * Description: Shared theme preview cards used by the instance appearance settings.
 */
import { CheckCircle2, Monitor, Moon, Sun, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useMessage } from './message';
import type { Theme } from './theme';

export function ThemeChoices({ theme, onChange, disabled }: { theme: Theme; onChange: (theme: Theme) => void; disabled: boolean }) {
  const choices = [{ id: 'light', title: '浅色', detail: '明亮清晰，专注每一处细节', icon: Sun }, { id: 'dark', title: '深色', detail: '柔和低光，适合夜间工作', icon: Moon }, { id: 'system', title: '跟随系统', detail: '自动匹配设备的外观偏好', icon: Monitor }] as const;
  return <div className="theme-choices" role="group" aria-label="界面主题">{choices.map(({ id, title, detail, icon: Icon }) => <button type="button" disabled={disabled} key={id} className={`theme-choice ${theme === id ? 'selected' : ''}`} aria-pressed={theme === id} onClick={() => onChange(id)}><div className={`theme-preview ${id}`}><span /><div><i /><i /><i /></div></div><strong><Icon size={16} />{title}{theme === id && <CheckCircle2 size={16} />}</strong><small>{detail}</small></button>)}</div>;
}

export function ClientAppearance({ theme, onSaved }: { theme: Theme; onSaved?: (theme: Theme) => void }) {
  const [draft, setDraft] = useState(theme);
  const message = useMessage();
  useEffect(() => { setDraft(theme); }, [theme]);
  return <section className="panel appearance-panel"><div className="panel-heading"><div><h2>界面主题</h2><p>保存在当前客户端，不修改全局配置，也不影响其他用户</p></div><span className="subtle-badge">仅当前客户端</span></div><form className="appearance-form" onSubmit={event => { event.preventDefault(); onSaved?.(draft); message.success('外观已保存到当前客户端'); }}><ThemeChoices theme={draft} onChange={value => { setDraft(value);  }} disabled={false} /><div className="settings-save"><button className="primary-button" disabled={draft === theme}><Save size={14} />保存设置</button></div></form></section>;
}
