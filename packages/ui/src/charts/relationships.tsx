// Author: yunnuo <ymz@ebox.vip>
// Description: Bivariate scatter/bubble geometry and flow-conserving acyclic Sankey layout.
import { finiteValue, nonNegative, numericDomain, sankeyLayers, scale, type SankeyLink, type SankeyNode } from './data';
import { ChartFrame, ChartSvg, chartColor, useChart, useInspection } from './shared';
import type { ChartCardProps, ChartSeries, ChartValue } from './types';
export type ScatterDatum = { id: string; label: string; x: ChartValue; y: ChartValue; size?: ChartValue; seriesKey?: string };
export type ScatterChartCardProps = ChartCardProps & { data: readonly ScatterDatum[]; series?: readonly ChartSeries[]; xLabel: string; yLabel: string; sizeLabel?: string; variant?: 'scatter' | 'bubble' };
export function ScatterChartCard(props: ScatterChartCardProps) {
  const { format, messages } = useChart(props); const inspection = useInspection(props);
  const xDomain = numericDomain(props.data.map(item => item.x)); const yDomain = numericDomain(props.data.map(item => item.y));
  const maxSize = Math.max(1, ...props.data.map(item => nonNegative(item.size) ? item.size : 0));
  const axes = [{ key: 'x', label: props.xLabel }, { key: 'y', label: props.yLabel }, ...(props.variant === 'bubble' ? [{ key: 'size', label: props.sizeLabel ?? messages.value }] : [])];
  return <ChartFrame props={props} series={axes} legendSeries={props.series ?? []} rows={props.data.map(item => ({ id: item.id, label: item.label, values: { x: item.x, y: item.y, size: item.size } }))} hover={inspection.hover} invalid={props.data.some(item => !finiteValue(item.x) || !finiteValue(item.y) || props.variant === 'bubble' && !nonNegative(item.size))}>
    <ChartSvg height={props.height}>
      {[0, 0.25, 0.5, 0.75, 1].map(fraction => <g key={fraction} aria-hidden="true"><line x1={55} x2={565} y1={215 - fraction * 190} y2={215 - fraction * 190} stroke="var(--color-line)" strokeDasharray="3 4" /><text x={45} y={219 - fraction * 190} textAnchor="end" fontSize="10" fill="var(--color-muted)">{format(yDomain[0] + fraction * (yDomain[1] - yDomain[0]), { purpose: 'axis', seriesKey: 'y' })}</text><text x={55 + fraction * 510} y={235} textAnchor="middle" fontSize="10" fill="var(--color-muted)">{format(xDomain[0] + fraction * (xDomain[1] - xDomain[0]), { purpose: 'axis', seriesKey: 'x' })}</text></g>)}
      {props.data.map(item => {
        if (!finiteValue(item.x) || !finiteValue(item.y) || props.variant === 'bubble' && !nonNegative(item.size) || item.seriesKey && props.visibleSeries && !props.visibleSeries.includes(item.seriesKey)) return null;
        const seriesIndex = Math.max(0, props.series?.findIndex(series => series.key === item.seriesKey) ?? 0);
        const radius = props.variant === 'bubble' ? Math.sqrt((item.size as number) / maxSize) * 19 : 4;
        const hover = { id: item.id, label: item.label, values: axes.map(axis => ({ key: axis.key, label: axis.label, value: item[axis.key as 'x' | 'y' | 'size'] })) };
        return <circle key={item.id} {...inspection.bind(hover)} cx={scale(item.x, xDomain, [55, 565])} cy={scale(item.y, yDomain, [215, 25])} r={radius} fill={chartColor(seriesIndex, props.series?.[seriesIndex]?.color)} fillOpacity={0.6} stroke={chartColor(seriesIndex, props.series?.[seriesIndex]?.color)} />;
      })}
    </ChartSvg>
  </ChartFrame>;
}
export type SankeyChartCardProps = ChartCardProps & { nodes: readonly SankeyNode[]; links: readonly SankeyLink[] };
export function SankeyChartCard(props: SankeyChartCardProps) {
  const { messages } = useChart(props); const inspection = useInspection(props); const layers = sankeyLayers(props.nodes, props.links);
  const columns = Math.max(1, ...(layers ? [...layers.values()] : [0]));
  const weight = (id: string) => Math.max(props.links.filter(link => link.source === id).reduce((sum, link) => sum + link.value, 0), props.links.filter(link => link.target === id).reduce((sum, link) => sum + link.value, 0));
  const layerNodes = Array.from({ length: columns + 1 }, (_, layer) => props.nodes.filter(node => layers?.get(node.id) === layer));
  const factor = Math.min(...layerNodes.filter(nodes => nodes.length).map(nodes => Math.max(1, 200 - Math.max(0, nodes.length - 1) * 10) / (nodes.reduce((sum, node) => sum + Math.max(weight(node.id), 0.001), 0) || 1)));
  const positions = new Map<string, { x: number; y: number; height: number }>();
  layerNodes.forEach((nodes, layer) => { let y = 24; for (const node of nodes) { const height = Math.max(0.001, weight(node.id)) * factor; positions.set(node.id, { x: 80 + layer / columns * 440, y, height }); y += height + 10; } });
  const outgoing = new Map<string, number>(); const incoming = new Map<string, number>();
  const rows = props.links.map((link, index) => ({ id: String(index), label: `${props.nodes.find(node => node.id === link.source)?.label ?? link.source} → ${props.nodes.find(node => node.id === link.target)?.label ?? link.target}`, values: { value: link.value } }));
  return <ChartFrame props={props} series={[{ key: 'value', label: messages.value }]} rows={rows} hover={inspection.hover} invalid={!layers}>
    {layers && <ChartSvg height={props.height ?? 280}>
      {props.links.map((link, index) => {
        if (!link.value) return null;
        const source = positions.get(link.source)!; const target = positions.get(link.target)!; const thickness = link.value * factor;
        const fromY = source.y + (outgoing.get(link.source) ?? 0) + thickness / 2; const toY = target.y + (incoming.get(link.target) ?? 0) + thickness / 2;
        outgoing.set(link.source, (outgoing.get(link.source) ?? 0) + thickness); incoming.set(link.target, (incoming.get(link.target) ?? 0) + thickness);
        const fromX = source.x + 12; const toX = target.x; const middle = (fromX + toX) / 2;
        return <path key={index} {...inspection.bind({ id: String(index), label: rows[index].label, values: [{ key: 'value', label: messages.value, value: link.value }] })} d={`M${fromX},${fromY} C${middle},${fromY} ${middle},${toY} ${toX},${toY}`} stroke={chartColor(props.nodes.findIndex(node => node.id === link.source), props.nodes.find(node => node.id === link.source)?.color)} strokeWidth={thickness} strokeOpacity={0.3} />;
      })}
      {props.nodes.map((node, index) => { const position = positions.get(node.id)!; return <g key={node.id}><rect x={position.x} y={position.y} width={12} height={position.height} rx={3} fill={chartColor(index, node.color)} /><text x={position.x + (position.x > 400 ? -6 : 18)} y={position.y + position.height / 2 + 4} textAnchor={position.x > 400 ? 'end' : 'start'} fontSize="11" fill="var(--color-ink)">{node.label}</text></g>; })}
    </ChartSvg>}
  </ChartFrame>;
}
