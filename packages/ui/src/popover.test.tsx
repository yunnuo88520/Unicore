// Author: yunnuo <ymz@ebox.vip>
// Description: Popover content surface.
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

it('renders anchored content inside a portal', () => {
  render(<Popover open><PopoverTrigger>打开</PopoverTrigger><PopoverContent>面板</PopoverContent></Popover>);
  expect(screen.getByText('面板')).toBeInTheDocument();
  expect(screen.getByText('面板').className).toContain('rounded-lg');
});
