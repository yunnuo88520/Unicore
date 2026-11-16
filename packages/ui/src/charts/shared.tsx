// Author: yunnuo <ymz@ebox.vip>
// Description: Shared chart shell, semantic palette, controlled legend and keyboard/pointer inspection.
import { useId, useState, type ReactNode } from 'react';
import './charts.css';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../card';
import { cn } from '../cn';
import { defineMessages, useI18n } from '../i18n';
import { finiteValue } from './data';
import type { ChartCardProps, ChartHover, ChartMessages, ChartSeries, ChartTableRow, ChartValue, ChartFormatContext } from './types';

export const chartMessages = defineMessages({ empty: 'No chart data', invalid: 'Some values are missing or invalid', data: 'View chart data', category: 'Category', value: 'Value', range: 'Date range', missing: 'Not available', series: 'Chart series', target: 'Target' });
export const chartMessagesZh = defineMessages({ empty: '暂无图表数据', invalid: '部分值缺失或无效', data: '查看图表数据', category: '类别', value: '数值', range: '日期范围', missing: '暂无数据', series: '图表系列', target: '目标值' });
export const chartColors = ['var(--chart-1, var(--color-primary))', 'var(--chart-2, var(--color-info))', 'var(--chart-3, var(--color-success))', 'var(--chart-4, var(--color-warning))', 'var(--chart-5, var(--color-accent))', 'var(--chart-6, var(--color-muted))', 'var(--chart-7, var(--color-danger))', 'var(--chart-8, var(--color-ink))'] as const;
export const chartColor = (index: number, color?: string) => color ?? chartColors[index % chartColors.length];
export const valueSeries: ChartSeries[] = [{ key: 'value', label: chartMessages.value }];
/** Finite-safe locale formatter shared by headlines, axes, hover and tables. Percent values use 0..100 units. */
export function formatChartValue(value: ChartValue, options: { locale: string; missing: string; context?: ChartFormatContext; formatter?: ChartCardProps['formatValue']; percent?: boolean; signed?: boolean }): string {
  if (!finiteValue(value)) return options.missing;
  if (options.formatter && !options.percent) return options.formatter(value, options.context ?? { purpose: 'tooltip' });
  return new Intl.NumberFormat(options.locale, { maximumFractionDigits: 2, ...(options.percent ? { style: 'percent', maximumFractionDigits: 1 } : {}), ...(options.signed ? { signDisplay: 'exceptZero' } : {}) }).format(options.percent ? value / 100 : value);
}
export function useChart(props: ChartCardProps) {
  const { locale: hostLocale, t } = useI18n();
  const locale = props.locale ?? hostLocale;
  const messages = { ...Object.fromEntries(Object.entries(chartMessages).map(([key, value]) => [key, t(locale.startsWith('zh') ? chartMessagesZh[key as keyof ChartMessages] : value)])) as ChartMessages, ...props.messages };
  const format = (value: ChartValue, context: ChartFormatContext = { purpose: 'tooltip' }) => formatChartValue(value, { locale, missing: messages.missing, context, formatter: props.formatValue });
  const formatPercent = (value: ChartValue) => formatChartValue(value, { locale, missing: messages.missing, percent: true });
  return { locale, messages, format, formatPercent };
}
export function useInspection(props: ChartCardProps) {
  const { format } = useChart(props);
  const [hover, setHover] = useState<ChartHover | null>(null);
  const update = (next: ChartHover | null) => { setHover(next); props.onHoverChange?.(next); };
  return { hover, bind: (datum: ChartHover) => ({
    tabIndex: 0, role: props.onSelect ? 'button' : 'img', 'aria-label': `${datum.label}: ${datum.values.map(item => `${item.label} ${format(item.value, { purpose: 'tooltip', seriesKey: item.key, datumId: datum.id })}`).join(', ')}`,
    onMouseEnter: () => update(datum), onMouseLeave: () => update(null), onFocus: () => update(datum), onBlur: () => update(null),
    onClick: () => props.onSelect?.(datum),
    onKeyDown: (event: React.KeyboardEvent) => { if (event.key === 'Escape') update(null); if (props.onSelect && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); props.onSelect(datum); } },
    className: 'outline-none focus-visible:stroke-focus',
  }) };
}
export function ChartFrame({ props, series, rows, children, hover, invalid = false, legendSeries = series, inspectionHeadline = false }: {
  props: ChartCardProps; series: readonly ChartSeries[]; rows: readonly ChartTableRow[]; children: ReactNode; hover?: ChartHover | null; invalid?: boolean; legendSeries?: readonly ChartSeries[]; inspectionHeadline?: boolean;
}) {
  const { messages, format, locale } = useChart(props); const id = useId();
  const headline = inspectionHeadline && hover ? { label: hover.label, value: hover.values[0]?.value } : props.headline;
  const any = rows.some(row => series.some(item => finiteValue(row.values[item.key])));
  return <Card className={cn('ui-chart min-w-0', props.className)} data-motion={props.animate === false ? 'off' : 'on'} role="region" aria-labelledby={id} dir="ltr">
    <CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><CardTitle id={id}>{props.title}</CardTitle>{props.description && <CardDescription>{props.description}</CardDescription>}</div>
      {props.range && <label className="flex items-center gap-2 text-xs text-muted"><span>{messages.range}</span><select className="max-w-full rounded-md border border-line bg-surface px-2 py-1 text-ink" value={props.range.value} onChange={event => props.range!.onChange(event.target.value)}>{props.range.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}</div>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      {(headline || props.delta) && <div className="ui-chart-entrance flex flex-wrap items-baseline gap-3" data-chart-headline="true" aria-live={inspectionHeadline ? 'polite' : undefined}>{headline && <dl><dt className="text-xs text-muted">{headline.label}</dt><dd className="text-3xl font-semibold tabular-nums text-ink">{format(headline.value, { purpose: 'tile', datumId: inspectionHeadline ? hover?.id : undefined })}</dd></dl>}{props.delta && <p className={cn('flex items-center gap-1 text-xs tabular-nums', props.delta.tone === 'success' ? 'text-success' : props.delta.tone === 'danger' ? 'text-danger' : 'text-muted')}><span>{formatChartValue(props.delta.value, { locale, missing: messages.missing, percent: props.delta.format === 'percent', signed: true })}</span><span>{props.delta.label}</span></p>}</div>}
      {props.tiles && <dl className="grid grid-cols-2 gap-3">{props.tiles.map(tile => <div key={tile.id} className="min-w-0"><dt className="text-xs text-muted">{tile.label}</dt><dd className="text-xl font-semibold tabular-nums text-ink">{format(tile.value, { purpose: 'tile', datumId: tile.id })}</dd>{tile.detail && <dd className="text-xs text-muted">{tile.detail}</dd>}</div>)}</dl>}
      {legendSeries.length > 1 && <ul aria-label={messages.series} className="flex flex-wrap gap-3 text-xs">{legendSeries.map((item, index) => { const active = !props.visibleSeries || props.visibleSeries.includes(item.key); return <li key={item.key}>{props.onVisibleSeriesChange ? <button type="button" aria-pressed={active} className="flex items-center gap-1.5 text-ink disabled:opacity-50" onClick={() => props.onVisibleSeriesChange!(active ? (props.visibleSeries ?? legendSeries.map(s => s.key)).filter(key => key !== item.key) : [...(props.visibleSeries ?? legendSeries.map(s => s.key)), item.key])}><span className="size-2 rounded-full" style={{ background: chartColor(index, item.color), opacity: active ? 1 : 0.25 }} />{item.label}</button> : <span className="flex items-center gap-1.5 text-muted"><span className="size-2 rounded-full" style={{ background: chartColor(index, item.color) }} />{item.label}</span>}</li>; })}</ul>}
      {!any ? <p role="status" className="py-8 text-center text-sm text-muted">{messages.empty}</p> : children}
      {invalid && <p role="status" className="text-xs text-muted">{messages.invalid}</p>}
      <div className="min-h-6 text-xs text-muted" aria-live="polite">{hover && <><strong className="text-ink">{hover.label}</strong>{hover.values.map(value => <span key={value.key} className="ms-3">{value.label}: {format(value.value, { purpose: 'tooltip', seriesKey: value.key, datumId: hover.id })}</span>)}</>}</div>
      <details className="text-xs text-muted"><summary className="cursor-pointer">{messages.data}</summary><div className="max-h-72 overflow-auto"><table className="w-full text-start"><caption className="sr-only">{props.title}</caption><thead><tr><th scope="col" className="p-2 text-start">{messages.category}</th>{series.map(item => <th key={item.key} scope="col" className="p-2 text-end">{item.label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-line"><th scope="row" className="p-2 text-start font-normal">{row.label}</th>{series.map(item => <td key={item.key} className="p-2 text-end tabular-nums">{format(row.values[item.key], { purpose: 'table', seriesKey: item.key, datumId: row.id })}</td>)}</tr>)}</tbody></table></div></details>
    </CardContent>{props.footer && <CardFooter>{props.footer}</CardFooter>}
  </Card>;
}
export function ChartSvg({ height = 240, children, viewBox = '0 0 600 260' }: { height?: number; children: ReactNode; viewBox?: string }) {
  return <svg viewBox={viewBox} width="100%" height={Number.isFinite(height) ? Math.max(100, height) : 240} className="ui-chart-entrance overflow-visible text-muted" style={{ maxWidth: '100%' }} fill="none">{children}</svg>;
}
export function datumHover(id: string, label: string, value: ChartValue, seriesLabel: string): ChartHover { return { id, label, values: [{ key: 'value', label: seriesLabel, value }] }; }
