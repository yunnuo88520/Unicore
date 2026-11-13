// Author: yunnuo <ymz@ebox.vip>
// Description: Questionnaire rejects stale choices and moves focus only after actual step changes.
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Questionnaire, type QuestionnaireQuestion } from './questionnaire';

const questions: QuestionnaireQuestion[] = [
  { id: 'first', title: 'First question', type: 'single', required: true, options: [{ id: 'yes', label: 'Yes' }] },
  { id: 'second', title: 'Second question', type: 'text' },
];

it('focuses the new heading after an uncontrolled navigation', () => {
  render(<Questionnaire questions={questions} defaultAnswers={{ first: 'yes' }} />);
  fireEvent.submit(screen.getByRole('heading', { name: 'First question' }).closest('form')!);
  expect(screen.getByRole('heading', { name: 'Second question' })).toHaveFocus();
});

it('does not move focus on a rejected controlled navigation request', () => {
  const onStepChange = vi.fn();
  const view = render(<Questionnaire questions={questions} step={0} onStepChange={onStepChange} answers={{ first: 'yes' }} />);
  const button = screen.getAllByRole('button').at(-1)!;
  button.focus();
  fireEvent.submit(button.closest('form')!);
  expect(onStepChange).toHaveBeenCalledWith(1);
  expect(button).toHaveFocus();
  view.rerender(<Questionnaire questions={questions} step={1} onStepChange={onStepChange} answers={{ first: 'yes' }} />);
  expect(screen.getByRole('heading', { name: 'Second question' })).toHaveFocus();
});

it.each(['single', 'multi'] as const)('does not submit stale optional %s answers', type => {
  const onSubmit = vi.fn();
  render(<Questionnaire questions={[{ id: 'choice', title: 'Choice', type, options: [{ id: 'yes', label: 'Yes' }, { id: 'locked', label: 'Locked', disabled: true }] }]} defaultAnswers={{ choice: type === 'single' ? 'missing' : ['yes', 'locked'] }} onSubmit={onSubmit} />);
  fireEvent.submit(screen.getByRole('heading', { name: 'Choice' }).closest('form')!);
  expect(onSubmit).not.toHaveBeenCalled();
});

it('normalizes nonfinite and fractional steps without rendering an empty questionnaire', () => {
  const view = render(<Questionnaire questions={questions} step={NaN} />);
  expect(screen.getByRole('heading', { name: 'First question' })).toBeInTheDocument();
  view.rerender(<Questionnaire questions={questions} step={1.5} />);
  expect(screen.getByRole('heading', { name: 'Second question' })).toBeInTheDocument();
});
