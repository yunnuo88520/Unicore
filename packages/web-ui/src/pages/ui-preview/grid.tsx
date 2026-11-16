// Author: yunnuo <ymz@ebox.vip>
// Description: Editable typed local grid, confirmed deletion, validation and export feedback.
import { useState } from 'react';
import { Button, ConfirmDialog, Switch } from '@unicore/ui';
import { DataGrid, type DataGridColumn } from '@unicore/ui/data-grid';
import { t, useLocale } from '../../i18n';
import { Sample, Feedback } from './frame';
type Row = { id: string; name: string; amount: number | null; status: string };
const initial: Row[] = Array.from({ length: 120 }, (_, index) => ({ id: `sample-${index + 1}`, name: `Sample ${index + 1}`, amount: index * 3, status: index % 2 ? 'ready' : 'draft' }));
export default function GridSection() {
  useLocale(); const [data, setData] = useState(initial); const [result, setResult] = useState(''); const [remove, setRemove] = useState<readonly string[]>([]); const [readOnly, setReadOnly] = useState(false); const [pending, setPending] = useState(false);
  const columns: DataGridColumn<Row>[] = [
    { id: 'name', header: t('名称'), kind: 'text', getValue: row => row.name, setValue: (row, name) => ({ ...row, name }), validate: value => value.trim() ? undefined : t('名称不能为空'), sortable: true, searchable: true, filterable: true },
    { id: 'amount', header: t('数量'), kind: 'number', getValue: row => row.amount, setValue: (row, amount) => ({ ...row, amount }), validate: value => value !== null && value < 0 ? t('数量不能为负数') : undefined, sortable: true },
    { id: 'status', header: t('状态'), kind: 'options', getValue: row => row.status, setValue: (row, status) => ({ ...row, status }), options: [{ value: 'ready', label: t('已启用') }, { value: 'draft', label: t('等待中') }], filterable: true },
  ];
  return <Sample id="data-grid"><div className="flex flex-wrap items-center gap-4"><Switch checked={readOnly} onChange={setReadOnly}>{t('只读')}</Switch><Switch checked={pending} onChange={setPending}>{t('合成等待状态')}</Switch><Button variant="secondary" onClick={() => { setData(initial); setResult(''); }}>{t('重置')}</Button></div><DataGrid label={t('本地可编辑合成数据')} data={data} columns={columns} getRowId={row => row.id} onDataChange={(rows, change) => { setData(rows); setResult(`${change.reason}: ${change.cells.length}`); }} pending={pending} readOnly={readOnly} height={400} onDeleteRows={setRemove} onValidationError={errors => setResult(errors.map(error => error.message).join(', '))} onExport={csv => setResult(`${t('本地导出预览')}\n${csv}`)} onRowSelectionChange={ids => setResult(ids.join(', '))} />{remove.length > 0 && <ConfirmDialog title={t('确认删除这条记录？')} description={t('仅删除本页的合成行。')} confirmLabel={t('确认删除')} cancelLabel={t('取消')} danger pending={false} onCancel={() => setRemove([])} onConfirm={() => { setData(rows => rows.filter(row => !remove.includes(row.id))); setResult(`${remove.length}`); setRemove([]); }} />}<div className="max-h-40 overflow-auto whitespace-pre-wrap"><Feedback>{result || t('编辑、粘贴、撤销或导出以查看本地反馈。')}</Feedback></div></Sample>;
}
