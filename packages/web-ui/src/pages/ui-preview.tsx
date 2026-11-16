// Author: yunnuo <ymz@ebox.vip>
// Description: DEV-only lazy component catalog; host router gates this module behind import.meta.env.DEV.
import { lazy, Suspense, useState } from 'react';
import { Button, Input, Label, PageHeader } from '@unicore/ui';
import { defineMessages, t, useLocale } from '../i18n';
import type { PageProps } from '../router';
import { catalogItems } from './ui-preview/catalog';
const Foundations = lazy(() => import('./ui-preview/foundations'));
const Base = lazy(() => import('./ui-preview/base'));
const Charts = lazy(() => import('./ui-preview/charts'));
const Composites = lazy(() => import('./ui-preview/composites'));
const Grid = lazy(() => import('./ui-preview/grid'));
const categories = defineMessages([
  { id: 'foundations', label: '基础样式' }, { id: 'base', label: '基础组件' }, { id: 'chart', label: '图表' }, { id: 'composite', label: '复合组件' }, { id: 'data-grid', label: '数据网格' },
] as const);
type Category = typeof categories[number]['id'];
export function UiPreviewPage(_: PageProps) {
  useLocale(); const [category, setCategory] = useState<Category>('composite'); const [query, setQuery] = useState('');
  const entries = catalogItems.filter(item => (category === 'foundations' || item.category === category) && item.id.includes(query.toLowerCase()));
  return <div id="catalog-top" className="flex min-w-0 flex-col gap-6">
    <PageHeader title={t('组件预览')} description={t('合成示例：仅修改本页内存状态，不连接服务。')} />
    <nav aria-label={t('组件分类')} className="flex flex-wrap gap-2">{categories.map(item => <Button key={item.id} data-testid={`catalog-category-${item.id}`} variant={category === item.id ? 'primary' : 'secondary'} aria-pressed={category === item.id} onClick={() => { setCategory(item.id); setQuery(''); }}>{t(item.label)}{item.id !== 'foundations' && ` (${catalogItems.filter(entry => entry.category === item.id).length})`}</Button>)}</nav>
    <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer text-sm font-medium text-ink">{t('查找组件与实现名称')}</summary><div className="mt-3 space-y-3"><Label htmlFor="catalog-search">{t('搜索组件 ID')}</Label><Input id="catalog-search" value={query} onChange={event => setQuery(event.target.value)} /><ul className="flex max-h-64 flex-wrap gap-2 overflow-auto">{entries.map(item => <li key={`${item.family}-${item.id}`}><Button size="sm" variant="ghost" title={item.implementation} onClick={() => { setCategory(item.category); setQuery(''); window.setTimeout(() => document.getElementById(`sample-${item.id}`)?.scrollIntoView({ block: 'start' }), 250); }}>{item.id}</Button></li>)}</ul></div></details>
    <Suspense fallback={<p role="status">{t('等待中')}</p>}>
      {category === 'foundations' && <Foundations />}{category === 'base' && <Base />}{category === 'chart' && <Charts />}{category === 'composite' && <Composites />}{category === 'data-grid' && <Grid />}
    </Suspense>
  </div>;
}
