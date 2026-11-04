// Author: yunnuo <ymz@ebox.vip>
// Description: Recharts capability layer bound to design tokens. Charts stay out of pages until a real statistics API lands.
import { useLocale, t } from '../i18n';
import type { ReactNode } from 'react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { cn } from '../lib/cn';

export const CHART_COLORS = ['var(--primary)', 'var(--info)', 'var(--success)', 'var(--warning)', 'var(--danger)'] as const;

const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
  fontSize: 12,
} as const;

const axisProps = {
  stroke: 'var(--subtle)',
  tick: { fill: 'var(--muted)', fontSize: 11 },
  axisLine: { stroke: 'var(--border)' },
  tickLine: false as const,
};

export function ChartCard({ title, description, children, className }: { title: string; description?: string; children: ReactNode; className?: string }) {
  useLocale();
  return <Card className={className}>
    <CardHeader>
      <CardTitle>{t(title)}</CardTitle>
      {description && <CardDescription>{t(description)}</CardDescription>}
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>;
}

export type Series = { key: string; label: string };

export function TrendChart({ data, xKey, series, height = 240, className }: { data: Record<string, unknown>[]; xKey: string; series: Series[]; height?: number; className?: string }) {
  useLocale();
  return <div className={cn('w-full', className)} style={{ height }} aria-label={t('趋势图')}>
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} {...axisProps} />
        <YAxis {...axisProps} width={36} />
        <RTooltip contentStyle={tooltipStyle} cursor={{ stroke: 'var(--focus)' }} />
        <Legend formatter={value => <span style={{ color: 'var(--muted)' }}>{value}</span>} />
        {series.map((entry, index) => <Line key={entry.key} type="monotone" dataKey={entry.key} name={entry.label} stroke={CHART_COLORS[index % CHART_COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />)}
      </LineChart>
    </ResponsiveContainer>
  </div>;
}

export function DistributionChart({ data, xKey, series, height = 240, className }: { data: Record<string, unknown>[]; xKey: string; series: Series[]; height?: number; className?: string }) {
  useLocale();
  return <div className={cn('w-full', className)} style={{ height }} aria-label={t('分布图')}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} {...axisProps} />
        <YAxis {...axisProps} width={36} />
        <RTooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--primary-soft)' }} />
        {series.map((entry, index) => <Bar key={entry.key} dataKey={entry.key} name={entry.label} fill={CHART_COLORS[index % CHART_COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={36} />)}
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

export function ShareChart({ data, nameKey, valueKey, height = 240, className }: { data: Record<string, unknown>[]; nameKey: string; valueKey: string; height?: number; className?: string }) {
  useLocale();
  return <div className={cn('w-full', className)} style={{ height }} aria-label={t('占比图')}>
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <RTooltip contentStyle={tooltipStyle} />
        <Legend formatter={value => <span style={{ color: 'var(--muted)' }}>{value}</span>} />
        <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius="55%" outerRadius="80%" paddingAngle={2} stroke="var(--surface)">
          {data.map((_, index) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  </div>;
}
