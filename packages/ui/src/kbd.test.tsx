// Author: yunnuo <ymz@ebox.vip>
// Description: Keycap styling.
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Kbd } from './kbd';

it('renders a mono keycap', () => {
  render(<Kbd>⌘K</Kbd>);
  expect(screen.getByText('⌘K').tagName).toBe('KBD');
  expect(screen.getByText('⌘K').className).toContain('font-mono');
});
