// Author: yunnuo <ymz@ebox.vip>
// Description: Data-driven ARIA tree with stable IDs, roving focus, expansion and optional selection.
import { forwardRef, useEffect, useId, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../cn';
import { useControlI18n } from './messages';
import { assignRef, useControllable } from './utils';

export interface TreeNode { id: string; label: string; icon?: ReactNode; disabled?: boolean; children?: readonly TreeNode[] }
export type TreeViewProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> & {
  label: string; nodes: readonly TreeNode[]; selectionMode?: 'none' | 'single' | 'multiple'; selectedIds?: string[]; defaultSelectedIds?: string[]; onSelectionChange?: (ids: string[]) => void;
  expandedIds?: string[]; defaultExpandedIds?: string[]; onExpandedChange?: (ids: string[]) => void; disabled?: boolean;
};
interface Row { node: TreeNode; level: number; position: number; size: number; parent?: string }
export const TreeView = forwardRef<HTMLDivElement, TreeViewProps>(function TreeView({ label, nodes, selectionMode = 'single', selectedIds, defaultSelectedIds = [], onSelectionChange, expandedIds, defaultExpandedIds = [], onExpandedChange, disabled, className, onKeyDown, onBlur, ...props }, ref) {
  const { t, locale } = useControlI18n();
  const base = useId();
  const [selected, setSelected] = useControllable(selectedIds, defaultSelectedIds, onSelectionChange);
  const [expanded, setExpanded] = useControllable(expandedIds, defaultExpandedIds, onExpandedChange);
  const [focused, setFocused] = useState<string>();
  const elements = useRef(new Map<string, HTMLDivElement>());
  const root = useRef<HTMLDivElement>(null);
  const focusWithin = useRef(false);
  const anchor = useRef<string | undefined>(undefined);
  const typeahead = useRef({ value: '', time: 0 });
  const rows: Row[] = [];
  const walk = (entries: readonly TreeNode[], level: number, parent?: string) => entries.forEach((node, index) => {
    rows.push({ node, level, position: index + 1, size: entries.length, parent });
    if (node.children?.length && expanded.includes(node.id)) walk(node.children, level + 1, node.id);
  });
  walk(nodes, 1);
  const enabled = rows.filter(row => !disabled && !row.node.disabled);
  const tabId = enabled.some(row => row.node.id === focused) ? focused : enabled.find(row => selected.includes(row.node.id))?.node.id ?? enabled[0]?.node.id;
  // If controlled expansion hides the focused row, restore its closest visible ancestor.
  useEffect(() => {
    if (!focused || enabled.some(row => row.node.id === focused)) return;
    const ancestors: string[] = [];
    const locate = (entries: readonly TreeNode[], path: string[]): boolean => entries.some(node => {
      if (node.id === focused) { ancestors.push(...path); return true; }
      return node.children ? locate(node.children, [...path, node.id]) : false;
    });
    locate(nodes, []);
    const next = ancestors.reverse().find(id => enabled.some(row => row.node.id === id)) ?? tabId;
    // Removed DOM nodes are already absent from the ref map by effect time.
    const hadFocus = focusWithin.current && (document.activeElement === document.body || !!root.current?.contains(document.activeElement));
    setFocused(next);
    if (hadFocus && next) elements.current.get(next)?.focus();
  }, [focused, nodes, expanded, disabled, tabId]);
  const focus = (id: string | undefined, range = false) => {
    if (!id) return;
    if (range && selectionMode === 'multiple') {
      const start = enabled.findIndex(row => row.node.id === (anchor.current ?? focused));
      const end = enabled.findIndex(row => row.node.id === id);
      if (start >= 0 && end >= 0) { anchor.current ??= focused; setSelected(enabled.slice(Math.min(start, end), Math.max(start, end) + 1).map(row => row.node.id)); }
    }
    setFocused(id); elements.current.get(id)?.focus();
  };
  const toggle = (node: TreeNode, force?: boolean) => {
    if (disabled || node.disabled || !node.children?.length) return;
    const next = force ?? !expanded.includes(node.id);
    setExpanded(next ? expanded.includes(node.id) ? expanded : [...expanded, node.id] : expanded.filter(id => id !== node.id));
  };
  const select = (node: TreeNode) => {
    if (disabled || node.disabled || selectionMode === 'none') return;
    anchor.current = node.id;
    setSelected(selectionMode === 'single' ? [node.id] : selected.includes(node.id) ? selected.filter(id => id !== node.id) : [...selected, node.id]);
  };
  return <div ref={node => { root.current = node; assignRef(ref, node); }} role="tree" aria-label={t(label)} aria-multiselectable={selectionMode === 'multiple' || undefined} aria-disabled={disabled || undefined} className={cn('flex flex-col gap-0.5 text-sm text-ink', className)} {...props}
    onBlur={event => { onBlur?.(event); if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) { focusWithin.current = false; typeahead.current.value = ''; } }}
    onKeyDown={event => {
      onKeyDown?.(event); if (event.defaultPrevented || disabled || event.nativeEvent.isComposing || event.keyCode === 229) return;
      const row = rows.find(entry => elements.current.get(entry.node.id) === event.target);
      if (!row || row.node.disabled) return;
      const { node } = row;
      const index = enabled.findIndex(entry => entry.node.id === node.id);
      if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) typeahead.current.value = '';
      if (event.key === 'ArrowDown') { event.preventDefault(); focus(enabled[Math.min(enabled.length - 1, index + 1)]?.node.id, event.shiftKey); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); focus(enabled[Math.max(0, index - 1)]?.node.id, event.shiftKey); }
      else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); focus((event.key === 'Home' ? enabled[0] : enabled.at(-1))?.node.id, event.shiftKey); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); if (!expanded.includes(node.id)) toggle(node, true); else focus(enabled.find(entry => entry.parent === node.id)?.node.id); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); if (expanded.includes(node.id) && node.children?.length) toggle(node, false); else if (row.parent && enabled.some(entry => entry.node.id === row.parent)) focus(row.parent); }
      else if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); if (selectionMode === 'none') toggle(node); else select(node); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && selectionMode === 'multiple') { event.preventDefault(); setSelected(enabled.map(entry => entry.node.id)); }
      else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const now = Date.now();
        const previous = now - typeahead.current.time > 700 ? '' : typeahead.current.value;
        const typed = previous + event.key.toLocaleLowerCase(locale);
        typeahead.current = { value: typed, time: now };
        const prefix = [...typed].every(character => character === typed[0]) ? typed[0] : typed;
        const continuing = previous.length > 0 && prefix.length > 1;
        const ordered = continuing ? [...enabled.slice(index), ...enabled.slice(0, index)] : [...enabled.slice(index + 1), ...enabled.slice(0, index + 1)];
        const match = ordered.find(entry => t(entry.node.label).toLocaleLowerCase(locale).startsWith(prefix));
        if (match) { event.preventDefault(); focus(match.node.id); }
      }
    }}>
    {rows.map(({ node, level, position, size }) => <div key={node.id} ref={element => { if (element) elements.current.set(node.id, element); else elements.current.delete(node.id); }} id={`${base}-${encodeURIComponent(node.id)}`} role="treeitem" aria-label={t(node.label)} aria-level={level} aria-posinset={position} aria-setsize={size} aria-expanded={node.children?.length ? expanded.includes(node.id) : undefined} aria-selected={selectionMode === 'none' ? undefined : selected.includes(node.id)} aria-disabled={disabled || node.disabled || undefined} tabIndex={node.id === tabId ? 0 : -1}
      className={cn('flex cursor-default items-center gap-2 rounded-md py-1.5 pe-3 outline-none focus-visible:ring-2 focus-visible:ring-focus', selected.includes(node.id) && selectionMode !== 'none' && 'bg-surface-alt font-medium', (disabled || node.disabled) && 'opacity-55')}
      style={{ paddingInlineStart: `${(level - 1) * 20 + 8}px` }} onFocus={() => { focusWithin.current = true; setFocused(node.id); }} onClick={() => { if (!disabled && !node.disabled) { focus(node.id); select(node); } }}>
      {node.children?.length ? <button type="button" tabIndex={-1} aria-label={t(expanded.includes(node.id) ? 'Collapse {{label}}' : 'Expand {{label}}', { label: t(node.label) })} disabled={disabled || node.disabled} className="inline-flex size-5 items-center justify-center rounded-sm" onClick={event => { event.stopPropagation(); focus(node.id); toggle(node); }}>{expanded.includes(node.id) ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}</button> : <span className="size-5 shrink-0" aria-hidden="true" />}
      {node.icon && <span aria-hidden="true">{node.icon}</span>}<span className="truncate">{t(node.label)}</span>
    </div>)}
  </div>;
});
