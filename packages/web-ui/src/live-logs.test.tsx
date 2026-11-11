/** Author: yunnuo <ymz@ebox.vip>
 * Description: The live log console opens on the newest page at the stream cursor, sticks to the tail, pages history on scroll-up and dedupes replayed frames.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { LiveLogsButton } from './live-logs';

type TailPage = { items: { seq: number; line: string }[]; latest_seq: number; older_count: number };

function mount(first: TailPage, older?: TailPage) {
  let push: (raw: string, seq: number) => void = () => {};
  const disconnect = vi.fn();
  const onCursor = vi.fn();
  const web = {
    logTail: vi.fn(async (query?: { before_seq?: number; limit?: number }) => (query?.before_seq && older ? older : first)),
    subscribeLogEvents: (afterSeq: number, onLine: (raw: string, seq: number) => void, onStatus: (state: 'connected') => void) => {
      onCursor(afterSeq);
      push = onLine;
      onStatus('connected');
      return disconnect;
    },
  } as unknown as Parameters<typeof LiveLogsButton>[0]['web'];
  render(<LiveLogsButton web={web} />);
  // The dialog assigns the sink after it mounts, so hand back a live closure
  // instead of the initial no-op snapshot.
  return { send: (raw: string, seq: number) => push(raw, seq), disconnect, web, onCursor };
}

const json = (msg: string) => JSON.stringify({ time: '2026-11-09T09:55:48.853+08:00', level: 'INFO', msg });

it('renders the newest page on open and opens the stream at that cursor', async () => {
  const { web, onCursor } = mount({ items: [{ seq: 1, line: json('boot-a') }, { seq: 2, line: json('boot-b') }], latest_seq: 2, older_count: 40 });
  await userEvent.click(screen.getByRole('button', { name: '实时日志' }));
  const log = screen.getByRole('log', { name: '实时日志行' });
  expect(await within(log).findByText('boot-a')).toBeVisible();
  expect(within(log).getByText('boot-b')).toBeVisible();
  expect(within(log).getByText('已省略 40 条更早日志，向上滚动加载')).toBeVisible();
  expect(onCursor).toHaveBeenCalledWith(2);
  expect(web.logTail).toHaveBeenCalledWith({ limit: 200 });
});

it('pages older history on scroll-up without counting it as new traffic', async () => {
  const { send } = mount(
    { items: [{ seq: 201, line: json('newest') }], latest_seq: 201, older_count: 2 },
    { items: [{ seq: 199, line: json('older-2') }, { seq: 200, line: json('older-1') }], latest_seq: 201, older_count: 0 },
  );
  await userEvent.click(screen.getByRole('button', { name: '实时日志' }));
  const log = await screen.findByRole('log', { name: '实时日志行' });
  // The entrance animation grace period gates scroll handling.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 400)); });
  fireEvent.scroll(log);
  expect(await within(log).findByText('older-2')).toBeVisible();
  expect(within(log).getByText('older-1')).toBeVisible();
  expect(within(log).getByText('已到缓冲区起点')).toBeVisible();
  // Live traffic still appends after the prepend.
  act(() => { send(json('live'), 202); });
  expect(within(log).getByText('live')).toBeVisible();
});

it('dedupes replayed frames by sequence and keeps system rows unsequenced', async () => {
  const { send } = mount({ items: [], latest_seq: 0, older_count: 0 });
  await userEvent.click(screen.getByRole('button', { name: '实时日志' }));
  const log = await screen.findByRole('log', { name: '实时日志行' });
  act(() => {
    send(json('twice'), 7);
    send(json('twice'), 7);
    send('broadcaster: buffer replayed', 0);
  });
  expect(within(log).getAllByText('twice')).toHaveLength(1);
  expect(within(log).getByText('broadcaster: buffer replayed').className).toContain('text-terminal-dim');
});

it('disconnects the stream when the console closes', async () => {
  const { disconnect } = mount({ items: [], latest_seq: 0, older_count: 0 });
  await userEvent.click(screen.getByRole('button', { name: '实时日志' }));
  expect(disconnect).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: '关闭对话框' }));
  expect(disconnect).toHaveBeenCalledTimes(1);
});

it('sticks to the tail on content mutations and stops once the viewer scrolls away', async () => {
  // jsdom has no layout: pin the scroll metrics so the stick is observable.
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return 1000; } });
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', { configurable: true, get() { return (this as any).__top ?? 0; }, set(v: number) { (this as any).__top = v; } });
  const { send } = mount({ items: [{ seq: 1, line: json('boot') }], latest_seq: 1, older_count: 0 });
  await userEvent.click(screen.getByRole('button', { name: '实时日志' }));
  const log = await screen.findByRole('log', { name: '实时日志行' });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 400)); });
  expect((log as any).__top).toBe(1000);
  act(() => { send(json('live'), 2); });
  expect((log as any).__top).toBe(1000);
  // Scrolling away detaches the stick; streamed lines stop snapping the view.
  fireEvent.scroll(log);
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return 5000; } });
  act(() => { send(json('more'), 3); });
  expect((log as any).__top).toBe(1000);
  expect(within(log).getByText('more')).toBeVisible();
});
