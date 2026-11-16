import { isAdministrator } from '../../routes';
// Author: yunnuo <ymz@ebox.vip>
// Description: Dedicated channel, plain-text template and event-routing settings with bilingual accessible controls.
import { useId, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Braces, Eye, Send, ShieldCheck, Webhook } from 'lucide-react';
import type { NotifyConfiguration, NotifyPreview, NotifyTemplate, NotifyTest, WebClient } from '@unicore/sdk';
import { useI18n } from '../../i18n';
import { AppForm, useAppForm } from '@unicore/form';
import { Button, Card, CardContent, Checkbox, Input, Textarea, Modal, RadioGroup, RadioGroupItem, Switch as Toggle, Tabs, useMessage } from '@unicore/ui';
import type { PageProps } from '../../router';

type Section='channels'|'templates'|'system';
export function AdminNotificationsPage({client,page,metadata}:PageProps){if(!client.web)return null;return <fieldset className="contents" disabled={!isAdministrator(metadata)}><NotificationPanel web={client.web} section={page==='notification-channels'?'channels':page==='notification-templates'?'templates':'system'}/></fieldset>}
function NotificationPanel({web,section}:{web:WebClient;section:Section}){
 const {t}=useI18n();
 const query=useQuery({queryKey:['notification-settings'],queryFn:()=>web.notificationSettings()});
 if(query.isPending)return <p role="status">{t('正在读取通知设置…')}</p>;
 if(query.isError)return <Card><CardContent><p role="alert">{t(query.error.message)}</p><Button onClick={()=>void query.refetch()}>{t('重试')}</Button></CardContent></Card>;
 // The key remounts the draft form per section, mirroring the former per-section draft reset.
 return <NotificationForm key={section} web={web} section={section} initial={query.data}/>;
}
function NotificationForm({web,section,initial}:{web:WebClient;section:Section;initial:NotifyConfiguration}){
 const {t,locale}=useI18n();const message=useMessage();const cache=useQueryClient();
 const form=useAppForm<NotifyConfiguration>({defaultValues:initial,onSubmit:async values=>{save.mutate(values)}});
 const values=form.watch();const dirty=form.formState.isDirty;
 const [audience,setAudience]=useState('user');const [event,setEvent]=useState('login');const [preview,setPreview]=useState<NotifyPreview|null>(null);const [testing,setTesting]=useState<NotifyTemplate|null>(null);
 const titleRef=useRef<HTMLInputElement>(null);const bodyRef=useRef<HTMLTextAreaElement>(null);const target=useRef<'title'|'body'>('body');
 const save=useMutation({mutationFn:(input:NotifyConfiguration)=>web.saveNotificationSettings({...input,section,catalog:undefined}),onSuccess:value=>{cache.setQueryData(['notification-settings'],value);form.reset(value);message.success(t('通知设置已保存'));},onError:form.applyServerError});
 const previewer=useMutation({mutationFn:(input:NotifyTemplate)=>web.previewNotification(input),onSuccess:setPreview,onError:error=>message.error(t(error.message))});
 const tester=useMutation({mutationFn:(input:NotifyTest)=>web.testNotification(input),onSuccess:()=>{setTesting(null);message.success(t('测试通知已发送'));},onError:error=>message.error(t(error.message))});
 const busy=save.isPending||previewer.isPending||tester.isPending;
 const change=(value:Partial<NotifyConfiguration>)=>{(Object.keys(value) as (keyof NotifyConfiguration)[]).forEach(key=>form.setValue(key,value[key] as never,{shouldDirty:true}))};
 const catalog=initial.catalog??[];
 const eventDefinition=(id:string)=>catalog.find(item=>item.id===id);
 const eventLabel=(id:string)=>{const item=eventDefinition(id);return item?(locale==='en'?item.label_en:item.label):id};
 const eventDescription=(id:string)=>{const item=eventDefinition(id);return item?(locale==='en'?item.description_en:item.description):''};
 const channelReady=initial.channel_enabled&&(initial.provider==='wecom'?initial.wecom_configured:initial.webhook_configured);
 const template=values.templates.find(item=>item.event===event);
 const updateTemplate=(value:Partial<NotifyTemplate>)=>{form.setValue('templates',values.templates.map(item=>item.event===event?{...item,...value}:item),{shouldDirty:true})};
 const insert=(key:string)=>{if(!template)return;const node=target.current==='title'?titleRef.current:bodyRef.current;if(!node)return;const field=target.current;const text=`{{${key}}}`;const start=node.selectionStart??node.value.length;const end=node.selectionEnd??start;updateTemplate({[field]:node.value.slice(0,start)+text+node.value.slice(end)});node.focus();requestAnimationFrame(()=>node.setSelectionRange(start+text.length,start+text.length));};
 const saveButton=<Button type="submit" pending={save.isPending} disabled={busy||!dirty}>{save.isPending?t('保存中…'):t('保存设置')}</Button>;
 return <AppForm form={form} className="flex flex-col gap-5">
  {section==='channels'&&<>
   <Card><CardContent className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-start gap-3"><div className="rounded-lg bg-primary-soft p-2 text-accent"><Webhook size={20}/></div><div><h2 className="font-semibold">{t('启用通知渠道')}</h2><p className="mt-1 text-sm text-muted">{t('关闭后停止企业微信和 Webhook 投递，邮件通知独立控制。')}</p></div></div><Switch checked={values.channel_enabled} disabled={busy} onChange={value=>change({channel_enabled:value})}>{t('启用通知渠道')}</Switch></CardContent></Card>
   <Card><CardContent className="flex flex-col gap-5"><div><h2 className="font-semibold">{t('选择通知渠道')}</h2><p className="mt-1 text-sm text-muted">{t('企业微信与自定义 Webhook 只能启用一个，切换时保留各自配置。')}</p></div>
    <RadioGroup label={t('选择通知渠道')} name="notification-provider" value={values.provider} disabled={busy} onValueChange={provider=>change({provider:provider as NotifyConfiguration['provider']})} className="grid gap-3 sm:grid-cols-2">{(['wecom','webhook'] as const).map(provider=><RadioGroupItem key={provider} value={provider} itemLabel={provider==='wecom'?t('企业微信群机器人'):t('自定义 Webhook')} className="h-full gap-3 p-4 text-start"><span className="min-w-0 flex-1"><strong className="text-sm font-medium">{provider==='wecom'?t('企业微信群机器人'):t('自定义 Webhook')}</strong><span className="mt-1 block text-xs text-muted">{provider==='wecom'?t('将消息发送到企业微信群。'):t('通过 HTTPS 对接外部通知服务。')}</span></span></RadioGroupItem>)}</RadioGroup>
    {values.provider==='wecom'?<SecretField label={t('机器人 Key')} value={values.wecom_key} configured={values.wecom_configured} clear={values.clear_wecom_key} disabled={busy} onChange={value=>change({wecom_key:value,clear_wecom_key:false})} onClear={value=>change({wecom_key:'',clear_wecom_key:value})}/>:<>
     <SecretField label={t('回调地址')} value={values.webhook_url} configured={values.webhook_configured} clear={values.clear_webhook_url} disabled={busy} onChange={value=>change({webhook_url:value,clear_webhook_url:false})} onClear={value=>change({webhook_url:'',clear_webhook_url:value})}/>
     <SecretField label={t('签名密钥（可选）')} value={values.signing_secret} configured={values.signing_configured} clear={values.clear_signing_secret} disabled={busy} onChange={value=>change({signing_secret:value,clear_signing_secret:false})} onClear={value=>change({signing_secret:'',clear_signing_secret:value})}/>
     <p className="rounded-lg border border-line bg-surface-alt p-3 text-xs leading-relaxed text-muted">{t('请求体使用 JSON。填写密钥后，以 HMAC-SHA256 对原始请求体签名，通过 X-Unicore-Signature 传递十六进制摘要。仅允许公网 HTTPS 地址，不跟随重定向。')}</p>
    </>}
    <p className="flex items-center gap-2 text-xs text-muted"><ShieldCheck size={15}/>{t('凭据加密存储；已保存的密钥不会回显，留空表示保持不变。')}</p>
    <div className="flex flex-wrap gap-2 border-t border-line pt-4">{saveButton}<Button variant="secondary" disabled={busy||dirty||!channelReady} onClick={()=>setTesting(values.templates[0])}><Send size={15}/>{t('测试发送')}</Button></div>
    {dirty&&<p className="text-xs text-muted">{t('请先保存渠道配置，再发送测试通知。')}</p>}
   </CardContent></Card>
  </>}
  {section==='templates'&&<div className="grid min-w-0 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
   <Card><CardContent className="flex flex-col gap-1"><p className="mb-2 px-2 text-xs font-semibold text-muted">{t('通知场景')}</p>{values.templates.map(item=><button type="button" key={item.event} aria-pressed={event===item.event} onClick={()=>setEvent(item.event)} className={`rounded-lg px-3 py-2.5 text-start text-sm transition-colors ${event===item.event?'bg-primary-soft font-medium text-accent':'text-muted hover:bg-surface-hover'}`}>{eventLabel(item.event)}</button>)}</CardContent></Card>
   {template&&<Card><CardContent className="flex flex-col gap-5"><div><h2 className="font-semibold">{eventLabel(event)}</h2><p className="mt-1 text-sm text-muted">{t('通知渠道使用纯文本，不支持 HTML 标签。')}</p></div>
    <div className="flex flex-col gap-2 text-sm font-medium"><Input label={t('通知标题')} ref={titleRef} value={template.title} required maxLength={160} disabled={busy} onFocus={()=>{target.current='title'}} onChange={e=>updateTemplate({title:e.target.value})}/></div>
    <div className="flex flex-wrap gap-2"><span className="flex items-center gap-1 text-xs text-muted"><Braces size={14}/>{t('插入变量')}</span>{(eventDefinition(event)?.variables??[]).map(({key,label,label_en})=><Button variant="secondary" size="sm" key={key} disabled={busy} title={`{{${key}}}`} onMouseDown={e=>e.preventDefault()} onClick={()=>insert(key)}>{locale==='en'?label_en:label}</Button>)}</div>
    <div className="flex flex-col gap-2 text-sm font-medium"><Textarea label={t('通知内容')} aria-label={t('通知内容')} ref={bodyRef} className="min-h-64 font-mono text-sm" value={template.body} required maxLength={4000} disabled={busy} onFocus={()=>{target.current='body'}} onChange={e=>updateTemplate({body:e.target.value})}/></div>
    <div className="flex flex-wrap gap-2 border-t border-line pt-4">{saveButton}<Button variant="secondary" disabled={busy} onClick={()=>previewer.mutate(template)}><Eye size={15}/>{t('预览')}</Button><Button variant="secondary" disabled={busy||!channelReady} onClick={()=>setTesting(template)}><Send size={15}/>{t('测试发送')}</Button></div><p className="text-xs text-muted">{t('预览与测试使用当前草稿和示例数据，不会保存模板。')}</p>
   </CardContent></Card>}
  </div>}
  {section==='system'&&<>
   <Card><CardContent className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-start gap-3"><div className="rounded-lg bg-primary-soft p-2 text-accent"><Bell size={20}/></div><div><h2 className="font-semibold">{t('启用系统通知')}</h2><p className="mt-1 text-sm text-muted">{t('统一控制自动事件通知，默认关闭；验证码与密码找回不受影响。')}</p></div></div><Switch checked={values.enabled} disabled={busy} onChange={value=>change({enabled:value})}>{t('启用系统通知')}</Switch></CardContent></Card>
   <Card><CardContent className="flex flex-col gap-4"><Tabs id="notification-audience" label={t('通知对象')} value={audience} onChange={setAudience} items={[{id:'user',label:t('普通用户通知')},{id:'admin',label:t('管理员通知')}]}/><p className="text-sm text-muted">{audience==='user'?t('发送给事件所属普通用户，仅通过邮件。'):t('邮件发送到基础设置中的管理员邮箱，渠道消息发送到当前通知渠道。')}</p>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-line text-start text-xs text-muted"><th className="py-3 text-start font-medium">{t('事件')}</th><th className="w-24 text-center font-medium">{t('邮件通知')}</th>{audience==='admin'&&<th className="w-24 text-center font-medium">{t('通知渠道')}</th>}</tr></thead><tbody>{values.rules.filter(rule=>audience!=='user'||eventDefinition(rule.event)?.user_email_allowed).map(rule=><tr key={rule.event} className="border-b border-line last:border-0"><td className="py-4 pe-4"><p className="font-medium">{eventLabel(rule.event)}</p><p className="mt-1 max-w-xl text-xs leading-relaxed text-muted">{eventDescription(rule.event)}</p></td>{(audience==='user'?['user_email']:['admin_email','admin_channel']).map(field=><td className="px-2 text-center" key={field}><Switch checked={rule[field as 'user_email']} disabled={busy||(audience==='user'&&rule.event==='ip_banned')} onChange={value=>change({rules:values.rules.map(item=>item.event===rule.event?{...item,[field]:value}:item)})}>{`${eventLabel(rule.event)} · ${field==='admin_channel'?t('通知渠道'):t('邮件通知')}`}</Switch></td>)}</tr>)}</tbody></table></div>
    <div className="rounded-lg border border-line bg-surface-alt p-4 text-xs leading-6 text-muted"><p>{t('邮件通知依赖已经测试通过的 SMTP；缺少收件邮箱时跳过该收件人。')}</p><p>{t('管理员渠道通知依赖通知渠道总开关及对应配置。')}</p><p>{t('通知与业务事务一起入队，异步发送，失败最多尝试 5 次；操作日志可查看投递状态。')}</p><p>{t('IP 封禁事件无法确认账户归属，仅通知管理员。')}</p><p>{t('运行告警与其他事件一致，受「启用系统通知」总开关统一控制；开启后默认通知管理员邮箱，企业微信与 Webhook 需单独开启。')}</p></div>
    <div className="border-t border-line pt-4">{saveButton}</div>
   </CardContent></Card>
  </>}
  {preview&&<Modal title={t('通知预览')} onClose={()=>setPreview(null)}><div className="flex flex-col gap-4"><h3 className="break-words font-semibold">{preview.title}</h3><pre className="whitespace-pre-wrap break-words rounded-lg bg-surface-alt p-4 font-sans text-sm leading-7">{preview.body}</pre></div></Modal>}
  {testing&&<Modal title={t('测试发送')} pending={tester.isPending} onClose={()=>setTesting(null)}><div className="flex flex-col gap-4"><p className="text-sm text-muted">{t('使用当前模板草稿和示例数据，发送到已保存的通知渠道。')}</p><p className="rounded-lg border border-line bg-surface-alt p-3 text-sm font-medium">{initial.provider==='wecom'?t('企业微信群机器人'):t('自定义 Webhook')}</p><div className="flex justify-end gap-2"><Button variant="secondary" disabled={tester.isPending} onClick={()=>setTesting(null)}>{t('取消')}</Button><Button pending={tester.isPending} disabled={!channelReady} onClick={()=>tester.mutate({template:testing,destination:'channel',recipient:''})}>{t('发送测试通知')}</Button></div></div></Modal>}
 </AppForm>;
}
function SecretField({label,value,configured,clear,disabled,onChange,onClear}:{label:string;value:string;configured:boolean;clear:boolean;disabled:boolean;onChange:(value:string)=>void;onClear:(value:boolean)=>void}){
 const {t}=useI18n();const hintID=useId();return <div className="flex flex-col gap-2"><div className="flex flex-col gap-2 text-sm font-medium"><Input aria-describedby={hintID} label={label} strength={false} type="password" autoComplete="new-password" value={value} disabled={disabled||clear} maxLength={2048} placeholder={configured?t('已配置，留空保持不变'):t('尚未配置')} onChange={e=>onChange(e.target.value)}/><p id={hintID} className="text-xs font-normal text-muted">{configured?t('已配置，留空保持不变'):t('尚未配置')}</p></div>{configured&&<Checkbox checked={clear} disabled={disabled} onChange={onClear}>{t('清除此项已保存的凭据')}</Checkbox>}</div>
}

function Switch({children,...props}:{children:ReactNode;checked:boolean;disabled?:boolean;onChange:(value:boolean)=>void}){const id=useId();return <span className="inline-flex"><label className="sr-only" htmlFor={id}>{children}</label><Toggle id={id} {...props}/></span>}
