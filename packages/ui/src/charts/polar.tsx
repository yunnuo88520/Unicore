// Author: yunnuo <ymz@ebox.vip>
// Description: Capacity-aware concentric radial geometries and multiseries radar cards.
import { useId } from 'react';
import { finiteValue, nonNegative, progress } from './data';
import { ChartFrame, ChartSvg, chartColor, useChart, useInspection } from './shared';
import type { DatumChartProps, SeriesChartProps } from './types';

export type RadialChartCardProps = DatumChartProps & { variant?: 'rings' | 'labels' | 'grid' | 'gauge' | 'solid' | 'stacked'; target?: number; /** Hide totals for unlike-unit activity goals. */ showTotal?: boolean };
export type RadarChartCardProps = SeriesChartProps & { variant?: 'filled' | 'dots' | 'lines' | 'score'; maximum?: number };
/** SVG arc with explicit angles; 180..360 is the upper semicircle. */
export function radialArcPath(cx: number, cy: number, radius: number, start: number, end: number): string {
  const point = (degrees: number) => [cx + radius * Math.cos(degrees * Math.PI / 180), cy + radius * Math.sin(degrees * Math.PI / 180)];
  const [x1, y1] = point(start); const [x2, y2] = point(end);
  if (end - start >= 360) return `M${x1},${y1} A${radius},${radius} 0 1 1 ${cx - radius * Math.cos(start * Math.PI / 180)},${cy - radius * Math.sin(start * Math.PI / 180)} A${radius},${radius} 0 1 1 ${x2},${y2}`;
  return `M${x1},${y1} A${radius},${radius} 0 ${end - start > 180 ? 1 : 0} 1 ${x2},${y2}`;
}
export function RadialChartCard(props: RadialChartCardProps) {
  const { messages, format, formatPercent } = useChart(props); const inspection = useInspection(props); const variant = props.variant ?? 'rings';
  const uniqueId = useId().replace(/:/g, '');
  const stacked = variant === 'stacked'; const gauge = variant === 'gauge'; const percentCenter = gauge || variant === 'solid';
  const total = props.data.reduce((sum, item) => sum + (nonNegative(item.value) ? item.value : 0), 0);
  const valid = props.data.filter(item => progress(item.value, item.target ?? props.target ?? 100) !== null);
  const targetTotal = valid.reduce((sum, item) => sum + (item.target ?? props.target ?? 100), 0);
  const aggregatePercent = targetTotal > 0 ? valid.reduce((sum, item) => sum + item.value!, 0) / targetTotal * 100 : null;
  const active = props.data.find(item => item.id === inspection.hover?.id);
  const activePercent = active ? progress(active.value, active.target ?? props.target ?? 100) : null;
  const center = percentCenter ? formatPercent(active ? activePercent === null ? null : activePercent * 100 : aggregatePercent === null ? null : Math.min(100, aggregatePercent)) : format(active?.value ?? total, { purpose: 'tile', datumId: active?.id });
  const count = Math.max(1, props.data.length); const thickness = Math.min(22, 86 / count);
  const cy = stacked ? 200 : 136; const startAngle = stacked ? 180 : gauge ? 135 : -90; const sweep = stacked ? 180 : gauge ? 270 : 360;
  let offset = 0;
  return <ChartFrame props={props} series={[{ key: 'value', label: messages.value }, { key: 'target', label: messages.target }]} legendSeries={[]} rows={props.data.map(item => ({ ...item, values: { value: item.value, target: stacked ? total : item.target ?? props.target ?? 100 } }))} hover={inspection.hover} inspectionHeadline invalid={props.data.some(item => progress(item.value, item.target ?? props.target ?? 100) === null)}>
    <ChartSvg height={props.height ?? 260} viewBox="0 0 600 280">
      <defs>{variant === 'labels' && props.data.map((item, index) => <path key={item.id} id={`${uniqueId}-arc-label-${index}`} d={radialArcPath(300, cy, 112 - index * thickness, -180, 0)} />)}</defs>
      {props.data.map((item, index) => {
        const fraction = stacked ? nonNegative(item.value) && total > 0 ? item.value / total : 0 : progress(item.value, item.target ?? props.target ?? 100);
        if (fraction === null) return null;
        const radius = stacked ? 100 : 112 - index * thickness;
        const start = startAngle + (stacked ? offset * sweep : 0); if (stacked) offset += fraction;
        const width = stacked ? 28 : variant === 'solid' ? Math.max(2, thickness - 1) : Math.max(1, thickness - 5);
        const hover = { id: item.id, label: item.label, values: [{ key: 'value', label: messages.value, value: item.value }, { key: 'target', label: messages.target, value: stacked ? total : item.target ?? props.target ?? 100 }] };
        return <g key={item.id} {...inspection.bind(hover)} className="ui-chart-ring outline-none focus-visible:stroke-focus" data-ring-id={item.id} data-dimmed={Boolean(active && active.id !== item.id)}>
          {(!stacked || index === 0) && <path data-radial-track="true" d={radialArcPath(300, cy, radius, startAngle, startAngle + sweep)} stroke="var(--color-surface-alt)" strokeWidth={width} strokeLinecap={stacked ? 'butt' : 'round'} />}
          <path className="ui-chart-arc" data-radial-value="true" data-start-angle={start} data-end-angle={start + fraction * sweep} d={radialArcPath(300, cy, radius, start, start + (stacked ? fraction * sweep : sweep))} pathLength={100} stroke={chartColor(index, item.color)} strokeWidth={width} strokeLinecap={stacked ? 'butt' : 'round'} strokeDasharray={`${stacked ? 100 : fraction * 100} 100`} />
          {variant === 'labels' && <text fontSize={Math.min(11, Math.max(7, thickness - 4))} fill="var(--color-ink)" dy={-width / 2 - 2}><textPath href={`#${uniqueId}-arc-label-${index}`} startOffset="50%" textAnchor="middle">{item.label}: {format(item.value, { purpose: 'axis', datumId: item.id })}</textPath></text>}
        </g>;
      })}
      {variant === 'grid' && Array.from({ length: 12 }, (_, index) => { const angle = index * Math.PI / 6; return <line key={index} x1={300 + Math.cos(angle) * 24} x2={300 + Math.cos(angle) * 120} y1={cy + Math.sin(angle) * 24} y2={cy + Math.sin(angle) * 120} stroke="var(--color-surface)" strokeWidth={3} aria-hidden="true" />; })}
      {props.showTotal !== false && <g aria-hidden="true"><text data-radial-center="true" x={300} y={stacked ? 182 : 142} textAnchor="middle" fontSize="24" fontWeight="600" fill="var(--color-ink)">{center}</text>{active && <text x={300} y={stacked ? 204 : 162} textAnchor="middle" fontSize="11" fill="var(--color-muted)">{active.label}</text>}</g>}
    </ChartSvg>
  </ChartFrame>;
}
/** Targets are per activity, allowing unlike units to share normalized rings without summing them. */
export function ActivityRingsChartCard(props: DatumChartProps) { return <RadialChartCard {...props} variant="labels" showTotal={false} />; }

export function RadarChartCard(props: RadarChartCardProps) {
  const { format } = useChart(props); const inspection = useInspection(props); const maximum = props.maximum ?? 100;
  const validMax = finiteValue(maximum) && maximum > 0; const count = props.points.length; const variant = props.variant ?? 'filled';
  const coordinate = (index: number, fraction: number) => { const angle = index / Math.max(1, count) * Math.PI * 2 - Math.PI / 2; return [300 + Math.cos(angle) * 104 * fraction, 130 + Math.sin(angle) * 104 * fraction]; };
  const vertices = (fraction: number) => props.points.map((_, index) => coordinate(index, fraction).join(',')).join(' ');
  const visible = props.series.filter(series => !props.visibleSeries || props.visibleSeries.includes(series.key));
  return <ChartFrame props={props} series={props.series} rows={props.points} hover={inspection.hover} invalid={!validMax || count < 3 || props.points.some(point => props.series.some(series => !nonNegative(point.values[series.key])))}>
    {validMax && count >= 3 && <ChartSvg height={props.height ?? 290} viewBox="0 0 600 280">
      {[0.25, 0.5, 0.75, 1].map(fraction => <polygon key={fraction} points={vertices(fraction)} stroke="var(--color-line)" fill={fraction === 1 ? 'var(--color-surface-alt)' : 'none'} fillOpacity={0.3} />).reverse()}
      {props.points.map((point, index) => { const [x, y] = coordinate(index, 1.2); const [endX, endY] = coordinate(index, 1); return <g key={point.id}><line x1={300} y1={130} x2={endX} y2={endY} stroke="var(--color-line)" /><text x={x} y={y} textAnchor="middle" fontSize="11" fill="var(--color-muted)">{point.label}</text></g>; })}
      {visible.map(series => {
        const color = chartColor(props.series.indexOf(series), series.color);
        const complete = props.points.every(point => nonNegative(point.values[series.key]));
        return <g key={series.key}>{complete && variant !== 'dots' && <polygon aria-hidden="true" points={props.points.map((point, index) => coordinate(index, Math.min(1, point.values[series.key]! / maximum)).join(',')).join(' ')} fill={variant === 'filled' || variant === 'score' ? color : 'none'} fillOpacity={0.18} stroke={color} strokeWidth={2} />}{props.points.map((point, index) => {
          const value = point.values[series.key]; if (!nonNegative(value)) return null;
          const [x, y] = coordinate(index, Math.min(1, value / maximum));
          const hover = { id: point.id, label: point.label, values: [{ key: series.key, label: series.label, value }] };
          return <g key={point.id}><circle {...inspection.bind(hover)} cx={x} cy={y} r={variant === 'dots' ? 5 : 3.5} fill={color} stroke="var(--color-surface)" />{variant === 'score' && <text aria-hidden="true" x={x} y={y - 9} textAnchor="middle" fontSize="10" fill={color}>{format(value, { purpose: 'axis', seriesKey: series.key, datumId: point.id })}</text>}</g>;
        })}</g>;
      })}
    </ChartSvg>}
  </ChartFrame>;
}
