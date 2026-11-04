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

export function safeEditorHTML(value: string) {
  const doc = new DOMParser().parseFromString(value, 'text/html');
  const tags = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'A', 'BLOCKQUOTE']);
  const walk = (parent: Element) => {
    for (const node of [...parent.children]) {
      if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'IMG', 'SVG', 'MATH'].includes(node.tagName)) { node.remove(); continue; }
      walk(node);
      if (!tags.has(node.tagName)) { node.replaceWith(...node.childNodes); continue; }
      for (const attr of [...node.attributes]) {
        if (node.tagName !== 'A' || attr.name !== 'href' || !(/^(https?:\/\/[^\s]+|\{\{site_url\}\})$/i.test(attr.value))) node.removeAttribute(attr.name);
      }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

const tools = defineMessages({ bold: '加粗', italic: '斜体', list: '无序列表', numbered: '有序列表', undo: '撤销', redo: '重做' });
const LINK_PATTERN = /^(https?:\/\/[^\s]+|\{\{site_url\}\})$/i;

export const RichTextEditor = forwardRef<RichTextHandle, { value: string; onChange: (value: string) => void; label: string; disabled?: boolean; sourceLabel?: string; className?: string }>(function RichTextEditor({ value, onChange, label, disabled, sourceLabel, className }, ref) {
  const { t } = useI18n();
  const [raw, setRaw] = useState(false);
  const [link, setLink] = useState(false);
  const [url, setURL] = useState('https://');
  const source = useRef<HTMLTextAreaElement>(null);

  const editor: TiptapEditorInstance | null = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, horizontalRule: false, link: false }),
      Link.configure({ openOnClick: false, autolink: false, defaultProtocol: 'https', HTMLAttributes: { rel: 'noopener noreferrer nofollow' } }),
    ],
    content: value,
    editable: !disabled,
    onUpdate({ editor: instance }) { onChange(safeEditorHTML(instance.getHTML())); },
  }, [value === '']);

  // Toggling editability must not emit an update: tiptap v3 would otherwise rewrite
  // the bound value with the editor serialization while a source-mode draft is pending.
  useEffect(() => { editor?.setEditable(!disabled, false); }, [disabled, editor]);
  useEffect(() => {
    if (!editor || raw) return;
    const current = safeEditorHTML(value);
    if (safeEditorHTML(editor.getHTML()) !== current) editor.commands.setContent(current, { emitUpdate: false });
  }, [value, raw, editor]);

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

  const toolButtons: [typeof Bold, () => boolean, () => void, string][] = editor ? [
    [Bold, () => editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), tools.bold],
    [Italic, () => editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), tools.italic],
    [List, () => editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), tools.list],
    [ListOrdered, () => editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), tools.numbered],
    [Undo2, () => false, () => editor.chain().focus().undo().run(), tools.undo],
    [Redo2, () => false, () => editor.chain().focus().redo().run(), tools.redo],
  ] : [];

  return <div className={cn('overflow-hidden rounded-lg border border-line bg-surface', className)}>
    <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-alt px-2 py-1.5">
      <div className="flex items-center gap-0.5">
        {toolButtons.map(([Icon, active, command, title]) => (
          <Button key={title} variant="ghost" size="icon" aria-label={t(title)} aria-pressed={active()} disabled={raw || disabled}
            onMouseDown={event => event.preventDefault()} onClick={command} className={active() ? 'bg-primary-soft text-accent' : ''}>
            <Icon size={15} />
          </Button>
        ))}
        <Button variant="ghost" size="icon" aria-label={t('插入链接')} disabled={raw || disabled} onMouseDown={event => event.preventDefault()} onClick={() => setLink(true)}>
          <LinkIcon size={15} />
        </Button>
      </div>
      <Button variant="ghost" size="sm" aria-pressed={raw} disabled={disabled} onClick={() => { if (raw) onChange(safeEditorHTML(value)); setRaw(current => !current); }}>
        <Code2 size={14} />{raw ? t('可视化') : t('源代码')}
      </Button>
    </div>
    {raw
      ? <Textarea ref={source} aria-label={sourceLabel ?? t('邮件内容源代码')} value={value} maxLength={12000} disabled={disabled} onChange={event => onChange(event.target.value)} className="min-h-40 rounded-none border-0 font-mono text-sm focus-visible:ring-0" />
      : <div role="textbox" aria-label={label} aria-multiline="true" tabIndex={0} onFocus={() => editor?.commands.focus()}>
          <EditorContent editor={editor} className="rich-editor-surface rich-surface [&_.tiptap]:px-3 [&_.tiptap]:py-2" />
        </div>}
    {link && <Modal title={t('插入链接')} onClose={() => setLink(false)}>
      <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); const address = String(data.get('url') ?? ''); if (!LINK_PATTERN.test(address)) return; insertLink(address); setLink(false); setURL(address); }}>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">{t('链接地址')}</span>
          <Input type="url" name="url" required pattern="https?://.+" maxLength={2048} defaultValue={url} placeholder={t('https:// 或 {{site_url}}')} />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setLink(false)}>{t('取消')}</Button>
          <Button type="submit">{t('插入')}</Button>
        </div>
      </form>
    </Modal>}
  </div>;
});
