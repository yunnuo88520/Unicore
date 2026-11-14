// Author: yunnuo <ymz@ebox.vip>
// Description: Service-free composite scenarios; callbacks mutate only explicit synthetic state.
import { useState, type ReactNode } from 'react';
import { Button, Input, Label } from '@unicore/ui';
import * as C from '@unicore/ui/composites';
import { EventCalendar } from '@unicore/ui/calendar';
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import { DataTable } from '../../components/data-table';
import { t, useLocale } from '../../i18n';
import { compositeIds, type CompositeId } from './catalog';
import { Sample, Feedback } from './frame';
const features = tableFeatures({});
type Row = { name: string; count: number };
const helper = createColumnHelper<typeof features, Row>();
function TableDemo() {
  const [state, setState] = useState('ready');
  const columns = helper.columns([helper.accessor('name', { header: () => t('名称'), cell: info => info.getValue() }), helper.accessor('count', { header: () => t('数量'), cell: info => String(info.getValue()) })]);
  const table = useTable({ features, columns, data: state === 'empty' ? [] : [{ name: 'sample-01', count: 12 }, { name: 'sample-02', count: 24 }] });
  return <><div className="flex flex-wrap gap-2">{['ready','pending','error','empty'].map(value => <Button key={value} size="sm" variant={state === value ? 'primary' : 'secondary'} onClick={() => setState(value)}>{value}</Button>)}</div><DataTable table={table} pending={state === 'pending'} error={state === 'error' ? { message: t('合成错误，重试恢复示例数据。') } : null} onRetry={() => setState('ready')} /></>;
}
export function CompositeDemo({ id }: { id: Exclude<CompositeId, 'data-grid'> }) {
  const locale = useLocale(); const [text, setText] = useState(''); const [result, setResult] = useState(''); const [flag, setFlag] = useState(false); const [selected, setSelected] = useState('one'); const [ids, setIds] = useState<string[]>([]); const [month, setMonth] = useState('2026-11-01'); const [step, setStep] = useState(0); const [answers, setAnswers] = useState<C.QuestionnaireAnswers>({});
  const [profile, setProfile] = useState<C.AgentProfile>({ name: 'sample-agent', description: '', instructions: '', avatar: { shape: 'round', expression: 'smile', color: 'accent' } });
  const [attachments, setAttachments] = useState<C.ComposerAttachment[]>([{ id: 'a', name: 'sample.txt', status: 'error' }, { id: 'b', name: 'local.csv', status: 'success' }]);
  const remove = (id: string) => setAttachments(items => items.filter(item => item.id !== id));
  const retry = (id: string) => setAttachments(items => items.map(item => item.id === id ? { ...item, status: 'success', detail: t('仅切换合成状态，未上传。') } : item));
  const [model, setModel] = useState('one'); const [effort, setEffort] = useState('quick'); const [permission, setPermission] = useState('one');
  const panel = { models: [{ id: 'one', label: t('轻量模型'), provider: t('本地') }, { id: 'two', label: t('推理模型'), provider: t('本地') }], modelId: model, onModelChange: setModel, effort, effortOptions: [{ id: 'quick', label: t('快速') }, { id: 'thorough', label: t('深入') }], onEffortChange: setEffort, permissionOptions: [{ id: 'one', label: t('只读') }, { id: 'two', label: t('编辑') }], permissionId: permission, onPermissionChange: setPermission };
  const submitDraft = (value: string) => { setResult(value); setText(''); };
  let demo: ReactNode;
  switch (id) {
    case 'agent-creator': demo = <C.AgentCreator value={profile} onChange={setProfile} onSubmit={value => setResult(JSON.stringify(value))} />; break;
    case 'agent-limits-card': demo = <C.AgentLimitsCard title={t('合成配额')} limits={[{ id: 'one', label: t('数量'), used: 12, limit: 20 }, { id: 'two', label: t('进度'), used: 4, limit: 10 }]} />; break;
    case 'agent-progress': demo = <><C.AgentProgress value={flag ? 100 : 35} label={t('进度')} detail={t('本地选择示例')} steps={[{ id: 'prepare', title: t('概览'), status: 'success' }, { id: 'review', title: t('明细'), status: flag ? 'success' : 'active', detail: t('仅切换合成状态，未上传。') }]} revealedIds={ids} onRevealChange={setIds} /><Button onClick={() => setFlag(!flag)}>{t('切换示例状态')}</Button></>; break;
    case 'agent-thinking': demo = <div className="flex flex-wrap gap-6">{(['wave','spin','stars','infinity'] as const).map(variant => <C.AgentThinking key={variant} variant={variant} label={variant} />)}</div>; break;
    case 'auth-card': demo = <><C.AuthCard title={t('本地表单示例')} description={t('不会登录或创建账号。')}><form className="space-y-3" onSubmit={event => { event.preventDefault(); setResult(text); }}><Label htmlFor="preview-auth">{t('名称')}</Label><Input id="preview-auth" value={text} onChange={event => setText(event.target.value)} required /><Button type="submit">{t('提交本地示例')}</Button></form></C.AuthCard><C.AuthMediaCarousel activeId={selected} onActiveChange={setSelected} slides={[{ id: 'one', title: t('概览'), media: <div className="rounded-lg bg-accent-soft p-8 text-accent">Aa</div> }, { id: 'two', title: t('明细'), media: <div className="rounded-lg bg-surface-alt p-8">Bb</div> }]} /></>; break;
    case 'calendar': demo = <EventCalendar locale={locale} month={month} onMonthChange={setMonth} timeZone="UTC" maxEventsPerDay={1} events={[{ id: 'a', title: t('本地选择示例'), allDay: true, start: '2026-11-13', end: '2026-11-16', tone: 'accent' }, { id: 'b', title: t('明细'), start: '2026-11-13T09:00:00Z', end: '2026-11-13T10:00:00Z' }]} renderEventActions={event => <Button size="sm" onClick={() => setResult(event.id)}>{t('选择')}</Button>} />; break;
    case 'composer': demo = <C.Composer {...panel} value={text} onChange={setText} label={t('本地消息草稿')} placeholder={t('输入消息，Enter 保存本地草稿')} onSubmit={submitDraft} />; break;
    case 'composer-attachments': demo = <><C.ComposerAttachmentStrip attachments={attachments} onRemove={remove} onRetry={retry} /><Button variant="secondary" onClick={() => setAttachments([{ id: 'a', name: 'sample.txt', status: 'error' }, { id: 'b', name: 'local.csv', status: 'uploading', progress: 42 }])}>{t('重置')}</Button></>; break;
    case 'composer-loader': demo = <><C.ComposerLoader busy={!flag} label={t('合成等待状态')}><p>{t('占位文本')}</p></C.ComposerLoader><Button onClick={() => setFlag(!flag)}>{t('切换示例状态')}</Button></>; break;
    case 'composer-panel': demo = <C.ComposerPanel {...panel} value={text} onChange={setText} onSubmit={submitDraft} label={t('本地消息草稿')} placeholder={t('输入消息，Enter 保存本地草稿')} status={result ? t('草稿已保存在本页') : t('Enter 保存草稿，Shift+Enter 换行')} attachments={<C.ComposerAttachmentStrip attachments={attachments} onRemove={remove} onRetry={retry} />} />; break;
    case 'data-table': demo = <TableDemo />; break;
    case 'notification-center': demo = <C.NotificationCenter tabs={[{ id: 'one', label: t('全部'), count: flag ? 0 : 2 }, { id: 'two', label: t('未读'), count: flag ? 0 : 1 }]} activeTabId={selected} onTabChange={setSelected} items={selected === 'two' && flag ? [] : [{ id: 'n1', title: t('本地选择示例'), description: t('查看草稿并继续编辑。'), timestamp: '2m', unread: !flag, status: 'information', actions: [{ id: 'select', label: t('选择') }] }]} onItemActivate={item => setResult(item)} onMarkAllRead={() => setFlag(true)} onAction={(item, action) => setResult(`${item}/${action}`)} />; break;
    case 'questionnaire': demo = <C.Questionnaire questions={[{ id: 'one', title: t('选项'), type: 'single', required: true, options: [{ id: 'one', label: t('选项一') }, { id: 'two', label: t('选项二') }] }, { id: 'two', title: t('明细'), type: 'text', required: true }]} step={step} onStepChange={setStep} answers={answers} onAnswersChange={setAnswers} onSubmit={value => setResult(JSON.stringify(value))} />; break;
    case 'settings-modal': demo = <><Button onClick={() => setFlag(true)}>{t('打开模态框')}</Button><C.SettingsDialog open={flag} onClose={() => setFlag(false)} title={t('本地设置示例')} activeSectionId={selected} onSectionChange={setSelected} sections={[{ id: 'one', label: t('概览'), content: <><Label htmlFor="preview-settings">{t('名称')}</Label><Input id="preview-settings" value={text} onChange={event => setText(event.target.value)} /></> }, { id: 'two', label: t('明细'), content: <p>{text || t('暂无数据')}</p> }]} /></>; break;
    case 'sidebar': demo = <div className="max-w-sm"><C.Sidebar label={t('本地导航示例')} header={t('组件预览')} items={[{ id: 'one', label: t('概览'), children: [{ id: 'two', label: t('明细') }] }, { id: 'disabled', label: t('已禁用'), disabled: true }]} activeId={selected} onSelect={setSelected} /></div>; break;
    case 'stat-cards': demo = <C.StatCards items={[{ id: 'a', label: t('数量'), value: '24', detail: t('本地示例记录') }, { id: 'b', label: t('进度'), value: '42%', tone: 'success' }]} />; break;
    case 'task-list': demo = <C.TaskList steps={[{ id: 'a', title: t('概览'), status: 'success' }, { id: 'b', title: t('明细'), status: flag ? 'success' : 'active', detail: <Button onClick={() => setFlag(!flag)}>{t('切换示例状态')}</Button>, children: [{ id: 'c', title: t('本地选择示例'), status: 'pending' }] }]} revealedIds={ids} onRevealChange={setIds} />; break;
    case 'web-search': demo = <C.SearchActivity query={text} onQueryChange={setText} onSearch={query => { setResult(query); setFlag(true); }} sources={[{ id: 'a', label: t('本地合成来源'), status: flag ? 'complete' : 'pending', resultCount: flag ? 3 : undefined, detail: flag ? result : undefined }]} onSourceAction={id => setResult(id)} sourceActionLabel={t('选择')} />; break;
  }
  return <Sample id={id}>{demo}{result && <Feedback>{result}</Feedback>}</Sample>;
}
export default function CompositesSection() {
  const ids = compositeIds.filter((id): id is Exclude<CompositeId, 'data-grid'> => id !== 'data-grid');
  return <div className="grid min-w-0 gap-x-6 gap-y-8 xl:grid-cols-2">{ids.map(id => <div key={id} className={['composer-panel', 'calendar', 'composer', 'data-table'].includes(id) ? 'min-w-0 xl:col-span-2' : 'min-w-0'}><CompositeDemo id={id} /></div>)}</div>;
}
