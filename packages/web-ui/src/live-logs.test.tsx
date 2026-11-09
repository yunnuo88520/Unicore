/** Author: yunnuo <ymz@ebox.vip>
 * Description: The live log console renders terminal-styled level colors, keeps system rows dim and disconnects the stream on unmount.
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { LiveLogsButton } from './live-logs';

function mount() {
  let push: (raw: string) => void = () => {};
  const disconnect = vi.fn();
  const web = {
    subscribeLogEvents: (onLine: (raw: string) => void, onStatus: (state: 'connected') => void) => {
      push = onLine;
      onStatus('connected');
      return disconnect;
    },
  } as unknown as Parameters<typeof LiveLogsButton>[0]['web'];
  render(<LiveLogsButton web={web} />);
  // The dialog assigns the sink after it mounts, so hand back a live closure
  // instead of the initial no-op snapshot.
  return { send: (raw: string) => push(raw), disconnect };
}

it('renders streamed levels with terminal colors and dim system rows', async () => {
  const { send } = mount();
  await userEvent.click(screen.getByRole('button', { name: '实时日志' }));
  const log = screen.getByRole('log', { name: '实时日志行' });
  // Stream callbacks arrive outside React events; flush the batched updates.
  act(() => {
    send(JSON.stringify({ time: '2026-11-09T09:55:48.853+08:00', level: 'ERROR', msg: 'server stopped', event: 'server.stop_failed' }));
    send(JSON.stringify({ time: '2026-11-09T09:55:49.001+08:00', level: 'WARN', msg: 'slow request' }));
    send(JSON.stringify({ time: '2026-11-09T09:55:50.100+08:00', level: 'INFO', msg: 'session opened', user: 'admin' }));
    send('broadcaster: buffer replayed');
  });
  expect(within(log).getByText('ERROR').className).toContain('text-terminal-error');
  expect(within(log).getByText('WARN').className).toContain('text-terminal-warn');
  expect(within(log).getByText('INFO').className).toContain('text-terminal-info');
  expect(within(log).getByText('server stopped')).toBeVisible();
  expect(within(log).getByText('event=server.stop_failed').className).toContain('text-terminal-dim');
  expect(within(log).getByText('09:55:48')).toBeVisible();
  expect(within(log).getByText('broadcaster: buffer replayed').className).toContain('text-terminal-dim');
});

it('disconnects the stream when the console closes', async () => {
  const { disconnect } = mount();  await userEvent.click(screen.getByRole('button', { name: '实时日志' }));
  expect(disconnect).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: '关闭对话框' }));
  expect(disconnect).toHaveBeenCalledTimes(1);
});
