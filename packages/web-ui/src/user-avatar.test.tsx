/** Author: yunnuo <ymz@ebox.vip>
 * Description: The shared avatar keeps a visible fallback: profile image when present, initial-letter circle otherwise, and the display chain prefers the nickname.
 */
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { UserAvatar, displayLabel, userInitial } from './user-avatar';

it('derives the initial from the first code point, whole for CJK', () => {
  expect(userInitial('陈小明')).toBe('陈');
  expect(userInitial('alice')).toBe('A');
  expect(userInitial('  bob ')).toBe('B');
  expect(userInitial('')).toBe('?');
  expect(userInitial(undefined)).toBe('?');
});

it('prefers the nickname and falls back to the username', () => {
  expect(displayLabel('小陈', 'member')).toBe('小陈');
  expect(displayLabel('  ', 'member')).toBe('member');
  expect(displayLabel(undefined, 'member')).toBe('member');
  expect(displayLabel('', '')).toBe('');
});

it('renders the image when a URL resolves and the initial circle otherwise', () => {
  const { container, rerender } = render(<UserAvatar name="member" url="https://example.test/a.png" />);
  expect(container.querySelector('img')).toBeTruthy();
  rerender(<UserAvatar name="member" />);
  expect(screen.getByText('M')).toBeTruthy();
  expect(container.querySelector('img')).toBeNull();
});
