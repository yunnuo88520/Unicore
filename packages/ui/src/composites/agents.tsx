// Author: yunnuo <ymz@ebox.vip>
// Description: Local, callback-driven agent profile controls and truthful activity surfaces.
import { useId, type ReactNode } from 'react';
import { Button } from '../button';
import { Card, CardContent } from '../card';
import { Input, Label, NativeSelect, Textarea } from '../input';
import { cn } from '../cn';
import { useLocale } from '../i18n';
import { compositeT as t } from './messages';
import { agentActivityT as extra } from './agent-activity.messages';
import { TaskList, type TaskStep } from './activity';

export type AgentAvatarShape = 'round' | 'square' | 'diamond' | 'squircle' | 'capsule' | 'star' | 'flower' | 'shield';
export type AgentAvatarExpression = 'smile' | 'calm' | 'focused' | 'curious' | 'joyful' | 'wink';
export type AgentAvatar = { shape: AgentAvatarShape; expression: AgentAvatarExpression; color: 'accent' | 'success' | 'warning' };
export type AgentProfile = { name: string; description: string; instructions: string; avatar: AgentAvatar };
export interface AgentCreatorProps {
  value: AgentProfile;
  onChange?: (value: AgentProfile) => void;
  onSubmit?: (value: AgentProfile) => void;
  /** Caller-owned controls; no locale, voice or persistence service is implied. Native controls inherit the disabled fieldset. */
  localeSlot?: ReactNode;
  voiceSlot?: ReactNode;
  preferencesSlot?: ReactNode;
  /** Compact is capped at 36rem; split explicitly opts into a wider two-column profile. */
  layout?: 'compact' | 'split';
  pending?: boolean;
  disabled?: boolean;
  className?: string;
}
const shapes: AgentAvatarShape[] = ['round', 'square', 'diamond', 'squircle', 'capsule', 'star', 'flower', 'shield'];
const expressions: AgentAvatarExpression[] = ['smile', 'calm', 'focused', 'curious', 'joyful', 'wink'];
const colors: AgentAvatar['color'][] = ['accent', 'success', 'warning'];
const silhouette: Record<Exclude<AgentAvatarShape, 'round' | 'square'>, string> = {
  diamond: 'M50 3 97 50 50 97 3 50Z',
  squircle: 'M50 5C87 5 95 13 95 50S87 95 50 95 5 87 5 50 13 5 50 5Z',
  capsule: 'M31 6H69C85 6 94 24 94 50S85 94 69 94H31C15 94 6 76 6 50S15 6 31 6Z',
  star: 'M50 3 64 22 88 12 83 38 98 50 80 64 88 88 63 80 50 98 37 80 12 88 20 64 2 50 17 38 12 12 36 22Z',
  flower: 'M50 13C68-7 86 7 82 28 108 33 106 58 84 66 91 92 66 105 50 86 34 105 9 92 16 66-6 58-8 33 18 28 14 7 32-7 50 13Z',
  shield: 'M50 5 91 20V49C91 72 70 88 50 97 30 88 9 72 9 49V20Z',
};
export function AgentAvatarPreview({ value, label, className }: { value: AgentAvatar; label?: string; className?: string }) {
  useLocale();
  return <svg viewBox="0 0 100 100" role="img" aria-label={label ?? t('Agent avatar')} className={cn('size-24 shrink-0', { 'text-accent': value.color === 'accent', 'text-success': value.color === 'success', 'text-warning': value.color === 'warning' }, className)}>
    {value.shape === 'round' ? <circle cx="50" cy="50" r="44" fill="currentColor" /> : value.shape === 'square' ? <rect x="6" y="6" width="88" height="88" rx="20" fill="currentColor" /> : <path d={silhouette[value.shape]} fill="currentColor" />}
    {/* Ink-backed face provides readable expressions on every semantic accent, without external assets. */}
    <rect x="23" y="29" width="54" height="45" rx="18" className="fill-surface" />
    <g className="text-ink" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" fill="none">
      {value.expression === 'focused' ? <path d="m31 40 8 3m22 0 8-3M33 47h4m26 0h4" /> : value.expression === 'joyful' ? <path d="m30 46 5-5 5 5m20 0 5-5 5 5" /> : value.expression === 'wink' ? <path d="M34 42v5m27-2 4-3 4 3" /> : value.expression === 'curious' ? <><path d="m29 36 11-2M34 44v3m31-5v7" /><circle cx="51" cy="61" r="4" /></> : <path d="M34 42v4m32-4v4" />}
      {value.expression !== 'curious' && <path d={value.expression === 'smile' || value.expression === 'wink' ? 'M36 58Q50 71 64 58' : value.expression === 'joyful' ? 'M38 57Q50 76 62 57Z' : value.expression === 'calm' ? 'M41 62h18' : 'M44 61h12'} />}
    </g>
  </svg>;
}
export function AgentCreator({ value, onChange, onSubmit, localeSlot, voiceSlot, preferencesSlot, layout = 'compact', pending, disabled, className }: AgentCreatorProps) {
  useLocale(); const id = useId(); const locked = !!(disabled || pending || !onChange);
  const update = (patch: Partial<AgentProfile>) => { if (!locked) onChange?.({ ...value, ...patch }); };
  const optionLabel = (option: AgentAvatarShape | AgentAvatarExpression | AgentAvatar['color']) => {
    if (option === 'squircle' || option === 'capsule' || option === 'star' || option === 'flower' || option === 'shield' || option === 'curious' || option === 'joyful' || option === 'wink') return extra(option);
    return t(option);
  };
  const hasPreferences = localeSlot != null || voiceSlot != null || preferencesSlot != null;
  return <form className={cn('grid w-full min-w-0 gap-6', layout === 'split' ? 'max-w-3xl md:grid-cols-[minmax(0,1fr)_15rem]' : 'max-w-xl', className)} onSubmit={event => { event.preventDefault(); if (!disabled && !pending && value.name.trim()) onSubmit?.(value); }}>
    <div className="flex min-w-0 flex-col gap-6">
      <fieldset disabled={locked} className="flex min-w-0 flex-col gap-4"><legend className="mb-3 text-sm font-medium text-ink">{extra('Identity')}</legend>
        <div className="flex flex-col gap-1.5"><Label htmlFor={`${id}-name`}>{t('Name')}</Label><Input id={`${id}-name`} required value={value.name} onChange={event => update({ name: event.target.value })} /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor={`${id}-description`}>{t('Description')}</Label><Textarea id={`${id}-description`} value={value.description} onChange={event => update({ description: event.target.value })} /></div>
      </fieldset>
      <fieldset disabled={locked} className="grid min-w-0 gap-3 sm:grid-cols-3"><legend className="mb-3 text-sm font-medium text-ink">{t('Avatar')}</legend>
        <div className="flex min-w-0 flex-col gap-1.5"><Label htmlFor={`${id}-shape`}>{t('Shape')}</Label><NativeSelect id={`${id}-shape`} value={value.avatar.shape} onChange={event => update({ avatar: { ...value.avatar, shape: event.target.value as AgentAvatarShape } })}>{shapes.map(option => <option key={option} value={option}>{optionLabel(option)}</option>)}</NativeSelect></div>
        <div className="flex min-w-0 flex-col gap-1.5"><Label htmlFor={`${id}-expression`}>{t('Expression')}</Label><NativeSelect id={`${id}-expression`} value={value.avatar.expression} onChange={event => update({ avatar: { ...value.avatar, expression: event.target.value as AgentAvatarExpression } })}>{expressions.map(option => <option key={option} value={option}>{optionLabel(option)}</option>)}</NativeSelect></div>
        <div className="flex min-w-0 flex-col gap-1.5"><Label htmlFor={`${id}-color`}>{t('Color')}</Label><NativeSelect id={`${id}-color`} value={value.avatar.color} onChange={event => update({ avatar: { ...value.avatar, color: event.target.value as AgentAvatar['color'] } })}>{colors.map(option => <option key={option} value={option}>{optionLabel(option)}</option>)}</NativeSelect></div>
      </fieldset>
      <fieldset disabled={locked} className="flex min-w-0 flex-col gap-3 border-t border-line pt-4"><legend className="pr-2 text-sm font-medium text-ink">{extra('Behavior')}</legend><Label htmlFor={`${id}-instructions`}>{t('Instructions')}</Label><Textarea id={`${id}-instructions`} rows={5} value={value.instructions} onChange={event => update({ instructions: event.target.value })} /></fieldset>
      {hasPreferences && <fieldset disabled={locked} className="flex min-w-0 flex-col gap-4 border-t border-line pt-4"><legend className="pr-2 text-sm font-medium text-ink">{extra('Optional preferences')}</legend>{localeSlot != null && <div role="group" aria-label={extra('Language')}>{localeSlot}</div>}{voiceSlot != null && <div role="group" aria-label={extra('Voice')}>{voiceSlot}</div>}{preferencesSlot != null && <div role="group" aria-label={extra('Preferences')}>{preferencesSlot}</div>}</fieldset>}
      <div className="flex flex-col items-start gap-2 border-t border-line pt-4"><Button type="submit" pending={pending} className="[&_svg]:motion-reduce:animate-none" disabled={disabled || !onSubmit || !value.name.trim()}>{t('Create agent')}</Button><p className="text-xs text-muted">{extra('Local profile only. Connecting services is managed by the host application.')}</p></div>
    </div>
    <aside aria-label={extra('Profile preview')} className={cn('order-first flex min-w-0 flex-col items-center gap-4 self-start rounded-xl border border-line bg-surface-alt p-5', layout === 'split' && 'md:order-none')}>
      <span className="self-start text-xs text-muted">{extra('Profile preview')}</span><AgentAvatarPreview value={value.avatar} className="size-28" />
      <div className="flex w-full min-w-0 flex-col gap-2 text-center"><h3 className="break-words text-base font-medium text-ink [overflow-wrap:anywhere]">{value.name.trim() || extra('Untitled agent')}</h3><p className="whitespace-pre-wrap break-words text-sm text-muted [overflow-wrap:anywhere]">{value.description || extra('Add a description to introduce this agent.')}</p></div>
    </aside>
  </form>;
}
export interface AgentLimit { id: string; label: ReactNode; used: number; limit: number; detail?: ReactNode }
export function AgentLimitsCard({ title, limits, footer }: { title?: ReactNode; limits: AgentLimit[]; footer?: ReactNode }) {
  useLocale(); return <Card><CardContent className="flex min-w-0 flex-col gap-4"><h3 className="font-medium text-ink">{title ?? t('Agent limits')}</h3>{limits.map(limit => {
    const valid = Number.isFinite(limit.used) && Number.isFinite(limit.limit) && limit.limit > 0;
    return <div key={limit.id} className="flex min-w-0 flex-col gap-1"><div className="flex flex-wrap justify-between gap-2 text-sm text-ink"><span className="min-w-0 break-words">{limit.label}</span><span>{Number.isFinite(limit.used) ? limit.used : '—'} / {Number.isFinite(limit.limit) ? limit.limit : '—'}</span></div>{valid ? <meter className="w-full" aria-label={typeof limit.label === 'string' ? limit.label : t('Usage')} min={0} max={limit.limit} value={Math.min(limit.limit, Math.max(0, limit.used))} /> : <span className="text-xs text-muted">{extra('Indeterminate progress')}</span>}{limit.detail != null && <div className="text-xs text-muted">{limit.detail}</div>}</div>;
  })}{footer}</CardContent></Card>;
}
export interface AgentProgressProps {
  value?: number;
  label?: ReactNode;
  detail?: ReactNode;
  /** Real caller-provided steps; the percentage remains independent and is never fabricated from steps. */
  steps?: TaskStep[];
  revealedIds?: string[];
  onRevealChange?: (ids: string[]) => void;
  disabled?: boolean;
  className?: string;
}
export function AgentProgress({ value, label, detail, steps, revealedIds = [], onRevealChange, disabled, className }: AgentProgressProps) {
  useLocale(); const id = useId(); const bounded = value === undefined || !Number.isFinite(value) ? undefined : Math.min(100, Math.max(0, value));
  return <section aria-labelledby={id} className={cn('flex min-w-0 flex-col gap-3 text-sm text-ink', className)}><div className="flex flex-wrap items-center justify-between gap-2"><div id={id}>{label ?? t('Agent progress')}</div><span className="text-xs text-muted">{bounded === undefined ? extra('Indeterminate progress') : extra('{{value}}% complete', { value: Math.round(bounded) })}</span></div><progress className="w-full accent-accent" max={100} value={bounded} aria-labelledby={id} aria-describedby={detail != null ? `${id}-detail` : undefined} />{detail != null && <div id={`${id}-detail`} className="text-xs text-muted">{detail}</div>}{steps && <><p className="text-xs text-muted">{extra('{{complete}} of {{total}} steps complete', { complete: steps.filter(step => step.status === 'success').length, total: steps.length })}</p><TaskList steps={steps} revealedIds={revealedIds} onRevealChange={onRevealChange} disabled={disabled} /></>}</section>;
}
export type AgentThinkingVariant = 'wave' | 'spin' | 'stars' | 'infinity';
export function AgentThinking({ variant = 'wave', label, className }: { variant?: AgentThinkingVariant; label?: ReactNode; className?: string }) {
  useLocale(); return <div role="status" className={cn('inline-flex items-center gap-2 text-sm text-muted', className)}><span aria-hidden="true" className="flex size-6 items-center justify-center text-accent">
    {variant === 'wave' ? <span className="flex gap-1">{[0, 1, 2].map(i => <span key={i} className="h-3 w-1 rounded-full bg-current motion-safe:animate-pulse motion-reduce:animate-none" style={{ animationDelay: `${i * 180}ms` }} />)}</span> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cn('size-6 motion-reduce:animate-none', variant === 'spin' ? 'motion-safe:animate-spin' : 'motion-safe:animate-pulse')}>
      {variant === 'spin' ? <path d="M20 12a8 8 0 1 1-8-8" /> : variant === 'stars' ? <path d="m8 2 2 5 5 2-5 2-2 5-2-5-5-2 5-2Zm10 11 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" /> : <path d="M12 12C8 3 1 6 2 12s6 9 10 0 11-6 10 0-6 9-10 0Z" />}
    </svg>}
  </span>{label ?? t('Thinking')}</div>;
}
