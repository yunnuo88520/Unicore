// Author: yunnuo <ymz@ebox.vip>
// Description: Test-only host for the shared upload dialog; never included in product builds.
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { HttpTransport, type FileEntry } from '@unicore/sdk';
import { FileUploadDialog } from '../src/file-upload-dialog';
import { t, useLocale } from '../src/i18n';
import { useTheme } from '@unicore/theme';
import { Button, MessageProvider, Modal } from '@unicore/ui';
import '@unicore/theme/styles.css';

const client = new HttpTransport('', globalThis.fetch.bind(globalThis), 'administrator');
function UploadFixture() {
  useLocale(); useTheme();
  const cache = useQueryClient();
  const [upload, setUpload] = useState<{ file?: FileEntry }>();
  const [remove, setRemove] = useState<FileEntry>();
  const [migrate, setMigrate] = useState<FileEntry>();
  const [target, setTarget] = useState('local');
  const boot = useQuery({ queryKey: ['bootstrap'], queryFn: () => client.bootstrap() });
  const files = useQuery({ queryKey: ['files'], queryFn: () => client.files!.listFiles('', 1), enabled: !!boot.data });
  const locations = useQuery({ queryKey: ['locations'], queryFn: () => client.storage!.storageLocations(), enabled: !!boot.data });
  const refresh = () => { void cache.invalidateQueries({ queryKey: ['files'] }); };
  return <main className="p-3">
    <Button onClick={() => setUpload({})}>{t('上传文件')}</Button>
    <table className="w-full text-sm"><tbody>{files.data?.items.map(file => <tr key={file.file_id}>
      <td className="max-w-28 truncate">{file.original_name}</td><td>{(file.size / 1048576).toFixed(1)} MiB</td><td>{file.storage_type}</td>
      <td>{file.state === 'ready'
        ? <><button aria-label={t('下载 {{v0}}', { v0: file.original_name })} onClick={async () => { const access = await client.files!.fileAccess(file.file_id); const link = document.createElement('a'); link.href = access.url; link.download = file.original_name; link.click(); }}>↓</button>
          <button aria-label={t('迁移 {{v0}}', { v0: file.original_name })} onClick={() => setMigrate(file)}>↔</button></>
        : <button onClick={() => setUpload({ file })}>{t('继续上传 {{name}}', { name: file.original_name })}</button>}
        <button aria-label={t('删除 {{v0}}', { v0: file.original_name })} onClick={() => setRemove(file)}>×</button></td>
    </tr>)}</tbody></table>
    {files.data && !files.data.items.length && <p>{t('还没有文件')}</p>}
    {upload && <FileUploadDialog client={client} resume={upload.file} onClose={() => { setUpload(undefined); refresh(); }} onUploaded={refresh} />}
    {remove && <Modal title={t('确认删除')} onClose={() => setRemove(undefined)}><Button onClick={async () => { await client.files!.deleteFile(remove.file_id); setRemove(undefined); refresh(); }}>{t('确认删除')}</Button></Modal>}
    {migrate && <Modal title={t('迁移文件')} onClose={() => setMigrate(undefined)}><label>{t('目标存储位置')}<select value={target} onChange={event => setTarget(event.target.value)}>{locations.data?.items.map(item => <option key={item.id} value={item.id}>{item.name} · {item.provider}</option>)}</select></label><Button onClick={async () => { await client.files!.migrateFile(migrate.file_id, target); setMigrate(undefined); refresh(); }}>{t('开始迁移')}</Button></Modal>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><MessageProvider><UploadFixture /></MessageProvider></QueryClientProvider>);
