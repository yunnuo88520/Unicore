import { grantUI } from '../test-authorization';
import { canAction } from '../permissions';
// Author: yunnuo <ymz@ebox.vip>
// Description: Batch migration reports partial failure, retries only unfinished files and stops between requests; page actions gate per assignable point.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { MessageProvider } from '@unicore/ui';
import type { AppClient, Bootstrap, FileEntry } from '@unicore/sdk';
import { BatchMigration, FilesPage } from './files';
import type { PageProps } from '../router';

const files = ['one', 'two', 'same'].map(id => ({file_id:id, original_name:`${id}.txt`, location_id:id === 'same' ? 'target' : 'source'} as FileEntry));
function show(migrateFile: ReturnType<typeof vi.fn>, onClose = vi.fn()) {
  const client = { files:{migrateFile}, storage:{storageLocations:vi.fn().mockResolvedValue({items:[{id:'target',name:'Target',provider:'minio',tested:true}]})} } as unknown as AppClient;
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><BatchMigration client={client} files={files} onClose={onClose}/></QueryClientProvider>);
  return onClose;
}
it('retains successful results and retries failed files without duplicating successful copies', async () => {
  const migrate = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Storage offline')).mockResolvedValue({});
  const close = show(migrate);
  await screen.findByRole('option',{name:'Target · minio'});
  await userEvent.selectOptions(screen.getByLabelText('目标存储位置'),'target');
  await userEvent.click(screen.getByRole('button',{name:'开始迁移'}));
  await screen.findByText('已处理 3 / 3，成功或跳过 2，失败 1');
  expect(screen.getByText('Storage offline')).toBeVisible();
  await userEvent.click(screen.getByRole('button',{name:'重试或继续迁移'}));
  await screen.findByText('已处理 3 / 3，成功或跳过 3，失败 0');
  expect(migrate.mock.calls).toEqual([['one','target'],['two','target'],['same','target'],['two','target']]);
  await userEvent.click(screen.getByRole('button',{name:'关闭'}));
  expect(close).toHaveBeenCalledWith(['one','two','same']);
});
it('finishes the current file before stopping, then continues the remaining files', async () => {
  let finish: (value: unknown) => void = () => {};
  const migrate = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish=resolve; })).mockResolvedValue({});
  const close=show(migrate);
  await screen.findByRole('option',{name:'Target · minio'});
  await userEvent.selectOptions(screen.getByLabelText('目标存储位置'),'target');
  await userEvent.click(screen.getByRole('button',{name:'开始迁移'}));
  await screen.findByText('复制并校验中');
  await userEvent.keyboard('{Escape}');expect(close).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button',{name:'当前文件完成后停止'}));
  finish({});
  await waitFor(() => expect(screen.getByText('已处理 1 / 3，成功或跳过 1，失败 0')).toBeVisible());
  expect(migrate).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button',{name:'重试或继续迁移'}));
  await screen.findByText('已处理 3 / 3，成功或跳过 3，失败 0');
  expect(migrate.mock.calls).toEqual([['one','target'],['two','target'],['same','target']]);
});

const entry = { file_id: 'f1', original_name: 'one.txt', size: 12, mime_type: 'text/plain', state: 'ready', created_at: 1760000000, location_id: 'local', creator_id: 'u1', creator_realm: 'user', capabilities: { download: true, delete: true } } as FileEntry;
const pageList = vi.fn().mockResolvedValue({ items: [entry], total: 1, page_size: 20 });

function mountFiles(permissions: string[], items: FileEntry[] = [entry], roles: string[] = ['ops']) {
  // The collapsed surface makes file management administrator-only: row and
  // upload actions gate on the points held by a restricted administrator.
  const metadata = { profile: 'web-platform', identity_realm: 'administrator', capabilities: {}, current_user: { id: 'u1', roles, permissions } } as unknown as Bootstrap;
  const client = { files: { listFiles: vi.fn().mockResolvedValue({ items, total: items.length, page_size: 20 }) }, storage: { storageLocations: vi.fn() } } as unknown as AppClient;
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MessageProvider>
        <FilesPage {...({ client, metadata: grantUI(metadata), registry: {}, theme: 'light', setTheme: () => {}, refresh: () => {} } as unknown as PageProps)} />
      </MessageProvider>
    </QueryClientProvider>,
  );
}

it('shows upload and capability-granted row actions for the super administrator', async () => {
  mountFiles(['files:access', 'files:upload', 'files:delete'], [entry], ['super_admin']);
  expect(await screen.findByRole('button', { name: '上传文件' })).toBeVisible();
  expect(await screen.findByText('one.txt')).toBeVisible();
  expect(screen.getByRole('button', { name: '下载 one.txt' })).toBeVisible();
  expect(screen.getByRole('button', { name: '删除 one.txt' })).toBeVisible();
});

it('keeps the management console read-only for restricted administrators', async () => {
  // Upload and delete ride the super-admin-only management endpoints; the
  // restricted operator keeps signed downloads through the shared access op.
  mountFiles(['files:access', 'notes:access', 'files:delete']);
  expect(await screen.findByText('one.txt')).toBeVisible();
  expect(screen.queryByRole('button', { name: '上传文件' })).toBeNull();
  expect(screen.getByRole('button', { name: '下载 one.txt' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '删除 one.txt' })).toBeNull();
});

it('follows the row projection: scope rows stay downloadable but never deletable', async () => {
  // The server projects delete=false for readable rows owned by other members,
  // even when the operator holds files:delete.
  const shared = { ...entry, file_id: 'f2', original_name: 'shared.txt', creator_id: 'u2', capabilities: { download: true, delete: false } } as FileEntry;
  mountFiles(['files:access', 'notes:access', 'files:delete'], [shared]);
  expect(await screen.findByText('shared.txt')).toBeVisible();
  expect(screen.getByRole('button', { name: '下载 shared.txt' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '删除 shared.txt' })).toBeNull();
  // Pending rows of other members never offer resume; owners keep theirs.
  const pending = { ...shared, file_id: 'f3', original_name: 'pending.txt', state: 'pending' } as FileEntry;
  mountFiles(['files:access', 'notes:access', 'files:delete'], [pending]);
  expect(await screen.findByText('pending.txt')).toBeVisible();
  expect(screen.queryByRole('button', { name: '继续上传 pending.txt' })).toBeNull();
});

it('keeps the delete action hidden when the row projection withdraws it', async () => {
  const guarded = { ...entry, capabilities: { download: true, delete: false } } as FileEntry;
  mountFiles(['files:access', 'files:upload'], [guarded], ['super_admin']);
  expect(await screen.findByText('one.txt')).toBeVisible();
  expect(screen.getByRole('button', { name: '上传文件' })).toBeVisible();
  expect(screen.getByRole('button', { name: '下载 one.txt' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '删除 one.txt' })).toBeNull();
});

it('probe: canAction matches page input', async () => {
  const permissions = ['files:access', 'files:upload', 'files:delete'];
  const metadata = { profile: 'web-platform', identity_realm: 'administrator', capabilities: {}, current_user: { id: 'u1', roles: ['super_admin'], permissions } } as unknown as Bootstrap;
  const granted = grantUI(metadata);
  console.log('INLINE_CAN', canAction(granted, 'createMultipartUpload'), granted.current_user?.roles, granted.identity_realm);
  const client = { files: { listFiles: vi.fn().mockResolvedValue({ items: [entry], total: 1, page_size: 20 }) }, storage: { storageLocations: vi.fn() } } as unknown as AppClient;
  const props = { client, metadata: granted, registry: {}, theme: 'light', setTheme: () => {}, refresh: () => {} } as unknown as PageProps;
  console.log('PROP_CAN', canAction(props.metadata as Bootstrap, 'createMultipartUpload'));
});
