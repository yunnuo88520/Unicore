// Author: yunnuo <ymz@ebox.vip>
// Description: Brand token and typography specimens with locally interactive supporting components.
import { useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, CardContent, CardFooter, EmptyState, Kbd, StatCard } from '@unicore/ui';
import { t, useLocale } from '../../i18n';
import { Sample } from './frame';
export default function FoundationsSection() {
  useLocale(); const [count, setCount] = useState(0); const [note, setNote] = useState(false);
  return <div className="grid min-w-0 gap-8 lg:grid-cols-2">
    <Sample id="color"><div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
      <div className="rounded-lg border border-line bg-surface p-5 text-ink"><span className="mb-3 block text-2xl font-semibold">Aa</span><code className="text-xs">surface / ink</code></div>
      <div className="rounded-lg bg-accent-soft p-5 text-accent"><span className="mb-3 block text-2xl font-semibold">Aa</span><code className="text-xs">accent / soft</code></div>
      <div className="rounded-lg bg-surface-alt p-5 text-muted"><span className="mb-3 block text-2xl font-semibold">Aa</span><code className="text-xs">surface-alt / muted</code></div>
    </div></Sample>
    <Sample id="typography"><div className="space-y-5 rounded-xl border border-line bg-surface p-6">
      <p className="text-4xl font-semibold tracking-tight text-ink">Aa 0123</p><p className="text-xl font-semibold text-ink">{t('标题')}</p><p className="max-w-prose text-sm leading-7 text-ink">{t('对话框正文文案，用于检查排版与按钮顺序。')}</p><p className="text-xs text-muted">{t('占位文本')}</p>
      <p className="flex items-center gap-2 border-t border-line pt-5 text-sm text-muted">{t('快捷键')} <Kbd>⌘</Kbd><Kbd>K</Kbd></p>
    </div></Sample>
    <Card><CardHeader><CardTitle>{t('卡片与页头')}</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-xl font-semibold">Aa 0123</p><p className="text-sm text-muted">{t('对话框正文文案，用于检查排版与按钮顺序。')}</p><dl><dt className="text-xs text-muted">{t('本地交互次数')}</dt><dd aria-live="polite" className="text-3xl font-semibold tabular-nums">{count}</dd></dl></CardContent><CardFooter><Button variant="secondary" size="sm" onClick={() => setCount(count + 1)}>{t('增加')}</Button><Button size="sm" onClick={() => setCount(0)}>{t('重置')}</Button></CardFooter></Card>
    <div className="min-w-0">{note ? <div className="space-y-3"><StatCard label={t('草稿')} value="01" detail={t('本地示例记录')} /><Button variant="secondary" size="sm" onClick={() => setNote(false)}>{t('重置')}</Button></div> : <EmptyState icon={NotebookPen} title={t('暂无数据')} description={t('本地选择示例')} action={<Button variant="secondary" onClick={() => setNote(true)}>{t('新建笔记')}</Button>} />}</div>
  </div>;
}
