// Author: yunnuo <ymz@ebox.vip>
// Description: Monitor chart primitives: trend areas, sparklines, ring gauges and stacked meters over real snapshot series.
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { currentLocale, t } from '../i18n';

export type TrendPoint = { t: number } & Record<string, number | undefined>;
export type TrendSeries = { key: string; label: string; color: string };

function timeTick(value: number): string {
  return new Date(value).toLocaleTimeString(currentLocale(), { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** One trend chart over the session snapshot series; the graph stays decorative and a summary list carries the data. */
export function TrendArea({ points, series, percent, unit, height = 200, valueFormatter, ariaLabel, summary, pendingHint, zeroBase }: {
  points: TrendPoint[]; series: TrendSeries[]; percent?: boolean; unit?: string; height?: number;
  valueFormatter?: (value: number) => string; ariaLabel: string; summary: string; pendingHint?: string; zeroBase?: boolean;
}) {
  if (points.length < 2) {
    return <div className="flex items-center justify-center rounded-lg bg-surface-alt/60 text-2xs text-subtle" style={{ height }} role="status">
      {pendingHint ?? t('正在累积趋势采样（每 5 秒一个采样点）…')}
    </div>;
  }
  return <div>
    <div aria-hidden="true">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <defs>
            {series.map(item => <linearGradient key={item.key} id={`monitor-fill-${item.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={item.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={item.color} stopOpacity={0.02} />
            </linearGradient>)}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={timeTick}
            fontSize={10} stroke="var(--color-muted)" tickLine={false} axisLine={false} minTickGap={48} />
          <YAxis domain={percent ? [0, 100] : zeroBase ? [0, 'auto'] : ['auto', 'auto']} fontSize={10} width={44} stroke="var(--color-muted)"
            tickLine={false} axisLine={false} tickFormatter={(value: number) => valueFormatter ? valueFormatter(value) : `${value}${unit ?? ''}`} />
          <Tooltip contentStyle={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)', color: 'var(--color-ink)', fontSize: 12 }}
            labelFormatter={label => timeTick(Number(label))}
            formatter={value => valueFormatter ? valueFormatter(Number(value)) : `${Number(value).toFixed(1)}${unit ?? ''}`} />
          {series.map(item => <Area key={item.key} type="monotone" dataKey={item.key} name={item.label}
            stroke={item.color} fill={`url(#monitor-fill-${item.key})`} strokeWidth={1.8} connectNulls isAnimationActive={false} />)}
        </AreaChart>
      </ResponsiveContainer>
    </div>
    <ul className="sr-only" aria-label={ariaLabel}>
      {points.slice(-6).map(point => <li key={point.t}>{summary} {timeTick(point.t)}：{series.map(item => `${item.label} ${point[item.key] != null && Number.isFinite(point[item.key]) ? (valueFormatter ? valueFormatter(point[item.key]!) : `${point[item.key]!.toFixed(1)}${unit ?? ''}`) : '—'}`).join('，')}</li>)}
    </ul>
  </div>;
}

/** A tiny axis-free trend line for tiles and cards. */
export function Sparkline({ points, series, ariaLabel, height = 36 }: { points: TrendPoint[]; series: TrendSeries; ariaLabel: string; height?: number }) {
  if (points.length < 2) return null;
  return <div aria-hidden="true" className="mt-1">
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`monitor-spark-${series.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={series.color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={series.color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <YAxis domain={[0, 100]} hide />
        <Area type="monotone" dataKey={series.key} stroke={series.color} fill={`url(#monitor-spark-${series.key})`} strokeWidth={1.5} connectNulls isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
    <span className="sr-only">{ariaLabel}</span>
  </div>;
}

const toneFor = (percent: number) => percent >= 90 ? 'var(--color-danger)' : percent >= 75 ? 'var(--color-warning)' : 'var(--color-success)';

/** A donut ring gauge for one usage percentage; the tone follows the load thresholds. */
export function RingGauge({ percent, label, ariaLabel, size = 136 }: { percent: number; label?: string; ariaLabel: string; size?: number }) {
  const clamped = Math.max(0, Math.min(100, percent || 0));
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return <div role="img" aria-label={`${ariaLabel} ${clamped.toFixed(1)}%`} className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
    <svg width={size} height={size} aria-hidden="true" className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={toneFor(clamped)} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={circumference * (1 - clamped / 100)} style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.6s ease' }} />
    </svg>
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
      <strong className="text-xl font-semibold text-ink">{clamped.toFixed(1)}%</strong>
      {label ? <small className="text-2xs text-muted">{label}</small> : null}
    </div>
  </div>;
}

/** One stacked horizontal meter; segments render in order with their own tone classes. */
export function MeterBar({ segments, ariaLabel }: { segments: Array<{ value: number; className: string; title?: string }>; ariaLabel: string }) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  if (total <= 0) return <div role="img" aria-label={ariaLabel} className="h-2.5 w-full rounded-full bg-surface-alt" />;
  return <div role="img" aria-label={ariaLabel} className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-alt">
    {segments.map((segment, index) => Math.max(0, segment.value) > 0
      ? <span key={index} aria-hidden="true" title={segment.title} className={segment.className} style={{ width: `${(segment.value / total) * 100}%` }} />
      : null)}
  </div>;
}
