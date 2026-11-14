// Author: yunnuo <ymz@ebox.vip>
// Description: Keyboard, controlled reveal, callback locking, safe sources and finite activity counts.
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setLocale, setTranslator } from '../i18n';
import { compositeMessages } from './messages';
import { agentActivityMessages } from './agent-activity.messages';
import { NotificationCenter, SearchActivity, TaskList, type SearchSource } from './activity';

beforeEach(() => {
  setLocale('en'); const english = new Map(Object.entries({ ...compositeMessages, ...agentActivityMessages }).map(([key, source]) => [source, key]));
  setTranslator(value => english.get(value) ?? value);
});
afterEach(() => { setTranslator(value => value); setLocale('zh-CN'); });

it('uses a segmented tablist and keeps unread, activation and actions caller-owned', async () => {
  const user = userEvent.setup(); const tab = vi.fn(); const activate = vi.fn(); const action = vi.fn(); const markAll = vi.fn();
  const props = { title: 'Notifications', tabs: [{ id: 'all', label: 'All', count: 2 }, { id: 'inbox', label: 'Inbox', count: 0 }], activeTabId: 'all', onTabChange: tab, onMarkAllRead: markAll, items: [{ id: 'n1', title: 'Caller notice', description: 'Body copy', timestamp: '2m', unread: true, status: 'information' as const, actions: [{ id: 'open', label: 'Caller action' }] }, { id: 'n2', title: 'Silent one', unread: false }], onItemActivate: activate, onAction: action };
  const { rerender } = render(<NotificationCenter {...props} />);
  expect(screen.getByText('1 unread')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /All/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: /All/ })).toHaveTextContent('2');
  await user.click(screen.getByRole('tab', { name: /Inbox/ })); expect(tab).toHaveBeenCalledWith('inbox');
  await user.click(screen.getByRole('button', { name: 'Caller notice' })); expect(activate).toHaveBeenCalledWith('n1');
  expect(screen.getByLabelText('Unread')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Caller action' })); expect(action).toHaveBeenCalledWith('n1', 'open');
  await user.click(screen.getByRole('button', { name: 'Mark all read' })); expect(markAll).toHaveBeenCalled();
  rerender(<NotificationCenter {...props} busy />);
  await user.click(screen.getByRole('button', { name: 'Caller action' })); expect(action).toHaveBeenCalledTimes(1);
});

it('locks every tab, item and header boundary from caller state without fabricating activation', async () => {
  const user = userEvent.setup(); const callback = vi.fn();
  render(<NotificationCenter title="Notifications" tabs={[{ id: 'off', label: 'Disabled tab', disabled: true }]} activeTabId="off" onTabChange={callback} onMarkAllRead={callback} onItemActivate={callback} onAction={callback} items={[{ id: 'n', title: 'Disabled notice', unread: true, disabled: true, actions: [{ id: 'open', label: 'Disabled action' }] }]} busy />);
  expect(screen.getByRole('tab', { name: /Disabled tab/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Disabled action' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Disabled notice' })).toBeNull();
  for (const name of ['Disabled action', 'Mark all read']) await user.click(screen.getByRole('button', { name }));
  await user.click(screen.getByRole('tab', { name: /Disabled tab/ }));
  expect(callback).not.toHaveBeenCalled();
});

it('reveals nested task details only through caller state and does not bubble keyboard activation', async () => {
  const user = userEvent.setup(); const reveal = vi.fn(); const steps = [{ id: 'parent', title: 'Parent', status: 'active' as const, children: [{ id: 'child', title: 'Child', status: 'pending' as const, detail: 'Caller child detail' }] }];
  const { rerender } = render(<TaskList steps={steps} revealedIds={['parent']} onRevealChange={reveal} />);
  await user.tab(); await user.tab(); await user.keyboard('{Enter}'); expect(reveal).toHaveBeenCalledTimes(1); expect(reveal).toHaveBeenCalledWith(['parent', 'child']);
  expect(screen.getByText('Caller child detail')).not.toBeVisible();
  rerender(<TaskList steps={steps} revealedIds={['parent', 'child']} onRevealChange={reveal} disabled />);
  expect(screen.getByText('Caller child detail')).toBeVisible(); expect(screen.getAllByRole('button').every(button => button.hasAttribute('disabled'))).toBe(true);
});

it('keeps search draft readable without an edit callback and supports Enter submission, not while locked', async () => {
  const user = userEvent.setup(); const search = vi.fn(); const change = vi.fn();
  const { rerender } = render(<SearchActivity query="Caller query" onSearch={search} sources={[]} />);
  expect(screen.getByLabelText('Search query')).toHaveAttribute('readonly'); expect(screen.getByLabelText('Search query')).toBeEnabled();
  await user.tab(); await user.keyboard('{Enter}'); expect(search).toHaveBeenCalledWith('Caller query'); search.mockClear();
  rerender(<SearchActivity query="Caller query" onQueryChange={change} onSearch={search} sources={[]} disabled />);
  fireEvent.submit(screen.getByRole('button', { name: 'Search' }).closest('form')!); expect(search).not.toHaveBeenCalled(); expect(screen.getByLabelText('Search query')).toBeDisabled();
});

it('supports controlled source details and source action locks without fake counts', async () => {
  const user = userEvent.setup(); const reveal = vi.fn(); const action = vi.fn();
  const source: SearchSource = { id: 'local', label: 'Local source', status: 'searching', detail: 'Caller detail', resultCount: NaN, href: '/sources/local' };
  const { rerender } = render(<SearchActivity query="q" sources={[source]} revealedIds={[]} onRevealChange={reveal} sourceActionLabel="Caller action" onSourceAction={action} />);
  expect(screen.queryByText(/results/)).not.toBeInTheDocument(); expect(screen.getByText('Caller detail')).not.toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Show details' })); expect(reveal).toHaveBeenCalledWith(['local']); expect(screen.getByText('Caller detail')).not.toBeVisible();
  rerender(<SearchActivity query="q" sources={[{ ...source, resultCount: 0 }]} revealedIds={['local']} onRevealChange={reveal} sourceActionLabel="Caller action" onSourceAction={action} busy />);
  expect(screen.getByText('Caller detail')).toBeVisible(); expect(screen.getByText('0 results')).toBeInTheDocument(); expect(screen.queryByRole('link')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Caller action' })); expect(action).not.toHaveBeenCalled();
});

it('renders only safe source links, blocks executable and protocol-relative URLs, and never opens a new window', () => {
  const sources = ['/sources/one', '#local', '../two', 'javascript:alert(1)', 'data:text/html,hi', '//remote.invalid/path', '/\\remote.invalid', ' /unsafe', 'java\nscript:alert(1)'].map((href, index): SearchSource => ({ id: String(index), label: `Source ${index}`, status: 'complete', href }));
  render(<SearchActivity query="q" sources={sources} />);
  expect(screen.getAllByRole('link')).toHaveLength(3);
  for (const link of screen.getAllByRole('link')) { expect(link).toHaveAttribute('rel', 'noopener noreferrer'); expect(link).not.toHaveAttribute('target'); expect(link).toHaveAccessibleDescription(/Source/); }
});

it('renders truthful empty states instead of fabricated task or search records', () => {
  render(<><TaskList steps={[]} revealedIds={[]} /><SearchActivity query="" sources={[]} /><NotificationCenter tabs={[]} activeTabId="none" items={[]} /></>);
  expect(screen.getByText('No tasks')).toBeInTheDocument(); expect(screen.getByText('No search sources')).toBeInTheDocument(); expect(screen.getByText('No notifications')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
});
