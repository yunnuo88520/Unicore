// Author: yunnuo <ymz@ebox.vip>
// Description: Dropdown actions preserve keyboard navigation, disabled semantics and trigger focus.
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './dropdown-menu';

function Actions({ onSelect = () => {} }: { onSelect?: () => void }) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button>Actions</button></DropdownMenuTrigger>
    <DropdownMenuContent aria-label="Row actions">
      <DropdownMenuLabel>Manage record</DropdownMenuLabel>
      <DropdownMenuItem onSelect={onSelect}>Edit</DropdownMenuItem>
      <DropdownMenuItem disabled onSelect={onSelect}>Delete</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem>View</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

it('opens a labelled menu in a portal and selects an action with the pointer', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  const { container } = render(<Actions onSelect={onSelect} />);
  const trigger = screen.getByRole('button', { name: 'Actions' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  await user.click(trigger);
  const menu = screen.getByRole('menu', { name: 'Actions' });
  expect(menu).toHaveAttribute('aria-labelledby', trigger.id);
  expect(menu).toHaveAttribute('aria-label', 'Row actions');
  expect(document.body).toContainElement(menu);
  expect(container).not.toContainElement(menu);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('Manage record')).toBeInTheDocument();
  expect(screen.getByRole('separator')).toBeInTheDocument();
  await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
  expect(onSelect).toHaveBeenCalledOnce();
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it('supports keyboard opening, skips disabled items and restores focus on Escape', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<Actions onSelect={onSelect} />);
  const trigger = screen.getByRole('button', { name: 'Actions' });
  await user.tab();
  expect(trigger).toHaveFocus();
  await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
  expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveAttribute('aria-disabled', 'true');
  await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('menuitem', { name: 'View' })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(onSelect).not.toHaveBeenCalled();
});

it('activates an item with Enter and does not select a disabled action', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<Actions onSelect={onSelect} />);
  await user.click(screen.getByRole('button', { name: 'Actions' }));
  await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.getByRole('menu')).toBeInTheDocument();
  await user.keyboard('{Escape}');
  await user.keyboard('{ArrowDown}{Enter}');
  expect(onSelect).toHaveBeenCalledOnce();
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

it('forwards refs, attributes and class overrides on the wrapped primitives', () => {
  const content = createRef<HTMLDivElement>();
  const item = createRef<HTMLDivElement>();
  const label = createRef<HTMLDivElement>();
  const separator = createRef<HTMLDivElement>();
  render(<DropdownMenu open>
    <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
    <DropdownMenuContent ref={content} aria-label="Custom actions" className="min-w-60" data-testid="content">
      <DropdownMenuLabel ref={label} className="text-lg" data-testid="label">Heading</DropdownMenuLabel>
      <DropdownMenuItem ref={item} className="px-4" data-testid="item">Edit</DropdownMenuItem>
      <DropdownMenuSeparator ref={separator} className="my-3" data-testid="separator" />
    </DropdownMenuContent>
  </DropdownMenu>);
  expect(content.current).toBe(screen.getByRole('menu', { name: 'Actions' }));
  expect(content.current).toHaveAttribute('aria-label', 'Custom actions');
  expect(content.current).toHaveClass('min-w-60');
  expect(content.current).not.toHaveClass('min-w-44');
  expect(item.current).toBe(screen.getByTestId('item'));
  expect(item.current).toHaveClass('px-4');
  expect(item.current).not.toHaveClass('px-2.5');
  expect(label.current).toBe(screen.getByTestId('label'));
  expect(label.current).toHaveClass('text-lg');
  expect(separator.current).toBe(screen.getByTestId('separator'));
  expect(separator.current).toHaveClass('my-3');
});
