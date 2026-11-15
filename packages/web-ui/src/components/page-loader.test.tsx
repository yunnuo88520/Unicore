/** Author: yunnuo <ymz@ebox.vip> */
// Navigation progress phases: the bar hides for quick switches, sweeps out
// when navigation settles, and a load stuck past the guard flips into an
// explicit timeout state with a reload action instead of silently vanishing.
import { render, screen, act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NavigationProgressBar, navigationFinish, navigationStart } from './page-loader';

beforeEach(() => {
  vi.useFakeTimers();
  render(<NavigationProgressBar />);
});
afterEach(() => {
  act(() => { navigationFinish(); });
  vi.useRealTimers();
});

const bar = () => document.querySelector('.nav-progress');

it('shows the bar after the reveal delay and sweeps out on finish', () => {
  act(() => navigationStart());
  expect(bar()).toBeNull();
  act(() => { vi.advanceTimersByTime(150); });
  expect(bar()).not.toBeNull();
  act(() => navigationFinish());
  expect(bar()).not.toBeNull();
  act(() => { vi.advanceTimersByTime(320); });
  expect(bar()).toBeNull();
});

it('flips into the timeout state with a reload action instead of hiding', () => {
  let reloads = 0;
  const location = window.location;
  Object.defineProperty(window, 'location', { value: { ...location, reload: () => { reloads++; } }, writable: true, configurable: true });
  act(() => navigationStart());
  act(() => { vi.advanceTimersByTime(150); });
  act(() => { vi.advanceTimersByTime(12000); });
  // The bar stays and the timeout alert appears; the router is still loading
  // at this point, so hiding the indicator would leave the page silent.
  expect(bar()).not.toBeNull();
  expect(screen.getByRole('alert')).toHaveTextContent('页面加载超时，请检查网络后重试');
  fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
  expect(reloads).toBe(1);
  // A late settle still sweeps everything out.
  act(() => navigationFinish());
  act(() => { vi.advanceTimersByTime(320); });
  expect(bar()).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  Object.defineProperty(window, 'location', { value: location, writable: true, configurable: true });
});

it('a fresh navigation resets the timeout back to the running bar', () => {
  act(() => navigationStart());
  act(() => { vi.advanceTimersByTime(150); });
  act(() => { vi.advanceTimersByTime(12000); });
  expect(screen.getByRole('alert')).toBeInTheDocument();
  act(() => navigationStart());
  act(() => { vi.advanceTimersByTime(150); });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(bar()).not.toBeNull();
});
