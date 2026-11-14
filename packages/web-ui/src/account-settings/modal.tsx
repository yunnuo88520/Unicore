// Author: yunnuo <ymz@ebox.vip>
// Description: The account settings modal opened from the account menus, ported 1:1 from the eboxui settings modal:
// dark backdrop, a 871x614 rounded panel with a left nav rail, a fixed title row over a scrolling page,
// the saved toast straddling the panel's bottom edge, and a fade + blur + scale open/close transition.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, KeyRound, Monitor, ShieldCheck, UserRound, X, type LucideIcon } from 'lucide-react';
import type { AppClient, Bootstrap } from '@unicore/sdk';
import { cn } from '@unicore/ui/cn';
import { defineMessages, t, useLocale } from '../i18n';
import { AccountProfilePage } from './profile';
import { AccountSecurityPanel } from './security';
import { AccountSessionsPanel } from './sessions';
import { AccountTokensPanel } from './tokens';

export type AccountSettingsPage = 'profile' | 'security' | 'sessions' | 'tokens';

const navEntries = defineMessages([
  { page: 'profile', label: '个人资料', icon: UserRound },
  { page: 'security', label: '安全设置', icon: ShieldCheck },
  { page: 'sessions', label: '登录会话', icon: Monitor },
  { page: 'tokens', label: '访问令牌', icon: KeyRound },
] as const satisfies readonly { page: AccountSettingsPage; label: string; icon: LucideIcon }[]);

const pageTitles = defineMessages({ profile: '个人资料', security: '安全设置', sessions: '登录会话', tokens: '访问令牌' } as const satisfies Record<AccountSettingsPage, string>);

export function AccountSettingsModal({ open, onClose, defaultPage = 'profile', pinned = false, client, metadata, refresh, oidc }: {
  open: boolean;
  onClose: () => void;
  /** Page selected each time the modal opens. */
  defaultPage?: AccountSettingsPage;
  /** Enrollment pins the modal: the backdrop, Escape and the close button stop dismissing it. */
  pinned?: boolean;
  client: AppClient;
  metadata: Bootstrap;
  refresh: () => void;
  /** One-shot OIDC binding result the shell consumed from the callback redirect. */
  oidc?: string;
}) {
  useLocale();
  const [page, setPage] = useState<AccountSettingsPage>(defaultPage);
  // Mount/visible two-phase state so both the enter and the exit play the
  // full fade + blur + scale transition before the DOM goes away.
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const unmountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // "Saved" toast — floats half-out of the panel's bottom edge for ~2s
  // whenever a settings row commits a change. Three phases so the motion is
  // directional: it rises in from below and keeps drifting upward while
  // fading out.
  const [savedPhase, setSavedPhase] = useState<'hidden' | 'shown' | 'leaving'>('hidden');
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSavedToast = () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
    setSavedPhase('shown');
    savedTimer.current = setTimeout(() => {
      setSavedPhase('leaving');
      savedTimer.current = setTimeout(() => setSavedPhase('hidden'), 220);
    }, 2000);
  };

  // Top fade over the scrolling page so rows dissolve under the title row
  // instead of cutting sharply.
  const [contentScrolled, setContentScrolled] = useState(false);

  useEffect(() => {
    if (open) {
      if (unmountTimer.current) clearTimeout(unmountTimer.current);
      setPage(defaultPage);
      setMounted(true);
      // Double rAF: the panel must commit its hidden state before the
      // transition to visible starts, or the browser skips the animation.
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      setSavedPhase('hidden');
      unmountTimer.current = setTimeout(() => setMounted(false), 320);
    }
    return () => {
      if (unmountTimer.current) clearTimeout(unmountTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, [open, defaultPage]);

  // Escape closes unless pinned; focus moves into the dialog once per open,
  // and the page behind stops scrolling for the duration like the shared Modal
  // does. The layered guard keeps nested dialogs (mailbox rebind, uploads,
  // confirms) from closing the whole modal: while any other dialog is up, the
  // Escape belongs to that layer first. Focus runs once per open on purpose —
  // re-stealing focus on every parent render would fight the nested dialogs'
  // focus scopes and dismiss them.
  useEffect(() => {
    if (!open || !mounted) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || pinned) return;
      // Capture phase, before any nested Radix dialog processes the key: this
      // Radix version renders role="dialog" without aria-modal (inert-based
      // modality), so the count must not filter on it. Any second dialog or
      // alertdialog means the Escape belongs to that topmost layer.
      const layers = document.querySelectorAll('[role="dialog"],[role="alertdialog"]');
      if (layers.length > 1) return;
      onClose();
    };
    document.addEventListener('keydown', onKeyDown, true);
    panelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
    // onClose participates through the stable setAccount closure; the effect
    // must not re-run (and re-focus) when the host re-creates the callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted, pinned]);

  if (!mounted || typeof document === 'undefined') return null;

  const dismiss = () => { if (!pinned) onClose(); };

  return createPortal(
    <div className="fixed inset-0 z-[45] flex items-center justify-center p-4" role="presentation">
      {/* Backdrop — the reference modal keeps black at 70% in both themes. */}
      <button
        type="button"
        aria-label={t('关闭个人中心')}
        tabIndex={-1}
        onClick={dismiss}
        className={cn('absolute inset-0 cursor-default bg-black/70 transition-opacity duration-300 ease-out', visible ? 'opacity-100' : 'opacity-0')}
      />

      {/* Animated wrapper — carries the open/close transition for the panel
          AND the saved toast, which straddles the panel's bottom edge and so
          must live outside the panel's overflow-clip. Kept light on purpose:
          a heavy blur over the full panel made the close stutter. */}
      <div
        className={cn(
          'relative transform-gpu transition-[opacity,transform,filter] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-[opacity,transform,filter]',
          visible ? 'scale-100 opacity-100 blur-0' : 'scale-[0.85] opacity-0 blur-[4px]',
        )}
      >
        {/* Panel — overflow-CLIP, not hidden: hidden boxes stay programmatically
            scrollable, so focusing a control clipped by the inner scroller could
            scroll-reveal it through the panel too. */}
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={t('个人中心')}
          tabIndex={-1}
          className="relative flex h-[614px] max-h-[calc(100dvh-32px)] w-[871px] max-w-[calc(100vw-32px)] overflow-clip rounded-3xl bg-surface shadow-control outline-none"
        >
          {/* Nav rail */}
          <nav aria-label={t('个人中心分区')} className="flex w-14 shrink-0 flex-col gap-5 overflow-y-auto border-e border-line bg-surface-soft p-2.5 sm:w-48 lg:w-60">
            <div className="flex w-full flex-col gap-1.5 pt-1">
              <span className="hidden ps-2 text-xs font-medium text-muted sm:block">{t('个人中心')}</span>
              <div className="flex w-full flex-col gap-1">
                {navEntries.map(item => {
                  const selected = item.page === page;
                  return <button
                    key={item.page}
                    type="button"
                    aria-label={t(item.label)}
                    title={t(item.label)}
                    aria-current={selected ? 'page' : undefined}
                    onClick={() => { setPage(item.page); setContentScrolled(false); }}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2 rounded-xl p-2 text-start outline-none transition-colors duration-150 ease focus-visible:ring-2 focus-visible:ring-focus',
                      selected ? 'bg-surface-hover' : 'hover:bg-surface-hover/60',
                    )}
                  >
                    <item.icon className="size-5 shrink-0 text-muted" aria-hidden="true" />
                    <span className={cn('hidden truncate text-sm sm:block', selected ? 'text-ink' : 'text-muted')}>{t(item.label)}</span>
                  </button>;
                })}
              </div>
            </div>
          </nav>

          {/* Content pane — fixed title row, scrollable page below */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-3 px-8 pb-3 pt-8">
              <h2 className="text-lg font-medium text-ink">{t(pageTitles[page])}</h2>
              {!pinned && <button
                type="button"
                aria-label={t('关闭个人中心')}
                onClick={onClose}
                className={cn(
                  'flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-surface-alt text-muted',
                  'transition-colors duration-150 ease hover:bg-surface-hover hover:text-ink',
                  'outline-none focus-visible:ring-2 focus-visible:ring-focus',
                )}
              >
                <X className="size-4" aria-hidden="true" />
              </button>}
            </div>
            <div className="relative min-h-0 flex-1">
              <div className="h-full overflow-y-auto px-8 pb-8" onScroll={event => setContentScrolled(event.currentTarget.scrollTop > 0)}>
                {page === 'profile'
                  ? <AccountProfilePage client={client} metadata={metadata} refresh={refresh} onSaved={showSavedToast} onNavigate={setPage} />
                  : page === 'security'
                    ? <AccountSecurityPanel client={client} metadata={metadata} refresh={refresh} oidc={oidc} onSaved={showSavedToast} />
                    : page === 'sessions'
                      ? <AccountSessionsPanel client={client} onSignedOut={refresh} />
                      : <AccountTokensPanel client={client} metadata={metadata} />}
              </div>
              {/* Progressive top fade — eases in once the page is scrolled so
                  content dissolves under the title row instead of hard-cutting. */}
              <div
                aria-hidden="true"
                className={cn('pointer-events-none absolute inset-x-0 top-0 h-10 bg-linear-to-b from-surface to-transparent transition-opacity duration-200 ease-out', contentScrolled ? 'opacity-100' : 'opacity-0')}
              />
            </div>
          </div>
        </div>

        {/* Saved toast — straddles the panel's bottom edge, half in / half out. */}
        <div
          aria-live="polite"
          className={cn(
            'pointer-events-none absolute bottom-0 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1',
            'rounded-full border border-line bg-surface py-1 pe-2.5 ps-1.5 shadow-control',
            'transition-[opacity,transform,filter] duration-200 ease-out',
            savedPhase === 'shown' && 'translate-y-1/2 scale-100 opacity-100 blur-0',
            // Starts below the resting spot, rises in; keeps drifting up on exit.
            savedPhase === 'hidden' && 'translate-y-[calc(50%+12px)] scale-90 opacity-0 blur-[2px]',
            savedPhase === 'leaving' && 'translate-y-[calc(50%-10px)] scale-90 opacity-0 blur-[2px]',
          )}
        >
          <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
          <span className="whitespace-nowrap text-xs font-medium text-ink">{t('已保存')}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
