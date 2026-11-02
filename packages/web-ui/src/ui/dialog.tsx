// Author: yunnuo <ymz@ebox.vip>
// Description: Radix dialog surface plus a legacy-compatible Modal with title, pending lock and first-field focus.
import { forwardRef, useEffect, useRef, type ComponentPropsWithoutRef, type HTMLAttributes, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { X } from 'lucide-react';
import { t, useLocale } from '../i18n';
import { cn } from '../lib/cn';
import { Button } from './button';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const FOCUSABLE = 'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export const DialogContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { showClose?: boolean }>(function DialogContent({ className, children, showClose = true, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) {
  useLocale();
  // Radix restores focus to its DialogTrigger, which state-controlled dialogs do not render;
  // keep the legacy behavior of returning focus to the element that opened the surface.
  const opener = useRef<HTMLElement | null>(null);
  return <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim/70 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out" />
    <DialogPrimitive.Content ref={ref} className={cn('fixed start-1/2 top-1/2 z-50 flex max-h-[85dvh] w-[calc(100%-16px)] max-w-dialog -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-xl border border-line bg-surface p-4 shadow-modal data-[state=open]:animate-in data-[state=closed]:animate-out', className)}
      onOpenAutoFocus={event => {
        opener.current = (event.currentTarget as HTMLElement).ownerDocument.activeElement as HTMLElement | null;
        // Keep the legacy first-field focus: an explicit data-autofocus target wins, else the first focusable control.
        onOpenAutoFocus?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        const root = event.currentTarget as HTMLElement;
        const target = root.querySelector<HTMLElement>('[data-autofocus]') ?? root.querySelector<HTMLElement>(FOCUSABLE);
        target?.focus();
      }}
      onCloseAutoFocus={event => {
        onCloseAutoFocus?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        if (opener.current && opener.current.isConnected) opener.current.focus({ preventScroll: true });
      }}
      {...props}>
      {children}
      {showClose && <DialogPrimitive.Close asChild><Button variant="ghost" size="icon" className="absolute end-3 top-3" aria-label={t('关闭对话框')}><X size={17} /></Button></DialogPrimitive.Close>}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>;
});

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-3 flex flex-col gap-1 pe-8', className)} {...props} />;
}

export function DialogTitle({ className, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-lg font-semibold text-ink', className)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-xs text-muted', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-4 flex flex-wrap items-center justify-end gap-2', className)} {...props} />;
}

/** Legacy-compatible modal: mounted equals open; Escape and overlay closes are suppressed while pending. */
export function Modal({ title, onClose, pending = false, children, className }: { title: string; onClose: () => void; pending?: boolean; children: ReactNode; className?: string }) {
  useLocale();
  useEffect(() => {
    if (pending) return;
    const previous = document.activeElement as HTMLElement | null;
    return () => { previous?.focus(); };
  }, [pending]);
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent aria-label={t(title)} showClose={false}>
      <DialogHeader>
        <DialogTitle>{t(title)}</DialogTitle>
      </DialogHeader>
      <div className={className} data-autofocus-scope>
        {children}
      </div>
      <DialogPrimitive.Close asChild><Button variant="ghost" size="icon" className="absolute end-3 top-3" aria-label={t('关闭{{v0}}', { v0: title })} disabled={pending}><X size={17} /></Button></DialogPrimitive.Close>
    </DialogContent>
  </Dialog>;
}

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

export function ConfirmDialog({ title, description, confirmLabel, cancelLabel, danger = false, pending = false, onConfirm, onCancel, open = true }: {
  title: string; description?: string; confirmLabel: string; cancelLabel: string; danger?: boolean; pending?: boolean; onConfirm: () => void; onCancel: () => void; open?: boolean;
}) {
  useLocale();
  return <AlertDialogPrimitive.Root open={open} onOpenChange={open => { if (!open && !pending) onCancel(); }}>
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim/70" />
      <AlertDialogPrimitive.Content className="fixed start-1/2 top-1/2 z-50 w-[calc(100%-16px)] max-w-dialog -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-surface p-4 shadow-modal">
        <AlertDialogPrimitive.Title className="text-md font-semibold text-ink">{t(title)}</AlertDialogPrimitive.Title>
        {description && <AlertDialogPrimitive.Description className="mt-1 text-sm text-muted">{t(description)}</AlertDialogPrimitive.Description>}
        <AlertDialogPrimitive.Action asChild>
          <Button variant={danger ? 'danger' : 'primary'} className="mt-4" pending={pending} onClick={event => { event.preventDefault(); onConfirm(); }}>{t(confirmLabel)}</Button>
        </AlertDialogPrimitive.Action>
        <AlertDialogPrimitive.Cancel asChild>
          <Button variant="secondary" className="mt-4 ms-2" disabled={pending} onClick={onCancel}>{t(cancelLabel)}</Button>
        </AlertDialogPrimitive.Cancel>
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  </AlertDialogPrimitive.Root>;
}
