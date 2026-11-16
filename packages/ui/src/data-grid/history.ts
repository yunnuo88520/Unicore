// Author: yunnuo <ymz@ebox.vip>
// Description: Bounded immutable transaction history; hosts must update rows immutably.
import type { GridCellChange } from './types';
export type GridHistoryEntry<T> = { before: readonly T[]; after: readonly T[]; changes: readonly GridCellChange[] };
export type GridHistory<T> = { past: readonly GridHistoryEntry<T>[]; future: readonly GridHistoryEntry<T>[] };
export function createGridHistory<T>(): GridHistory<T> { return { past: [], future: [] }; }
export function pushGridHistory<T>(history: GridHistory<T>, entry: GridHistoryEntry<T>): GridHistory<T> {
  if (!entry.changes.length) return history;
  return { past: [...history.past, entry].slice(-100), future: [] };
}
export function undoGridHistory<T>(history: GridHistory<T>) {
  const entry = history.past.at(-1);
  if (!entry) return null;
  return { data: [...entry.before], changes: entry.changes.map(change => ({ ...change, before: change.after, after: change.before })), history: { past: history.past.slice(0, -1), future: [...history.future, entry] } };
}
export function redoGridHistory<T>(history: GridHistory<T>) {
  const entry = history.future.at(-1);
  if (!entry) return null;
  return { data: [...entry.after], changes: entry.changes, history: { past: [...history.past, entry].slice(-100), future: history.future.slice(0, -1) } };
}
