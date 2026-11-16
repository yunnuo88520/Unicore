// Author: yunnuo <ymz@ebox.vip>
// Description: Nineteen supplied-data chart cards with controlled ranges and selection feedback.
import { useState, type ReactNode } from 'react';
import * as Charts from '@unicore/ui/charts';
import { Button } from '@unicore/ui';
import { t, useLocale } from '../../i18n';
import { chartIds, type ChartId } from './catalog';
import { Sample, Feedback } from './frame';
export function ChartDemo({ id }: { id: ChartId }) {
  const locale = useLocale(); const [range, setRange] = useState('all'); const [visible, setVisible] = useState<string[]>(['a','b']); const [selected, setSelected] = useState(''); const [empty, setEmpty] = useState(false);
  const [areaMode, setAreaMode] = useState<'stacked' | 'overlap' | 'percent'>('stacked');
  const [radialVariant, setRadialVariant] = useState<'gauge' | 'labels' | 'stacked'>('gauge');
  const labels = [t('选项一'), t('选项二'), t('选项三')];
  const data: Charts.ChartDatum[] = empty ? [] : labels.map((label, index) => ({ id: String(index), label, value: [32,21,13][index] * (range === 'all' ? 1 : 0.5), target: 50 }));
  const series: Charts.ChartSeries[] = [{ key: 'a', label: t('概览') }, { key: 'b', label: t('明细') }];
  const points: Charts.ChartPoint[] = data.map((datum, index) => ({ id: datum.id, label: datum.label, values: { a: datum.value, b: [12,25,18][index] } }));
  const common: Charts.ChartCardProps = { title: id, locale, height: 300, headline: { label: t('数量'), value: empty ? null : data.reduce((sum, item) => sum + (item.value ?? 0), 0) }, delta: empty ? undefined : { label: t('与上一组合成数据相比'), value: range === 'all' ? 10 : -45, format: 'percent', tone: range === 'all' ? 'success' : 'danger' }, range: { value: range, options: [{ value: 'all', label: t('全部') }, { value: 'half', label: t('部分') }], onChange: setRange }, onSelect: hover => setSelected(hover.label), visibleSeries: visible, onVisibleSeriesChange: setVisible };
  const seriesProps = { ...common, points, series }; const datumProps = { ...common, data };
  let chart: ReactNode;
  switch (id) {
    case 'area': chart = <Charts.AreaChartCard {...seriesProps} mode={areaMode} curve="smooth" />; break;
    case 'line': chart = <Charts.LineChartCard {...seriesProps} dots />; break;
    case 'combo': chart = <Charts.ComboChartCard {...seriesProps} barKeys={['a']} />; break;
    case 'earnings': chart = <Charts.EarningsChartCard {...seriesProps} />; break;
    case 'orders-comparison': chart = <Charts.OrdersComparisonChartCard {...seriesProps} />; break;
    case 'revenue-comparison': chart = <Charts.RevenueComparisonChartCard {...seriesProps} />; break;
    case 'bar-list': chart = <Charts.BarListChartCard {...datumProps} />; break;
    case 'stage-bars': chart = <Charts.StageBarsChartCard {...datumProps} />; break;
    case 'horizontal-funnel': chart = <Charts.HorizontalFunnelChartCard {...datumProps} />; break;
    case 'most-active-dates': chart = <Charts.MostActiveDatesChartCard {...datumProps} data={data.map((datum, index) => ({ ...datum, label: `2026-11-${13 + index}` }))} />; break;
    case 'steps': chart = <Charts.StepsChartCard {...datumProps} />; break;
    case 'segmented-score': chart = <Charts.SegmentedScoreChartCard {...datumProps} target={80} />; break;
    case 'activity-rings': chart = <Charts.ActivityRingsChartCard {...datumProps} />; break;
    case 'radial': chart = <Charts.RadialChartCard {...datumProps} variant={radialVariant} />; break;
    case 'radar': chart = <Charts.RadarChartCard {...seriesProps} maximum={50} />; break;
    case 'contributions-calendar': chart = <Charts.ContributionsCalendarChartCard {...common} start="2026-11-01" end="2026-11-30" data={data.map((datum, index) => ({ date: `2026-11-${13 + index}`, value: datum.value }))} />; break;
    case 'heatmap': chart = <Charts.HeatmapChartCard {...common} rows={labels.map((label,index) => ({ id: String(index), label }))} columns={series.map(item => ({ id: item.key, label: item.label }))} cells={data.flatMap(datum => [{ row: datum.id, column: 'a', value: datum.value }, { row: datum.id, column: 'b', value: 12 }])} />; break;
    case 'scatter': chart = <Charts.ScatterChartCard {...common} xLabel={t('数量')} yLabel={t('进度')} data={data.map((datum,index) => ({ id: datum.id, label: datum.label, x: index * 10 + 5, y: datum.value, size: 5 + index * 4 }))} />; break;
    case 'sankey': chart = <Charts.SankeyChartCard {...common} nodes={empty ? [] : labels.map((label,index) => ({ id: String(index), label }))} links={empty ? [] : [{ source: '0', target: '1', value: range === 'all' ? 20 : 10 }, { source: '1', target: '2', value: 10 }]} />; break;
  }
  return <Sample id={id}>
    {id === 'area' && <div role="group" aria-label={t('图表变体')} className="flex flex-wrap gap-2">
      <Button size="sm" variant={areaMode === 'stacked' ? 'primary' : 'secondary'} aria-pressed={areaMode === 'stacked'} onClick={() => setAreaMode('stacked')}>{t('堆叠')}</Button>
      <Button size="sm" variant={areaMode === 'overlap' ? 'primary' : 'secondary'} aria-pressed={areaMode === 'overlap'} onClick={() => setAreaMode('overlap')}>{t('重叠')}</Button>
      <Button size="sm" variant={areaMode === 'percent' ? 'primary' : 'secondary'} aria-pressed={areaMode === 'percent'} onClick={() => setAreaMode('percent')}>{t('百分比')}</Button>
    </div>}
    {id === 'radial' && <div role="group" aria-label={t('图表变体')} className="flex flex-wrap gap-2">
      <Button size="sm" variant={radialVariant === 'gauge' ? 'primary' : 'secondary'} aria-pressed={radialVariant === 'gauge'} onClick={() => setRadialVariant('gauge')}>{t('仪表盘')}</Button>
      <Button size="sm" variant={radialVariant === 'labels' ? 'primary' : 'secondary'} aria-pressed={radialVariant === 'labels'} onClick={() => setRadialVariant('labels')}>{t('弧形标签')}</Button>
      <Button size="sm" variant={radialVariant === 'stacked' ? 'primary' : 'secondary'} aria-pressed={radialVariant === 'stacked'} onClick={() => setRadialVariant('stacked')}>{t('半圆堆叠')}</Button>
    </div>}
    {chart}
    <div className="flex flex-wrap items-center gap-3"><Button size="sm" variant="secondary" onClick={() => { setEmpty(!empty); setSelected(''); }}>{empty ? t('重置') : t('显示空状态')}</Button>{selected && <Feedback>{selected}</Feedback>}</div>
  </Sample>;
}
export default function ChartsSection() { return <div className="min-w-0 space-y-8">{chartIds.map(id => <ChartDemo key={id} id={id} />)}</div>; }
