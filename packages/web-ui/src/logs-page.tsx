/** Author: yunnuo <ymz@ebox.vip>
 * Description: Audit and delivery records belong to system logs, independently of configuration.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { WebClient } from '@unicore/sdk';
import { Tabs } from './tabs';
const actions:Record<string,string>={"users.created":"新增用户","users.updated":"更新用户状态","administrators.created":"新增管理员","administrators.updated":"更新管理员状态","settings.updated":"更新系统设置","auth.login":"账号登录","account.password.changed":"修改密码","mail.notification.queued":"系统通知入队","auth.verify.requested":"申请邮箱验证","auth.verify.completed":"完成邮箱验证","auth.reset.requested":"申请密码重置","auth.reset.completed":"完成密码重置","auth.login.requested":"申请邮箱登录","auth.login.completed":"邮箱登录成功","oidc.login":"企业账号登录","oidc.link":"绑定企业身份","oidc.unlink":"解除企业绑定"};
export function SystemLogs({web}:{web:WebClient}){
 const [tab,setTab]=useState('audit');
 const audit=useQuery({queryKey:['system-logs'],queryFn:()=>web.systemLogs(),enabled:tab==='audit'});
 const mail=useQuery({queryKey:['mail-jobs'],queryFn:()=>web.mailJobs(),enabled:tab==='mail',refetchInterval:tab==='mail'?5000:false});
 const state:Record<string,string>={pending:'待发送',sending:'发送中',sent:'已发送',dead:'已终止',cancelled:'已取消'};
 const query=tab==='audit'?audit:mail;
 return <div className="settings-workspace"><Tabs id="system-logs" label="日志类型" value={tab} onChange={setTab} items={[{id:'audit',label:'操作日志'},{id:'mail',label:'邮件投递'}]}/><section className="panel" role="tabpanel" id={`system-logs-panel-${tab}`} aria-labelledby={`system-logs-tab-${tab}`}><div className="panel-heading"><div><h2>{tab==='audit'?'系统操作日志':'邮件投递记录'}</h2><p>{tab==='audit'?`最近 50 条操作，共 ${audit.data?.total??0} 条；仅记录操作元信息`:'最近 30 个任务；失败自动重试，最多 5 次'}</p></div></div>{query.isPending?<p className="flow-form" role="status">正在读取日志…</p>:query.error?<div className="flow-form"><p role="alert" className="form-error">{query.error.message}</p><button className="secondary-button" onClick={()=>query.refetch()}>重试</button></div>:<div className="user-table-wrap"><table>{tab==='audit'?<><thead><tr><th>操作</th><th>操作者</th><th>时间</th></tr></thead><tbody>{audit.data?.items.length?audit.data.items.map(item=><tr key={item.id}><td>{actions[item.action]??item.action}</td><td>{item.actor_id==='bootstrap'?'首次安装':item.actor_id.slice(0,12)}</td><td>{new Date(item.created_at*1000).toLocaleString()}</td></tr>):<tr><td colSpan={3}>暂无操作日志</td></tr>}</tbody></>:<><thead><tr><th>状态</th><th>尝试次数</th><th>创建时间</th><th>结果</th></tr></thead><tbody>{mail.data?.items.length?mail.data.items.map(item=><tr key={item.id}><td>{state[item.state]??item.state}</td><td>{item.attempts}</td><td>{new Date(item.created_at*1000).toLocaleString()}</td><td>{item.last_error==='EXPIRED'?'邮件已过期':item.last_error?'发送失败':'—'}</td></tr>):<tr><td colSpan={4}>暂无邮件任务</td></tr>}</tbody></>}</table></div>}</section></div>;
}
