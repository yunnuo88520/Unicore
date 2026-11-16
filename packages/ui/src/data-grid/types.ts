// Author: yunnuo <ymz@ebox.vip>
// Description: Controlled, transport-free data grid contracts.
import type { ReactNode } from 'react';

export type GridValue = string | number | null;
export type GridRowId = string;
export type GridCell = { rowId: GridRowId; columnId: string };
export type GridSelection = { anchor: GridCell; focus: GridCell };
export type GridSort = { columnId: string; direction: 'asc' | 'desc' };
export type GridFilter = { columnId: string; value: string };

type ColumnBase<T> = {
  id: string;
  header: string;
  /** Fixed pixel width. When omitted, the column shares spare container width until maxWidth; manual resizing fixes its width. */
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  readOnly?: boolean | ((row: T) => boolean);
  sortable?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  format?: (value: GridValue, row: T) => ReactNode;
  /** Plain text used by search, filtering, clipboard and export. */
  toText?: (value: GridValue, row: T) => string;
  compare?: (a: T, b: T) => number;
};
/** Getters/validators must be pure. Setters must return an immutable row copy and never mutate their input. */
export type DataGridColumn<T> = ColumnBase<T> & (
  | { kind: 'text'; getValue: (row: T) => string; setValue?: (row: T, value: string) => T; validate?: (value: string, row: T) => string | undefined }
  | { kind: 'number'; getValue: (row: T) => number | null; setValue?: (row: T, value: number | null) => T; validate?: (value: number | null, row: T) => string | undefined }
  | { kind: 'options'; options: readonly { value: string; label: string }[]; getValue: (row: T) => string; setValue?: (row: T, value: string) => T; validate?: (value: string, row: T) => string | undefined }
);
export type GridCellChange = GridCell & { before: GridValue; after: GridValue };
export type GridChange = { reason: 'edit' | 'paste' | 'undo' | 'redo'; cells: readonly GridCellChange[] };
export type GridValidationError = Partial<GridCell> & { message: string };
export type GridTransformResult<T> =
  | { ok: true; data: T[]; changes: GridCellChange[] }
  | { ok: false; errors: GridValidationError[] };

export interface DataGridProps<T> {
  label: string;
  data: readonly T[];
  columns: readonly DataGridColumn<T>[];
  /** Must be stable, nonempty and unique; array positions are not row identities. */
  getRowId: (row: T) => GridRowId;
  onDataChange: (data: T[], change: GridChange) => void;
  pending: boolean;
  readOnly: boolean;
  /** Requests deletion only. The host owns confirmation, authorization and removal. */
  onDeleteRows?: (ids: readonly GridRowId[]) => void;
  onRowSelectionChange?: (ids: readonly GridRowId[]) => void;
  onCellSelectionChange?: (selection: GridSelection | null) => void;
  onValidationError?: (errors: readonly GridValidationError[]) => void;
  /** Overrides browser download, e.g. to invoke a native desktop save dialog. */
  onExport?: (csv: string) => void;
  height?: number;
  rowHeight?: number;
  overscan?: number;
  className?: string;
}
