// Author: yunnuo <ymz@ebox.vip>
// Description: Native workspace uses the same inbox panel, paging and refresh contract without Web APIs.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { WailsTransport, type Bootstrap, type InboxList } from '@unicore/sdk';
import { setPreferences } from '@unicore/theme/preferences';
import { Workspace } from './App';

const metadata: Bootstrap = { profile: 'desktop', version: '', commit: '', build_time: '', stage: '', deployment_kind: 'native', installed: true, site_name: 'Unicore', admin_path: '', capabilities: { execute: true, authentication: false, database: true, installation: false, settings: false, api_docs: false, license: false, updater: false, features: {} } };
beforeEach(() => { localStorage.clear(); setPreferences({ locale: 'zh-CN' }); window.history.replaceState({}, '', '/'); });

it.each(['zh-CN', 'en'] as const)('shows persistent module notifications and refreshes after native events in %s', async locale => {
  setPreferences({ locale });
  const entries = Array.from({ length: 21 }, (_, index) => ({ id: String(index), type: 'report_ready', source_id: String(index), title: `Report ${index}`, body: 'Report completed', created_at: 1700000000, read_at: 0 }));
  const snapshot = (page: number, size: number): InboxList => ({ items: entries.slice((page - 1) * size, page * size), total: entries.length, unread: entries.filter(entry => !entry.read_at).length, page, page_size: size });
  const ok = <T,>(data: T) => ({ code: 'OK', message: '', request_id: 'native-test', data });
  const bridge = {
    Bootstrap: vi.fn(async () => ok(metadata)), Execute: vi.fn(),
    Inbox: vi.fn(async (page: number, size: number) => ok(snapshot(page, size))),
    ReadInbox: vi.fn(async (id: string) => { entries.find(entry => entry.id === id)!.read_at = 1; return ok(snapshot(1, 20)); }),
    ReadAllInbox: vi.fn(async () => { entries.forEach(entry => { entry.read_at = 1; }); return ok(snapshot(1, 20)); }),
  };
  let publish = (_type: string) => {}; const unsubscribe = vi.fn();
  const client = new WailsTransport(() => bridge, listener => { publish = listener; return unsubscribe; });
  const view = render(<Workspace client={client} />);
  const english = locale === 'en';
  await userEvent.click(await screen.findByRole('button', { name: english ? 'Notification centre' : '通知中心' }));
  const panel = screen.getByRole('dialog', { name: english ? 'Notification centre' : '通知中心' });
  expect(within(panel).queryByRole('tab', { name: english ? /Announcements/ : /公告/ })).toBeNull();
  await userEvent.click(within(panel).getByRole('button', { name: english ? 'Load more' : '加载更多' }));
  expect(await within(panel).findByText('Report 20')).toBeVisible();
  await userEvent.click(within(panel).getByText('Report 0'));
  await waitFor(() => expect(bridge.ReadInbox).toHaveBeenCalledWith('0'));
  entries.unshift({ ...entries[1], id: 'new', title: 'New task completed' });
  await act(async () => publish('inbox.new'));
  expect(await within(panel).findByText('New task completed')).toBeVisible();
  await userEvent.click(within(panel).getByRole('button', { name: english ? 'Mark all as read' : '全部标为已读' }));
  await waitFor(() => expect(bridge.ReadAllInbox).toHaveBeenCalledOnce());
  view.unmount(); expect(unsubscribe).toHaveBeenCalledOnce();
});
