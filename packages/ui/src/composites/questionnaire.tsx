// Author: yunnuo <ymz@ebox.vip>
// Description: Linear questionnaire with retained answers and explicit controlled/uncontrolled state.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from '../button';
import { Label, Textarea } from '../input';
import { cn } from '../cn';
import { useLocale } from '../i18n';
import { compositeT as t } from './messages';

export interface QuestionnaireOption { id: string; label: ReactNode; disabled?: boolean }
export type QuestionnaireQuestion = { id: string; title: ReactNode; description?: ReactNode; required?: boolean } & ({ type: 'single' | 'multi'; options: QuestionnaireOption[] } | { type: 'text'; placeholder?: string });
export type QuestionnaireAnswers = Record<string, string | string[]>;
export interface QuestionnaireProps {
  questions: QuestionnaireQuestion[]; answers?: QuestionnaireAnswers; defaultAnswers?: QuestionnaireAnswers; onAnswersChange?: (answers: QuestionnaireAnswers) => void;
  step?: number; defaultStep?: number; onStepChange?: (step: number) => void; onSubmit?: (answers: QuestionnaireAnswers) => void;
  disabled?: boolean; keyboardShortcuts?: boolean; className?: string;
}
/** Alt+Left/Right navigates; 1–9 selects choices outside editable fields. Native radios/checkboxes retain their keyboard behavior. */
export function Questionnaire({ questions, answers, defaultAnswers = {}, onAnswersChange, step, defaultStep = 0, onStepChange, onSubmit, disabled, keyboardShortcuts = true, className }: QuestionnaireProps) {
  useLocale(); const id = useId(); const heading = useRef<HTMLHeadingElement>(null);
  const [localAnswers, setLocalAnswers] = useState(defaultAnswers); const [localStep, setLocalStep] = useState(defaultStep);
  const requestedStep = step ?? localStep;
  const currentAnswers = answers ?? localAnswers; const currentStep = Math.max(0, Math.min(questions.length - 1, Number.isFinite(requestedStep) ? Math.trunc(requestedStep) : 0)); const question = questions[currentStep];
  const previousQuestion = useRef(question?.id);
  useEffect(() => {
    if (previousQuestion.current !== question?.id) heading.current?.focus();
    previousQuestion.current = question?.id;
  }, [question?.id]);
  const answer = question ? currentAnswers[question.id] : undefined;
  const valid = (item: QuestionnaireQuestion) => {
    const value = currentAnswers[item.id];
    const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
    if (empty) return !item.required;
    if (item.type === 'text') return typeof value === 'string' && (!item.required || !!value.trim());
    if (item.type === 'single') return typeof value === 'string' && item.options.some(option => option.id === value && !option.disabled);
    return Array.isArray(value) && value.every(valueId => item.options.some(option => option.id === valueId && !option.disabled));
  };
  const canEdit = !disabled && (answers === undefined || !!onAnswersChange);
  const canNavigate = !disabled && (step === undefined || !!onStepChange);
  const setAnswer = (value: string | string[]) => { if (!question || !canEdit) return; const next = { ...currentAnswers, [question.id]: value }; if (answers === undefined) setLocalAnswers(next); onAnswersChange?.(next); };
  const navigate = (next: number) => { if (!canNavigate || next < 0 || next >= questions.length) return; if (step === undefined) setLocalStep(next); onStepChange?.(next); };
  const choose = (option: QuestionnaireOption) => {
    if (!question || question.type === 'text' || option.disabled) return;
    if (question.type === 'single') setAnswer(option.id);
    else { const values = Array.isArray(answer) ? answer : []; setAnswer(values.includes(option.id) ? values.filter(value => value !== option.id) : [...values, option.id]); }
  };
  const shortcuts = (event: KeyboardEvent<HTMLFormElement>) => {
    if (!keyboardShortcuts || disabled || event.nativeEvent.isComposing || event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    if (target.closest('textarea, input:not([type="radio"]):not([type="checkbox"]), select, [contenteditable="true"]')) return;
    if (event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); navigate(currentStep - 1); }
    else if (event.altKey && event.key === 'ArrowRight' && question && valid(question)) { event.preventDefault(); navigate(currentStep + 1); }
    else if (!event.altKey && !event.ctrlKey && !event.metaKey && /^[1-9]$/.test(event.key) && question && question.type !== 'text') { const option = question.options[Number(event.key) - 1]; if (option && canEdit && !option.disabled) { event.preventDefault(); choose(option); } }
  };
  return <form className={cn('flex w-full max-w-xl flex-col gap-4 rounded-2xl bg-surface-soft p-5 text-ink', className)} onKeyDown={shortcuts} onSubmit={event => { event.preventDefault(); event.stopPropagation(); if (!disabled && question && valid(question)) { if (currentStep < questions.length - 1) navigate(currentStep + 1); else if (questions.every(valid)) onSubmit?.(currentAnswers); } }}>
    {question ? <><p className="text-xs text-muted">{t('Step {{current}} of {{total}}', { current: currentStep + 1, total: questions.length })}</p><h3 id={`${id}-title`} ref={heading} tabIndex={-1} className="text-lg font-medium outline-none focus-visible:ring-2 focus-visible:ring-focus">{question.title}</h3>{question.description && <div id={`${id}-description`} className="text-sm text-muted">{question.description}</div>}
      {question.type === 'text' ? <div className="pt-2"><Textarea label={question.title} id={`${id}-answer`} value={typeof answer === 'string' ? answer : ''} placeholder={question.placeholder} required={question.required} disabled={!canEdit} onChange={event => setAnswer(event.target.value)} /></div> : <fieldset disabled={!canEdit} aria-labelledby={`${id}-title`} aria-describedby={question.description ? `${id}-description` : undefined} className="flex flex-col gap-2">{question.options.map((option, index) => <Label key={option.id} htmlFor={`${id}-option-${index}`} className="flex items-center gap-2 rounded-lg border border-transparent bg-field p-3 transition-colors hover:border-line-strong has-checked:border-primary-line has-checked:bg-primary-soft"><input id={`${id}-option-${index}`} name={`${id}-${question.id}`} type={question.type === 'single' ? 'radio' : 'checkbox'} className="size-4 shrink-0 accent-accent outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-55" checked={question.type === 'single' ? answer === option.id : Array.isArray(answer) && answer.includes(option.id)} disabled={option.disabled} onChange={() => choose(option)} />{option.label}</Label>)}</fieldset>}
      <div className="flex justify-between gap-2"><Button variant="secondary" disabled={!canNavigate || currentStep === 0} onClick={() => navigate(currentStep - 1)}>{t('Previous')}</Button><Button type="submit" disabled={disabled || !valid(question) || (currentStep === questions.length - 1 ? !onSubmit || !questions.every(valid) : !canNavigate)}>{currentStep === questions.length - 1 ? t('Submit answers') : t('Next')}</Button></div>
    </> : <p className="text-sm text-muted">{t('No questions')}</p>}
  </form>;
}
