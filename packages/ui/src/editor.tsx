// Author: yunnuo <ymz@ebox.vip>
// Description: Tiptap rich text editor restricted to the contract whitelist; source mode and explicit link insertion.
// Editor output is never trusted by the server; safeEditorHTML keeps local previews on the same tag set.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor as TiptapEditorInstance } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Bold, Italic, List, ListOrdered, Link as LinkIcon, Code2, Undo2, Redo2 } from 'lucide-react';
import { defineMessages, useI18n, t } from './i18n';
import { cn } from './cn';
import { Button } from './button';
import { Textarea } from './input';
import { Modal } from './dialog';
import { Input } from './input';

export type RichTextHandle = { insert: (value: string) => void };
export type RichTextOptions = { siteTemplate?: boolean };

/** Link contract: plain absolute URLs, or additionally the {{site_url}} template when the host opts in. */
function linkPattern(siteTemplate: boolean) {
  return siteTemplate ? /^(https?:\/\/[^\s]+|\{\{site_url\}\})$/i : /^https?:\/\/[^\s]+$/i;
}

export function safeEditorHTML(value: string, { siteTemplate = false }: RichTextOptions = {}) {
  const doc = new DOMParser().parseFromString(value, 'text/html');
  const tags = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'A', 'BLOCKQUOTE']);
  const pattern = linkPattern(siteTemplate);
  const walk = (parent: Element) => {
    for (const node of [...parent.children]) {
      if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'IMG', 'SVG', 'MATH'].includes(node.tagName)) { node.remove(); continue; }
      walk(node);
      if (!tags.has(node.tagName)) { node.replaceWith(...node.childNodes); continue; }
      for (const attr of [...node.attributes]) {
        if (node.tagName !== 'A' || attr.name !== 'href' || !pattern.test(attr.value)) node.removeAttribute(attr.name);
      }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

const tools = defineMessages({ bold: '加粗', italic: '斜体', list: '无序列表', numbered: '有序列表', undo: '撤销', redo: '重做' });

export const RichTextEditor = forwardRef<RichTextHandle, { value: string; onChange: (value: string) => void; label: string; disabled?: boolean; sourceLabel?: string; siteTemplate?: boolean; maxLength?: number; className?: string }>(function RichTextEditor({ value, onChange, label, disabled, sourceLabel, siteTemplate = false, maxLength = 12000, className }, ref) {
  const { t } = useI18n();
  const [raw, setRaw] = useState(false);
  const [link, setLink] = useState(false);
  const [url, setURL] = useState('https://');
  const source = useRef<HTMLTextAreaElement>(null);
  const pattern = linkPattern(siteTemplate);

  const editor: TiptapEditorInstance | null = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, horizontalRule: false, link: false }),
      Link.configure({ openOnClick: false, autolink: false, defaultProtocol: 'https', HTMLAttributes: { rel: 'noopener noreferrer nofollow' } }),
    ],
    content: value,
    editable: !disabled,
    editorProps: { attributes: { 'aria-label': label, role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate({ editor: instance }) { onChange(safeEditorHTML(instance.getHTML(), { siteTemplate })); },
  }, [value === '', siteTemplate]);

  // The accessible name follows the locale without recreating the editor (which would move the caret).
  useEffect(() => { editor?.setOptions({ editorProps: { attributes: { 'aria-label': label, role: 'textbox', 'aria-multiline': 'true' } } }); }, [editor, label]);

  // Toggling editability must not emit an update: tiptap v3 would otherwise rewrite
  // the bound value with the editor serialization while a source-mode draft is pending.
  useEffect(() => { editor?.setEditable(!disabled, false); }, [disabled, editor]);
  useEffect(() => {
    if (!editor || raw) return;
    const current = safeEditorHTML(value, { siteTemplate });
    if (safeEditorHTML(editor.getHTML(), { siteTemplate }) !== current) editor.commands.setContent(current, { emitUpdate: false });
  }, [value, raw, editor, siteTemplate]);

  useImperativeHandle(ref, () => ({
    insert(text) {
      if (raw && source.current) {
        const node = source.current;
        const next = value.slice(0, node.selectionStart) + text + value.slice(node.selectionEnd);
        const caret = node.selectionStart + text.length;
        onChange(next);
        node.focus();
        requestAnimationFrame(() => node.setSelectionRange(caret, caret));
      } else editor?.chain().focus().insertContent(text).run();
    },
  }));

  function insertLink(address: string) {
    editor?.chain().focus().extendMarkRange('link').setLink({ href: address }).run();
  }

  // Toggle buttons expose their active state; undo/redo expose availability through disabled instead.
  const toolButtons: [typeof Bold, () => boolean, () => void, string][] = editor ? [
    [Bold, () => editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), tools.bold],
    [Italic, () => editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), tools.italic],
    [List, () => editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), tools.list],
    [ListOrdered, () => editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), tools.numbered],
  ] : [];
  const historyButtons: [typeof Undo2, string, () => void, () => boolean][] = editor ? [
    [Undo2, tools.undo, () => editor.chain().focus().undo().run(), () => !editor.can().undo()],
    [Redo2, tools.redo, () => editor.chain().focus().redo().run(), () => !editor.can().redo()],
  ] : [];

  return <div className={cn('overflow-hidden rounded-xl border border-transparent bg-field transition-colors hover:border-line-strong focus-within:border-focus focus-within:ring-2 focus-within:ring-focus', className)}>
    <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-alt px-2 py-1.5">
      <div className="flex items-center gap-0.5">
        {toolButtons.map(([Icon, active, command, title]) => (
          <Button key={title} variant="ghost" size="icon" aria-label={t(title)} aria-pressed={active()}
            disabled={raw || disabled} onMouseDown={event => event.preventDefault()} onClick={command} className={active() ? 'bg-primary-soft text-accent' : ''}>
            <Icon size={15} />
          </Button>
        ))}
        {historyButtons.map(([Icon, title, command, unavailable]) => (
          <Button key={title} variant="ghost" size="icon" aria-label={t(title)} disabled={raw || disabled || unavailable()}
            onMouseDown={event => event.preventDefault()} onClick={command}>
            <Icon size={15} />
          </Button>
        ))}
        <Button variant="ghost" size="icon" aria-label={t('插入链接')} disabled={raw || disabled} onMouseDown={event => event.preventDefault()} onClick={() => setLink(true)}>
          <LinkIcon size={15} />
        </Button>
      </div>
      <Button variant="ghost" size="sm" aria-pressed={raw} disabled={disabled} onClick={() => { if (raw) onChange(safeEditorHTML(value, { siteTemplate })); setRaw(current => !current); }}>
        <Code2 size={14} />{raw ? t('可视化') : t('源代码')}
      </Button>
    </div>
    {raw
      ? <Textarea ref={source} aria-label={sourceLabel ?? t('内容源代码')} value={value} maxLength={maxLength} disabled={disabled} onChange={event => onChange(event.target.value)} className="min-h-40 rounded-none border-0 font-mono text-sm focus-visible:ring-0" />
      : <EditorContent editor={editor} className="rich-editor-surface rich-surface [&_.tiptap]:px-3 [&_.tiptap]:py-2" />}
    {link && <Modal title={t('插入链接')} onClose={() => setLink(false)}>
      <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); const address = String(data.get('url') ?? ''); if (!pattern.test(address)) return; insertLink(address); setLink(false); setURL(address); }}>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">{t('链接地址')}</span>
          <Input type={siteTemplate ? 'text' : 'url'} name="url" required maxLength={2048} defaultValue={url} placeholder={siteTemplate ? t('https:// 或 {{site_url}}') : 'https://'} pattern={siteTemplate ? undefined : 'https?://.+'} />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setLink(false)}>{t('取消')}</Button>
          <Button type="submit">{t('插入')}</Button>
        </div>
      </form>
    </Modal>}
  </div>;
});
