/** Author: yunnuo <ymz@ebox.vip>
 * Description: Shared persistent business example with modal editing, ownership, attachments and concurrency feedback.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NotebookPen, Plus, Search, Pencil, Trash2, Paperclip, CheckCircle2, Circle, Download, X } from 'lucide-react';
import type { AppClient, Bootstrap, NoteEntry, NoteInput, NoteQuery } from '@unicore/sdk';
import { Form } from './forms';
import { Modal } from './modal';
import { useMessage } from './message';
import './notes.css';

const initialQuery:NoteQuery={search:'',status:'',sort:'updated_at',direction:'desc',page:1};
export function NotesPage({client,metadata}:{client:AppClient;metadata:Bootstrap}) {
 const api=client.notes!,cache=useQueryClient(),message=useMessage();
 const [query,setQuery]=useState<NoteQuery>(initialQuery),[search,setSearch]=useState('');
 const [editing,setEditing]=useState<NoteEntry|'new'|null>(null),[removing,setRemoving]=useState<NoteEntry|null>(null);
 const list=useQuery({queryKey:['notes',query],queryFn:()=>api.listNotes(query)});
 const refresh=()=>cache.invalidateQueries({queryKey:['notes']});
 const remove=useMutation({mutationFn:(note:NoteEntry)=>api.deleteNote(note.id,note.version),onSuccess:()=>{message.success('笔记已删除');setRemoving(null);void refresh();}});
 const download=useMutation({mutationFn:async(id:string)=>{const access=await client.files!.fileAccess(id);const a=document.createElement('a');a.href=access.url;a.rel='noreferrer';a.download='';document.body.append(a);a.click();a.remove();}});
 return <section className="panel notes-panel">
  <div className="panel-heading"><div><h2><NotebookPen size={19}/>个人笔记</h2><p>把想法写下来，按自己的节奏推进。</p></div><button className="primary-button" onClick={()=>setEditing('new')}><Plus size={16}/>新建笔记</button></div>
  <Form className="notes-filters" onSubmit={()=>setQuery(q=>({...q,search,page:1}))}>
   <label className="notes-search"><Search size={16}/><input aria-label="搜索笔记" placeholder="搜索笔记标题" maxLength={128} value={search} onChange={e=>setSearch(e.target.value)}/></label>
   <button className="secondary-button">搜索</button>
   <label><span className="visually-hidden">笔记状态</span><select aria-label="笔记状态" value={query.status} onChange={e=>setQuery(q=>({...q,status:e.target.value as NoteQuery['status'],page:1}))}><option value="">全部状态</option><option value="open">进行中</option><option value="done">已完成</option></select></label>
   <label><span className="visually-hidden">笔记排序</span><select aria-label="笔记排序" value={query.sort} onChange={e=>setQuery(q=>({...q,sort:e.target.value as NoteQuery['sort'],page:1}))}><option value="updated_at">最近更新</option><option value="title">按标题</option></select></label>
   <button type="button" className="secondary-button" onClick={()=>setQuery(q=>({...q,direction:q.direction==='desc'?'asc':'desc',page:1}))}>{query.direction==='desc'?'降序':'升序'}</button>
  </Form>
  {list.isPending?<div className="storage-empty" role="status">正在读取笔记…</div>:list.isError?<div className="storage-empty" role="alert"><p>{list.error.message}</p><button className="secondary-button" onClick={()=>list.refetch()}>重试</button></div>:!list.data.items.length?<div className="storage-empty"><NotebookPen size={36}/><strong>{query.search||query.status?'没有符合条件的笔记':'让第一条想法落在这里'}</strong><p>新建一条笔记，记录值得跟进的事。</p></div>:<>
   <div className="notes-grid">{list.data.items.map(note=><article className="note-card" key={note.id}>
    <div className="note-card-top"><span className={`note-status ${note.status==='done'?'is-done':''}`}>{note.status==='done'?<CheckCircle2 size={14}/>:<Circle size={14}/>} {note.status==='done'?'已完成':'进行中'}</span><div className="storage-actions"><button className="icon-button" aria-label={`编辑 ${note.title}`} onClick={()=>setEditing(note)}><Pencil size={16}/></button><button className="icon-button" aria-label={`删除 ${note.title}`} onClick={()=>setRemoving(note)}><Trash2 size={16}/></button></div></div>
    <h3>{note.title}</h3><p className="note-body">{note.body||'还没有正文，随时补充你的想法。'}</p>
    {note.attachment_ids.length>0&&client.files&&<div className="note-attachments">{note.attachment_ids.map((id,index)=><button key={id} className="text-button" disabled={download.isPending} onClick={()=>download.mutate(id)}><Paperclip size={13}/>附件 {index+1}<Download size={12}/></button>)}</div>}
    <small>更新于 {new Date(note.updated_at*1000).toLocaleString()}</small>
   </article>)}</div>
   <div className="file-pagination"><small>共 {list.data.total} 条笔记 · 第 {query.page} 页</small><button className="secondary-button" disabled={query.page===1} onClick={()=>setQuery(q=>({...q,page:q.page-1}))}>上一页</button><button className="secondary-button" disabled={query.page*list.data.page_size>=list.data.total} onClick={()=>setQuery(q=>({...q,page:q.page+1}))}>下一页</button></div>
  </>}
  {editing&&<NoteEditor key={editing==='new'?'new':editing.id} client={client} metadata={metadata} note={editing==='new'?undefined:editing} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);void refresh();}}/>}
  {removing&&<Modal title="删除笔记" onClose={()=>setRemoving(null)} pending={remove.isPending}><Form className="flow-form" pending={remove.isPending} error={remove.error} onSubmit={()=>remove.mutate(removing)}><p>确定删除“{removing.title}”？此操作不可撤销，附件原文件会保留。</p><div className="dialog-actions"><button type="button" className="secondary-button" disabled={remove.isPending} onClick={()=>setRemoving(null)}>取消</button><button className="primary-button" disabled={remove.isPending}>确认删除</button></div></Form></Modal>}
 </section>;
}
function NoteEditor({client,metadata,note,onClose,onSaved}:{client:AppClient;metadata:Bootstrap;note?:NoteEntry;onClose:()=>void;onSaved:()=>void}) {
 const [value,setValue]=useState<NoteInput>({title:note?.title??'',body:note?.body??'',status:note?.status??'open',attachment_ids:note?.attachment_ids??[]});
 const [fileSearch,setFileSearch]=useState('');
 const message=useMessage();
 const files=useQuery({queryKey:['note-files',fileSearch],queryFn:()=>client.files!.listFiles(fileSearch,1),enabled:metadata.profile==='web-platform'&&!!client.files});
 const mine=files.data?.items.filter(f=>f.state==='ready'&&f.creator_id===metadata.current_user?.id&&f.creator_realm===metadata.identity_realm)??[];
 const save=useMutation({mutationFn:()=>note?client.notes!.updateNote(note.id,{...value,version:note.version}):client.notes!.createNote(value),onSuccess:()=>{message.success(note?'笔记已保存':'笔记已创建');onSaved();}});
 return <Modal title={note?'编辑笔记':'新建笔记'} pending={save.isPending} onClose={onClose}><Form className="flow-form note-form" schema={note?'NoteUpdate':'NoteInput'} value={note?{...value,version:note.version}:value} pending={save.isPending} error={save.error} onSubmit={()=>save.mutate()}>
  <label>标题<input name="title" required maxLength={120} placeholder="给这条笔记一个名字" value={value.title} onChange={e=>setValue(v=>({...v,title:e.target.value}))}/></label>
  <label>正文<textarea name="body" maxLength={5000} rows={6} placeholder="写下细节、计划或下一步…" value={value.body} onChange={e=>setValue(v=>({...v,body:e.target.value}))}/></label>
  <label>状态<select name="status" value={value.status} onChange={e=>setValue(v=>({...v,status:e.target.value as NoteInput['status']}))}><option value="open">进行中</option><option value="done">已完成</option></select></label>
  {metadata.profile==='web-platform'&&client.files&&<fieldset className="note-attachment-picker"><legend><Paperclip size={14}/>附件</legend><p className="help-text">先在“我的文件”上传，再选择本人文件。最多 5 个。</p><input aria-label="搜索可选附件" placeholder="搜索本人文件" maxLength={128} value={fileSearch} onChange={e=>setFileSearch(e.target.value)}/><select aria-label="添加已有附件" disabled={value.attachment_ids.length>=5} value="" onChange={e=>{if(e.target.value)setValue(v=>({...v,attachment_ids:[...v.attachment_ids,e.target.value]}));}}><option value="">选择本人文件</option>{mine.filter(f=>!value.attachment_ids.includes(f.file_id)).map(f=><option key={f.file_id} value={f.file_id}>{f.original_name}</option>)}</select>{files.isError&&<p role="alert">{files.error.message}</p>}{value.attachment_ids.map((id,index)=><div className="note-selected-file" key={id}><Paperclip size={14}/><span>{mine.find(f=>f.file_id===id)?.original_name??`已选附件 ${index+1}`}</span><button type="button" className="icon-button" aria-label={`移除附件 ${index+1}`} onClick={()=>setValue(v=>({...v,attachment_ids:v.attachment_ids.filter(f=>f!==id)}))}><X size={15}/></button></div>)}</fieldset>}
  {save.error?.message&&<p className="help-text">{save.error.message}</p>}
  <div className="dialog-actions"><button type="button" className="secondary-button" disabled={save.isPending} onClick={onClose}>取消</button><button className="primary-button" disabled={save.isPending}>{save.isPending?'保存中…':'保存笔记'}</button></div>
 </Form></Modal>;
}
