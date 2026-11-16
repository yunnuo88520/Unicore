// Author: yunnuo <ymz@ebox.vip>
// Description: Composable action controls with native link and button semantics.
import { forwardRef, type AnchorHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button, buttonVariants, type ButtonProps } from '../button';
import { cn } from '../cn';
import { useControlI18n } from './messages';

export const ButtonGroup = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { label: string; orientation?: 'horizontal' | 'vertical' }>(function ButtonGroup({ label, orientation = 'horizontal', className, ...props }, ref) {
  const { t } = useControlI18n();
  return <div ref={ref} role="group" aria-label={t(label)} className={cn('inline-flex gap-1', orientation === 'vertical' && 'flex-col', className)} {...props} />;
});

export type IconButtonProps = Omit<ButtonProps, 'children'> & { label: string; children: ReactNode };
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ label, size = 'icon', ...props }, ref) {
  const { t } = useControlI18n();
  return <Button ref={ref} size={size} aria-label={t(label)} {...props} />;
});

export const CloseButton = forwardRef<HTMLButtonElement, Omit<IconButtonProps, 'children' | 'label'> & { label?: string }>(function CloseButton({ label = 'Close', variant = 'ghost', ...props }, ref) {
  return <IconButton ref={ref} label={label} variant={variant} {...props}><X size={16} aria-hidden="true" /></IconButton>;
});

export type LinkButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & { disabled?: boolean; variant?: ButtonProps['variant']; size?: ButtonProps['size'] };
export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(function LinkButton({ disabled, variant = 'link', size = 'md', className, href, tabIndex, onClick, ...props }, ref) {
  return <a ref={ref} {...props} href={disabled ? undefined : href} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : tabIndex}
    className={cn(buttonVariants({ variant, size }), disabled && 'pointer-events-none opacity-55', className)}
    onClick={event => { if (disabled) event.preventDefault(); else onClick?.(event); }} />;
});

/** Generic provider action. Authentication, branding, and network effects belong to the caller. */
export const SocialButton = forwardRef<HTMLButtonElement, ButtonProps & { icon?: ReactNode }>(function SocialButton({ icon, children, variant = 'secondary', ...props }, ref) {
  return <Button ref={ref} variant={variant} {...props}>{icon && <span aria-hidden="true">{icon}</span>}{children}</Button>;
});
