// Author: yunnuo <ymz@ebox.vip>
// Description: Route-level loading surface: a structured skeleton fallback and the top navigation progress bar.
// The bar is fed exclusively by router navigation events, so background polling and query refetches never trigger it.
import { useEffect, useState } from 'react';
import { Skeleton } from '@unicore/ui';
import { t } from '../i18n';

type Phase = 'idle' | 'active' | 'finish';

let phase: Phase = 'idle';
const listeners = new Set<() => void>();
let showTimer: ReturnType<typeof setTimeout> | undefined;
let finishTimer: ReturnType<typeof setTimeout> | undefined;
let guardTimer: ReturnType<typeof setTimeout> | undefined;

const emit = () => listeners.forEach(notify => notify());

/** Navigation started: reveal the bar after a short delay so quick switches never flash it. */
export function navigationStart() {
  clearTimeout(showTimer);
  clearTimeout(finishTimer);
  clearTimeout(guardTimer);
  showTimer = setTimeout(() => {
    phase = 'active';
    emit();
  }, 150);
  // Safety net: a stalled load must not leave a permanent bar.
  guardTimer = setTimeout(() => {
    if (phase !== 'idle') {
      phase = 'idle';
      emit();
    }
  }, 12000);
}

/** Navigation settled (including error renders): sweep to 100% and fade out. */
export function navigationFinish() {
  clearTimeout(showTimer);
  if (phase === 'idle') return;
  phase = 'finish';
  emit();
  finishTimer = setTimeout(() => {
    phase = 'idle';
    emit();
  }, 320);
}

/** The top progress bar; mount once per entry, ideally at the router root. */
export function NavigationProgressBar() {
  const [current, setCurrent] = useState<Phase>('idle');
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const notify = () => setCurrent(phase);
    listeners.add(notify);
    notify();
    return () => { listeners.delete(notify); };
  }, []);
  // active creeps toward ~80% over a few seconds; finish completes and fades.
  useEffect(() => {
    if (current === 'active') {
      setWidth(0);
      const creep = requestAnimationFrame(() => setWidth(80));
      return () => cancelAnimationFrame(creep);
    }
    if (current === 'finish') {
      setWidth(100);
      return;
    }
    setWidth(0);
  }, [current]);
  if (current === 'idle') return null;
  return <div aria-hidden="true" className="fixed inset-x-0 top-0 z-[90] pointer-events-none">
    <div className={current === 'finish' ? 'h-[3px] w-full bg-accent opacity-0 transition-all duration-300 ease-out' : 'h-[3px] bg-accent/25 transition-[width] duration-3000 ease-linear'}>
      <div className="h-full bg-accent transition-[width] duration-3000 ease-linear" style={{ width: `${width}%` }} />
    </div>
  </div>;
}

/** Structured route fallback: header and card shapes instead of a bare text line. */
export function PageLoader() {
  return <div role="status" aria-busy="true" className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
    <span className="sr-only">{t('页面加载中…')}</span>
    <div className="flex flex-col gap-2">
      <Skeleton className="h-6 w-52" />
      <Skeleton className="h-4 w-80" />
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
    </div>
  </div>;
}
