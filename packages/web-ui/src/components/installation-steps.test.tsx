// Author: yunnuo <ymz@ebox.vip>
// Description: Installation progress preserves step names and current state for variable-length flows.
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { InstallationSteps } from './installation-steps';

it.each([4, 5, 6])('labels the current step in a %i-step flow', count => {
  const steps = Array.from({ length: count }, (_, index) => ({ id: String(index), label: `Step ${index + 1}` }));
  const { container, rerender } = render(<InstallationSteps steps={steps} current={2} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(count);
  expect(container.querySelector('[aria-current="step"]')).toHaveTextContent('Step 3');
  expect(screen.getByText(`第 3 步，共 ${count} 步`)).toBeInTheDocument();
  rerender(<InstallationSteps steps={steps} current={count - 1} />);
  expect(container.querySelector('[aria-current="step"]')).toHaveTextContent(`Step ${count}`);
});
