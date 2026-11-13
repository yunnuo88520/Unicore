// Author: yunnuo <ymz@ebox.vip>
// Description: Chinese source keys and English catalog handoff for host translation.
import { defineMessages } from '../i18n';
export const dataGridMessages = defineMessages({
  search: '搜索行', columns: '列', undo: '撤销', redo: '重做', export: '导出 CSV', delete: '删除选中行',
  selectAll: '选择所有可见行', selectRow: '选择第 {{row}} 行', resize: '调整 {{column}} 宽度', filter: '筛选 {{column}}',
  edit: '编辑 {{column}}', empty: '没有匹配的行', pending: '正在加载行', readOnly: '只读表格',
  count: '{{count}} 行', selected: '已选择 {{count}} 行', error: '表格校验失败',
  help: '使用方向键导航，按住 Shift 扩展单元格选区。Enter 或 F2 编辑，Escape 取消。复制和粘贴作用于单元格选区。',
});
export const dataGridValidationMessages = defineMessages({
  invalidClipboard: '剪贴板文本无效。',
  clipboardWidth: '剪贴板各行的列数必须相同。',
  duplicateEdit: '单元格重复编辑。',
  missingCell: '单元格已不存在。',
  readOnlyCell: '此单元格为只读。',
  finiteNumber: '请输入有限数字。',
  validOption: '请选择有效选项。',
  immutableId: '编辑不能更改行 ID。',
  updateFailed: '无法更新此单元格。',
  validationFailed: '无法校验此单元格。',
  pasteBounds: '粘贴超出表格边界。'
});
const englishToSource = defineMessages({
  'Search rows': '搜索行',
  'Columns': '列',
  'Undo': '撤销',
  'Redo': '重做',
  'Export CSV': '导出 CSV',
  'Delete selected rows': '删除选中行',
  'Select all visible rows': '选择所有可见行',
  'Select row {{row}}': '选择第 {{row}} 行',
  'Resize {{column}}': '调整 {{column}} 宽度',
  'Filter {{column}}': '筛选 {{column}}',
  'Edit {{column}}': '编辑 {{column}}',
  'No matching rows': '没有匹配的行',
  'Loading rows': '正在加载行',
  'Read-only grid': '只读表格',
  '{{count}} rows': '{{count}} 行',
  '{{count}} rows selected': '已选择 {{count}} 行',
  'Grid validation failed': '表格校验失败',
  'Arrow keys navigate. Shift extends the cell range. Enter or F2 edits. Escape cancels. Copy and paste use the selected cells.': '使用方向键导航，按住 Shift 扩展单元格选区。Enter 或 F2 编辑，Escape 取消。复制和粘贴作用于单元格选区。',
  'Invalid clipboard text.': '剪贴板文本无效。',
  'Clipboard rows must have equal widths.': '剪贴板各行的列数必须相同。',
  'Duplicate cell edit.': '单元格重复编辑。',
  'Cell no longer exists.': '单元格已不存在。',
  'This cell is read-only.': '此单元格为只读。',
  'Enter a finite number.': '请输入有限数字。',
  'Choose a valid option.': '请选择有效选项。',
  'Editing cannot change a row ID.': '编辑不能更改行 ID。',
  'Unable to update this cell.': '无法更新此单元格。',
  'Unable to validate this cell.': '无法校验此单元格。',
  'Paste exceeds the grid bounds.': '粘贴超出表格边界。'
});
export const dataGridEnglishMessages: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(englishToSource).map(([english, source]) => [source, english]),
);
