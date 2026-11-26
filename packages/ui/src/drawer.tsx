// Author: yunnuo <ymz@ebox.vip>
// Description: Accessible side panels and entity editors with a fixed header and independently scrolling content.
import { forwardRef, useRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cva } from 'class-variance-authority';
import { X } from 'lucide-react';
import { t, useLocale } from './i18n';
import { cn } from './cn';
import { Button } from './button';
import { FOCUSABLE } from './dialog';
import { ControlLabelProvider } from './input';

export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerClose = DialogPrimitive.Close;

const SIDES = {
  end: 'end-2 start-auto sm:end-3',
  start: 'start-2 end-auto sm:start-3',
} as const;

const drawerVariants = cva('fixed inset-y-2 z-50 flex min-h-0 w-[calc(100%-16px)] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-modal outline-none sm:inset-y-3 sm:w-[calc(100%-24px)]', {
  variants: { size: { sm: 'max-w-96', md: 'max-w-[560px]', lg: 'max-w-[800px]' } },
  defaultVariants: { size: 'sm' },
});

type DrawerContentProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  side?: keyof typeof SIDES;
  size?: 'sm' | 'md' | 'lg';
  title: ReactNode;
  description?: ReactNode;
  closeLabel?: string;
  pending?: boolean;
  bodyClassName?: string;
  /** Editor recipes focus their first body field; plain panels focus the close button. */
  focusBody?: boolean;
};

export const DrawerContent = forwardRef<HTMLDivElement, DrawerContentProps>(function DrawerContent({ side = 'end', size = 'sm', title, description, closeLabel, pending = false, className, bodyClassName, focusBody = false, children, onOpenAutoFocus, onCloseAutoFocus, onEscapeKeyDown, ...props }, ref) {
  useLocale();
  // State-controlled drawers render no Radix trigger; remember what opened the
  // surface so focus returns there on close, like DialogContent.
  const opener = useRef<HTMLElement | null>(null);
  return <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim/50" />
    <DialogPrimitive.Content ref={ref}
      className={cn(drawerVariants({ size }), SIDES[side], className)}
      {...(!description ? { 'aria-describedby': undefined } : {})}
      aria-busy={pending || undefined}
      onOpenAutoFocus={event => {
        opener.current = (event.currentTarget as HTMLElement).ownerDocument.activeElement as HTMLElement | null;
        onOpenAutoFocus?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        const root = event.currentTarget as HTMLElement;
        // DialogContent convention: an explicit data-autofocus target wins, else
        // the first focusable control (header close button first). Editor recipes
        // opt into body-scoped focus so their first field opens ready to type.
        const scope = focusBody ? root.querySelector<HTMLElement>('[data-drawer-body]') ?? root : root;
        const target = root.querySelector<HTMLElement>('[data-autofocus]') ?? scope.querySelector<HTMLElement>(FOCUSABLE);
        (target ?? root).focus({ preventScroll: true });
      }}
      onCloseAutoFocus={event => {
        onCloseAutoFocus?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        if (opener.current && opener.current.isConnected) opener.current.focus({ preventScroll: true });
      }}
      onEscapeKeyDown={event => {
        onEscapeKeyDown?.(event);
        if (pending) event.preventDefault();
      }}
      {...props}>
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <DialogPrimitive.Title className="break-words text-lg font-medium leading-7 text-ink">{title}</DialogPrimitive.Title>
          {description && <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted">{description}</DialogPrimitive.Description>}
        </div>
        <DialogPrimitive.Close asChild>
          <Button variant="ghost" size="icon" className="-me-2 -mt-1 shrink-0" disabled={pending} aria-label={t(closeLabel ?? '关闭面板')}><X size={18} /></Button>
        </DialogPrimitive.Close>
      </div>
      <div data-drawer-body className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 py-5 sm:px-6', bodyClassName)}>{children}</div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>;
});

/** Entity editor recipe. Pair with AppForm layout="panel", AppFormBody and AppFormFooter. */
export function FormDrawer({ title, description, onClose, pending = false, size = 'md', children }: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  pending?: boolean;
  size?: 'md' | 'lg';
  children: ReactNode;
}) {
  useLocale();
  return <Drawer open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DrawerContent title={title} description={description} size={size} pending={pending} focusBody closeLabel={t('关闭{{v0}}', { v0: title })}
      bodyClassName="overflow-hidden p-0 sm:px-0" onInteractOutside={event => event.preventDefault()}>
      <ControlLabelProvider layout="stacked">{children}</ControlLabelProvider>
    </DrawerContent>
  </Drawer>;
}
