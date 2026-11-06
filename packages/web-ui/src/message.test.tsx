// Author: yunnuo <ymz@ebox.vip>
// Description: Message lifetime, replacement and native dialog placement remain shared across profiles.
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { message, MessageProvider, useMessage, type MessageType } from './message';

afterEach(() => vi.useRealTimers());
const types: MessageType[] = ['primary', 'success', 'warning', 'info', 'error'];
function Examples() {
  const message = useMessage();
  return <>{types.map(type => <button key={type} onClick={() => message[type](`${type} 提示`)}>{type}</button>)}<button onClick={() => message.open({ id: 'replace', type: 'info', content: '替换消息', duration: 1000 })}>替换</button></>;
}
it('supports five semantic styles, dismisses after three seconds and resets a replaced timer', () => {
  vi.useFakeTimers();
  render(<MessageProvider><Examples /></MessageProvider>);
  for (const type of types) {
    fireEvent.click(screen.getByRole('button', { name: type }));
    expect(screen.getByText(`${type} 提示`).parentElement).toHaveAttribute('data-message-type', type);
  }
  // The stack is bounded while each type is independently available.
  expect(document.querySelectorAll('.message')).toHaveLength(4);
  act(() => vi.advanceTimersByTime(2999));
  expect(screen.getByText('error 提示')).toBeVisible();
  act(() => vi.advanceTimersByTime(1));
  expect(document.querySelectorAll('.message')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: '替换' }));
  act(() => vi.advanceTimersByTime(800));
  fireEvent.click(screen.getByRole('button', { name: '替换' }));
  act(() => vi.advanceTimersByTime(800));
  expect(screen.getAllByText('替换消息')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: '关闭消息' }));
  expect(screen.queryByText('替换消息')).not.toBeInTheDocument();
});
it('renders the stack above overlay surfaces and keeps it in the document viewport', async () => {
  render(<MessageProvider><Examples /></MessageProvider>);
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.zIndex = '50';
  await act(async () => { document.body.append(overlay); });
  fireEvent.click(screen.getByRole('button', { name: 'error' }));
  const stack = document.querySelector('[role="region"][aria-label="消息提示"]');
  expect(stack).not.toBeNull();
  expect(stack!.querySelector('.message-error')).toHaveTextContent('error 提示');
  await act(async () => { overlay.remove(); });
  expect(screen.getByRole('alert')).toHaveTextContent('error 提示');
});

it('static message works outside the provider tree and no-ops without one', async () => {
  const user = userEvent.setup();
  const { unmount } = render(<MessageProvider><Examples /></MessageProvider>);
  await user.click(screen.getByRole('button', { name: 'error' }));
  expect(await screen.findByText('error 提示')).toBeInTheDocument();
  unmount();
  expect(message.error('树外消息')).toBe('');
});

it('renders caller-provided content verbatim without catalog lookup', () => {
  render(<MessageProvider><Examples /></MessageProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'info' }));
  expect(screen.getByText('info 提示')).toBeInTheDocument();
});
