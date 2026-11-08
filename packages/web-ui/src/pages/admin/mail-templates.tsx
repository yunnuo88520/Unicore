import { canAction } from '../../permissions';
// Author: yunnuo <ymz@ebox.vip>
// Description: Mail template drafts on the restricted Tiptap editor: named variables, preview, test delivery and restore.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useWatch } from 'react-hook-form';
import { Braces, Eye, MailCheck, RotateCcw, Save, Send } from 'lucide-react';
import type { MailTemplate, MailTemplateInput, MailTemplateTestInput, WebClient } from '@unicore/sdk';
import { defineMessages, t, useI18n } from '../../i18n';
import { AppForm, useAppForm } from '@unicore/form';
import { Button, Card, CardContent, Input, Label, Modal, Tabs, useMessage } from '@unicore/ui';
import { RichTextEditor, type RichTextHandle } from '@unicore/ui/editor';
import type { PageProps } from '../../router';

const purposes = defineMessages({ test: '服务测试', verify: '注册验证', login: '登录验证码', reset: '密码重置', notification: '系统通知' });
const variableLabels = defineMessages({ site_name: '站点名称', site_url: '站点地址', code: '验证码', expires_minutes: '有效分钟数', title: '通知标题', detail: '通知详情' });
const CODE_PURPOSES = ['verify', 'login', 'reset'];

export function AdminMailTemplatesPage({ client, metadata }: PageProps) {
  if (!client.web) return null;
  return <fieldset className="contents" disabled={!canAction(metadata,'saveMailTemplate')}><MailTemplatePanel web={client.web} /></fieldset>;
}

function MailTemplatePanel({ web }: { web: WebClient }) {
  const { t } = useI18n();
  const message = useMessage();
  const cache = useQueryClient();
  const [purpose, setPurpose] = useState<MailTemplateInput['purpose']>('verify');
  const [drafts, setDrafts] = useState<Record<string, MailTemplateInput>>({});
  const [preview, setPreview] = useState<MailTemplate | null>(null);
  const [testing, setTesting] = useState<MailTemplateInput | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [resetToken, setResetToken] = useState(0);
  const query = useQuery({ queryKey: ['mail-templates'], queryFn: () => web.mailTemplates() });

  const apply = (value: MailTemplate) => {
    cache.setQueryData<{ items: MailTemplate[] }>(['mail-templates'], old => old ? { items: old.items.map(item => item.purpose === value.purpose ? value : item) } : old);
    setDrafts(current => {
      const next = { ...current };
      delete next[value.purpose];
      return next;
    });
  };
  const save = useMutation({
    mutationFn: (values: MailTemplateInput) => web.saveMailTemplate(values),
    onSuccess: value => { apply(value); message.success(t('邮件模板已保存')); },
  });
  const previewer = useMutation({
    mutationFn: (values: MailTemplateInput) => web.previewMailTemplate(values),
    onSuccess: setPreview,
    onError: error => message.error(t(error.message)),
  });
  const test = useMutation({
    mutationFn: (input: MailTemplateTestInput) => web.testMailTemplate(input),
    onSuccess: () => { setTesting(null); message.success(t('测试邮件已发送')); },
    onError: error => message.error(t(error.message)),
  });
  const restore = useMutation({
    mutationFn: () => web.resetMailTemplate(purpose),
    onSuccess: value => { apply(value); setRestoring(false); setResetToken(token => token + 1); message.success(t('已恢复默认邮件模板')); },
  });
  const pending = save.isPending || previewer.isPending || test.isPending || restore.isPending;
  const onDraftChange = useCallback((id: MailTemplateInput['purpose'], values: { subject?: string; body?: string }) => {
    setDrafts(current => {
      const next = { purpose: id, subject: values.subject ?? '', body: values.body ?? '' };
      const previous = current[id];
      if (previous && previous.subject === next.subject && previous.body === next.body) return current;
      return { ...current, [id]: next };
    });
  }, []);
  const selected = query.data?.items.find(item => item.purpose === purpose);
  const draft = drafts[purpose] ?? (selected ? { purpose, subject: selected.subject, body: selected.body } : null);
  const isDirty = (id: string) => {
    const record = drafts[id];
    const saved = query.data?.items.find(item => item.purpose === id);
    return !!record && !!saved && (record.subject !== saved.subject || record.body !== saved.body);
  };
  return <Card>
    <CardContent className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-xs text-muted"><MailCheck size={16} className="text-accent" aria-hidden="true" />{t('品牌页眉与页脚统一保留，以下内容用于实际发送。')}</p>
      <Tabs id="mail-template" label={t('邮件模板类型')} value={purpose}
        onChange={id => { if (!pending) setPurpose(id as MailTemplateInput['purpose']); }}
        items={Object.entries(purposes).map(([id, label]) => ({ id, label: t(label), dirty: isDirty(id) }))} />
      {query.isPending && <p role="status" className="py-6 text-center text-sm text-muted">{t('正在读取邮件模板…')}</p>}
      {query.isError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
        <span>{t(query.error.message)}</span>
        <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>{t('重试')}</Button>
      </div>}
      {query.data && draft && <MailTemplateForm key={purpose} draft={draft} selected={selected} pending={pending}
        savePending={save.isPending} saveError={save.error} resetToken={resetToken}
        onDraftChange={onDraftChange} onSave={values => save.mutate(values)}
        onPreview={values => previewer.mutate(values)} onPreviewPending={previewer.isPending}
        onRender={values => web.previewMailTemplate(values)}
        onTest={values => setTesting(values)} onRestore={() => setRestoring(true)} />}
    </CardContent>
    {preview && <Modal title={t('邮件预览')} onClose={() => setPreview(null)}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted">{t('预览当前草稿；未保存的内容不会影响实际业务邮件。')}</p>
        <iframe title={t('邮件预览内容')} sandbox="" className="h-80 w-full rounded-lg border border-line bg-surface"
          srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">${preview.html}`} />
      </div>
    </Modal>}
    {testing && <Modal title={t('测试发送')} onClose={() => setTesting(null)} pending={test.isPending}>
      <form className="flex flex-col gap-3" onSubmit={event => {
        event.preventDefault();
        const template = drafts[testing.purpose] ?? testing;
        test.mutate({ template, recipient });
      }}>
        <p className="text-xs leading-relaxed text-muted">{t('将当前草稿发送到指定邮箱，不会保存或修改账号流程。')}</p>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">{t('测试收件邮箱')}</span>
          <Input type="email" required maxLength={254} value={recipient} disabled={test.isPending} onChange={event => setRecipient(event.target.value)} />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" disabled={test.isPending} onClick={() => setTesting(null)}>{t('取消')}</Button>
          <Button type="submit" pending={test.isPending}><Send size={14} />{test.isPending ? t('发送中…') : t('发送测试邮件')}</Button>
        </div>
      </form>
    </Modal>}
    {restoring && <ConfirmRestore pending={restore.isPending} onCancel={() => setRestoring(false)} onConfirm={() => restore.mutate()} />}
  </Card>;
}

function ConfirmRestore({ pending, onCancel, onConfirm }: { pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <Modal title={t('恢复默认邮件模板')} onClose={onCancel} pending={pending}>
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-ink">{t('当前模板的自定义内容和草稿将被默认模板替换，其他模板保持不变。')}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={pending} onClick={onCancel}>{t('取消')}</Button>
        <Button pending={pending} onClick={onConfirm}>{t('确认恢复')}</Button>
      </div>
    </div>
  </Modal>;
}

function MailTemplateForm({ draft, selected, pending, savePending, saveError, resetToken, onDraftChange, onSave, onPreview, onPreviewPending, onRender, onTest, onRestore }: {
  draft: MailTemplateInput; selected?: MailTemplate; pending: boolean; savePending: boolean; saveError: unknown; resetToken: number;
  onDraftChange: (purpose: MailTemplateInput['purpose'], values: { subject?: string; body?: string }) => void;
  onSave: (values: MailTemplateInput) => void; onPreview: (values: MailTemplateInput) => void; onPreviewPending: boolean;
  onRender: (values: MailTemplateInput) => Promise<MailTemplate>;
  onTest: (values: MailTemplateInput) => void; onRestore: () => void;
}) {
  const { t } = useI18n();
  const subject = useRef<HTMLInputElement>(null);
  const editor = useRef<RichTextHandle>(null);
  const target = useRef<'subject' | 'body'>('body');
  const form = useAppForm<MailTemplateInput>({
    schema: 'MailTemplateInput',
    defaultValues: draft,
    onSubmit: values => onSave(values),
  });
  const values = useWatch({ control: form.control }) as Partial<MailTemplateInput>;
  const dirty = !!selected && ((values.subject ?? '') !== selected.subject || (values.body ?? '') !== selected.body);
  // Live preview pane: re-render the draft next to the editor, debounced while typing.
  const [live, setLive] = useState<MailTemplate | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState(false);
  const renderedSignature = useRef('');
  const renderTimer = useRef<number | undefined>(undefined);
  const render = useCallback((subjectValue: string, bodyValue: string) => {
    const signature = `${subjectValue}\u0000${bodyValue}`;
    if (signature === renderedSignature.current) return;
    renderedSignature.current = signature;
    setRendering(true);
    setRenderError(false);
    onRender({ purpose: draft.purpose, subject: subjectValue, body: bodyValue })
      .then(value => setLive(value))
      .catch(() => { renderedSignature.current = ''; setRenderError(true); })
      .finally(() => setRendering(false));
  }, [draft.purpose, onRender]);
  useEffect(() => {
    const subjectValue = values.subject ?? draft.subject;
    const bodyValue = values.body ?? draft.body;
    window.clearTimeout(renderTimer.current);
    renderTimer.current = window.setTimeout(() => render(subjectValue, bodyValue), 900);
    return () => window.clearTimeout(renderTimer.current);
  }, [values.subject, values.body, draft.subject, draft.body, render]);
  useEffect(() => () => window.clearTimeout(renderTimer.current), []);
  // Keep the panel-level drafts record in sync so tab switches and the test dialog see the live draft.
  useEffect(() => {
    onDraftChange(draft.purpose, { subject: values.subject ?? draft.subject, body: values.body ?? draft.body });
  }, [values.subject, values.body, draft.purpose, draft.subject, draft.body, onDraftChange]);
  // Re-apply server-side field errors from the latest save attempt.
  useEffect(() => {
    if (saveError) form.applyServerError(saveError);
  }, [saveError, form]);
  // Restoring replaces the canonical template; reload the form once per restore.
  useEffect(() => {
    if (resetToken > 0) form.reset(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken, form]);
  const insert = (key: string) => {
    const text = `{{${key}}}`;
    if (target.current === 'subject' && subject.current) {
      const node = subject.current;
      const value = node.value;
      const start = node.selectionStart ?? value.length;
      const end = node.selectionEnd ?? start;
      form.setValue('subject', value.slice(0, start) + text + value.slice(end), { shouldDirty: true });
      node.focus();
      requestAnimationFrame(() => node.setSelectionRange(start + text.length, start + text.length));
    } else {
      editor.current?.insert(text);
    }
  };
  const busy = pending || savePending;
  return <AppForm form={form} role="tabpanel" id={`mail-template-panel-${draft.purpose}`} aria-labelledby={`mail-template-tab-${draft.purpose}`} className="flex flex-col gap-4">
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-4 lg:border-e lg:border-line lg:pe-5">
        <Controller control={form.control} name="subject" render={({ field, fieldState }) => (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="template-subject">{t('邮件主题')}</Label>
              <span className={`rounded-full border px-2 py-0.5 text-2xs font-medium ${dirty ? 'border-primary-line bg-primary-soft text-accent' : 'border-line bg-surface-alt text-muted'}`}>
                {dirty ? t('未保存') : selected?.customized ? t('已自定义') : t('默认模板')}
              </span>
            </div>
            <Input id="template-subject" required maxLength={160} disabled={busy} value={field.value}
              ref={node => { field.ref(node); subject.current = node; }}
              aria-invalid={!!fieldState.error} aria-describedby={fieldState.error ? 'template-subject-error' : undefined}
              onFocus={() => { target.current = 'subject'; }}
              onBlur={field.onBlur}
              onChange={event => field.onChange(event)} />
            {fieldState.error && <p id="template-subject-error" role="alert" className="text-xs text-danger">{t(fieldState.error.message)}</p>}
          </div>
        )} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <span className="flex items-center gap-1.5 text-xs text-muted"><Braces size={14} aria-hidden="true" />{t('插入变量')}</span>
          <div className="template-variables flex flex-wrap gap-1.5">
            {selected?.variables.map(variable => (
              <button type="button" key={variable.key} disabled={busy} title={`{{${variable.key}}} · ${variable.sample}`}
                onMouseDown={event => event.preventDefault()}
                onClick={() => insert(variable.key)}
                className="flex items-center gap-1.5 rounded-md border border-line bg-surface-alt px-2 py-1 text-2xs text-ink transition-colors hover:border-primary-line hover:bg-primary-soft hover:text-accent disabled:pointer-events-none disabled:opacity-55">
                {t(variableLabels[variable.key as keyof typeof variableLabels] ?? variable.key)}
                <code className="text-2xs text-muted">{`{{${variable.key}}}`}</code>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <strong className="text-sm font-medium text-ink">{t('邮件内容')}</strong>
            <small className="text-2xs text-muted">{t('支持段落、加粗、斜体、列表与安全链接。')}</small>
          </div>
          <Controller control={form.control} name="body" render={({ field }) => (
            <div onFocusCapture={event => { if (!(event.target as HTMLElement).closest('button')) target.current = 'body'; }}>
              <RichTextEditor ref={editor} label={t('邮件内容')} value={field.value} disabled={busy} siteTemplate sourceLabel={t('邮件内容源代码')} onChange={value => field.onChange(value)} />
            </div>
          )} />
        </div>
        <p className="text-xs leading-relaxed text-muted">
          {CODE_PURPOSES.includes(draft.purpose) ? t('验证码模板必须保留 {{code}}，测试与预览使用固定示例码。') : t('变量仅来自当前场景，邮件内容不会执行脚本或加载外部图片。')}
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <strong className="text-sm font-medium text-ink">{t('实时预览')}</strong>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-muted" disabled={rendering}
            onClick={() => render(values.subject ?? draft.subject, values.body ?? draft.body)}>
            <RotateCcw size={13} aria-hidden="true" />{rendering ? t('正在渲染…') : t('刷新预览')}
          </Button>
        </div>
        {renderError && <p role="alert" className="text-xs text-danger">{t('预览生成失败，请点击刷新重试。')}</p>}
        <iframe title={t('实时预览内容')} sandbox="" className="min-h-[360px] w-full flex-1 rounded-lg border border-line bg-surface"
          srcDoc={live ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">${live.html}` : undefined} />
        <small className="text-2xs text-muted">{t('品牌页眉页脚与真实邮件一致；输入停顿后自动刷新，也可手动刷新。')}</small>
      </div>
    </div>
    <div className="template-actions flex flex-wrap items-center gap-2 border-t border-line pt-3">
      <Button type="submit" pending={savePending} disabled={busy || !dirty}><Save size={15} />{savePending ? t('保存中…') : t('保存')}</Button>
      <Button variant="secondary" disabled={busy} onClick={() => onPreview({ purpose: draft.purpose, subject: values.subject ?? draft.subject, body: values.body ?? draft.body })}>
        <Eye size={15} />{onPreviewPending ? t('生成预览…') : t('预览')}
      </Button>
      <Button variant="secondary" disabled={busy} onClick={() => onTest({ purpose: draft.purpose, subject: values.subject ?? draft.subject, body: values.body ?? draft.body })}>
        <Send size={15} />{t('测试发送')}
      </Button>
      <Button variant="ghost" size="sm" className="ms-auto text-muted" disabled={busy || (!selected?.customized && !dirty)} onClick={onRestore}>
        <RotateCcw size={14} />{t('恢复默认')}
      </Button>
    </div>
  </AppForm>;
}
