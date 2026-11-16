// Author: yunnuo <ymz@ebox.vip>
// Description: Slot-based authentication, settings and navigation surfaces with no application services.
import { useId, type ReactNode } from 'react';
import { Button } from '../button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../card';
import { Modal } from '../dialog';
import { StatCard, type StatCardProps } from '../stat-card';
import { cn } from '../cn';
import { useLocale } from '../i18n';
import { compositeT as t } from './messages';

export interface AuthCardProps { title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; media?: ReactNode; className?: string }
export function AuthCard({ title, description, children, footer, media, className }: AuthCardProps) {
  return <div className={cn('grid w-full min-w-0 gap-6', media ? 'max-w-4xl md:grid-cols-2' : 'max-w-md', className)}><Card><CardHeader><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</CardHeader><CardContent className="space-y-4">{children}{footer && <div className="border-t border-line pt-4">{footer}</div>}</CardContent></Card>{media && <aside className="min-w-0">{media}</aside>}</div>;
}
export interface AuthMediaSlide { id: string; title: ReactNode; description?: ReactNode; media?: ReactNode }
export function AuthMediaCarousel({ slides, activeId, onActiveChange, className }: { slides: AuthMediaSlide[]; activeId: string; onActiveChange?: (id: string) => void; className?: string }) {
  useLocale(); const id = useId(); const index = slides.findIndex(slide => slide.id === activeId); const slide = slides[index];
  const move = (offset: number) => { if (slides.length && index >= 0) onActiveChange?.(slides[(index + offset + slides.length) % slides.length].id); };
  return <section aria-label={t('Highlights')} aria-roledescription={t('Carousel')} className={cn('space-y-4 rounded-xl border border-line bg-surface-alt p-5 text-ink', className)}>
    <div id={id} aria-live="polite">{slide ? <><div>{slide.media}</div><h3 className="text-lg font-medium">{slide.title}</h3>{slide.description && <div className="text-sm text-muted">{slide.description}</div>}</> : <p>{t('No slides')}</p>}</div>
    <div className="flex flex-wrap items-center gap-2"><Button variant="secondary" disabled={!onActiveChange || slides.length < 2 || index < 0} aria-controls={id} onClick={() => move(-1)}>{t('Previous')}</Button>{slides.map((item, i) => <Button key={item.id} size="sm" variant={item.id === activeId ? 'primary' : 'ghost'} aria-current={item.id === activeId ? 'true' : undefined} aria-label={t('Go to slide {{number}}', { number: i + 1 })} aria-controls={id} disabled={!onActiveChange} onClick={() => onActiveChange?.(item.id)}>{i + 1}</Button>)}<Button variant="secondary" disabled={!onActiveChange || slides.length < 2 || index < 0} aria-controls={id} onClick={() => move(1)}>{t('Next')}</Button></div>
  </section>;
}
export interface SettingsSection { id: string; label: ReactNode; content: ReactNode; disabled?: boolean }
export interface SettingsDialogProps { open: boolean; onClose: () => void; title?: string; sections: SettingsSection[]; activeSectionId: string; onSectionChange?: (id: string) => void; footer?: ReactNode; pending?: boolean }
export function SettingsDialog({ open, onClose, title, sections, activeSectionId, onSectionChange, footer, pending }: SettingsDialogProps) {
  useLocale(); const id = useId(); if (!open) return null; const active = sections.find(section => section.id === activeSectionId && !section.disabled);
  return <Modal title={title ?? t('Settings')} onClose={onClose} pending={pending}><div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]"><nav aria-label={t('Settings sections')} className="flex flex-col gap-1">{sections.map((section, index) => <Button key={section.id} id={`${id}-section-${index}`} aria-current={section.id === activeSectionId ? 'true' : undefined} aria-controls={`${id}-content`} variant={section.id === activeSectionId ? 'secondary' : 'ghost'} className="h-auto justify-start whitespace-normal text-start" disabled={pending || section.disabled || !onSectionChange} onClick={() => onSectionChange?.(section.id)}>{section.label}</Button>)}</nav><section id={`${id}-content`} aria-labelledby={active ? `${id}-section-${sections.indexOf(active)}` : undefined} className="min-w-0">{active?.content}</section></div>{footer && <div className="mt-4 border-t border-line pt-4">{footer}</div>}</Modal>;
}
export interface SidebarItem { id: string; label: ReactNode; icon?: ReactNode; badge?: ReactNode; disabled?: boolean; children?: SidebarItem[] }
export function Sidebar({ items, activeId, onSelect, header, footer, label, className }: { items: SidebarItem[]; activeId?: string; onSelect?: (id: string) => void; header?: ReactNode; footer?: ReactNode; label?: string; className?: string }) {
  useLocale(); const renderItems = (entries: SidebarItem[], inheritedDisabled = false): ReactNode => <ul className="space-y-1">{entries.map(item => <li key={item.id}><Button variant={activeId === item.id ? 'secondary' : 'ghost'} className="h-auto w-full justify-start whitespace-normal text-start" disabled={inheritedDisabled || item.disabled || !onSelect} aria-current={activeId === item.id ? 'page' : undefined} onClick={() => onSelect?.(item.id)}>{item.icon}<span className="min-w-0 flex-1">{item.label}</span>{item.badge}</Button>{item.children && <div className="ms-3 border-s border-line ps-2">{renderItems(item.children, inheritedDisabled || item.disabled)}</div>}</li>)}</ul>;
  return <aside className={cn('flex min-h-0 min-w-0 flex-col gap-4 bg-surface p-3', className)}>{header}<nav aria-label={label ?? t('Navigation')} className="min-h-0 overflow-y-auto">{renderItems(items)}</nav>{footer && <div className="mt-auto">{footer}</div>}</aside>;
}
export function StatCards({ items, className }: { items: (StatCardProps & { id: string })[]; className?: string }) {
  return <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-4', className)}>{items.map(({ id, ...props }) => <StatCard key={id} {...props} />)}</div>;
}
