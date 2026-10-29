/** Author: yunnuo <ymz@ebox.vip>
 * Description: Compact accessible tabs with arrow/Home/End keyboard navigation.
 */
import { t, useLocale } from './i18n';

export function Tabs({ id, label, items, value, onChange }: { id: string; label: string; items: readonly { id: string; label: string; dirty?: boolean }[]; value: string; onChange: (id: string) => void }) {
  useLocale();
  return <div className="settings-tabs" role="tablist" aria-label={t(label)}>{items.map((item, index) => <button key={item.id} type="button" role="tab" id={`${id}-tab-${item.id}`} aria-controls={`${id}-panel-${item.id}`} aria-selected={value === item.id} tabIndex={value === item.id ? 0 : -1} onClick={() => onChange(item.id)} onKeyDown={event => {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowRight' ? (index + 1) % items.length : event.key === 'ArrowLeft' ? (index + items.length - 1) % items.length : -1;
    if (next < 0) return;
    event.preventDefault(); onChange(items[next].id);
    document.getElementById(`${id}-tab-${items[next].id}`)?.focus();
  }}>{t(item.label)}{item.dirty && <span className="tab-dirty" aria-hidden="true">•</span>}</button>)}</div>;
}
