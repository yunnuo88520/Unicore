// Author: yunnuo <ymz@ebox.vip>
// Description: Signed rankings, capacity stages, proportional funnels, segmented scores and step totals.
import { finiteValue, nonNegative, numericDomain, rankDates, scale } from './data';
import { ChartFrame, ChartSvg, chartColor, datumHover, useChart, useInspection } from './shared';
import type { ChartSeries, DatumChartProps } from './types';

export type FunnelChartCardProps = DatumChartProps & { shape?: 'soft' | 'sharp'; monochrome?: boolean };
export type SegmentedScoreChartCardProps = DatumChartProps & { target?: number };
function DatumBars(props: DatumChartProps & { kind: 'list' | 'stage' | 'funnel' | 'dates' | 'steps'; shape?: 'soft' | 'sharp'; monochrome?: boolean; limit?: number }) {
  const { format, messages } = useChart(props); const inspection = useInspection(props);
  const data = props.kind === 'dates' ? rankDates(props.data, props.limit ?? 5) : props.data;
  const series: ChartSeries[] = [{ key: 'value', label: messages.value }, ...(props.kind === 'stage' ? [{ key: 'target', label: messages.target }] : [])];
  const signed = props.kind === 'list';
  const valid = (value: Parameters<typeof finiteValue>[0]) => signed ? finiteValue(value) : nonNegative(value);
  const domain = numericDomain(data.flatMap(item => [valid(item.value) ? item.value : null, nonNegative(item.target) ? item.target : null]));
  const zero = scale(0, domain, [160, 535]); const rowHeight = 40; const totalHeight = Math.max(100, data.length * rowHeight + 16);
  return <ChartFrame props={props} series={series} legendSeries={[]} rows={data.map(item => ({ ...item, values: { value: item.value, target: item.target } }))} hover={inspection.hover} invalid={props.data.some(item => !valid(item.value))}>
    <ChartSvg height={props.height ?? Math.min(440, totalHeight)} viewBox={`0 0 600 ${totalHeight}`}>
      {data.map((item, index) => {
        if (!valid(item.value)) return null;
        const value = item.value as number; const end = scale(value, domain, [160, 535]); const width = Math.abs(end - zero); const y = index * rowHeight + 10;
        const color = chartColor(props.monochrome ? 0 : index, item.color);
        const hover = props.kind === 'stage' ? { id: item.id, label: item.label, values: [{ key: 'value', label: messages.value, value: item.value }, { key: 'target', label: messages.target, value: item.target }] } : datumHover(item.id, item.label, item.value, messages.value);
        const funnelWidth = (value / (domain[1] || 1)) * 375;
        const next = data[index + 1]?.value; const nextWidth = nonNegative(next) ? next / (domain[1] || 1) * 375 : funnelWidth * 0.75;
        return <g key={item.id} {...inspection.bind(hover)}>
          <text x={0} y={y + 18} fill="var(--color-ink)" fontSize="12">{props.kind === 'dates' ? `${index + 1}. ` : ''}{item.label.length > 20 ? `${item.label.slice(0, 19)}…` : item.label}</text>
          {props.kind === 'funnel' ? props.shape === 'sharp' ? <path d={`M${350 - funnelWidth / 2},${y} h${funnelWidth} L${350 + nextWidth / 2},${y + 28} H${350 - nextWidth / 2} Z`} fill={color} opacity={props.monochrome ? 1 - index / Math.max(1, data.length) * 0.65 : 1} /> : <rect x={350 - funnelWidth / 2} y={y} width={funnelWidth} height={28} rx={14} fill={color} opacity={props.monochrome ? 1 - index / Math.max(1, data.length) * 0.65 : 1} /> : <>
            <rect x={160} y={y + 2} width={375} height={24} rx={props.kind === 'steps' ? 0 : 4} fill="var(--color-surface-alt)" />
            <rect x={Math.min(zero, end)} y={y + 2} width={width} height={24} rx={props.kind === 'steps' ? 0 : 4} fill={color} />
            {props.kind === 'stage' && nonNegative(item.target) && <line x1={scale(item.target, domain, [160, 535])} x2={scale(item.target, domain, [160, 535])} y1={y - 2} y2={y + 30} stroke="var(--color-ink)" strokeWidth={2} />}
            {props.kind === 'steps' && Array.from({ length: 19 }, (_, step) => <line key={step} x1={160 + (step + 1) * 375 / 20} x2={160 + (step + 1) * 375 / 20} y1={y + 2} y2={y + 26} stroke="var(--color-surface)" strokeWidth={3} />)}
          </>}
          <text x={594} y={y + 18} textAnchor="end" fill="var(--color-ink)" fontSize="11">{format(value, { purpose: 'axis', datumId: item.id })}</text>
        </g>;
      })}
    </ChartSvg>
  </ChartFrame>;
}
export function BarListChartCard(props: DatumChartProps) { return <DatumBars {...props} kind="list" />; }
export function StageBarsChartCard(props: DatumChartProps) { return <DatumBars {...props} kind="stage" />; }
export function HorizontalFunnelChartCard(props: FunnelChartCardProps) { return <DatumBars {...props} kind="funnel" />; }
export function MostActiveDatesChartCard(props: DatumChartProps & { limit?: number }) { return <DatumBars {...props} kind="dates" />; }
export function StepsChartCard(props: DatumChartProps) { return <DatumBars {...props} kind="steps" />; }

/** Segments use a common capacity; unused capacity remains visible, overflow is clamped geometrically only. */
export function SegmentedScoreChartCard(props: SegmentedScoreChartCardProps) {
  const { messages, format } = useChart(props); const inspection = useInspection(props);
  const total = props.data.reduce((sum, item) => sum + (nonNegative(item.value) ? item.value : 0), 0);
  const capacity = nonNegative(props.target) && props.target > 0 ? props.target : total || 1;
  let consumed = 0;
  return <ChartFrame props={props} series={[{ key: 'value', label: messages.value }]} rows={props.data.map(item => ({ ...item, values: { value: item.value } }))} hover={inspection.hover} invalid={props.data.some(item => !nonNegative(item.value)) || props.target !== undefined && (!nonNegative(props.target) || props.target === 0)}>
    <div className="text-3xl font-semibold tabular-nums text-ink">{format(total, { purpose: 'tile' })}{props.target !== undefined && <span className="text-sm font-normal text-muted"> / {format(props.target, { purpose: 'tile' })}</span>}</div>
    <ChartSvg height={props.height ?? 110} viewBox="0 0 600 100"><rect x={0} y={24} width={600} height={32} rx={6} fill="var(--color-surface-alt)" />{props.data.map((item, index) => {
      if (!nonNegative(item.value)) return null;
      const start = Math.min(1, consumed / capacity) * 600; consumed += item.value; const end = Math.min(1, consumed / capacity) * 600;
      return <g key={item.id} {...inspection.bind(datumHover(item.id, item.label, item.value, messages.value))}><rect x={start} y={24} width={Math.max(0, end - start - 2)} height={32} rx={3} fill={chartColor(index, item.color)} /><title>{item.label}</title></g>;
    })}</ChartSvg>
    <ul className="flex flex-wrap gap-3 text-xs text-muted">{props.data.map((item, index) => <li key={item.id} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: chartColor(index, item.color) }} />{item.label}: {format(item.value, { purpose: 'tile', datumId: item.id })}</li>)}</ul>
  </ChartFrame>;
}
