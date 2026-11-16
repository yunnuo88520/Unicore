// Author: yunnuo <ymz@ebox.vip>
// Description: Internal controlled-state and forwarded-ref helpers for independent controls.
import { useCallback, useRef, useState, type Ref } from 'react';

export function useControllable<T>(value: T | undefined, defaultValue: T, onChange?: (value: T) => void) {
  const [internal, setInternal] = useState(defaultValue);
  const current = value === undefined ? internal : value;
  const latest = useRef(current);
  latest.current = current;
  const set = useCallback((next: T | ((previous: T) => T)) => {
    const resolved = typeof next === 'function' ? (next as (previous: T) => T)(latest.current) : next;
    if (Object.is(latest.current, resolved)) return;
    if (value === undefined) { latest.current = resolved; setInternal(resolved); }
    onChange?.(resolved);
  }, [value, onChange]);
  return [current, set] as const;
}

export function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

export function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
