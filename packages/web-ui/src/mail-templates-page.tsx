// Author: yunnuo <ymz@ebox.vip>
// Description: Administrator template drafts, named variables and one renderer for preview and actual delivery.
import {useRef,useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Braces,Eye,Send,Save,RotateCcw,MailCheck} from 'lucide-react';
import type {WebClient,MailTemplate,MailTemplateInput} from '@unicore/sdk';
import {defineMessages,useI18n} from './i18n';
import {Tabs} from './tabs';
import {Form} from './forms';
import {Modal} from './modal';
import {useMessage} from './message';
import {RichTextEditor,type RichTextHandle} from './rich-text-editor';
import './management.css';
const labels=defineMessages({test:'服务测试',verify:'注册验证',login:'登录验证码',reset:'密码重置',notification:'系统通知'});
const variables:Record<string,string>=defineMessages({site_name:'站点名称',site_url:'站点地址',code:'验证码',expires_minutes:'有效分钟数',title:'通知标题',detail:'通知详情'});
export function MailTemplates({web}:{web:WebClient}){
 const {t}=useI18n(),message=useMessage(),cache=useQueryClient();const [purpose,setPurpose]=useState<MailTemplateInput['purpose']>('verify');
 const query=useQuery({queryKey:['mail-templates'],queryFn:()=>web.mailTemplates()});
 const [drafts,setDrafts]=useState<Record<string,MailTemplateInput>>({}),[preview,setPreview]=useState<MailTemplate|null>(null),[testing,setTesting]=useState(false),[reset,setReset]=useState(false),[recipient,setRecipient]=useState('');
 const subject=useRef<HTMLInputElement>(null),editor=useRef<RichTextHandle>(null),target=useRef<'subject'|'body'>('body');
 const selected=query.data?.items.find(v=>v.purpose===purpose);const draft=drafts[purpose]??(selected?{purpose,subject:selected.subject,body:selected.body}:null);
 const dirty=!!draft&&!!selected&&(draft.subject!==selected.subject||draft.body!==selected.body);
 const update=(patch:Partial<MailTemplateInput>)=>{if(draft)setDrafts(v=>({...v,[purpose]:{...draft,...patch}}));};
 const apply=(value:MailTemplate)=>{cache.setQueryData(['mail-templates'],(old:{items:MailTemplate[]}|undefined)=>old?{items:old.items.map(v=>v.purpose===value.purpose?value:v)}:old);setDrafts(v=>{const next={...v};delete next[value.purpose];return next;});};
 const save=useMutation({mutationFn:()=>web.saveMailTemplate(draft!),onSuccess:value=>{apply(value);message.success(t('邮件模板已保存'));}});
 const previewer=useMutation({mutationFn:()=>web.previewMailTemplate(draft!),onSuccess:setPreview});
 const test=useMutation({mutationFn:()=>web.testMailTemplate({template:draft!,recipient}),onSuccess:()=>{setTesting(false);message.success(t('测试邮件已发送'));}});
 const restore=useMutation({mutationFn:()=>web.resetMailTemplate(purpose),onSuccess:value=>{apply(value);setReset(false);message.success(t('已恢复默认邮件模板'));}});
 const pending=save.isPending||previewer.isPending||test.isPending||restore.isPending;
 const insert=(key:string)=>{const text=`{{${key}}}`;if(target.current==='subject'&&subject.current&&draft){const node=subject.current,start=node.selectionStart??draft.subject.length,end=node.selectionEnd??start;update({subject:draft.subject.slice(0,start)+text+draft.subject.slice(end)});node.focus();requestAnimationFrame(()=>node.setSelectionRange(start+text.length,start+text.length));}else editor.current?.insert(text);};
 return <div className="management-workspace mail-template-workspace"><div className="template-intro"><MailCheck size={19}/><span>{t('品牌页眉与页脚统一保留，以下内容用于实际发送。')}</span></div>
 <Tabs id="mail-template" label={t('邮件模板类型')} value={purpose} onChange={id=>{if(!pending)setPurpose(id as MailTemplateInput['purpose']);}} items={Object.entries(labels).map(([id,label])=>({id,label:t(label),dirty:!!drafts[id]&&(drafts[id].subject!==query.data?.items.find(v=>v.purpose===id)?.subject||drafts[id].body!==query.data?.items.find(v=>v.purpose===id)?.body)}))}/>
 {query.isPending?<div role="status" className="management-state">{t('正在读取邮件模板…')}</div>:query.error?<div className="management-state"><p role="alert">{t(query.error.message)}</p><button className="secondary-button" onClick={()=>query.refetch()}>{t('重试')}</button></div>:draft&&<Form className="template-form" role="tabpanel" id={`mail-template-panel-${purpose}`} aria-labelledby={`mail-template-tab-${purpose}`} schema="MailTemplateInput" value={draft} pending={pending} error={save.error??previewer.error??test.error} onSubmit={()=>save.mutate()}>
 <div className="template-field-heading"><label htmlFor="template-subject">{t('邮件主题')}</label><span className={`template-status ${dirty?'is-dirty':''}`}>{dirty?t('未保存'):selected?.customized?t('已自定义'):t('默认模板')}</span></div>
 <input ref={subject} id="template-subject" name="subject" required maxLength={160} value={draft.subject} disabled={pending} onFocus={()=>target.current='subject'} onChange={e=>update({subject:e.target.value})}/>
 <div className="template-variables"><span><Braces size={15}/>{t('插入变量')}</span><div>{selected?.variables.map(v=><button type="button" key={v.key} disabled={pending} title={`{{${v.key}}} · ${v.sample}`} onMouseDown={event=>event.preventDefault()} onClick={()=>insert(v.key)}>{t(variables[v.key]??v.key)}<code>{`{{${v.key}}}`}</code></button>)}</div></div>
 <div className="template-field-heading"><strong>{t('邮件内容')}</strong><small>{t('支持段落、加粗、斜体、列表与安全链接。')}</small></div>
 <div onFocusCapture={event=>{if(!(event.target as HTMLElement).closest('.rich-toolbar'))target.current='body';}}><RichTextEditor key={purpose} ref={editor} label={t('邮件内容')} value={draft.body} onChange={body=>update({body})} disabled={pending}/></div>
 <p className="template-help">{['verify','login','reset'].includes(purpose)?t('验证码模板必须保留 {{code}}，测试与预览使用固定示例码。'):t('变量仅来自当前场景，邮件内容不会执行脚本或加载外部图片。')}</p>
 <div className="template-actions"><button className="primary-button" type="submit" disabled={pending||!dirty}><Save size={16}/>{save.isPending?t('保存中…'):t('保存')}</button><button className="secondary-button" type="button" disabled={pending} onClick={()=>previewer.mutate()}><Eye size={16}/>{previewer.isPending?t('生成预览…'):t('预览')}</button><button className="secondary-button" type="button" disabled={pending} onClick={()=>setTesting(true)}><Send size={16}/>{t('测试发送')}</button><button className="text-button template-reset" type="button" disabled={pending||(!selected?.customized&&!dirty)} onClick={()=>setReset(true)}><RotateCcw size={15}/>{t('恢复默认')}</button></div>
 </Form>}
 {preview&&<Modal title={t('邮件预览')} onClose={()=>setPreview(null)}><div className="template-preview"><p>{t('预览当前草稿；未保存的内容不会影响实际业务邮件。')}</p><iframe title={t('邮件预览内容')} sandbox="" srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">${preview.html}`}/></div></Modal>}
 {testing&&<Modal title={t('测试发送')} onClose={()=>setTesting(false)} pending={test.isPending}><Form className="flow-form" pending={test.isPending} onSubmit={()=>test.mutate()}><p className="template-help">{t('将当前草稿发送到指定邮箱，不会保存或修改账号流程。')}</p><label>{t('测试收件邮箱')}<input type="email" required maxLength={254} value={recipient} disabled={test.isPending} onChange={e=>setRecipient(e.target.value)}/></label><div className="dialog-actions"><button className="secondary-button" type="button" disabled={test.isPending} onClick={()=>setTesting(false)}>{t('取消')}</button><button className="primary-button" disabled={test.isPending}><Send size={16}/>{test.isPending?t('发送中…'):t('发送测试邮件')}</button></div></Form></Modal>}
 {reset&&<Modal title={t('恢复默认邮件模板')} onClose={()=>setReset(false)} pending={restore.isPending}><div className="flow-form"><p>{t('当前模板的自定义内容和草稿将被默认模板替换，其他模板保持不变。')}</p><div className="dialog-actions"><button className="secondary-button" disabled={restore.isPending} onClick={()=>setReset(false)}>{t('取消')}</button><button className="primary-button" disabled={restore.isPending} onClick={()=>restore.mutate()}>{t('确认恢复')}</button></div></div></Modal>}
 </div>;
}
