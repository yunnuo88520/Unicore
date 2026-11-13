// Author: yunnuo <ymz@ebox.vip>
// Description: Observable callback, keyboard, retained-answer and controlled-state composite contracts.
import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentLocale, setLocale, setTranslator } from '../i18n';
import { compositeMessages } from './messages';
import { AgentCreator, AgentThinking, AgentProgress, AgentLimitsCard, type AgentProfile } from './agents';
import { Composer, ComposerPanel, ComposerAttachmentStrip, ComposerLoader } from './composer';
import { NotificationCenter, SearchActivity, TaskList } from './activity';
import { AuthCard, AuthMediaCarousel, SettingsDialog, Sidebar, StatCards } from './surfaces';
import { Questionnaire, type QuestionnaireQuestion } from './questionnaire';

beforeEach(() => {
  setLocale('en');
  const english = new Map(Object.entries(compositeMessages).map(([key, source]) => [source, key]));
  setTranslator(value => currentLocale() === 'en' ? english.get(value) ?? value : value);
});
afterEach(() => { setTranslator(value => value); setLocale('zh-CN'); });

describe('composer', () => {
  it('submits raw text on plain Enter, not shift, modifiers, IME or busy; never clears caller state', () => {
    const onSubmit = vi.fn(); const onChange = vi.fn();
    const { rerender } = render(<Composer value="  draft  " onChange={onChange} onSubmit={onSubmit} />);
    const input = screen.getByLabelText('Message');
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    fireEvent.compositionStart(input); fireEvent.keyDown(input, { key: 'Enter' }); fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('  draft  ');
    expect(input).toHaveValue('  draft  ');
    rerender(<Composer value="draft" onChange={onChange} onSubmit={onSubmit} busy />);
    fireEvent.keyDown(input, { key: 'Enter' }); expect(onSubmit).toHaveBeenCalledTimes(1);
    rerender(<Composer value="   " onChange={onChange} onSubmit={onSubmit} />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });
  it('searches caller provider/model catalog and only invokes available actions', async () => {
    const user = userEvent.setup(); const change = vi.fn(); const permission = vi.fn(); const effort = vi.fn();
    render(<ComposerPanel models={[{ id: 'a', provider: 'Local', label: 'Small' }, { id: 'b', provider: 'Remote', label: 'Large', disabled: true }]} onModelChange={change} effort="medium" onEffortChange={effort} permissionOptions={[{ id: 'review', label: 'Review each', description: 'Caller policy' }]} permissionId="review" onPermissionChange={permission} />);
    await user.click(screen.getByRole('button', { name: 'Select model' }));
    await user.type(screen.getByLabelText('Search models'), 'local');
    expect(screen.queryByRole('button', { name: 'Remote / Large' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Local / Small' })); expect(change).toHaveBeenCalledWith('a');
    expect(screen.queryByLabelText('Search models')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Effort'), { target: { value: 'high' } }); expect(effort).toHaveBeenCalledWith('high');
    expect(screen.getByText('Caller policy')).toBeInTheDocument();
  });
  it('filters models by provider rail and search and selects caller effort choices', async () => {
    const user = userEvent.setup(); const model = vi.fn(); const effort = vi.fn();
    render(<ComposerPanel models={[{ id: 'a', provider: 'Local', label: 'Small' }, { id: 'b', provider: 'Remote', label: 'Large' }]} onModelChange={model} effort="low" effortOptions={[{ id: 'low', label: 'Quick' }, { id: 'high', label: 'Thorough' }]} onEffortChange={effort} />);
    await user.click(screen.getByRole('button', { name: 'Select model' }));
    const providers = screen.getByRole('group', { name: 'Model providers' });
    await user.click(within(providers).getByRole('button', { name: 'Remote' }));
    expect(screen.queryByRole('button', { name: 'Local / Small' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remote / Large' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search models'), 'small');
    expect(screen.getByText('No models found')).toBeInTheDocument();
    await user.click(within(providers).getByRole('button', { name: 'All providers' }));
    await user.click(screen.getByRole('button', { name: 'Local / Small' })); expect(model).toHaveBeenCalledWith('a');
    await user.click(screen.getByRole('button', { name: 'Effort' }));
    await user.click(screen.getByRole('button', { name: 'Thorough' })); expect(effort).toHaveBeenCalledWith('high');
  });
  it('provides full panel input and status without nesting forms', async () => {
    const user = userEvent.setup(); const submit = vi.fn(); const outer = vi.fn();
    render(<form aria-label="Outer form" onSubmit={event => { event.preventDefault(); outer(); }}><ComposerPanel value="draft" onChange={() => {}} onSubmit={submit} status={<span>Caller status</span>} /></form>);
    const input = screen.getByLabelText('Message');
    expect(input.closest('form')).toBe(screen.getByRole('form', { name: 'Outer form' }));
    expect(screen.getByText('Caller status')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send' })); expect(submit).toHaveBeenCalledWith('draft'); expect(outer).not.toHaveBeenCalled();
  });
  it('renders attachment preview, type and ring progress without changing status', () => {
    render(<ComposerAttachmentStrip attachments={[{ id: 'p', name: 'preview.txt', type: 'Plain text', preview: <span>Caller preview</span>, status: 'uploading', progress: 42, progressVariant: 'ring' }]} />);
    expect(screen.getByText('Caller preview')).toBeInTheDocument(); expect(screen.getByText('Plain text')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Upload progress' })).toHaveAttribute('aria-valuenow', '42');
  });
  it('renders all attachment states without inventing transitions', async () => {
    const user = userEvent.setup(); const remove = vi.fn(); const retry = vi.fn();
    render(<ComposerAttachmentStrip attachments={[{ id: 'q', name: 'queue.txt', status: 'queued' }, { id: 'u', name: 'upload.txt', status: 'uploading', progress: 150 }, { id: 's', name: 'done.txt', status: 'success' }, { id: 'e', name: 'error.txt', status: 'error' }]} onRemove={remove} onRetry={retry} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '100');
    await user.click(screen.getByRole('button', { name: 'Retry' })); expect(retry).toHaveBeenCalledWith('e');
    await user.click(screen.getByRole('button', { name: 'Remove upload.txt' })); expect(remove).toHaveBeenCalledWith('u');
    expect(screen.getByText('Uploading')).toBeInTheDocument(); expect(screen.getByText('Upload failed')).toBeInTheDocument();
  });
  it('disables absent callbacks and exposes parameterized busy state', () => {
    const { rerender } = render(<Composer value="draft" />);
    expect(screen.getByLabelText('Message')).toBeDisabled(); expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    rerender(<ComposerLoader effect="pulse" label="Processing files">Content</ComposerLoader>);
    expect(screen.getByRole('status')).toHaveTextContent('Processing files');
    rerender(<ComposerLoader busy={false}>Content</ComposerLoader>); expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

const questions: QuestionnaireQuestion[] = [
  { id: 'single', type: 'single', title: 'Choose one', required: true, options: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta', disabled: true }] },
  { id: 'multi', type: 'multi', title: 'Choose several', required: true, options: [{ id: 'x', label: 'Extra' }, { id: 'y', label: 'Other' }] },
  { id: 'text', type: 'text', title: 'Notes', required: true },
];
describe('questionnaire', () => {
  it('retains single, multi and text answers through backward navigation and submits only at the end', async () => {
    const user = userEvent.setup(); const submit = vi.fn(); render(<Questionnaire questions={questions} onSubmit={submit} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.click(screen.getByLabelText('Alpha')); await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByLabelText('Extra')); await user.click(screen.getByLabelText('Other')); await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.type(screen.getByLabelText('Notes'), 'Retained notes'); await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByLabelText('Extra')).toBeChecked(); expect(screen.getByLabelText('Other')).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Previous' })); expect(screen.getByLabelText('Alpha')).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Next' })); await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText('Notes')).toHaveValue('Retained notes'); await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect(submit).toHaveBeenCalledExactlyOnceWith({ single: 'a', multi: ['x', 'y'], text: 'Retained notes' });
  });
  it('honors controlled answers and step; keyboard shortcuts never capture text editing', () => {
    const change = vi.fn(); const stepChange = vi.fn();
    const { rerender } = render(<Questionnaire questions={questions} answers={{}} onAnswersChange={change} step={0} onStepChange={stepChange} />);
    fireEvent.keyDown(screen.getByRole('heading'), { key: '1' }); expect(change).toHaveBeenCalledWith({ single: 'a' }); expect(screen.getByLabelText('Alpha')).not.toBeChecked();
    rerender(<Questionnaire questions={questions} answers={{ single: 'a' }} step={0} onStepChange={stepChange} />);
    fireEvent.keyDown(screen.getByRole('heading'), { key: 'ArrowRight', altKey: true }); expect(stepChange).toHaveBeenCalledWith(1); expect(screen.getByRole('heading')).toHaveTextContent('Choose one');
    rerender(<Questionnaire questions={questions} step={2} onStepChange={stepChange} onAnswersChange={change} />); stepChange.mockClear();
    fireEvent.keyDown(screen.getByLabelText('Notes'), { key: 'ArrowLeft', altKey: true }); expect(stepChange).not.toHaveBeenCalled();
  });
});

it('updates local avatar controls and profile via callbacks, not a backend', async () => {
  const user = userEvent.setup(); const submit = vi.fn();
  function Harness() { const [value, setValue] = useState<AgentProfile>({ name: '', description: '', instructions: '', avatar: { shape: 'round', expression: 'calm', color: 'accent' } }); return <AgentCreator value={value} onChange={setValue} onSubmit={submit} />; }
  render(<Harness />); await user.type(screen.getByLabelText('Name'), 'Helper'); await user.selectOptions(screen.getByLabelText('Shape'), 'diamond'); await user.selectOptions(screen.getByLabelText('Expression'), 'focused'); await user.selectOptions(screen.getByLabelText('Color'), 'success'); await user.click(screen.getByRole('button', { name: 'Create agent' }));
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Helper', avatar: { shape: 'diamond', expression: 'focused', color: 'success' } }));
  expect(screen.getByRole('img', { name: 'Agent avatar' })).toBeInTheDocument();
});

it('shows real metric values, bounded progress and reduced-motion thinking variants', () => {
  const { rerender } = render(<><AgentLimitsCard limits={[{ id: 'tokens', label: 'Tokens', used: 23, limit: 100 }]} /><AgentProgress value={170} /></>);
  expect(screen.getByRole('meter')).toHaveAttribute('value', '23'); expect(screen.getByRole('progressbar')).toHaveAttribute('value', '100');
  for (const variant of ['wave', 'spin', 'stars', 'infinity'] as const) { rerender(<AgentThinking variant={variant} />); expect(screen.getByRole('status')).toHaveTextContent('Thinking'); expect(screen.getByRole('status').querySelector('.motion-reduce\\:animate-none')).not.toBeNull(); }
});

it('keeps notification tabs, reads and actions controlled until caller updates', async () => {
  const user = userEvent.setup(); const read = vi.fn(); const action = vi.fn(); const tab = vi.fn();
  render(<NotificationCenter tabs={[{ id: 'all', label: 'All' }, { id: 'unread', label: 'Only unread' }]} activeTabId="all" onTabChange={tab} items={[{ id: 'n', title: 'Notice', read: false, actions: [{ id: 'open', label: 'Open notice' }] }]} onReadChange={read} onAction={action} />);
  await user.click(screen.getByRole('button', { name: 'Only unread' })); expect(tab).toHaveBeenCalledWith('unread');
  await user.click(screen.getByRole('button', { name: 'Mark read' })); expect(read).toHaveBeenCalledWith('n', true); expect(screen.getByText('Unread')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Open notice' })); expect(action).toHaveBeenCalledWith('n', 'open'); expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
});

it('reveals task details only after controlled update and searches without fake results', async () => {
  const user = userEvent.setup(); const reveal = vi.fn(); const search = vi.fn(); const steps = [{ id: 's', title: 'Read files', status: 'active' as const, detail: 'Actual detail' }];
  const { rerender } = render(<TaskList steps={steps} revealedIds={[]} onRevealChange={reveal} />);
  expect(screen.getByText('Actual detail')).not.toBeVisible(); await user.click(screen.getByRole('button', { name: 'Show details' })); expect(reveal).toHaveBeenCalledWith(['s']);
  rerender(<TaskList steps={steps} revealedIds={['s']} onRevealChange={reveal} />); expect(screen.getByText('Actual detail')).toBeVisible();
  rerender(<SearchActivity query="needle" onSearch={search} sources={[{ id: 'local', label: 'Local files', status: 'error', detail: 'Caller error' }]} />);
  await user.click(screen.getByRole('button', { name: /^Search$/ })); expect(search).toHaveBeenCalledWith('needle'); expect(screen.queryByText(/results/)).not.toBeInTheDocument(); expect(screen.getByText('Caller error')).toBeInTheDocument();
});

it('provides auth slots, controlled carousel, presentational sidebar and existing stat cards', async () => {
  const user = userEvent.setup(); const slide = vi.fn(); const select = vi.fn();
  render(<><AuthCard title="Welcome" footer="Caller links">Caller form</AuthCard><AuthMediaCarousel slides={[{ id: 'a', title: 'First' }, { id: 'b', title: 'Second' }]} activeId="a" onActiveChange={slide} /><Sidebar items={[{ id: 'parent', label: 'Group', children: [{ id: 'child', label: 'Child' }] }]} activeId="child" onSelect={select} /><StatCards items={[{ id: 'metric', label: 'Count', value: 7 }]} /></>);
  await user.click(screen.getByRole('button', { name: 'Next' })); expect(slide).toHaveBeenCalledWith('b'); expect(screen.getByText('First')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Child' })); expect(select).toHaveBeenCalledWith('child'); expect(screen.getByRole('button', { name: 'Child' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByText('Caller form')).toBeInTheDocument(); expect(screen.getByRole('article')).toHaveTextContent('Count7');
});

it('renders settings sections through Modal with pending close lock', async () => {
  const user = userEvent.setup(); const close = vi.fn(); const section = vi.fn(); const sections = [{ id: 'a', label: 'General', content: 'General controls' }, { id: 'b', label: 'Advanced', content: 'Advanced controls' }];
  const { rerender } = render(<SettingsDialog open onClose={close} sections={sections} activeSectionId="a" onSectionChange={section} />);
  const dialog = screen.getByRole('dialog'); expect(within(dialog).getByText('General controls')).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Advanced' })); expect(section).toHaveBeenCalledWith('b'); expect(screen.queryByText('Advanced controls')).not.toBeInTheDocument();
  rerender(<SettingsDialog open onClose={close} sections={sections} activeSectionId="b" onSectionChange={section} pending />); await user.keyboard('{Escape}'); expect(close).not.toHaveBeenCalled();
});

it('switches built-in labels to Chinese without resetting drafts or translating caller content', () => {
  render(<><Composer value="retained" onChange={() => {}} models={[{ id: 'raw', label: 'Name', provider: 'Message' }]} modelId="raw" /><AgentThinking label="Thinking" /><AuthCard title="Name">Message</AuthCard></>);
  expect(screen.getByLabelText('Message')).toHaveValue('retained');
  expect(screen.getByRole('button', { name: 'Select model' })).toHaveTextContent('Name');
  act(() => { setLocale('zh-CN'); });
  expect(screen.getByLabelText(compositeMessages.Message)).toHaveValue('retained');
  expect(screen.getByRole('button', { name: compositeMessages.Send })).toBeDisabled();
  expect(screen.getByRole('button', { name: compositeMessages['Select model'] })).toHaveTextContent('Name');
  expect(screen.getByRole('status')).toHaveTextContent('Thinking');
  expect(screen.getByRole('heading', { name: 'Name' })).toBeInTheDocument();
  expect(screen.getByText('Message')).toBeInTheDocument();
  act(() => { setLocale('en'); });
  expect(screen.getByLabelText('Message')).toHaveValue('retained');
});
