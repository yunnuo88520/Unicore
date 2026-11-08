// Author: yunnuo <ymz@ebox.vip>
// Description: Normal, rail and mobile navigation consume the same ordered section tree and route targets.
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, Tooltip } from '@unicore/ui';
import { flattenNavigation, navEntryActive, subtreeContains, type NavEntry, type Navigation } from './navigation';
import { useI18n } from './i18n';
import type { Page } from './routes';

const expansion = new Map<string, boolean>();
export function NavigationBadge({ node }: { node: NavEntry }) {
  const tones: Record<string, string> = { primary: 'bg-primary-soft text-accent', success: 'bg-success-soft text-success', warning: 'bg-warning-soft text-warning', danger: 'bg-danger-soft text-danger', muted: 'bg-surface-alt text-muted' };
  if (!node.badgeText && !node.badgeDot) return null;
  return <span className={`ms-auto shrink-0 rounded-full ${node.badgeDot ? 'size-2' : 'px-1.5 text-2xs'} ${tones[node.badgeColor] ?? tones.primary}`} aria-label={node.badgeText || undefined}>{!node.badgeDot && node.badgeText}</span>;
}
export function NavigationTree({ navigation, page, rail, onNavigate }: { navigation: Navigation; page: Page; rail: boolean; onNavigate: (node: NavEntry) => void }) {
  const { t } = useI18n();
  return <nav aria-label={t('主导航')} data-navigation-mode={rail ? 'rail' : 'normal'} className={`flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pb-2 ${rail ? 'items-center' : ''}`}>
    {navigation.sections.map(section => <section key={section.id} data-nav-section={section.id} className={rail ? 'flex flex-col items-center gap-1' : ''}>
      {section.showTitle && !rail && <h2 className="mt-4 mb-1 px-3 text-2xs font-semibold text-subtle">{t(section.title)}</h2>}
      {section.entries.map(node => rail ? <RailNode key={node.id} node={node} page={page} onNavigate={onNavigate} /> : <TreeNode key={node.id} node={node} page={page} onNavigate={onNavigate} />)}
    </section>)}
  </nav>;
}
function IconLabel({ node, size = 19 }: { node: NavEntry; size?: number }) {
  const { t } = useI18n(); const Icon: LucideIcon = node.icon;
  return <><Icon size={size} aria-hidden="true" className="shrink-0" /><span className="truncate">{t(node.label)}</span><NavigationBadge node={node} /></>;
}
function TreeNode({ node, page, onNavigate, depth = 0 }: { node: NavEntry; page: Page; onNavigate: (node: NavEntry) => void; depth?: number }) {
  const { t } = useI18n();
  // Directories start collapsed (unless the entry page lives inside); the
  // operator's toggle stays authoritative — navigating only ever expands.
  const [expanded, setExpanded] = useState(() => expansion.get(node.id) ?? subtreeContains(node, page));
  const lastPage = useRef(page);
  useEffect(() => {
    if (page === lastPage.current) return;
    lastPage.current = page;
    if (subtreeContains(node, page)) setExpanded(true);
  }, [page, node]);
  const open = expanded;
  const toggle = () => setExpanded(current => { expansion.set(node.id, !current); return !current; });
  const active = navEntryActive(node, page);
  const rowClass = `flex min-h-10 w-full min-w-0 items-center gap-2 rounded-lg px-3 text-start text-sm font-medium ${active ? 'bg-primary-soft text-accent' : 'text-muted hover:bg-surface-alt hover:text-ink'} disabled:opacity-50`;
  return <div data-nav-node={node.id} data-nav-target={node.routeId ?? node.url}>
    <div className="flex items-center">
      {node.type === 'directory'
        ? <button type="button" className={rowClass} aria-expanded={open} disabled={node.disabled} onClick={toggle}><IconLabel node={node} /><ChevronRight size={15} className={`ms-auto shrink-0 ${open ? 'rotate-90' : ''}`} /></button>
        : <><button type="button" className={rowClass} aria-current={active ? 'page' : undefined} disabled={node.disabled} onClick={() => onNavigate(node)}><IconLabel node={node} size={depth ? 16 : 19} /></button>
          {node.children.length > 0 && <button type="button" aria-label={t('展开或收起 {{name}}', { name: t(node.label) })} aria-expanded={open} onClick={toggle} className="p-2"><ChevronRight size={15} className={open ? 'rotate-90' : ''} /></button>}</>}
    </div>
    {node.children.length > 0 && <div hidden={!open} className="ms-[18px] border-s border-line ps-[9px]">{node.children.map(child => <TreeNode key={child.id} node={child} page={page} depth={depth + 1} onNavigate={onNavigate} />)}</div>}
  </div>;
}
function RailNode({ node, page, onNavigate }: { node: NavEntry; page: Page; onNavigate: (node: NavEntry) => void }) {
  const { t } = useI18n(); const Icon = node.icon;
  const className = `flex size-10 shrink-0 items-center justify-center rounded-lg ${subtreeContains(node, page) ? 'bg-primary-soft text-accent' : 'text-muted hover:bg-surface-alt hover:text-ink'}`;
  if (node.type !== 'directory' && !node.children.length) return <Tooltip label={t(node.label)}><button type="button" data-nav-node={node.id} data-nav-target={node.routeId ?? node.url} className={className} aria-label={t(node.label)} aria-current={navEntryActive(node, page) ? 'page' : undefined} disabled={node.disabled} onClick={() => onNavigate(node)}><Icon size={19} aria-hidden="true" /></button></Tooltip>;
  return <DropdownMenu><DropdownMenuTrigger asChild><button type="button" data-nav-node={node.id} className={className} aria-label={t(node.label)} disabled={node.disabled}><Icon size={19} aria-hidden="true" /></button></DropdownMenuTrigger>
    <DropdownMenuContent side="right" align="start" aria-label={t(node.label)} className="max-h-[75dvh] min-w-48 overflow-y-auto">
      {flattenNavigation([node]).map(({ node: item, depth }) => item.type === 'directory'
        ? <DropdownMenuLabel key={item.id} data-nav-node={item.id} style={{ paddingInlineStart: 8 + depth * 12 }}><IconLabel node={item} size={16} /></DropdownMenuLabel>
        : <DropdownMenuItem key={item.id} data-nav-node={item.id} data-nav-target={item.routeId ?? item.url} style={{ paddingInlineStart: 8 + depth * 12 }} disabled={item.disabled} aria-current={navEntryActive(item, page) ? 'page' : undefined} onSelect={() => onNavigate(item)}><IconLabel node={item} size={16} /></DropdownMenuItem>)}
    </DropdownMenuContent></DropdownMenu>;
}
