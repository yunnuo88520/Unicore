// Author: yunnuo <ymz@ebox.vip>
// Description: Text input, textarea and radix label with a shared control surface.
import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '../lib/cn';

const control = 'w-full rounded-md border border-line bg-surface px-3 text-base text-ink shadow-tint transition-colors placeholder:text-subtle outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-danger aria-invalid:ring-danger';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, 'h-9', className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(control, 'min-h-20 py-2', className)} {...props} />;
});

export const NativeSelect = forwardRef<HTMLSelectElement, InputHTMLAttributes<HTMLSelectElement>>(function NativeSelect({ className, ...props }, ref) {
  return <select ref={ref} className={cn(control, 'h-9 appearance-none', className)} {...props} />;
});

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement> & { htmlFor?: string }>(function Label({ className, ...props }, ref) {
  return <LabelPrimitive.Root ref={ref} className={cn('text-sm font-medium text-ink select-none', className)} {...props} />;
});

export { control as controlSurface };
