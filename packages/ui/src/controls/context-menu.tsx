// Author: yunnuo <ymz@ebox.vip>
// Description: Pointer- and keyboard-opened context actions using the installed dropdown focus manager.
import { forwardRef, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../dropdown-menu';
import { cn } from '../cn';
import { useControlI18n } from './messages';
import { assignRef } from './utils';

export interface ContextMenuAction { id: string; label: string; disabled?: boolean; onSelect: () => void }
export type ContextMenuProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & { children: ReactNode; actions: readonly ContextMenuAction[]; label: string; disabled?: boolean };
export const ContextMenu = forwardRef<HTMLDivElement, ContextMenuProps>(function ContextMenu({ children, actions, label, disabled, className, onContextMenu, onKeyDown, tabIndex = 0, ...props }, ref) {
  const { t } = useControlI18n();
  const root = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const outsidePointer = useRef(false);
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState({ x: 0, y: 0 });
  const show = (x: number, y: number) => {
    if (disabled || !actions.length) return;
    outsidePointer.current = false;
    returnFocus.current = document.activeElement instanceof HTMLElement && root.current?.contains(document.activeElement) ? document.activeElement : root.current;
    setPoint({ x, y }); setOpen(true);
  };
  return <DropdownMenu open={open && !disabled} onOpenChange={setOpen} modal={false}>
    <div ref={node => { root.current = node; assignRef(ref, node); }} tabIndex={tabIndex} aria-label={t(label)} className={cn('outline-none focus-visible:ring-2 focus-visible:ring-focus', className)} {...props}
      onContextMenu={event => { onContextMenu?.(event); if (!event.defaultPrevented && !disabled && actions.length && !event.shiftKey) { event.preventDefault(); show(event.clientX, event.clientY); } }}
      onKeyDown={event => { onKeyDown?.(event); if (!event.defaultPrevented && !disabled && actions.length > 0 && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); show(rect.left, rect.bottom); } }}>{children}</div>
    <DropdownMenuTrigger tabIndex={-1} aria-hidden="true" className="pointer-events-none fixed size-px opacity-0" style={{ left: point.x, top: point.y }} />
    <DropdownMenuContent ref={content} aria-label={t(label)} side="bottom" align="start" sideOffset={0}
      onContextMenu={event => event.preventDefault()}
      onPointerDownOutside={() => { outsidePointer.current = true; }}
      onCloseAutoFocus={event => { event.preventDefault(); if (!outsidePointer.current && returnFocus.current?.isConnected) returnFocus.current.focus(); }}>
      {actions.map(action => <DropdownMenuItem key={action.id} disabled={action.disabled} onSelect={action.onSelect}>{t(action.label)}</DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
});
