// Author: yunnuo <ymz@ebox.vip>
// Description: Text input, textarea and radix label sharing one CVA control surface.
import { forwardRef, useId, useState, type InputHTMLAttributes, type LabelHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { Eye, EyeOff } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { cn } from './cn';
import { t, useLocale } from './i18n';

// The aria-invalid:* selectors react to the DOM attribute; cva keeps the surface composable and exported.
export const controlVariants = cva('w-full rounded-lg border border-transparent bg-field px-3 text-base text-ink transition-colors placeholder:text-muted outline-none hover:border-line-strong focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-danger aria-invalid:ring-danger', {
  variants: { appearance: { default: '', search: 'rounded-full border-transparent bg-surface-inset shadow-none' } },
  defaultVariants: { appearance: 'default' },
});

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; labelSuffix?: ReactNode; strength?: boolean; appearance?: 'default' | 'search'; leadingIcon?: ReactNode };
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, label, labelSuffix, strength, appearance, leadingIcon, id, type, onChange, ...props }, ref) {
  useLocale();
  const generated = useId();
  const inputID = id ?? generated;
  // Floating captions come from the explicit label only; bare aria-label stays
  // an accessible name for label-less controls (search fields, date pickers).
  const caption = label;
  const password = type === 'password';
  const visibilityCaption = typeof caption === 'string' && caption !== t('密码') ? caption : undefined;
  const requiredMark = labelSuffix ?? (props.required ? <span aria-hidden="true" className="ms-1 text-danger">*</span> : null);
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState(String(props.defaultValue ?? ''));
  const text = String(props.value ?? draft);
  const showStrength = password && (strength ?? props.autoComplete === 'new-password');
  const score = !text ? 0 : text.length < 8 ? 1 : text.length < 12 ? 2 : text.length >= 16 || [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter(rule => rule.test(text)).length >= 3 ? 4 : 3;
  const strengthLabel = !score ? t('密码强度：尚未输入') : score <= 2 ? t('密码强度：弱') : score === 3 ? t('密码强度：中') : t('密码强度：强');
  const input = <input ref={ref} id={inputID} type={password && visible ? 'text' : type} {...props}
    placeholder={caption ? ' ' : props.placeholder}
    aria-labelledby={props['aria-labelledby'] ?? (caption ? `${generated}-caption` : undefined)}
    aria-describedby={[props['aria-describedby'], showStrength ? `${inputID}-strength` : ''].filter(Boolean).join(' ') || undefined}
    onChange={event => { setDraft(event.target.value); onChange?.(event); }}
    className={cn(controlVariants({ appearance }), caption ? 'peer h-11' : 'h-9', password && 'pe-12', leadingIcon && 'ps-9', className)} />;
  if (!caption && !password && !leadingIcon) return input;
  return <div className="flex w-full min-w-0 flex-col gap-2">
    <div className={cn('relative min-w-0', caption && 'pt-6')}>
      {leadingIcon && <span className="pointer-events-none absolute start-3 top-1/2 flex -translate-y-1/2 text-muted [&_svg]:size-4" aria-hidden="true">{leadingIcon}</span>}
      {input}
      {caption && <label htmlFor={inputID} className={cn('pointer-events-none absolute start-3 top-0 max-w-[calc(100%-1.5rem)] origin-left scale-[0.85] truncate text-sm leading-5 text-muted transition-[top,scale,color] duration-150 motion-reduce:transition-none peer-placeholder-shown:top-9 peer-placeholder-shown:scale-100 peer-focus:top-0 peer-focus:scale-[0.85] peer-focus:text-accent peer-autofill:top-0 peer-autofill:scale-[0.85] peer-autofill:text-accent peer-disabled:opacity-55', props['aria-invalid'] && 'text-danger', (type === 'date' || type === 'time' || type === 'datetime-local') && 'peer-placeholder-shown:top-0 peer-placeholder-shown:scale-[0.85]')}>
        <span id={`${generated}-caption`}>{caption}</span>{requiredMark}
      </label>}
      {password && <button type="button" aria-label={visibilityCaption ? t(visible ? '隐藏{{label}}' : '显示{{label}}', { label: visibilityCaption }) : visible ? t('隐藏密码') : t('显示密码')} aria-pressed={visible} disabled={props.disabled} className="absolute end-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted outline-none hover:bg-surface-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-55" onPointerDown={event => event.preventDefault()} onClick={() => setVisible(value => !value)}>
        {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
      </button>}
    </div>
    {showStrength && <div id={`${inputID}-strength`} className="flex flex-col gap-1.5">
      <div role="meter" aria-label={t('密码强度')} aria-valuemin={0} aria-valuemax={4} aria-valuenow={score} aria-valuetext={strengthLabel} className="flex gap-1">
        {[1, 2, 3, 4].map(level => <span key={level} className={cn('h-1 flex-1 rounded-full bg-line transition-colors', score >= level && (score <= 2 ? 'bg-danger' : score === 3 ? 'bg-warning' : 'bg-success'))} />)}
      </div>
      <p className="text-xs text-muted">{strengthLabel}</p>
    </div>}
  </div>;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; labelSuffix?: ReactNode }>(function Textarea({ className, label, labelSuffix, id, ...props }, ref) {
  const generated = useId();
  const inputID = id ?? generated;
  const caption = label ?? props['aria-label'];
  return <div className={cn('relative min-w-0', caption && 'pt-6')}><textarea ref={ref} id={inputID} className={cn(controlVariants(), 'peer min-h-24 py-3', className)} {...props} placeholder={caption ? ' ' : props.placeholder} aria-labelledby={props['aria-labelledby'] ?? (caption ? `${generated}-caption` : undefined)} />
    {caption && <label htmlFor={inputID} className="pointer-events-none absolute start-3 top-0 origin-left scale-[0.85] text-sm leading-5 text-muted transition-[top,scale,color] duration-150 motion-reduce:transition-none peer-placeholder-shown:top-9 peer-placeholder-shown:scale-100 peer-focus:top-0 peer-focus:scale-[0.85] peer-focus:text-accent"><span id={`${generated}-caption`}>{caption}</span>{labelSuffix ?? (props.required ? <span aria-hidden="true" className="ms-1 text-danger">*</span> : null)}</label>}
  </div>;
});

export const NativeSelect = forwardRef<HTMLSelectElement, InputHTMLAttributes<HTMLSelectElement>>(function NativeSelect({ className, ...props }, ref) {
  return <select ref={ref} className={cn(controlVariants(), 'h-9 appearance-none', className)} {...props} />;
});

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement> & { htmlFor?: string }>(function Label({ className, ...props }, ref) {
  return <LabelPrimitive.Root ref={ref} className={cn('text-sm font-medium text-ink select-none', className)} {...props} />;
});

export { controlVariants as controlSurface };
