// Author: yunnuo <ymz@ebox.vip>
// Description: Package-level message API, semantic roles, replacement and provider cleanup.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { message, MessageProvider, useMessage, type MessageAPI, type MessageType } from './message';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

function mountMessages() {
  let api: MessageAPI;
  function Consumer() { api = useMessage(); return <span>Application</span>; }
  const view = render(<MessageProvider><Consumer /></MessageProvider>);
  return { ...view, api: api! };
}

it.each([
  ['primary', 'status', 'text-accent'],
  ['success', 'status', 'text-success'],
  ['info', 'status', 'text-info'],
  ['warning', 'alert', 'text-warning'],
  ['error', 'alert', 'text-danger'],
] as const)('announces %s with the appropriate role and semantic tone', (type, role, tone) => {
  const { api, container } = mountMessages();
  act(() => { api[type]('Operation result'); });
  const notification = screen.getByRole(role);
  expect(notification).toHaveTextContent('Operation result');
  expect(notification).toHaveAttribute('data-message-type', type);
  expect(notification).toHaveAttribute('aria-atomic', 'true');
  expect(notification).toHaveClass(tone);
  expect(screen.getByRole('region')).toContainElement(notification);
  expect(container).not.toContainElement(notification);
  if (type === 'error') expect(notification).toHaveClass('border-danger-line');
});

it('defaults open to info and expires at exactly three seconds', () => {
  const { api } = mountMessages();
  let id = '';
  act(() => { id = api.open({ content: 'Saved' }); });
  expect(id).not.toBe('');
  expect(screen.getByRole('status')).toHaveAttribute('data-message-type', 'info');
  act(() => vi.advanceTimersByTime(2999));
  expect(screen.getByText('Saved')).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByText('Saved')).not.toBeInTheDocument();
});

it('replaces an explicit id and resets its deadline without removing another message', () => {
  const { api } = mountMessages();
  act(() => {
    api.open({ id: 'record', content: 'First', duration: 1000 });
    api.open({ id: 'other', content: 'Independent', duration: 5000 });
  });
  act(() => vi.advanceTimersByTime(800));
  act(() => { expect(api.open({ id: 'record', content: 'Updated', duration: 2000 })).toBe('record'); });
  expect(screen.queryByText('First')).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1999));
  expect(screen.getAllByText('Updated')).toHaveLength(1);
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByText('Updated')).not.toBeInTheDocument();
  expect(screen.getByText('Independent')).toBeInTheDocument();
});

it('replaces same-type shortcuts, preserves other tones and bounds the stack to four', () => {
  const { api } = mountMessages();
  act(() => { api.success('First'); api.success('Latest'); api.error('Failure'); });
  expect(screen.queryByText('First')).not.toBeInTheDocument();
  expect(screen.getAllByText('Latest')).toHaveLength(1);
  expect(screen.getByText('Failure')).toBeInTheDocument();
  act(() => {
    api.open({ content: 'Third' });
    api.open({ content: 'Fourth' });
    api.open({ content: 'Fifth' });
  });
  expect(screen.queryByText('Latest')).not.toBeInTheDocument();
  expect(screen.getByText('Failure')).toBeInTheDocument();
  expect(screen.getByRole('region').querySelectorAll('[data-message-type]')).toHaveLength(4);
});

it('dismisses only the requested message through destroy or its close button', () => {
  const { api } = mountMessages();
  act(() => {
    api.open({ id: 'first', content: 'First' });
    api.open({ id: 'second', content: 'Second' });
  });
  act(() => { api.destroy('unknown'); api.destroy('first'); });
  expect(screen.queryByText('First')).not.toBeInTheDocument();
  expect(screen.getByText('Second')).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('status')).getByRole('button'));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(vi.getTimerCount()).toBe(0);
});

it('forwards the static API while mounted and drops calls before mount and after unmount', () => {
  expect(message.info('Before mount')).toBe('');
  const { unmount } = mountMessages();
  let id = '';
  act(() => { id = message.open({ content: <strong>Caller-owned content</strong>, duration: 5000 }); });
  expect(screen.getByText('Caller-owned content').tagName).toBe('STRONG');
  act(() => { message.destroy(id); message.warning('Static warning'); });
  expect(screen.queryByText('Caller-owned content')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Static warning');
  expect(vi.getTimerCount()).toBeGreaterThan(0);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  const types: MessageType[] = ['primary', 'success', 'warning', 'info', 'error'];
  for (const type of types) expect(message[type]('After unmount')).toBe('');
  expect(message.open({ content: 'After unmount' })).toBe('');
  message.destroy(id);
  expect(vi.getTimerCount()).toBe(0);
});

it('requires a provider for the hook', () => {
  function Unwrapped() { useMessage(); return null; }
  expect(() => render(<Unwrapped />)).toThrow('useMessage requires MessageProvider');
});
