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

// The dedicated navigation animation: two accent segments chase across a
// transparent track (fast lead, soft trail), theme-aware through
// --color-accent and disabled into a calm pulse under reduced motion.
const PROGRESS_KEYFRAMES = `
@keyframes np-chase-a { 0% { transform: translateX(-130%) } 55% { transform: translateX(240%) } 100% { transform: translateX(360%) } }
@keyframes np-chase-b { 0% { transform: translateX(-320%) } 65% { transform: translateX(110%) } 100% { transform: translateX(420%) } }
@keyframes np-pulse { 0%, 100% { opacity: .35 } 50% { opacity: .9 } }
.nav-progress { position: fixed; inset-inline: 0; top: 0; z-index: 90; height: 3px; pointer-events: none; overflow: hidden; }
.nav-progress span { position: absolute; inset-block: 0; border-radius: 999px; background: var(--color-accent); box-shadow: 0 0 8px color-mix(in srgb, var(--color-accent) 55%, transparent); }
.nav-progress .np-a { width: 36%; animation: np-chase-a 1.15s cubic-bezier(.25,.6,.35,.9) infinite; }
.nav-progress .np-b { width: 22%; opacity: .6; animation: np-chase-b 1.15s cubic-bezier(.35,.2,.65,.8) infinite .12s; }
@media (prefers-reduced-motion: reduce) {
  .nav-progress .np-a, .nav-progress .np-b { width: 34%; animation: np-pulse 1.4s ease-in-out infinite; }
}`;

/** The top progress bar; mount once per entry, ideally at the router root. */
export function NavigationProgressBar() {
  const [current, setCurrent] = useState<Phase>('idle');
  useEffect(() => {
    const notify = () => setCurrent(phase);
    listeners.add(notify);
    notify();
    return () => { listeners.delete(notify); };
  }, []);
  if (current === 'idle') return null;
  return <div aria-hidden="true">
    <style>{PROGRESS_KEYFRAMES}</style>
    {current === 'active'
      ? <div className="nav-progress"><span className="np-a" /><span className="np-b" /></div>
      : <div className="nav-progress"><span className="h-full w-full opacity-100 transition-opacity duration-300 ease-out" style={{ opacity: 0 }} /></div>}
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
