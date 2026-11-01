// Author: yunnuo <ymz@ebox.vip>
// Description: Button primitive with token-driven variants; loading replaces content while pending.
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { cn } from '../lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-button text-on-primary hover:bg-button-hover shadow-tint',
        secondary: 'border border-line bg-surface text-ink hover:bg-surface-alt',
        ghost: 'text-ink hover:bg-surface-alt',
        danger: 'bg-danger text-on-primary hover:opacity-90',
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
