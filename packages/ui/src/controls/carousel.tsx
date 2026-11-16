// Author: yunnuo <ymz@ebox.vip>
// Description: Focus-safe, manually advanced slide carousel; intentionally no autoplay.
import { forwardRef, useId, type HTMLAttributes, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../cn';
import { useControlI18n } from './messages';
import { IconButton } from './actions';
import { clamp, useControllable } from './utils';

export interface CarouselSlide { id: string; content: ReactNode; label?: string }
export type CarouselProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> & { label: string; slides: readonly CarouselSlide[]; value?: number; defaultValue?: number; onValueChange?: (index: number) => void; loop?: boolean; disabled?: boolean };
export const Carousel = forwardRef<HTMLDivElement, CarouselProps>(function Carousel({ label, slides, value, defaultValue = 0, onValueChange, loop = false, disabled, className, onKeyDown, ...props }, ref) {
  const { t } = useControlI18n();
  const base = useId();
  const [rawIndex, setIndex] = useControllable(value, defaultValue, onValueChange);
  const index = clamp(rawIndex, 0, Math.max(0, slides.length - 1));
  const move = (delta: number) => { if (!disabled && slides.length > 1) setIndex(loop ? (index + delta + slides.length) % slides.length : clamp(index + delta, 0, slides.length - 1)); };
  return <div ref={ref} role="region" aria-roledescription={t('carousel')} aria-label={t(label)} tabIndex={0} className={cn('flex flex-col gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-focus', className)} {...props}
    onKeyDown={event => {
      onKeyDown?.(event); if (event.defaultPrevented || disabled || event.target !== event.currentTarget) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1); }
      else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); setIndex(event.key === 'Home' ? 0 : Math.max(0, slides.length - 1)); }
    }}>
    <div aria-live="polite" aria-atomic="false">{slides.map((slide, slideIndex) => <div key={slide.id} id={`${base}-${encodeURIComponent(slide.id)}`} role="group" aria-roledescription={t('slide')} aria-label={slide.label ? t(slide.label) : t('Slide {{current}} of {{total}}', { current: slideIndex + 1, total: slides.length })} hidden={index !== slideIndex}>{slide.content}</div>)}</div>
    <div className="flex items-center justify-center gap-3"><IconButton label="Previous slide" variant="secondary" disabled={disabled || slides.length < 2 || (!loop && index === 0)} onClick={() => move(-1)}><ChevronLeft size={16} /></IconButton><span className="text-sm tabular-nums text-muted">{slides.length ? index + 1 : 0} / {slides.length}</span><IconButton label="Next slide" variant="secondary" disabled={disabled || slides.length < 2 || (!loop && index === slides.length - 1)} onClick={() => move(1)}><ChevronRight size={16} /></IconButton></div>
  </div>;
});
