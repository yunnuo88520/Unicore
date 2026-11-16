// Author: yunnuo <ymz@ebox.vip>
// Description: Chart domain, missing-value, date and graph transform regression cases.
import { describe, expect, it } from 'vitest';
import { calendarCells, finiteValue, linePath, normalizePercent, numericDomain, progress, rankDates, sankeyLayers, scale } from './data';

describe('chart transforms', () => {
  it('distinguishes missing, invalid and zero and keeps signed domains', () => {
    expect([null, undefined, NaN, Infinity].map(finiteValue)).toEqual([false, false, false, false]);
    expect(finiteValue(0)).toBe(true);
    expect(numericDomain([])).toEqual([0, 1]);
    expect(numericDomain([null, NaN, 0])).toEqual([0, 1]);
    expect(numericDomain([-9, 4])).toEqual([-9, 4]);
    expect(numericDomain([-4, -2])).toEqual([-4, 0]);
    expect(numericDomain([8, 8], false)).toEqual([7.2, 8.8]);
    expect(scale(0, [-10, 10], [0, 100])).toBe(50);
  });
  it('normalizes only valid nonnegative values without mutating or inventing missing observations', () => {
    const points = [{ id: 'a', label: 'A', values: { a: 10, b: 30, c: null, d: -1 } }, { id: 'b', label: 'B', values: { a: 0, b: 0 } }];
    const result = normalizePercent(points, ['a', 'b', 'c', 'd'].map(key => ({ key, label: key })));
    expect(result[0].values).toEqual({ a: 25, b: 75, c: null, d: null });
    expect(result[1].values).toEqual({ a: 0, b: 0, c: null, d: null });
    expect(points[0].values.a).toBe(10);
  });
  it('clamps only progress geometry and rejects impossible targets', () => {
    expect(progress(120, 100)).toBe(1);
    expect(progress(0, 100)).toBe(0);
    expect(progress(-1)).toBeNull(); expect(progress(1, 0)).toBeNull(); expect(progress(null)).toBeNull();
  });
  it('ranks ties stably without sorting the caller array', () => {
    const data = [{ id: 'a', label: 'A', value: 2 }, { id: 'b', label: 'B', value: 5 }, { id: 'c', label: 'C', value: 5 }, { id: 'd', label: 'D', value: -1 }];
    expect(rankDates(data, 2).map(item => item.id)).toEqual(['b', 'c']);
    expect(data[0].id).toBe('a');
  });
  it('creates UTC leap-day cells, sums duplicates, and preserves missing days', () => {
    const result = calendarCells([{ date: '2024-02-29', value: 2 }, { date: '2024-02-29', value: 3 }, { date: '2024-03-01', value: 0 }], '2024-02-28', '2024-03-02');
    expect(result.map(cell => cell.value)).toEqual([null, 5, 0, null]);
    expect(result[1].date).toBe('2024-02-29');
    expect(calendarCells([], '2023-02-29', '2023-03-01')).toEqual([]);
    expect(calendarCells([], 'bad', 'bad')).toEqual([]);
    expect(calendarCells([], '2024-04-01', '2024-03-01')).toEqual([]);
    expect(calendarCells([], '2020-01-01', '2025-01-01')).toEqual([]);
  });
  it('rejects cycles, unknown endpoints and negative flow', () => {
    const nodes = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }];
    expect(sankeyLayers(nodes, [{ source: 'a', target: 'b', value: 0 }, { source: 'b', target: 'c', value: 2 }])?.get('c')).toBe(2);
    expect(sankeyLayers(nodes, [{ source: 'a', target: 'b', value: 1 }, { source: 'b', target: 'a', value: 1 }])).toBeNull();
    expect(sankeyLayers(nodes, [{ source: 'a', target: 'z', value: 1 }])).toBeNull();
    expect(sankeyLayers(nodes, [{ source: 'a', target: 'b', value: -1 }])).toBeNull();
    expect(sankeyLayers([nodes[0], nodes[0]], [])).toBeNull();
  });
  it('builds genuinely different sharp and smooth paths', () => {
    expect(linePath([])).toBe('');
    expect(linePath([[1, 2]])).toBe('M1,2');
    expect(linePath([[1, 2], [3, 4], [5, 1]], true)).toContain(' C');
    expect(linePath([[1, 2], [3, 4]], false)).toBe('M1,2 L3,4');
  });
});
