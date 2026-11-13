// Author: yunnuo <ymz@ebox.vip>
// Description: Date-only contributions and rectangular heatmaps preserve missing-versus-zero cells.
import { calendarCells, nonNegative, numericDomain, scale } from './data';
import { ChartFrame, ChartSvg, chartColor, datumHover, useChart, useInspection } from './shared';
import type { ChartCardProps, ChartValue } from './types';
export type ContributionsCalendarChartCardProps = ChartCardProps & { data: readonly { date: string; value: ChartValue }[]; start: string; end: string };
export type HeatmapChartCardProps = ChartCardProps & {
  columns: readonly { id: string; label: string }[]; rows: readonly { id: string; label: string }[];
  cells: readonly { row: string; column: string; value: ChartValue }[];
};
export function ContributionsCalendarChartCard(props: ContributionsCalendarChartCardProps) {
  const { messages, locale } = useChart(props); const inspection = useInspection(props);
  const cells = calendarCells(props.data, props.start, props.end); const invalidDates = props.data.some(item => { try { return !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || new Date(item.date + 'T00:00:00Z').toISOString().slice(0, 10) !== item.date; } catch { return true; } }); const max = Math.max(1, ...cells.map(cell => nonNegative(cell.value) ? cell.value : 0));
  const weeks = (cells.at(-1)?.week ?? 0) + 1; const size = Math.min(22, 550 / weeks);
  const dateLabel = (date: string) => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'));
  return <ChartFrame props={props} series={[{ key: 'value', label: messages.value }]} rows={cells.map(cell => ({ id: cell.id, label: dateLabel(cell.date), values: { value: cell.value } }))} hover={inspection.hover} invalid={!cells.length || invalidDates || props.data.some(item => !nonNegative(item.value))}>
    <ChartSvg height={props.height ?? 190} viewBox={`0 0 600 ${Math.max(100, size * 7 + 26)}`}>
      {cells.map(cell => <g key={cell.id} {...inspection.bind(datumHover(cell.id, dateLabel(cell.date), cell.value, messages.value))}><rect x={24 + cell.week * size} y={22 + cell.weekday * size} width={Math.max(2, size - 3)} height={Math.max(2, size - 3)} rx={2} fill={nonNegative(cell.value) && cell.value > 0 ? chartColor(0) : 'var(--color-surface-alt)'} fillOpacity={nonNegative(cell.value) && cell.value > 0 ? 0.15 + cell.value / max * 0.85 : 1} stroke={cell.value === null ? 'var(--color-line)' : 'none'} /><title>{dateLabel(cell.date)}</title></g>)}
      {cells.filter(cell => cell.date.endsWith('-01') || cell === cells[0]).map(cell => <text aria-hidden="true" key={cell.id} x={24 + cell.week * size} y={12} fontSize="10" fill="var(--color-muted)">{new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(cell.date + 'T00:00:00Z'))}</text>)}
    </ChartSvg>
  </ChartFrame>;
}
export function HeatmapChartCard(props: HeatmapChartCardProps) {
  const { messages } = useChart(props); const inspection = useInspection(props);
  const domain = numericDomain(props.cells.map(cell => cell.value), false);
  const lookup = new Map(props.cells.map(cell => [JSON.stringify([cell.row, cell.column]), cell.value]));
  const width = 480 / Math.max(1, props.columns.length); const height = 200 / Math.max(1, props.rows.length);
  const tableRows = props.rows.map(row => ({ id: row.id, label: row.label, values: Object.fromEntries(props.columns.map(column => [column.id, lookup.get(JSON.stringify([row.id, column.id]))])) }));
  return <ChartFrame props={props} series={props.columns.map(column => ({ key: column.id, label: column.label }))} rows={tableRows} hover={inspection.hover} invalid={new Set(props.cells.map(cell => JSON.stringify([cell.row, cell.column]))).size !== props.cells.length || props.cells.some(cell => !Number.isFinite(cell.value) || !props.rows.some(row => row.id === cell.row) || !props.columns.some(column => column.id === cell.column))}>
    <ChartSvg height={props.height ?? 260}>
      {props.rows.map((row, rowIndex) => <g key={row.id}><text aria-hidden="true" x={100} y={22 + rowIndex * height + height / 2} textAnchor="end" fill="var(--color-muted)" fontSize="11">{row.label}</text>{props.columns.map((column, columnIndex) => {
        const value = lookup.get(JSON.stringify([row.id, column.id])); const valid = typeof value === 'number' && Number.isFinite(value);
        return <rect key={column.id} {...inspection.bind(datumHover(JSON.stringify([row.id, column.id]), `${row.label} / ${column.label}`, value, messages.value))} x={112 + columnIndex * width} y={16 + rowIndex * height} width={Math.max(1, width - 3)} height={Math.max(1, height - 3)} rx={3} fill={valid ? chartColor(0) : 'var(--color-surface-alt)'} fillOpacity={valid ? scale(value, domain, [0.12, 1]) : 1} stroke={!valid ? 'var(--color-line)' : 'none'} />;
      })}</g>)}
      {props.columns.map((column, index) => <text key={column.id} aria-hidden="true" x={112 + index * width + width / 2} y={240} textAnchor="middle" fontSize="10" fill="var(--color-muted)">{column.label}</text>)}
    </ChartSvg>
  </ChartFrame>;
}
