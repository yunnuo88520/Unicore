// Author: yunnuo <ymz@ebox.vip>
// Description: Batch migration reports partial failure, retries only unfinished files and stops between requests.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import type { AppClient, FileEntry } from '@unicore/sdk';
import { BatchMigration } from './files';

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
