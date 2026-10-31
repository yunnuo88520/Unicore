/** Author: yunnuo <ymz@ebox.vip>
 * Description: Shared theme preview cards used by the instance appearance settings.
 */
import { t, useLocale } from './i18n';
import { CheckCircle2, Monitor, Moon, Sun, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useMessage } from './message';
import { AppearanceDrawer } from './appearance-drawer';
import type { Theme } from './theme';

export function ThemeChoices({ theme, onChange, disabled }: { theme: Theme; onChange: (theme: Theme) => void; disabled: boolean }) {
  useLocale();
  const choices = [{ id: 'light', title: t('浅色'), detail: t('明亮清晰，专注每一处细节'), icon: Sun }, { id: 'dark', title: t('深色'), detail: t('柔和低光，适合夜间工作'), icon: Moon }, { id: 'system', title: t('跟随系统'), detail: t('自动匹配设备的外观偏好'), icon: Monitor }] as const;
  return <div className="theme-choices" role="group" aria-label={t("界面主题")}>{choices.map(({ id, title, detail, icon: Icon }) => <button type="button" disabled={disabled} key={id} className={`theme-choice ${theme === id ? 'selected' : ''}`} aria-pressed={theme === id} onClick={() => onChange(id)}><div className={`theme-preview ${id}`}><span /><div><i /><i /><i /></div></div><strong><Icon size={16} />{t(title)}{theme === id && <CheckCircle2 size={16} />}</strong><small>{t(detail)}</small></button>)}</div>;
}

export function ClientAppearance({ theme, onSaved }: { theme: Theme; onSaved?: (theme: Theme) => void }) {
  useLocale();
  const [draft, setDraft] = useState(theme);
  const [expanded, setExpanded] = useState(false);
  const message = useMessage();
  useEffect(() => { setDraft(theme); }, [theme]);
  return <section className="panel appearance-panel"><div className="panel-heading"><div><h2>{t("界面主题")}</h2><p>{t("保存在当前客户端，不修改全局配置，也不影响其他用户")}</p></div><span className="subtle-badge">{t("仅当前客户端")}</span></div><form className="appearance-form" onSubmit={event => { event.preventDefault(); onSaved?.(draft); message.success(t('外观已保存到当前客户端')); }}><ThemeChoices theme={draft} onChange={value => { setDraft(value);  }} disabled={false} /><div className="settings-save"><button type="button" className="secondary-button" onClick={event=>{event.currentTarget.focus();setExpanded(true);}}>{t("更多外观设置")}</button><button className="primary-button" disabled={draft === theme}><Save size={14} />{t("保存设置")}</button></div></form>{expanded&&<AppearanceDrawer onClose={()=>setExpanded(false)}/>}</section>;
}
