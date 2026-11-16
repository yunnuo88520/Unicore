// Author: yunnuo <ymz@ebox.vip>
// Description: Compact accessible catalog framing, independent of workspace geometry.
import type { ReactNode } from 'react';
import { cn } from '@unicore/ui/cn';
import { chartIds } from './catalog';

const chartSamples: ReadonlySet<string> = new Set(chartIds);

const wideSamples = new Set(['calendar', 'data-grid', 'data-table', 'stat-cards']);
const panelSamples = new Set(['composer', 'composer-panel', 'composer-attachments', 'composer-loader', 'settings-modal']);
const compactSamples = new Set(['input', 'textarea', 'number-field', 'time-field', 'select', 'combobox', 'search-field', 'color-picker', 'input-otp', 'slider']);

function sampleWidth(id: string) {
  if (wideSamples.has(id)) return 'w-full';
  if (panelSamples.has(id) || chartSamples.has(id)) return 'w-full max-w-3xl';
  if (compactSamples.has(id)) return 'w-full max-w-xs';
  return 'w-full max-w-sm';
}

export function Sample({ id, children }: { id: string; children: ReactNode }) {
  return <section id={`sample-${id}`} data-catalog-id={id} aria-labelledby={`sample-title-${id}`} className="min-w-0 scroll-mt-6 space-y-3">
    <h2 id={`sample-title-${id}`} className="flex items-center gap-3 text-sm font-semibold text-ink"><span className="font-mono">{id}</span><span aria-hidden="true" className="h-px flex-1 bg-line" /></h2>
    <div data-sample-surface className={cn('min-w-0 space-y-3', sampleWidth(id))}>{children}</div>
  </section>;
}
export function Feedback({ children }: { children: ReactNode }) { return <output aria-live="polite" className="block break-words text-sm text-muted">{children}</output>; }
