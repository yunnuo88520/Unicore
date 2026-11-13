// Author: yunnuo <ymz@ebox.vip>
// Description: Accessible OTP entry with normalized paste, IME-safe editing and visual slots.
import { forwardRef, useRef, useState, type InputHTMLAttributes } from 'react';
import { cn } from '../cn';
import { useControlI18n } from './messages';
import { assignRef, useControllable } from './utils';

export type InputOTPProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'onChange' | 'maxLength' | 'size'> & {
  label: string; length?: number; value?: string; defaultValue?: string; onValueChange?: (value: string) => void; onComplete?: (value: string) => void; digitsOnly?: boolean;
};
export const InputOTP = forwardRef<HTMLInputElement, InputOTPProps>(function InputOTP({ label, length = 6, value, defaultValue = '', onValueChange, onComplete, digitsOnly = true, disabled, readOnly, className, onPaste, onCompositionStart, onCompositionEnd, onFocus, onBlur, onSelect, onPointerDown, ...props }, ref) {
  const { t } = useControlI18n();
  const count = Number.isFinite(length) ? Math.max(1, Math.min(32, Math.floor(length))) : 6;
  const normalize = (text: string) => (digitsOnly ? text.normalize('NFKC').replace(/\D/g, '') : text).slice(0, count);
  const [code, setCode] = useControllable(value, defaultValue, onValueChange);
  const [composition, setComposition] = useState<string | null>(null);
  const composing = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [caret, setCaret] = useState(0);
  const commit = (text: string) => {
    if (disabled || readOnly) return;
    const next = normalize(text);
    setCode(next);
    setCaret(Math.min(next.length, count - 1));
    if (next.length === count && next !== code) onComplete?.(next);
  };
  return <div className={cn('relative inline-flex w-fit max-w-full gap-2', disabled && 'opacity-55', className)}>
    <input ref={node => { input.current = node; assignRef(ref, node); }} type="text" inputMode={digitsOnly ? 'numeric' : 'text'} pattern={digitsOnly ? '[0-9]*' : undefined} autoComplete="one-time-code" aria-label={t(label)} value={composition ?? code} disabled={disabled} readOnly={readOnly} {...props}
      className="absolute inset-0 z-10 size-full cursor-text opacity-0 disabled:cursor-not-allowed"
      onFocus={event => { setFocused(true); onFocus?.(event); }} onBlur={event => { setFocused(false); onBlur?.(event); }}
      onPointerDown={event => {
        onPointerDown?.(event);
        if (event.defaultPrevented || disabled) return;
        event.preventDefault();
        const element = event.currentTarget;
        const bounds = element.getBoundingClientRect();
        const index = Math.min(code.length, count - 1, Math.max(0, Math.floor((event.clientX - bounds.left) / (bounds.width / count))));
        element.focus();
        element.setSelectionRange(index, Math.min(index + 1, code.length));
        setCaret(index);
      }}
      onSelect={event => { setCaret(Math.min(event.currentTarget.selectionStart ?? code.length, count - 1)); onSelect?.(event); }}
      onCompositionStart={event => { onCompositionStart?.(event); composing.current = true; setComposition(event.currentTarget.value); }}
      onCompositionEnd={event => { onCompositionEnd?.(event); composing.current = false; setComposition(null); commit(event.currentTarget.value); }}
      onPaste={event => {
        onPaste?.(event);
        if (event.defaultPrevented || disabled || readOnly || composing.current) return;
        const text = event.clipboardData.getData('text');
        event.preventDefault();
        const start = event.currentTarget.selectionStart ?? code.length;
        const end = event.currentTarget.selectionEnd ?? start;
        // Normalize before truncating so spaces/hyphens do not consume OTP slots.
        const pasted = digitsOnly ? text.normalize('NFKC').replace(/\D/g, '') : text;
        commit(code.slice(0, start) + pasted + code.slice(end));
        const caret = Math.min(count, start + pasted.length);
        requestAnimationFrame(() => input.current?.setSelectionRange(caret, caret));
      }}
      onChange={event => { if (composing.current) setComposition(event.target.value); else commit(event.target.value); }} />
    <div aria-hidden="true" className="pointer-events-none flex gap-2">{Array.from({ length: count }, (_, index) => <span key={index} className={cn('inline-flex h-12 w-10 items-center justify-center rounded-md border border-line bg-surface text-lg tabular-nums text-ink transition-colors', focused && caret === index && 'border-focus ring-2 ring-focus', props['aria-invalid'] && 'border-danger')}>{code[index] ?? ''}</span>)}</div>
  </div>;
});
