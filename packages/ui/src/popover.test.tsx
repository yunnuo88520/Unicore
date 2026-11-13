// Author: yunnuo <ymz@ebox.vip>
// Description: Popover content surface.
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

it('renders anchored content inside a portal', () => {
  const { container } = render(<Popover open><PopoverTrigger>打开</PopoverTrigger><PopoverContent>面板</PopoverContent></Popover>);
  const panel = screen.getByText('面板');
  expect(document.body).toContainElement(panel);
  expect(container).not.toContainElement(panel);
});
