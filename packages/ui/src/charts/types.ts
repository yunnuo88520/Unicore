// Author: yunnuo <ymz@ebox.vip>
// Description: Controlled chart data, formatting and interaction protocol; labels are host-owned business text.
import type { ReactNode } from 'react';

export type ChartValue = number | null | undefined;
export type ChartSeries = { key: string; label: string; color?: string; axis?: 'left' | 'right' };
export type ChartPoint = { id: string; label: string; values: Readonly<Record<string, ChartValue>> };
export type ChartDatum = { id: string; label: string; value: ChartValue; color?: string; target?: number };
export type ChartFormatContext = { seriesKey?: string; datumId?: string; purpose: 'axis' | 'tooltip' | 'table' | 'tile' };
export type ChartFormatter = (value: number, context: ChartFormatContext) => string;
export type ChartHover = { id: string; label: string; values: readonly { key: string; label: string; value: ChartValue }[] };
export type ChartRange = { value: string; options: readonly { value: string; label: string }[]; onChange: (value: string) => void };
export type ChartTile = { id: string; label: string; value: ChartValue; detail?: ReactNode };
export type ChartMessages = {
  empty: string; invalid: string; data: string; category: string; value: string;
  range: string; missing: string; series: string; target: string;
};
export type ChartCardProps = {
  title: string;
  description?: string;
  className?: string;
  height?: number;
  locale?: string;
  /** Optional overrides for host terminology; default messages support English and Chinese. */
  messages?: Partial<ChartMessages>;
  formatValue?: ChartFormatter;
  /** Host-owned headline; radial inspection temporarily shows the inspected activity. */
  headline?: { label: string; value: ChartValue };
  /** Signed change supplied by the host; never inferred from incomplete history. */
  delta?: { label: string; value: ChartValue; tone?: 'neutral' | 'success' | 'danger'; format?: 'number' | 'percent' };
  /** Entrance motion defaults on and always respects prefers-reduced-motion. */
  animate?: boolean;
  range?: ChartRange;
  tiles?: readonly ChartTile[];
  footer?: ReactNode;
  /** Omit to show all; visibility is controlled, never copied into component state. */
  visibleSeries?: readonly string[];
  onVisibleSeriesChange?: (keys: string[]) => void;
  onHoverChange?: (hover: ChartHover | null) => void;
  onSelect?: (hover: ChartHover) => void;
};
export type SeriesChartProps = ChartCardProps & {
  points: readonly ChartPoint[];
  series: readonly ChartSeries[];
};
export type DatumChartProps = ChartCardProps & { data: readonly ChartDatum[] };
export type ChartTableRow = { id: string; label: string; values: Readonly<Record<string, ChartValue>> };
