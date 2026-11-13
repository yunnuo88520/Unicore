// Author: yunnuo <ymz@ebox.vip>
// Description: Pure, deterministic chart transforms; missing is never silently converted to zero.
import type { ChartDatum, ChartPoint, ChartSeries, ChartValue } from './types';

export const finiteValue = (value: ChartValue): value is number => typeof value === 'number' && Number.isFinite(value);
export const nonNegative = (value: ChartValue): value is number => finiteValue(value) && value >= 0;
export function numericDomain(values: readonly ChartValue[], zero = true): [number, number] {
  const valid = values.filter(finiteValue);
  if (!valid.length) return [0, 1];
  let min = zero ? Math.min(0, ...valid) : Math.min(...valid);
  let max = zero ? Math.max(0, ...valid) : Math.max(...valid);
  if (min === max) { const pad = Math.abs(min) * 0.1 || 1; min -= zero ? 0 : pad; max += pad; }
  return [min, max];
}
export function scale(value: number, domain: readonly [number, number], range: readonly [number, number]): number {
  if (!Number.isFinite(value) || domain[0] === domain[1]) return range[0];
  return range[0] + ((value - domain[0]) / (domain[1] - domain[0])) * (range[1] - range[0]);
}
export function normalizePercent(points: readonly ChartPoint[], series: readonly ChartSeries[]): ChartPoint[] {
  return points.map(point => {
    const total = series.reduce((sum, item) => sum + (nonNegative(point.values[item.key]) ? point.values[item.key]! : 0), 0);
    return { ...point, values: Object.fromEntries(series.map(item => {
      const value = point.values[item.key];
      return [item.key, nonNegative(value) ? total > 0 ? value / total * 100 : 0 : null];
    })) };
  });
}
export function rankDates(data: readonly ChartDatum[], limit = 5): ChartDatum[] {
  return data.filter(item => nonNegative(item.value)).map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.value! - a.item.value! || a.index - b.index).slice(0, Math.max(0, Math.floor(limit))).map(({ item }) => item);
}
export function progress(value: ChartValue, target = 100): number | null {
  return nonNegative(value) && finiteValue(target) && target > 0 ? Math.min(1, value / target) : null;
}
export type CalendarCell = { date: string; week: number; weekday: number; value: ChartValue; id: string };
/** UTC date-only calendar avoids DST and local-time shifts. Duplicate dates are summed; absent days stay missing. */
export function calendarCells(data: readonly { date: string; value: ChartValue }[], start: string, end: string): CalendarCell[] {
  const parse = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date ? Date.parse(date + 'T00:00:00Z') : NaN;
  let first: number; let last: number;
  try { first = parse(start); last = parse(end); } catch { return []; }
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first || last - first > 366 * 86400000) return [];
  const values = new Map<string, number>();
  for (const item of data) if (nonNegative(item.value)) values.set(item.date, (values.get(item.date) ?? 0) + item.value);
  const offset = new Date(first).getUTCDay();
  return Array.from({ length: Math.round((last - first) / 86400000) + 1 }, (_, index) => {
    const date = new Date(first + index * 86400000).toISOString().slice(0, 10);
    return { date, id: date, week: Math.floor((index + offset) / 7), weekday: (index + offset) % 7, value: values.get(date) ?? null };
  });
}
export type SankeyNode = { id: string; label: string; color?: string };
export type SankeyLink = { source: string; target: string; value: number };
/** Fail closed for cycles, duplicate IDs, unknown nodes and negative flows. */
export function sankeyLayers(nodes: readonly SankeyNode[], links: readonly SankeyLink[]): Map<string, number> | null {
  if (new Set(nodes.map(node => node.id)).size !== nodes.length) return null;
  const layers = new Map(nodes.map(node => [node.id, 0]));
  if (links.some(link => !layers.has(link.source) || !layers.has(link.target) || !nonNegative(link.value))) return null;
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const link of links) {
      if (layers.get(link.target)! <= layers.get(link.source)!) { layers.set(link.target, layers.get(link.source)! + 1); changed = true; }
    }
    if (!changed) return layers;
  }
  return links.length ? null : layers;
}

export type XY = readonly [number, number];
/** Bounded cubic interpolation or sharp polyline; runs must be split at missing data by callers. */
export function linePath(points: readonly XY[], smooth = false): string {
  if (!points.length) return '';
  let path = `M${points[0][0]},${points[0][1]}`;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 2] ?? points[index - 1]; const b = points[index - 1]; const c = points[index]; const d = points[index + 1] ?? c;
    const bounded = (value: number, first: number, last: number) => Math.max(Math.min(first, last), Math.min(Math.max(first, last), value));
    path += smooth ? ` C${bounded(b[0] + (c[0] - a[0]) / 6, b[0], c[0])},${bounded(b[1] + (c[1] - a[1]) / 6, b[1], c[1])} ${bounded(c[0] - (d[0] - b[0]) / 6, b[0], c[0])},${bounded(c[1] - (d[1] - b[1]) / 6, b[1], c[1])} ${c[0]},${c[1]}` : ` L${c[0]},${c[1]}`;
  }
  return path;
}
