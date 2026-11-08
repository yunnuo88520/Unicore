/** Author: yunnuo <ymz@ebox.vip>
 * Description: Notes module contribution: route facts, default order and icon for the shared registries.
 */
import { NotebookPen } from 'lucide-react';
import { defineMessages } from '../../i18n';
import { registerUiModule, type UiModule } from '../../module-registry';

const routes = defineMessages({
  notes: { label: '我的笔记', title: '我的笔记', description: '记录个人笔记，支持附件、搜索与分页。', permission: 'notes:access', icon: NotebookPen, database: true, local: true },
});

const notes: UiModule<typeof routes> = {
  slug: 'notes',
  routes,
  order: ['notes'],
  icons: { notes: 'NotebookPen' },
};

registerUiModule(notes);

export { notes };
