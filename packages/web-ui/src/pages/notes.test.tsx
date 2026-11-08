import { grantUI } from '../test-authorization';
/** Author: yunnuo <ymz@ebox.vip>
 * Description: Row actions follow server-projected note capabilities; create stays on the notes:create point.
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { MessageProvider } from '@unicore/ui';
import type { AppClient, Bootstrap, NoteEntry } from '@unicore/sdk';
import { NotesPage } from './notes';
import type { PageProps } from '../router';

function note(capabilities: { update: boolean; delete: boolean }) {
  return { id: 'note-1', title: '记录想法', body: '正文内容', status: 'open', attachment_ids: [], version: 1, created_at: 1760000000, updated_at: 1760000000, capabilities } as NoteEntry;
}

const listNotes = vi.fn().mockResolvedValue({ items: [note({ update: true, delete: true })], total: 1, page_size: 20 });

function metadata(profile: string, permissions: string[]) {
  return {
    profile, identity_realm: profile === 'web-platform' ? 'user' : '', capabilities: { database: true },
    current_user: profile === 'web-platform' ? { id: 'u1', roles: ['user'], permissions } : null,
  } as unknown as Bootstrap;
}

function mount(meta: Bootstrap, items = listNotes) {
  const client = { notes: { listNotes: items, createNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn() }, files: { listFiles: vi.fn() } } as unknown as AppClient;
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MessageProvider>
        <NotesPage {...({ client, metadata: grantUI(meta), registry: {}, theme: 'light', setTheme: () => {}, refresh: () => {} } as unknown as PageProps)} />
      </MessageProvider>
    </QueryClientProvider>,
  );
}

it('shows create plus capability-granted row actions when every point is granted', async () => {
  mount(metadata('web-platform', ['notes:access', 'notes:create', 'notes:update', 'notes:delete']));
  expect(await screen.findByRole('button', { name: '新建笔记' })).toBeVisible();
  expect(await screen.findByText('记录想法')).toBeVisible();
  expect(screen.getByRole('button', { name: '编辑 记录想法' })).toBeVisible();
  expect(screen.getByRole('button', { name: '删除 记录想法' })).toBeVisible();
});

it('hides the create button without notes:create while the page stays reachable', async () => {
  mount(metadata('web-platform', ['notes:access', 'notes:update', 'notes:delete']));
  expect(await screen.findByText('记录想法')).toBeVisible();
  expect(screen.queryByRole('button', { name: '新建笔记' })).toBeNull();
  // Independent update/delete point, action and API grants remain available.
  expect(screen.getByRole('button', { name: '编辑 记录想法' })).toBeVisible();
  expect(screen.getByRole('button', { name: '删除 记录想法' })).toBeVisible();
  expect(screen.getByText('把想法写下来，按自己的节奏推进。')).toBeVisible();
});

it('keeps the update action when the row projection allows it without the delete grant', async () => {
  // Server says: this row may update but not delete (owner without delete grant).
  const items = vi.fn().mockResolvedValue({ items: [note({ update: true, delete: false })], total: 1, page_size: 20 });
  mount(metadata('web-platform', ['notes:access', 'notes:create', 'notes:update', 'notes:delete']), items);
  expect(await screen.findByText('记录想法')).toBeVisible();
  expect(screen.getByRole('button', { name: '编辑 记录想法' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '删除 记录想法' })).toBeNull();
});

it('keeps readable scope rows read-only even with full grants', async () => {
  const shared = vi.fn().mockResolvedValue({ items: [note({ update: false, delete: false })], total: 1, page_size: 20 });
  mount(metadata('web-platform', ['notes:access', 'notes:create', 'notes:update', 'notes:delete']), shared);
  expect(await screen.findByText('记录想法')).toBeVisible();
  expect(screen.queryByRole('button', { name: '编辑 记录想法' })).toBeNull();
  expect(screen.queryByRole('button', { name: '删除 记录想法' })).toBeNull();
});

it('keeps every action on standalone profiles where the server projects full capabilities', async () => {
  mount(metadata('web-standalone', []));
  expect(await screen.findByText('记录想法')).toBeVisible();
  expect(screen.getByRole('button', { name: '新建笔记' })).toBeVisible();
  expect(screen.getByRole('button', { name: '编辑 记录想法' })).toBeVisible();
  expect(screen.getByRole('button', { name: '删除 记录想法' })).toBeVisible();
});
