// Author: yunnuo <ymz@ebox.vip>
// Description: Smoke coverage for badge, card, misc, table and tooltip primitives.
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Badge, badgeVariants } from './badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Avatar, Progress, Separator, Skeleton } from './misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';
import { Tooltip } from './tooltip';

it('badge variants resolve through exported cva', () => {
  render(<Badge variant="danger">故障</Badge>);
  expect(screen.getByText('故障').className).toBe(badgeVariants({ variant: 'danger' }));
});

it('card composes header, title, description and content', () => {
  render(<Card><CardHeader><CardTitle>标题</CardTitle><CardDescription>说明</CardDescription></CardHeader><CardContent>正文</CardContent></Card>);
  expect(screen.getByText('标题')).toBeInTheDocument();
  expect(screen.getByText('正文')).toBeInTheDocument();
});

it('misc primitives expose progress semantics and skeleton placeholder', () => {
  render(<>
    <Progress value={40} aria-label="进度" />
    <Skeleton data-testid="skeleton" />
    <Avatar initials="云" data-testid="avatar" />
    <Separator data-testid="separator" />
  </>);
  expect(screen.getByRole('progressbar', { name: '进度' })).toBeInTheDocument();
  expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  expect(screen.getByTestId('avatar')).toHaveTextContent('云');
  expect(screen.getByTestId('separator')).toBeInTheDocument();
});

it('table renders header scope and body cells', () => {
  render(<Table><TableHeader><TableRow><TableHead>名称</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>值</TableCell></TableRow></TableBody></Table>);
  expect(screen.getByRole('columnheader', { name: '名称' })).toHaveAttribute('scope', 'col');
  expect(screen.getByRole('cell', { name: '值' })).toBeInTheDocument();
});

it('tooltip renders its labelled trigger', () => {
  render(<Tooltip label="帮助说明"><button>图标</button></Tooltip>);
  expect(screen.getByRole('button', { name: '图标' })).toBeInTheDocument();
});
