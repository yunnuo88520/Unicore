// Author: yunnuo <ymz@ebox.vip>
// Description: Controlled-state, browser-event and input edge cases for shared controls.
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setLocale } from '../i18n';
import { ColorPicker, Combobox, CommandPalette, ContextMenu, InputOTP, NumberField, SearchField, SegmentedControl, TimeField, TreeView } from './index';

beforeEach(() => act(() => setLocale('en')));
afterEach(() => act(() => setLocale('zh-CN')));
const options = [{ value: 'a', label: 'Apple' }, { value: 'b', label: 'Banana' }];

it('clearing search returns keyboard focus to the input', () => {
  render(<SearchField label="Search" defaultValue="query" />);
  const clear = screen.getByRole('button', { name: 'Clear search' }); act(() => clear.focus()); fireEvent.click(clear);
  expect(screen.getByRole('searchbox')).toHaveFocus(); expect(screen.getByRole('searchbox')).toHaveValue('');
});

it('disabled segmented root disables every radio regardless of per-option false', () => {
  const change = vi.fn(); render(<SegmentedControl label="View" disabled options={[{ value: 'a', label: 'List', disabled: false }, { value: 'b', label: 'Grid' }]} onValueChange={change} />);
  for (const radio of screen.getAllByRole('radio')) { expect(radio).toBeDisabled(); fireEvent.click(radio); }
  expect(change).not.toHaveBeenCalled();
});

it('command palette does not invoke actions on an IME confirmation Enter', async () => {
  const select = vi.fn(); render(<CommandPalette open onOpenChange={() => {}} items={[{ id: 'a', label: 'Create', onSelect: select }]} />);
  const input = await screen.findByRole('combobox'); fireEvent.keyDown(input, { key: 'Enter', isComposing: true }); expect(select).not.toHaveBeenCalled();
});

it('combobox never shows an unaccepted controlled selection and resynchronizes during search', () => {
  const change = vi.fn();
  const view = render(<Combobox label="Fruit" options={options} value="a" onValueChange={change} />);
  const input = screen.getByRole('combobox'); act(() => input.focus());
  fireEvent.keyDown(input, { key: 'ArrowUp' }); fireEvent.keyDown(input, { key: 'Enter' });
  expect(change).toHaveBeenCalledWith('b'); expect(input).toHaveValue('Apple'); expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: 'unknown' } });
  view.rerender(<Combobox label="Fruit" options={options} value="b" onValueChange={change} />);
  expect(input).toHaveValue('Banana');
});

it('combobox external close discards query and IME Enter cannot select', () => {
  const change = vi.fn(); const close = vi.fn();
  const view = render(<Combobox label="Fruit" options={options} value="a" open onOpenChange={close} onValueChange={change} />);
  const input = screen.getByRole('combobox'); act(() => input.focus());
  fireEvent.keyDown(input, { key: 'ArrowDown' }); fireEvent.keyDown(input, { key: 'Enter', isComposing: true }); expect(change).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: 'missing' } });
  view.rerender(<Combobox label="Fruit" options={options} value="a" open={false} onOpenChange={close} />);
  expect(input).toHaveValue('Apple'); expect(input).toHaveAttribute('aria-expanded', 'false');
});

it('OTP normalizes entire formatted paste before truncating and supports replacing a selection', () => {
  const complete = vi.fn(); const ref = createRef<HTMLInputElement>();
  render(<InputOTP ref={ref} label="Code" length={6} onComplete={complete} />);
  fireEvent.paste(ref.current!, { clipboardData: { getData: () => '１２３ - ４５６' } });
  expect(ref.current).toHaveValue('123456'); expect(complete).toHaveBeenCalledExactlyOnceWith('123456');
  ref.current!.setSelectionRange(1, 3);
  fireEvent.paste(ref.current!, { clipboardData: { getData: () => '98' } });
  expect(ref.current).toHaveValue('198456');
});

it('OTP preserves composing text until commit, respects readonly and does not lose its ref', () => {
  const change = vi.fn(); const complete = vi.fn(); const ref = createRef<HTMLInputElement>();
  const view = render(<InputOTP ref={ref} label="Code" length={2} onValueChange={change} onComplete={complete} />);
  const input = ref.current!;
  fireEvent.compositionStart(input); fireEvent.change(input, { target: { value: '１２' } });
  expect(input).toHaveValue('１２'); expect(change).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input, { data: '１２' }); expect(input).toHaveValue('12'); expect(complete).toHaveBeenCalledOnce(); expect(ref.current).toBe(input);
  view.rerender(<InputOTP ref={ref} label="Code" value="12" length={2} readOnly onValueChange={change} />);
  change.mockClear(); fireEvent.paste(input, { clipboardData: { getData: () => '99' } }); expect(change).not.toHaveBeenCalled();
});

it('number aligns fractional steppers, normalizes invalid step and clamps manual values on blur', () => {
  const view = render(<NumberField label="Quantity" min={0.1} max={1} step={0.2} defaultValue={0.4} />);
  fireEvent.click(screen.getByRole('button', { name: 'Increase value' })); expect(screen.getByRole('spinbutton')).toHaveValue(0.5);
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '20' } }); expect(screen.getByRole('spinbutton')).toBeInvalid();
  fireEvent.blur(screen.getByRole('spinbutton')); expect(screen.getByRole('spinbutton')).toHaveValue(1);
  view.rerender(<NumberField label="Quantity" min={0} max={10} step={0} value={2} />); expect(screen.getByRole('spinbutton')).toHaveAttribute('step', '1');
});

it('time preserves native range and second-step validity rather than silently changing typed values', () => {
  const ref = createRef<HTMLInputElement>(); const change = vi.fn();
  const view = render(<TimeField ref={ref} label="Time" min="09:00" max="17:00" step={60} onValueChange={change} />);
  fireEvent.change(ref.current!, { target: { value: '08:30' } }); expect(ref.current).toBeInvalid(); expect(change).toHaveBeenCalledWith('08:30');
  fireEvent.change(ref.current!, { target: { value: '10:15' } }); expect(ref.current).toBeValid();
  view.rerender(<TimeField ref={ref} label="Time" value="10:15" readOnly onValueChange={change} />); change.mockClear();
  fireEvent.change(ref.current!, { target: { value: '11:00' } }); expect(change).not.toHaveBeenCalled();
});

it('color hex entry validates, honors controlled state and exposes a keyboard-accessible caller palette', () => {
  const change = vi.fn();
  const view = render(<ColorPicker label="Accent" value="#112233" palette={['#aabbcc', 'bad', '#AABBCC']} onValueChange={change} />);
  const hex = screen.getByRole('textbox', { name: 'Hex color for Accent' });
  fireEvent.change(hex, { target: { value: '#12' } }); expect(hex).toHaveAttribute('aria-invalid', 'true'); expect(change).not.toHaveBeenCalled();
  fireEvent.keyDown(hex, { key: 'Escape' }); expect(hex).toHaveValue('#112233');
  fireEvent.change(hex, { target: { value: '#AABBCC' } }); expect(change).toHaveBeenCalledWith('#aabbcc'); expect(hex).toHaveValue('#112233');
  expect(screen.getAllByRole('button')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Choose color #aabbcc' })); expect(change).toHaveBeenLastCalledWith('#aabbcc');
  view.rerender(<ColorPicker label="Accent" value="#aabbcc" palette={['#aabbcc']} readOnly onValueChange={change} />);
  expect(hex).toHaveValue('#aabbcc'); expect(hex).toHaveAttribute('readonly'); expect(screen.getByRole('button')).toBeDisabled();
});

it('tree typeahead refines current match, repeated letters cycle and navigation resets the buffer', () => {
  render(<TreeView label="Tree" nodes={[{ id: 'z', label: 'Zulu' }, { id: 'a', label: 'Alpha' }, { id: 'al', label: 'Alpine' }, { id: 'b', label: 'Beta', disabled: true }]} />);
  const z = screen.getByRole('treeitem', { name: 'Zulu' }); const alpha = screen.getByRole('treeitem', { name: 'Alpha' }); const alpine = screen.getByRole('treeitem', { name: 'Alpine' });
  act(() => z.focus()); fireEvent.keyDown(z, { key: 'a' }); expect(alpha).toHaveFocus();
  fireEvent.keyDown(alpha, { key: 'l' }); expect(alpha).toHaveFocus();
  fireEvent.keyDown(alpha, { key: 'Home' }); fireEvent.keyDown(z, { key: 'a' }); fireEvent.keyDown(alpha, { key: 'a' }); expect(alpine).toHaveFocus();
});

it('tree restores focus after controlled ancestor collapse without stealing external focus', () => {
  const nodes = [{ id: 'r', label: 'Root', children: [{ id: 'a', label: 'Alpha' }] }];
  const view = render(<><TreeView label="Tree" nodes={nodes} expandedIds={['r']} /><button>Outside</button></>);
  act(() => screen.getByRole('treeitem', { name: 'Alpha' }).focus());
  view.rerender(<><TreeView label="Tree" nodes={nodes} expandedIds={[]} /><button>Outside</button></>);
  expect(screen.getByRole('treeitem', { name: 'Root' })).toHaveFocus();
  act(() => screen.getByRole('button', { name: 'Outside' }).focus());
  view.rerender(<><TreeView label="Tree" nodes={[]} expandedIds={[]} /><button>Outside</button></>);
  expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus();
});

it('tree shift selection excludes disabled rows and controlled selection stays caller-owned', () => {
  const change = vi.fn(); const nodes = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Blocked', disabled: true }, { id: 'c', label: 'Charlie' }];
  render(<TreeView label="Tree" nodes={nodes} selectionMode="multiple" selectedIds={[]} onSelectionChange={change} />);
  const a = screen.getByRole('treeitem', { name: 'Alpha' }); act(() => a.focus());
  fireEvent.keyDown(a, { key: 'ArrowDown', shiftKey: true }); expect(screen.getByRole('treeitem', { name: 'Charlie' })).toHaveFocus(); expect(change).toHaveBeenLastCalledWith(['a', 'c']); expect(a).toHaveAttribute('aria-selected', 'false');
});

it('context menu preserves browser escape hatch and empty/disabled native behavior', async () => {
  const action = vi.fn(); const view = render(<ContextMenu label="Actions" actions={[{ id: 'a', label: 'Rename', onSelect: action }]}><span>Row</span></ContextMenu>);
  const root = screen.getByLabelText('Actions');
  expect(fireEvent.contextMenu(root, { shiftKey: true })).toBe(true); expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(fireEvent.contextMenu(root, { clientX: 10, clientY: 20 })).toBe(false); await screen.findByRole('menu');
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' }); await waitFor(() => expect(root).toHaveFocus());
  view.rerender(<ContextMenu label="Actions" actions={[]}><span>Row</span></ContextMenu>); expect(fireEvent.contextMenu(root)).toBe(true);
  view.rerender(<ContextMenu label="Actions" disabled actions={[{ id: 'a', label: 'Rename', onSelect: action }]}><span>Row</span></ContextMenu>); expect(fireEvent.contextMenu(root)).toBe(true);
});
