// Author: yunnuo <ymz@ebox.vip>
// Description: Observable interaction coverage for independent UI controls.
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setLocale, setTranslator } from '../i18n';
import { Accordion, Announcement, ButtonGroup, Carousel, CloseButton, ColorPicker, Combobox, CommandPalette, ContextMenu, Counter, FileUploadDropzone, IconButton, InputOTP, LinkButton, Meter, Notification, NumberField, Pagination, SearchField, SegmentedControl, Slider, SocialButton, Spinner, TagGroup, TimeField, TreeView } from './index';

beforeEach(() => { act(() => setLocale('en')); });
afterEach(() => { setTranslator(value => value); act(() => setLocale('zh-CN')); });

it('action family forwards refs, exposes labels, and preserves disabled semantics', () => {
  const button = createRef<HTMLButtonElement>();
  const link = createRef<HTMLAnchorElement>();
  const click = vi.fn();
  render(<ButtonGroup label="Actions"><IconButton ref={button} label="Edit" disabled onClick={click}>E</IconButton><CloseButton /><LinkButton ref={link} href="/local" disabled onClick={click}>Details</LinkButton><SocialButton onClick={click}>Continue</SocialButton></ButtonGroup>);
  expect(button.current).toBe(screen.getByRole('button', { name: 'Edit' }));
  fireEvent.click(button.current!); fireEvent.click(link.current!);
  expect(click).not.toHaveBeenCalled();
  expect(link.current).not.toHaveAttribute('href');
  expect(link.current).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(click).toHaveBeenCalledOnce();
});

it('renders measurable feedback and caller-owned dismissal', () => {
  const dismiss = vi.fn();
  render(<><Announcement onDismiss={dismiss}>Notice</Announcement><Notification title="Saved" urgent>Stored locally</Notification><Spinner /><Counter label="Count" value={12} max={9} /><Meter label="Capacity" value={150} /></>);
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss announcement' }));
  expect(dismiss).toHaveBeenCalledOnce();
  expect(screen.getByRole('alert')).toHaveTextContent('Saved');
  expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '100');
  expect(screen.getByLabelText('Count')).toHaveTextContent('9+');
  expect(screen.getByText('Loading')).toBeInTheDocument();
});

it('disclosure supports multiple expansion, disabled items and heading keyboard navigation', () => {
  render(<Accordion multiple items={[{ id: 'a', title: 'Alpha', content: 'First body' }, { id: 'b', title: 'Blocked', content: 'Blocked body', disabled: true }, { id: 'c', title: 'Charlie', content: 'Last body' }]} />);
  const first = screen.getByRole('button', { name: 'Alpha' });
  const last = screen.getByRole('button', { name: 'Charlie' });
  fireEvent.click(first); fireEvent.click(last);
  expect(first).toHaveAttribute('aria-expanded', 'true'); expect(last).toHaveAttribute('aria-expanded', 'true');
  fireEvent.keyDown(first, { key: 'ArrowDown' }); expect(last).toHaveFocus();
  fireEvent.keyDown(last, { key: 'Home' }); expect(first).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Blocked' })).toBeDisabled();
});

it('controlled disclosure reports but does not mutate its value', () => {
  const change = vi.fn();
  render(<Accordion value={[]} onValueChange={change} items={[{ id: 'a', title: 'Open', content: 'Body' }]} />);
  fireEvent.click(screen.getByRole('button'));
  expect(change).toHaveBeenCalledWith(['a']); expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
});

it('search can be typed and cleared and forwards the input ref', () => {
  const ref = createRef<HTMLInputElement>(); const change = vi.fn();
  render(<SearchField ref={ref} label="Find" onValueChange={change} />);
  fireEvent.change(ref.current!, { target: { value: 'term' } });
  expect(ref.current).toHaveValue('term'); fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
  expect(ref.current).toHaveValue(''); expect(change).toHaveBeenLastCalledWith('');
});

it('number steppers clamp bounds and preserve empty input', () => {
  render(<NumberField label="Quantity" min={0} max={2} defaultValue={1} />);
  fireEvent.click(screen.getByRole('button', { name: 'Increase value' }));
  expect(screen.getByRole('spinbutton')).toHaveValue(2); expect(screen.getByRole('button', { name: 'Increase value' })).toBeDisabled();
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } }); expect(screen.getByRole('spinbutton')).toHaveValue(null);
  fireEvent.click(screen.getByRole('button', { name: 'Decrease value' })); expect(screen.getByRole('spinbutton')).toHaveValue(0);
});

it('range, time and color retain native types and controlled callbacks', () => {
  const change = vi.fn(); const time = createRef<HTMLInputElement>(); const color = createRef<HTMLInputElement>();
  render(<><Slider label="Volume" value={20} onValueChange={change} min={0} max={100} /><TimeField ref={time} label="Time" defaultValue="12:30" /><ColorPicker ref={color} label="Color" value="#112233" onValueChange={change} disabled /></>);
  fireEvent.change(screen.getByRole('slider'), { target: { value: '40' } }); expect(change).toHaveBeenCalledWith(40); expect(screen.getByRole('slider')).toHaveValue('20');
  expect(time.current).toHaveAttribute('type', 'time'); expect(time.current).toHaveValue('12:30'); expect(color.current).toBeDisabled();
});

it('color picker requires caller state and reports changes without choosing a default color', () => {
  const change = vi.fn();
  const view = render(<ColorPicker label="Color" value="#112233" onValueChange={change} />);
  const input = screen.getByLabelText('Color');
  fireEvent.change(input, { target: { value: '#445566' } });
  expect(change).toHaveBeenCalledWith('#445566'); expect(input).toHaveValue('#112233');
  view.rerender(<ColorPicker label="Color" value="#445566" onValueChange={change} />);
  expect(input).toHaveValue('#445566');
});

it('segmented choices use radio keyboard behavior and skip disabled options', async () => {
  render(<SegmentedControl label="View" defaultValue="a" options={[{ value: 'a', label: 'List' }, { value: 'b', label: 'Blocked', disabled: true }, { value: 'c', label: 'Grid' }]} />);
  const first = screen.getByRole('radio', { name: 'List' });
  act(() => first.focus()); fireEvent.keyDown(first, { key: 'ArrowRight' });
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Grid' })).toHaveAttribute('aria-checked', 'true'));
});

it('OTP sanitizes input, signals completion once per change and forwards ref', () => {
  const complete = vi.fn(); const ref = createRef<HTMLInputElement>();
  render(<InputOTP ref={ref} label="Code" length={4} onComplete={complete} />);
  fireEvent.change(ref.current!, { target: { value: '1a234' } }); expect(ref.current).toHaveValue('1234'); expect(complete).toHaveBeenCalledWith('1234');
  fireEvent.change(ref.current!, { target: { value: '1234' } }); expect(complete).toHaveBeenCalledOnce();
  expect(ref.current).toHaveAttribute('autocomplete', 'one-time-code');
});

it('tags support multiple selection and explicit removal without mutating caller items', () => {
  const remove = vi.fn();
  render(<TagGroup label="Tags" selectionMode="multiple" items={[{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta', disabled: true }]} onRemove={remove} />);
  fireEvent.click(screen.getByRole('button', { name: 'Alpha' })); expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Remove Alpha' })); expect(remove).toHaveBeenCalledWith('a'); expect(screen.getByRole('button', { name: 'Beta' })).toBeDisabled();
});

it('dropzone validates selection and drop with no service behavior', () => {
  const accept = vi.fn(); const reject = vi.fn();
  render(<FileUploadDropzone label="Attachment" accept=".txt" multiple maxFiles={1} maxSize={10} onFiles={accept} onReject={reject} />);
  const good = new File(['a'], 'note.txt', { type: 'text/plain' }); const wrong = new File(['a'], 'image.png', { type: 'image/png' }); const excess = new File(['b'], 'extra.txt');
  fireEvent.drop(screen.getByRole('group'), { dataTransfer: { files: [good, wrong, excess] } });
  expect(accept).toHaveBeenCalledWith([good]); expect(reject).toHaveBeenCalledWith([{ file: wrong, reason: 'type' }, { file: excess, reason: 'count' }]);
  fireEvent.change(screen.getByLabelText('Attachment', { selector: 'input' }), { target: { files: [good] } }); expect(accept).toHaveBeenCalledTimes(2);
});

it('disabled dropzone ignores drops and disables chooser', () => {
  const accept = vi.fn(); render(<FileUploadDropzone label="Upload" disabled onFiles={accept} />);
  fireEvent.drop(screen.getByRole('group'), { dataTransfer: { files: [new File(['a'], 'a.txt')] } }); expect(accept).not.toHaveBeenCalled(); expect(screen.getByRole('button')).toBeDisabled();
});

const choices = [{ value: 'a', label: 'Apple' }, { value: 'b', label: 'Apricot', disabled: true }, { value: 'c', label: 'Cherry' }];
it('combobox filters, skips disabled choices and selects through active descendant', async () => {
  const ref = createRef<HTMLInputElement>(); const change = vi.fn();
  render(<Combobox ref={ref} label="Fruit" options={choices} onValueChange={change} />);
  const input = screen.getByRole('combobox'); act(() => input.focus());
  fireEvent.change(input, { target: { value: 'Ap' } }); expect(await screen.findAllByRole('option')).toHaveLength(2);
  fireEvent.keyDown(input, { key: 'ArrowDown' }); const activeId = input.getAttribute('aria-activedescendant'); expect(activeId).toBeTruthy(); expect(document.getElementById(activeId!)).toHaveTextContent('Apple');
  fireEvent.keyDown(input, { key: 'Enter' }); expect(change).toHaveBeenCalledWith('a'); expect(input).toHaveValue('Apple'); expect(input).toHaveFocus(); expect(input).toHaveAttribute('aria-expanded', 'false'); expect(ref.current).toBe(input);
});

it('combobox Escape restores selected text, pointer selection retains input focus, and disabled cannot open', async () => {
  const view = render(<Combobox label="Fruit" options={choices} defaultValue="c" />); const input = screen.getByRole('combobox'); act(() => input.focus());
  fireEvent.change(input, { target: { value: 'missing' } }); expect(await screen.findByText('No results')).toBeInTheDocument(); fireEvent.keyDown(input, { key: 'Escape' }); expect(input).toHaveValue('Cherry');
  fireEvent.keyDown(input, { key: 'ArrowDown' }); const apple = await screen.findByRole('option', { name: 'Apple' }); fireEvent.pointerDown(apple); fireEvent.click(apple); expect(input).toHaveValue('Apple');
  view.rerender(<Combobox label="Fruit" options={choices} disabled />); expect(input).toBeDisabled(); expect(input).toHaveAttribute('aria-expanded', 'false');
});

it('command palette filters and invokes only the selected enabled action', async () => {
  const choose = vi.fn(); const close = vi.fn();
  render(<CommandPalette open onOpenChange={close} items={[{ id: 'a', label: 'Archive', disabled: true, onSelect: choose }, { id: 'b', label: 'Create', onSelect: choose }]} />);
  const input = await screen.findByRole('combobox'); fireEvent.change(input, { target: { value: 'cre' } }); fireEvent.keyDown(input, { key: 'Enter' }); expect(choose).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledWith(false);
});

it('context menu opens via keyboard, executes action and restores trigger focus', async () => {
  const choose = vi.fn(); const ref = createRef<HTMLDivElement>();
  render(<ContextMenu ref={ref} label="Row actions" actions={[{ id: 'a', label: 'Rename', onSelect: choose }]}><span>Row</span></ContextMenu>);
  act(() => ref.current?.focus()); fireEvent.keyDown(ref.current!, { key: 'F10', shiftKey: true });
  const item = await screen.findByRole('menuitem', { name: 'Rename' }); fireEvent.keyDown(item, { key: 'Enter' });
  await waitFor(() => expect(choose).toHaveBeenCalledOnce()); await waitFor(() => expect(ref.current).toHaveFocus());
});

it('carousel keyboard navigation hides inactive interactive slides and never steals control focus', () => {
  const ref = createRef<HTMLDivElement>(); render(<Carousel ref={ref} label="Gallery" slides={[{ id: 'a', content: <button>First action</button> }, { id: 'b', content: <button>Second action</button> }]} />);
  expect(screen.getByRole('button', { name: 'First action' })).toBeVisible(); expect(screen.queryByRole('button', { name: 'Second action' })).not.toBeInTheDocument();
  act(() => ref.current?.focus()); fireEvent.keyDown(ref.current!, { key: 'ArrowRight' }); expect(screen.getByRole('button', { name: 'Second action' })).toBeVisible(); expect(ref.current).toHaveFocus();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Second action' }), { key: 'ArrowLeft' }); expect(screen.getByRole('button', { name: 'Second action' })).toBeVisible();
});

const nodes = [{ id: 'root', label: 'Folder', children: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta', disabled: true }, { id: 'c', label: 'Charlie' }] }, { id: 'z', label: 'Zulu' }];
it('tree expands, navigates arrows/home/end/typeahead, skips disabled and preserves stable IDs', () => {
  render(<TreeView label="Files" nodes={nodes} selectionMode="multiple" />);
  const root = screen.getByRole('treeitem', { name: 'Folder' }); const stableId = root.id;
  act(() => root.focus()); fireEvent.keyDown(root, { key: 'ArrowRight' }); expect(root).toHaveAttribute('aria-expanded', 'true');
  fireEvent.keyDown(root, { key: 'ArrowRight' }); const alpha = screen.getByRole('treeitem', { name: 'Alpha' }); expect(alpha).toHaveFocus();
  fireEvent.keyDown(alpha, { key: 'ArrowDown' }); const charlie = screen.getByRole('treeitem', { name: 'Charlie' }); expect(charlie).toHaveFocus();
  fireEvent.keyDown(charlie, { key: ' ' }); expect(charlie).toHaveAttribute('aria-selected', 'true'); fireEvent.keyDown(charlie, { key: 'Home' }); expect(root).toHaveFocus();
  fireEvent.keyDown(root, { key: 'z' }); expect(screen.getByRole('treeitem', { name: 'Zulu' })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole('treeitem', { name: 'Zulu' }), { key: 'Home' }); fireEvent.keyDown(root, { key: 'ArrowLeft' }); expect(screen.queryByRole('treeitem', { name: 'Alpha' })).not.toBeInTheDocument(); expect(root.id).toBe(stableId);
});

it('tree single selection, none mode and controlled expansion are distinct', () => {
  const select = vi.fn(); const expand = vi.fn(); const view = render(<TreeView label="Files" nodes={nodes} expandedIds={[]} onExpandedChange={expand} selectedIds={[]} onSelectionChange={select} />);
  const root = screen.getByRole('treeitem', { name: 'Folder' }); fireEvent.click(root); expect(select).toHaveBeenCalledWith(['root']); expect(root).toHaveAttribute('aria-selected', 'false');
  fireEvent.keyDown(root, { key: 'ArrowRight' }); expect(expand).toHaveBeenCalledWith(['root']); expect(root).toHaveAttribute('aria-expanded', 'false');
  view.rerender(<TreeView label="Files" nodes={nodes} selectionMode="none" />); fireEvent.keyDown(root, { key: 'Enter' }); expect(root).not.toHaveAttribute('aria-selected'); expect(root).toHaveAttribute('aria-expanded', 'true');
});

it('new built-in labels react to locale changes through the shared translation surface', () => {
  setTranslator(key => key === 'Loading' ? 'Working' : key);
  render(<Spinner />); expect(screen.getByText('Working')).toBeInTheDocument();
  setTranslator(key => key); act(() => setLocale('zh-CN')); expect(screen.getByText('加载中')).toBeInTheDocument();
});

it('pagination reports bounded page changes without mutating controlled current', () => {
  const change = vi.fn(); const ref = createRef<HTMLElement>();
  const view = render(<Pagination ref={ref} current={5} total={10} onPageChange={change} />);
  expect(ref.current).toBe(screen.getByRole('navigation', { name: 'Pagination' }));
  expect(screen.getByRole('button', { name: 'Page 5' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(screen.getByRole('button', { name: 'Next page' })); expect(change).toHaveBeenLastCalledWith(6);
  expect(screen.getByRole('button', { name: 'Page 5' })).toHaveAttribute('aria-current', 'page');
  view.rerender(<Pagination current={1} total={10} onPageChange={change} />); expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  view.rerender(<Pagination current={10} total={10} disabled onPageChange={change} />); expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Page 9' })).toBeDisabled();
  act(() => setLocale('zh-CN')); expect(screen.getByRole('navigation', { name: '分页' })).toBeInTheDocument();
});
