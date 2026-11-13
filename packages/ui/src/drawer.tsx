// Author: yunnuo <ymz@ebox.vip>
// Description: Side sheet over the Radix dialog: slides in from an edge with the shared overlay.
// Use for preference panels and contextual editors; confirmations stay in Modal/ConfirmDialog.
import { forwardRef, useRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { t } from './i18n';
import { cn } from './cn';

export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerClose = DialogPrimitive.Close;

const SIDES = {
  end: 'inset-y-0 end-0 start-auto h-dvh max-h-none w-[min(384px,100%)] border-s rounded-none rounded-s-xl border-0',
  start: 'inset-y-0 start-0 end-auto h-dvh max-h-none w-[min(384px,100%)] border-e rounded-none rounded-e-xl border-0',
} as const;

export const DrawerContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { side?: keyof typeof SIDES; title: ReactNode; closeLabel?: string }>(function DrawerContent({ side = 'end', title, closeLabel, className, children, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) {
  // State-controlled drawers render no Radix trigger; remember what opened the
  // surface so focus returns there on close, like DialogContent.
  const opener = useRef<HTMLElement | null>(null);
  return <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim/70 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out" />
    <DialogPrimitive.Content ref={ref}
      className={cn('fixed top-0 z-50 flex flex-col overflow-y-auto border-line bg-surface p-4 shadow-modal data-[state=open]:animate-in data-[state=closed]:animate-out', SIDES[side], className)}
      onOpenAutoFocus={event => {
        opener.current = (event.currentTarget as HTMLElement).ownerDocument.activeElement as HTMLElement | null;
        onOpenAutoFocus?.(event);
      }}
      onCloseAutoFocus={event => {
        onCloseAutoFocus?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        if (opener.current && opener.current.isConnected) opener.current.focus({ preventScroll: true });
      }}
      {...props}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <DialogPrimitive.Title className="text-base font-semibold text-ink">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Close asChild>
          <button type="button" className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-alt hover:text-ink" aria-label={t(closeLabel ?? '关闭面板')}><X size={16} /></button>
        </DialogPrimitive.Close>
      </div>
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>;
});
