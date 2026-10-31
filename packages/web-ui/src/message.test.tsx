// Author: yunnuo <ymz@ebox.vip>
// Description: Message lifetime, replacement and native dialog placement remain shared across profiles.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MessageProvider, useMessage, type MessageType } from './message';

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
it('keeps feedback in the active dialog and returns it to body when the dialog closes', async () => {
  render(<MessageProvider><Examples /></MessageProvider>);
  const dialog = document.createElement('dialog');
  await act(async () => { dialog.setAttribute('open', ''); document.body.append(dialog); });
  fireEvent.click(screen.getByRole('button', { name: 'error' }));
  expect(dialog.querySelector('.message-error')).toHaveTextContent('error 提示');
  await act(async () => { dialog.remove(); });
  expect(screen.getByRole('alert')).toHaveTextContent('error 提示');
});
