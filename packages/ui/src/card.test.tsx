// Author: yunnuo <ymz@ebox.vip>
// Description: Card surface, composition parts and the asChild slot for link tiles.
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { expect, it } from 'vitest';
import { Card, CardContent, CardTitle } from './card';

it('renders a plain div surface with the token classes', () => {
  render(<Card data-testid="card" className="extra">内容</Card>);
  const card = screen.getByTestId('card');
  expect(card.tagName).toBe('DIV');
  expect(card.className).toContain('rounded-xl');
  expect(card.className).toContain('extra');
});

it('asChild merges the surface classes into the child element', () => {
  render(<Card asChild><a href="/notes" data-testid="link">前往</a></Card>);
  const link = screen.getByTestId('link');
  expect(link.tagName).toBe('A');
  expect(link.className).toContain('rounded-xl');
  expect(link.className).toContain('shadow-card');
  expect(screen.getByText('前往').closest('div[data-testid]')).toBeNull();
});

it('forwards refs to the surface element', () => {
  const ref = createRef<HTMLDivElement>();
  render(<Card ref={ref} data-testid="card" />);
  expect(ref.current).toBeInstanceOf(HTMLDivElement);
});

it('composes header, title and content parts', () => {
  render(<Card><CardTitle>标题</CardTitle><CardContent>正文</CardContent></Card>);
  expect(screen.getByRole('heading', { name: '标题' }).tagName).toBe('H2');
  expect(screen.getByText('正文').className).toContain('p-5');
});
