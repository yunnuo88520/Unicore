// Author: yunnuo <ymz@ebox.vip>
// Description: Panel/card composition surface matching the shared workspace look.
import type { ComponentProps, HTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

export const cardVariants = cva('', {
  variants: {
    variant: {
      default: 'rounded-2xl border border-transparent bg-surface-soft',
      soft: 'rounded-2xl border border-transparent bg-surface-soft',
      outlined: 'rounded-2xl border border-line bg-surface',
    },
  },
  defaultVariants: { variant: 'default' },
});

export type CardProps = ComponentProps<'div'> & VariantProps<typeof cardVariants> & { asChild?: boolean };

export function Card({ asChild = false, variant, className, ...props }: CardProps) {
  const Component = asChild ? Slot : 'div';
  return <Component className={cn(cardVariants({ variant }), className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-0.5 border-b border-line px-5 py-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('flex items-center gap-2 text-md font-semibold text-ink', className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center gap-2 border-t border-line px-5 py-4', className)} {...props} />;
}
