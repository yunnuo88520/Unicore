// Author: yunnuo <ymz@ebox.vip>
// Description: Inline feedback, bounded measurement, and count primitives; no notification transport.
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { cn } from '../cn';
import { useControlI18n } from './messages';
import { CloseButton } from './actions';
import { clamp } from './utils';

const feedbackVariants = cva('flex items-start gap-3 rounded-lg border p-3 text-sm', { variants: { tone: {
  neutral: 'border-line bg-surface text-ink', info: 'border-line bg-surface-alt text-ink', danger: 'border-danger-line bg-danger-soft text-danger',
}}, defaultVariants: { tone: 'neutral' } });
export type AnnouncementProps = HTMLAttributes<HTMLDivElement> & { tone?: 'neutral' | 'info' | 'danger'; onDismiss?: () => void; dismissLabel?: string };
export const Announcement = forwardRef<HTMLDivElement, AnnouncementProps>(function Announcement({ tone, onDismiss, dismissLabel = 'Dismiss announcement', className, children, ...props }, ref) {
  return <div ref={ref} role="status" className={cn(feedbackVariants({ tone }), className)} {...props}><div className="min-w-0 flex-1">{children}</div>{onDismiss && <CloseButton label={dismissLabel} onClick={onDismiss} />}</div>;
});
export const Notification = forwardRef<HTMLDivElement, AnnouncementProps & { title: string; action?: ReactNode; urgent?: boolean }>(function Notification({ title, action, urgent, children, ...props }, ref) {
  const { t } = useControlI18n();
  return <Announcement ref={ref} dismissLabel="Dismiss notification" role={urgent ? 'alert' : 'status'} {...props}><p className="font-medium">{t(title)}</p>{children && <div className="mt-1 text-muted">{children}</div>}{action && <div className="mt-2">{action}</div>}</Announcement>;
});
export const Counter = forwardRef<HTMLOutputElement, HTMLAttributes<HTMLOutputElement> & { value: number; max?: number; label: string }>(function Counter({ value, max, label, className, ...props }, ref) {
  const { t, locale } = useControlI18n();
  const format = (number: number) => new Intl.NumberFormat(locale).format(number);
  return <output ref={ref} aria-label={t(label)} className={cn('inline-flex min-w-5 items-center justify-center rounded-full bg-surface-alt px-1.5 text-xs tabular-nums text-ink', className)} {...props}>{max !== undefined && value > max ? `${format(max)}+` : format(value)}</output>;
});
export const Spinner = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement> & { label?: string; size?: number }>(function Spinner({ label = 'Loading', size = 16, className, ...props }, ref) {
  const { t } = useControlI18n();
  return <span ref={ref} role="status" className={cn('inline-flex items-center text-muted', className)} {...props}><LoaderCircle size={size} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /><span className="sr-only">{t(label)}</span></span>;
});
export type MeterProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & { value: number; min?: number; max?: number; label: string; valueText?: string };
export const Meter = forwardRef<HTMLDivElement, MeterProps>(function Meter({ value, min = 0, max = 100, label, valueText, className, ...props }, ref) {
  const { t } = useControlI18n();
  const upper = Math.max(min, max);
  const bounded = clamp(Number.isFinite(value) ? value : min, min, upper);
  const percent = upper === min ? 0 : (bounded - min) / (upper - min) * 100;
  return <div ref={ref} role="meter" aria-label={t(label)} aria-valuemin={min} aria-valuemax={upper} aria-valuenow={bounded} aria-valuetext={valueText} className={cn('h-2 overflow-hidden rounded-full bg-surface-alt', className)} {...props}><div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} /></div>;
});
