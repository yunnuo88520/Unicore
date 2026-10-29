// Author: yunnuo <ymz@ebox.vip>
// Description: Shared restricted rich text editor with stable selection, source mode and explicit link insertion.
import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {Bold,Italic,List,ListOrdered,Link,Code2,Undo2,Redo2} from 'lucide-react';
import {defineMessages,useI18n} from './i18n';
import {Modal} from './modal';
import {Form} from './forms';
export type RichTextHandle={insert:(value:string)=>void};
// Editor input is never trusted by the server. This also prevents active markup in local source-mode previews.
export function safeEditorHTML(value:string){
 const doc=new DOMParser().parseFromString(value,'text/html');
 const tags=new Set(['P','BR','STRONG','B','EM','I','U','UL','OL','LI','A','BLOCKQUOTE']);
 const walk=(parent:Element)=>{for(const node of [...parent.children]){if(['SCRIPT','STYLE','IFRAME','OBJECT','IMG','SVG','MATH'].includes(node.tagName)){node.remove();continue;}walk(node);if(!tags.has(node.tagName)){node.replaceWith(...node.childNodes);continue;}for(const attr of [...node.attributes]){if(node.tagName!=='A'||attr.name!=='href'||!(/^(https?:\/\/[^\s]+|\{\{site_url\}\})$/i.test(attr.value)))node.removeAttribute(attr.name);}}};
 walk(doc.body);return doc.body.innerHTML;
}
const tools=defineMessages({bold:'加粗',italic:'斜体',list:'无序列表',numbered:'有序列表',undo:'撤销',redo:'重做'});
export const RichTextEditor=forwardRef<RichTextHandle,{value:string;onChange:(value:string)=>void;label:string;disabled?:boolean}>(function RichTextEditor({value,onChange,label,disabled},ref){
 const {t}=useI18n();const editor=useRef<HTMLDivElement>(null),source=useRef<HTMLTextAreaElement>(null),selection=useRef<Range|null>(null);
 const pendingLink=useRef<string|null>(null);
 const [raw,setRaw]=useState(false),[link,setLink]=useState(false),[url,setURL]=useState('https://');
 useEffect(()=>{if(editor.current&&editor.current.innerHTML!==safeEditorHTML(value))editor.current.innerHTML=safeEditorHTML(value);},[value,raw]);
 const remember=()=>{const s=window.getSelection();if(s?.rangeCount&&editor.current?.contains(s.anchorNode))selection.current=s.getRangeAt(0).cloneRange();};
 const focus=()=>{editor.current?.focus();const s=window.getSelection();if(selection.current&&s){s.removeAllRanges();s.addRange(selection.current);}};
 const command=(name:string,arg?:string)=>{focus();document.execCommand(name,false,arg);if(editor.current)onChange(safeEditorHTML(editor.current.innerHTML));remember();};
 useEffect(()=>{if(!link&&pendingLink.current){const address=pendingLink.current;pendingLink.current=null;command('createLink',address);}},[link]);
 useImperativeHandle(ref,()=>({insert(text){if(raw&&source.current){const node=source.current;const next=value.slice(0,node.selectionStart)+text+value.slice(node.selectionEnd);const caret=node.selectionStart+text.length;onChange(next);node.focus();requestAnimationFrame(()=>node.setSelectionRange(caret,caret));}else command('insertText',text);}}));
 return <div className="rich-editor"><div className="rich-toolbar"><div>{[[Bold,'bold',tools.bold],[Italic,'italic',tools.italic],[List,'insertUnorderedList',tools.list],[ListOrdered,'insertOrderedList',tools.numbered],[Undo2,'undo',tools.undo],[Redo2,'redo',tools.redo]].map(([Icon,cmd,title])=>{const Glyph=Icon as typeof Bold;return <button key={String(cmd)} type="button" className="icon-button" aria-label={t(String(title))} disabled={raw||disabled} onMouseDown={event=>event.preventDefault()} onClick={()=>command(String(cmd))}><Glyph size={16}/></button>;})}<button type="button" className="icon-button" aria-label={t('插入链接')} disabled={raw||disabled} onMouseDown={e=>e.preventDefault()} onClick={()=>{remember();setLink(true);}}><Link size={16}/></button></div><button className="editor-source" type="button" aria-pressed={raw} disabled={disabled} onClick={()=>{if(raw)onChange(safeEditorHTML(value));setRaw(v=>!v);selection.current=null;}}><Code2 size={15}/>{raw?t('可视化'):t('源代码')}</button></div>
 {raw?<textarea ref={source} className="rich-source" aria-label={t('邮件内容源代码')} value={value} maxLength={12000} disabled={disabled} onChange={e=>onChange(e.target.value)}/>:<div ref={editor} className="rich-surface" role="textbox" aria-label={label} aria-multiline="true" contentEditable={!disabled} suppressContentEditableWarning onInput={()=>{if(editor.current)onChange(safeEditorHTML(editor.current.innerHTML));remember();}} onKeyUp={remember} onMouseUp={remember} onFocus={()=>document.execCommand('defaultParagraphSeparator',false,'p')} onPaste={event=>{event.preventDefault();command('insertText',event.clipboardData.getData('text/plain'));}}/>}
 {link&&<Modal title={t('插入链接')} onClose={()=>setLink(false)}><Form className="flow-form" onSubmit={()=>{pendingLink.current=url;setLink(false);}}><label>{t('链接地址')}<input type="url" required pattern="https?://.+" maxLength={2048} value={url} onChange={e=>setURL(e.target.value)}/></label><div className="dialog-actions"><button className="secondary-button" type="button" onClick={()=>setLink(false)}>{t('取消')}</button><button className="primary-button">{t('插入')}</button></div></Form></Modal>}
 </div>;
});
