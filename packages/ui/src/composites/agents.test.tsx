// Author: yunnuo <ymz@ebox.vip>
// Description: Agent profile, original avatar choices, real progress and controlled details regressions.
import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { currentLocale, setLocale, setTranslator } from '../i18n';
import { compositeMessages } from './messages';
import { agentActivityMessages } from './agent-activity.messages';
import { AgentAvatarPreview, AgentCreator, AgentLimitsCard, AgentProgress, type AgentAvatarShape, type AgentProfile } from './agents';

beforeEach(() => {
  setLocale('en');
  const english = new Map(Object.entries({ ...compositeMessages, ...agentActivityMessages }).map(([key, source]) => [source, key]));
  setTranslator(value => currentLocale() === 'en' ? english.get(value) ?? value : value);
});
afterEach(() => { setTranslator(value => value); setLocale('zh-CN'); });
const profile: AgentProfile = { name: 'Helper', description: 'Caller description', instructions: 'Caller instructions', avatar: { shape: 'round', expression: 'calm', color: 'accent' } };

it('offers additive original shapes and expressions and previews controlled changes before submitting', async () => {
  const user = userEvent.setup(); const submit = vi.fn();
  function Harness() { const [value, setValue] = useState(profile); return <AgentCreator value={value} onChange={setValue} onSubmit={submit} />; }
  render(<Harness />);
  expect(screen.getAllByRole('option').filter(option => ['round', 'square', 'diamond', 'squircle', 'capsule', 'star', 'flower', 'shield'].includes(option.getAttribute('value') ?? ''))).toHaveLength(8);
  await user.selectOptions(screen.getByLabelText('Shape'), 'flower'); await user.selectOptions(screen.getByLabelText('Expression'), 'wink');
  await user.clear(screen.getByLabelText('Name')); await user.type(screen.getByLabelText('Name'), 'Local helper');
  expect(screen.getByRole('complementary', { name: 'Profile preview' })).toHaveTextContent('Local helper');
  await user.click(screen.getByRole('button', { name: 'Create agent' }));
  expect(submit).toHaveBeenCalledWith({ ...profile, name: 'Local helper', avatar: { ...profile.avatar, shape: 'flower', expression: 'wink' } });
});

it('keeps compact creator width by default and only opts into a split profile explicitly', () => {
  const { rerender } = render(<AgentCreator value={profile} />);
  const form = screen.getByLabelText('Name').closest('form')!;
  expect(form).toHaveClass('max-w-xl'); expect(form).not.toHaveClass('md:grid-cols-[minmax(0,1fr)_15rem]');
  rerender(<AgentCreator value={profile} layout="split" />);
  expect(form).toHaveClass('max-w-3xl', 'md:grid-cols-[minmax(0,1fr)_15rem]');
});

it('renders every shape as local SVG with an accessible caller label and no image requests', () => {
  const { rerender } = render(<AgentAvatarPreview value={profile.avatar} label="Caller avatar" />);
  for (const shape of ['round', 'square', 'diamond', 'squircle', 'capsule', 'star', 'flower', 'shield'] as AgentAvatarShape[]) {
    rerender(<AgentAvatarPreview value={{ ...profile.avatar, shape }} label="Caller avatar" />);
    const image = screen.getByRole('img', { name: 'Caller avatar' });
    expect(image.querySelector('image')).toBeNull(); expect(image.querySelector('circle, rect, path')).not.toBeNull();
  }
});

it('does not mutate profile without a controlled rerender, disables absent callbacks and locks native preference slots', async () => {
  const user = userEvent.setup(); const change = vi.fn(); const submit = vi.fn();
  const { rerender } = render(<AgentCreator value={profile} onChange={change} onSubmit={submit} />);
  await user.selectOptions(screen.getByLabelText('Shape'), 'shield'); expect(change).toHaveBeenCalledWith({ ...profile, avatar: { ...profile.avatar, shape: 'shield' } });
  expect(screen.getByLabelText('Shape')).toHaveValue('round');
  rerender(<AgentCreator value={profile} onSubmit={submit} pending localeSlot={<label>Caller language<input /></label>} voiceSlot={<label>Caller voice<select><option>Caller option</option></select></label>} preferencesSlot={<label>Caller preference<input type="checkbox" /></label>} />);
  for (const name of ['Name', 'Shape', 'Caller language', 'Caller voice', 'Caller preference']) expect(screen.getByLabelText(name)).toBeDisabled();
  fireEvent.submit(screen.getByRole('button', { name: 'Create agent' }).closest('form')!); expect(submit).not.toHaveBeenCalled();
  rerender(<AgentCreator value={{ ...profile, name: '   ' }} onSubmit={submit} />); expect(screen.getByRole('button', { name: 'Create agent' })).toBeDisabled();
  expect(screen.queryByRole('group', { name: 'Voice' })).not.toBeInTheDocument();
});

it('treats nonfinite percentages as indeterminate and preserves finite bounded percentage API', () => {
  const { rerender } = render(<AgentProgress value={NaN} label={<strong>Caller progress</strong>} detail="Caller detail" />);
  for (const value of [NaN, Infinity, -Infinity, undefined]) {
    rerender(<AgentProgress value={value} label={<strong>Caller progress</strong>} detail="Caller detail" />);
    expect(screen.getByRole('progressbar', { name: 'Caller progress' })).not.toHaveAttribute('value');
    expect(screen.getByRole('progressbar')).toHaveAccessibleDescription('Caller detail');
  }
  for (const [input, output] of [[-1, 0], [140, 100], [24.5, 24.5]]) { rerender(<AgentProgress value={input} />); expect(screen.getByRole('progressbar')).toHaveAttribute('value', String(output)); }
});

it('supports keyboard controlled step details without deriving a fabricated percentage', async () => {
  const user = userEvent.setup(); const reveal = vi.fn(); const steps = [{ id: 'actual', title: 'Actual step', status: 'active' as const, detail: 'Caller evidence' }];
  const { rerender } = render(<AgentProgress steps={steps} revealedIds={[]} onRevealChange={reveal} />);
  expect(screen.getByRole('progressbar')).not.toHaveAttribute('value'); expect(screen.getByText('Caller evidence')).not.toBeVisible();
  await user.tab(); await user.keyboard('{Enter}'); expect(reveal).toHaveBeenCalledWith(['actual']); expect(screen.getByText('Caller evidence')).not.toBeVisible();
  rerender(<AgentProgress value={40} steps={steps} revealedIds={['actual']} onRevealChange={reveal} />);
  expect(screen.getByText('Caller evidence')).toBeVisible(); expect(screen.getByRole('progressbar')).toHaveAttribute('value', '40');
});

it('never puts NaN, infinity or an invented denominator in usage meters', () => {
  render(<AgentLimitsCard limits={[{ id: 'nan', label: 'Unknown', used: NaN, limit: Infinity }, { id: 'zero', label: 'Disabled quota', used: 0, limit: 0 }, { id: 'over', label: 'Over quota', used: 25, limit: 10 }]} />);
  expect(screen.getAllByRole('meter')).toHaveLength(1); expect(screen.getByRole('meter', { name: 'Over quota' })).toHaveAttribute('value', '10');
  expect(screen.getByText('25 / 10')).toBeInTheDocument(); expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument();
});

it('switches added source labels without translating caller content or resetting fields', () => {
  render(<AgentCreator value={profile} onChange={() => {}} />);
  act(() => { setLocale('zh-CN'); });
  expect(screen.getByRole('complementary', { name: '资料预览' })).toHaveTextContent('Caller description');
  expect(screen.getByLabelText('名称')).toHaveValue('Helper'); expect(screen.getByRole('option', { name: '花瓣形' })).toBeInTheDocument();
});
