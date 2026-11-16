// Author: yunnuo <ymz@ebox.vip>
// Description: Button primitive with token-driven variants; pending prepends a spinner and disables the button.
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { cn } from './cn';

const buttonVariants = cva(
  'relative isolate inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-medium transition-[background-color,border-color,box-shadow,color,transform] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-55 motion-safe:active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Primary CTA carries a 180° accent gradient. Gradients cannot
        // interpolate, so the hover ramp fades in through a ::before overlay
        // kept behind the content by the isolated stacking context, and the
        // active ramp swaps the background directly.
        primary: 'bg-[linear-gradient(180deg,var(--button-gradient-from),var(--button-gradient-to))] text-on-primary shadow-tint before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-[linear-gradient(180deg,var(--button-gradient-hover-from),var(--button-gradient-hover-to))] before:opacity-0 before:transition-opacity hover:before:opacity-100 active:bg-[linear-gradient(180deg,var(--button-gradient-active-from),var(--button-gradient-active-to))] active:before:opacity-0',
        secondary: 'border border-line bg-surface text-ink hover:bg-surface-hover',
        ghost: 'text-ink hover:bg-surface-hover',
        danger: 'bg-danger text-on-primary hover:bg-danger/90',
        dangerSoft: 'border border-danger-line bg-danger-soft text-danger hover:opacity-85',
        link: 'text-accent underline-offset-2 hover:underline',
      },
      size: {
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-9 px-3.5',
        lg: 'h-10 px-5 text-md',
        icon: 'size-8',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { pending?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant, size, pending = false, disabled, children, type, ...props }, ref) {
  return <button
    ref={ref}
    type={type ?? 'button'}
    className={cn(buttonVariants({ variant, size }), className)}
    disabled={disabled || pending}
    aria-busy={pending || undefined}
    {...props}
  >
    {pending && <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />}
    {children}
  </button>;
});

export { buttonVariants };
