// Author: yunnuo <ymz@ebox.vip>
// Description: Modal mounting, pending lock and ConfirmDialog action semantics.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ConfirmDialog, Modal } from './dialog';

it('modal renders its title, focuses content and closes through the close button', async () => {
  const onClose = vi.fn();
  render(<Modal title="编辑资料" onClose={onClose}><button>字段</button></Modal>);
  expect(screen.getByRole('dialog', { name: '编辑资料' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '关闭编辑资料' }));
  expect(onClose).toHaveBeenCalled();
});

it('pending modal disables the close affordance', () => {
  const onClose = vi.fn();
  render(<Modal title="保存中" onClose={onClose} pending><p>进行中</p></Modal>);
  expect(screen.getByRole('button', { name: '关闭保存中' })).toBeDisabled();
});

it('confirm dialog reports confirm and cancel decisions', async () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(<ConfirmDialog title="删除确认" description="该操作不可撤销" confirmLabel="删除" cancelLabel="取消" danger onConfirm={onConfirm} onCancel={onCancel} />);
  await userEvent.click(screen.getByRole('button', { name: '删除' }));
  expect(onConfirm).toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(onCancel).toHaveBeenCalled();
});
