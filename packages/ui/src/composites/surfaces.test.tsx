// Author: yunnuo <ymz@ebox.vip>
// Description: Surface constraints and disabled settings content preserve safe presentation contracts.
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AuthCard, SettingsDialog, Sidebar } from './surfaces';

it('constrains authentication forms without media and expands only the two-column variant', () => {
  const view = render(<AuthCard title="Sign in"><input aria-label="Name" /></AuthCard>);
  expect(view.container.firstElementChild).toHaveClass('max-w-md');
  view.rerender(<AuthCard title="Sign in" media={<p>Product details</p>}><input aria-label="Name" /></AuthCard>);
  expect(view.container.firstElementChild).toHaveClass('max-w-4xl', 'md:grid-cols-2');
});

it('does not render a disabled active settings section', () => {
  render(<SettingsDialog open title="Settings" onClose={() => {}} activeSectionId="locked" sections={[{ id: 'locked', label: 'Locked', content: 'Unavailable content', disabled: true }]} />);
  expect(screen.getByRole('button', { name: 'Locked' })).toBeDisabled();
  expect(screen.queryByText('Unavailable content')).not.toBeInTheDocument();
});

it('propagates disabled navigation groups to nested actions', () => {
  render(<Sidebar onSelect={() => {}} items={[{ id: 'group', label: 'Group', disabled: true, children: [{ id: 'child', label: 'Child' }] }]} />);
  expect(screen.getByRole('button', { name: 'Child' })).toBeDisabled();
});
