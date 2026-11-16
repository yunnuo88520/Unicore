// Author: yunnuo <ymz@ebox.vip>
// Description: Radial angle, percentage, arc-label, motion and shared headline semantics.
import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RadialChartCard, BarListChartCard, formatChartValue } from './index';
import { radialArcPath } from './polar';

const data = [{ id: 'a', label: 'Walking', value: 30, target: 60 }, { id: 'b', label: 'Running', value: 20, target: 40 }];
describe('radial semantics', () => {
  it('draws stacked shares across precisely one upper half gauge, not a full circle', () => {
    const result = render(<RadialChartCard title="Stack" data={data} variant="stacked" locale="en" />);
    const segments = [...result.container.querySelectorAll('[data-radial-value]')];
    expect(segments).toHaveLength(2);
    expect(Number(segments[0].getAttribute('data-start-angle'))).toBe(180);
    expect(Number(segments[0].getAttribute('data-end-angle'))).toBe(288);
    expect(Number(segments[1].getAttribute('data-start-angle'))).toBe(288);
    expect(Number(segments[1].getAttribute('data-end-angle'))).toBe(360);
    expect(result.container.querySelector('[data-radial-track]')?.getAttribute('d')).toBe(radialArcPath(300, 200, 100, 180, 360));
    expect(result.container.querySelectorAll('circle')).toHaveLength(0);
    expect(segments[0]).toHaveAttribute('stroke-dasharray', '100 100');
  });
  it.each(['gauge', 'solid'] as const)('%s center is target-weighted percent and responds to focused activity', variant => {
    const result = render(<RadialChartCard title="Progress" data={data} variant={variant} locale="en" headline={{ label: 'All activity', value: 50 }} />);
    expect(result.container.querySelector('[data-radial-center]')).toHaveTextContent('50%');
    const second = result.container.querySelector('[data-ring-id="b"]')!;
    fireEvent.focus(second);
    expect(result.container.querySelector('[data-ring-id="a"]')).toHaveAttribute('data-dimmed', 'true');
    expect(second).toHaveAttribute('data-dimmed', 'false');
    expect(result.container.querySelector('[data-chart-headline]')).toHaveTextContent('Running');
    expect(result.container.querySelector('[data-chart-headline]')).toHaveTextContent('20');
    fireEvent.blur(second);
    expect(result.container.querySelector('[data-chart-headline]')).toHaveTextContent('All activity');
    expect(result.container.querySelector('[data-ring-id="a"]')).toHaveAttribute('data-dimmed', 'false');
  });
  it('changes percentage center to the inspected goal and restores aggregate on pointer leave', () => {
    const result = render(<RadialChartCard title="Progress" data={[...data, { id: 'c', label: 'Cycling', value: 10, target: 100 }]} variant="gauge" locale="en" />);
    const center = result.container.querySelector('[data-radial-center]')!;
    expect(center).toHaveTextContent('30%');
    const cycling = result.container.querySelector('[data-ring-id="c"]')!;
    fireEvent.mouseEnter(cycling); expect(center).toHaveTextContent('10%');
    expect(result.container.querySelector('[data-chart-headline]')).toHaveTextContent('Cycling');
    fireEvent.mouseLeave(cycling); expect(center).toHaveTextContent('30%');
  });
  it('places labels on uniquely referenced SVG arcs across mounted cards', () => {
    const result = render(<><RadialChartCard title="One" data={data} variant="labels" /><RadialChartCard title="Two" data={data} variant="labels" /></>);
    const labels = [...result.container.querySelectorAll('textPath')];
    expect(labels).toHaveLength(4);
    const hrefs = labels.map(label => label.getAttribute('href')!);
    expect(new Set(hrefs).size).toBe(4);
    for (const href of hrefs) expect([...result.container.querySelectorAll('defs path')].some(path => path.id === href.slice(1))).toBe(true);
    expect(labels[0]).toHaveTextContent('Walking');
    expect(labels[0]).toHaveAttribute('startOffset', '50%');
  });
  it('never displays NaN percentages or draws negative progress; overflow is clamped only in geometry', () => {
    const result = render(<RadialChartCard title="Invalid" data={[{ id: 'a', label: 'Overflow', value: 200, target: 100 }, { id: 'b', label: 'Missing', value: null, target: 0 }]} variant="solid" locale="en" />);
    expect(result.container.querySelector('[data-radial-center]')).toHaveTextContent('100%');
    expect(result.container.querySelector('[data-radial-value]')).toHaveAttribute('stroke-dasharray', '100 100');
    expect(result.container.querySelector('table')).toHaveTextContent('200');
    expect(result.container.innerHTML).not.toContain('NaN');
    result.rerender(<RadialChartCard title="Missing" data={[{ id: 'a', label: 'Missing', value: null, target: 0 }]} variant="gauge" locale="en" />);
    expect(result.container.querySelector('[data-radial-center]')).toHaveTextContent('Not available');
  });
  it('shares headline and signed delta protocol with non-polar cards, preserving finite formatting', () => {
    const result = render(<BarListChartCard title="Summary" data={data} locale="en" headline={{ label: 'Activity', value: 50 }} delta={{ label: 'vs previous', value: -12.5, format: 'percent', tone: 'danger' }} />);
    expect(result.container.querySelector('[data-chart-headline]')).toHaveTextContent('Activity50-12.5%vs previous');
    expect(screen.getByText('-12.5%').parentElement).toHaveClass('text-danger');
    expect(formatChartValue(Infinity, { locale: 'en', missing: 'missing' })).toBe('missing');
    expect(formatChartValue(null, { locale: 'en', missing: 'missing', percent: true })).toBe('missing');
    expect(formatChartValue(12.5, { locale: 'en', missing: 'missing', percent: true, signed: true })).toBe('+12.5%');
    expect(formatChartValue(3, { locale: 'en', missing: '-', formatter: value => `${value} km` })).toBe('3 km');
  });
  it('opts out of entrance motion and supplies scoped token/reduced-motion CSS without style injection', () => {
    const result = render(<RadialChartCard title="Motion" data={data} variant="gauge" animate={false} />);
    expect(screen.getByRole('region')).toHaveAttribute('data-motion', 'off');
    expect(result.container.querySelector('style')).toBeNull();
    expect(result.container.querySelector('.ui-chart-arc')).not.toBeNull();
    const css = readFileSync(resolve(process.cwd(), 'packages/ui/src/charts/charts.css'), 'utf8');
    expect(css).toContain('var(--chart-motion-duration, 480ms)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation: none');
    expect(css).toContain('transition: none');
    result.rerender(<RadialChartCard title="Motion" data={data} variant="gauge" />);
    expect(screen.getByRole('region')).toHaveAttribute('data-motion', 'on');
  });
});
