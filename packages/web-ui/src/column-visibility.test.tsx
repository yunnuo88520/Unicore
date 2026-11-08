// Author: yunnuo <ymz@ebox.vip>
// Description: Column visibility: menu data, per-table toggle persistence and stored-value whitelisting.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { getPreferences, preferencesKey, resetPreferences } from '@unicore/theme/preferences';
import { useColumnVisibility } from './column-visibility';

const columns = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];

beforeEach(() => { localStorage.clear(); resetPreferences(); });

it('derives visibility state and persists toggles per table key', () => {
  const { result } = renderHook(() => useColumnVisibility('users', columns));
  expect(result.current.columnVisibility).toEqual({ a: true, b: true });
  expect(result.current.menu).toEqual([{ id: 'a', label: 'A', visible: true }, { id: 'b', label: 'B', visible: true }]);
  act(() => result.current.toggle('b', false));
  expect(result.current.columnVisibility).toEqual({ a: true, b: false });
  expect(getPreferences().hiddenColumns).toEqual({ users: ['b'] });
  act(() => result.current.toggle('b', true));
  expect(getPreferences().hiddenColumns).toEqual({});
});

it('keeps tables isolated and keeps decoding strict for stored values', () => {
  localStorage.setItem(preferencesKey, JSON.stringify({ hiddenColumns: { users: ['b'], files: 'nope', mixed: [1, 'a'] } }));
  const { result } = renderHook(() => useColumnVisibility('users', columns));
  expect(result.current.columnVisibility).toEqual({ a: true, b: false });
  const other = renderHook(() => useColumnVisibility('files', columns));
  expect(other.result.current.columnVisibility).toEqual({ a: true, b: true });
  expect(getPreferences().hiddenColumns).toEqual({ users: ['b'], mixed: ['a'] });
});
