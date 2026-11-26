// Author: yunnuo <ymz@ebox.vip>
// Description: Drawer side rendering and labelled title row.
import { render, screen } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Drawer, DrawerContent, FormDrawer } from './drawer';

it('renders the titled side sheet with a labelled close button', () => {
  render(<Drawer open><DrawerContent title="主题设置"><p>内容</p></DrawerContent></Drawer>);
  expect(screen.getByText('主题设置')).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: '主题设置' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '关闭面板' })).toBeInTheDocument();
});

it('lets a panel override the close button label', () => {
  render(<Drawer open><DrawerContent title="主题设置" closeLabel="关闭主题设置"><p>内容</p></DrawerContent></Drawer>);
  expect(screen.getByRole('button', { name: '关闭主题设置' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '关闭面板' })).not.toBeInTheDocument();
});

it('focuses the editor field first and returns focus to the opener after Escape', async () => {
  function Editor() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Create entry</button>{open && <FormDrawer title="Entry" onClose={() => setOpen(false)}>
      <form><input aria-label="Name" /><button>Save</button></form>
    </FormDrawer>}</>;
  }
  render(<Editor />);
  const opener = screen.getByRole('button', { name: 'Create entry' });
  await userEvent.click(opener);
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
});

it('keeps an editor open while saving and preserves field focus when pending changes', async () => {
  const close = vi.fn();
  const content = <><input aria-label="Name" /><input aria-label="Description" /></>;
  const view = render(<FormDrawer title="Entry" onClose={close}>{content}</FormDrawer>);
  await userEvent.click(screen.getByRole('textbox', { name: 'Description' }));
  view.rerender(<FormDrawer title="Entry" onClose={close} pending>{content}</FormDrawer>);
  expect(screen.getByRole('textbox', { name: 'Description' })).toHaveFocus();
  expect(screen.getByRole('button', { name: '关闭Entry' })).toBeDisabled();
  await userEvent.keyboard('{Escape}');
  expect(close).not.toHaveBeenCalled();
  view.rerender(<FormDrawer title="Entry" onClose={close}>{content}</FormDrawer>);
  await userEvent.keyboard('{Escape}');
  expect(close).toHaveBeenCalledOnce();
});
