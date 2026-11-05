// Author: yunnuo <ymz@ebox.vip>
// Description: The custom instance accent drives inline variables and yields to explicit presets.
import { act, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { resetPreferences } from './preferences';
import { setCustomAccent, useTheme } from './theme';

function Harness() { useTheme(); return null; }

afterEach(() => {
  act(() => setCustomAccent(''));
  resetPreferences();
});

it('applies the custom accent inline and clears it on reset', () => {
  localStorage.clear();
  resetPreferences();
  render(<Harness />);
  act(() => setCustomAccent('#FF0000'));
  expect(document.documentElement.style.getPropertyValue('--button-primary')).toBe('#ff0000');
  expect(document.documentElement.style.getPropertyValue('--on-primary')).toBe('#111111');
  act(() => setCustomAccent(''));
  expect(document.documentElement.style.getPropertyValue('--button-primary')).toBe('');
});

it('ignores malformed accents instead of throwing', () => {
  expect(() => act(() => setCustomAccent('purple'))).not.toThrow();
  expect(document.documentElement.style.getPropertyValue('--button-primary')).toBe('');
});
