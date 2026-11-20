/** Author: yunnuo <ymz@ebox.vip>
 * Description: Notes module contribution: route facts, default order and icon for the shared registries.
 */
import { NotebookPen } from 'lucide-react';
import { defineMessages } from '../../i18n';
import { registerUiModule, type UiModule } from '../../module-registry';

const routes = /* @__PURE__ */ defineMessages({
  notes: { label: '我的笔记', title: '我的笔记', description: '记录个人笔记，支持附件、搜索与分页。', permission: 'notes:access', icon: NotebookPen, database: true, local: true },
  'note-management': { label: '笔记管理', title: '笔记管理', description: '按标题或作者查找笔记、管理状态与删除记录。', permission: 'notes:manage:read', icon: NotebookPen, surfaces: ['administrator'] as ['administrator'] },
});

const notes: UiModule<typeof routes> = {
  slug: 'notes',
  routes,
  order: ['notes', 'note-management'],
  icons: { notes: 'NotebookPen', 'note-management': 'NotebookPen' },
};

if (__FEATURE_NOTES__) registerUiModule(notes);

export { notes };
