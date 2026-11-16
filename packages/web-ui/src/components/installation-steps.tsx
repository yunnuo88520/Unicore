// Author: yunnuo <ymz@ebox.vip>
// Description: Centered, count-independent installation progress with an accessible current step.
import { Check } from 'lucide-react';
import { cn } from '@unicore/ui/cn';
import { t, useLocale } from '../i18n';

export function InstallationSteps({ steps, current }: { steps: readonly { id: string; label: string }[]; current: number }) {
  useLocale();
  return <nav aria-label={t('安装步骤')} className="mt-8 border-b border-line pb-6">
    <ol className="mx-auto flex w-full">
      {steps.map((step, index) => <li key={step.id} aria-current={index === current ? 'step' : undefined} className="relative flex min-w-0 flex-1 flex-col items-center gap-3 px-1 text-center">
        {index < steps.length - 1 && <span aria-hidden="true" className={cn('absolute start-1/2 top-4 w-full border-t', index < current ? 'border-accent' : 'border-line')} />}
        <span aria-hidden="true" className={cn('relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium tabular-nums', index < current ? 'border-accent bg-accent text-on-primary' : index === current ? 'border-accent bg-surface text-accent ring-4 ring-primary-soft' : 'border-line bg-surface text-muted')}>
          {index < current ? <Check size={16} /> : index + 1}
        </span>
        <span className={cn('sr-only max-w-full break-words text-sm leading-5 sm:not-sr-only', index === current ? 'font-medium text-ink' : 'text-muted')}>{step.label}</span>
      </li>)}
    </ol>
    <p className="mt-4 text-center text-xs text-muted sm:sr-only">{t('第 {{current}} 步，共 {{total}} 步', { current: current + 1, total: steps.length })}</p>
  </nav>;
}
