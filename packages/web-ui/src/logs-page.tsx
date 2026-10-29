/** Author: yunnuo <ymz@ebox.vip>
 * Description: Audit and delivery records belong to system logs, independently of configuration.
 */
import {defineMessages, t, useLocale, currentLocale } from './i18n';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { WebClient } from '@unicore/sdk';
import { Tabs } from './tabs';
const actions:Record<string,string>=defineMessages({"users.created":"新增用户","users.updated":"更新用户状态","administrators.created":"新增管理员","administrators.updated":"更新管理员状态","settings.updated":"更新系统设置","auth.login":"账号登录","account.password.changed":"修改密码","mail.notification.queued":"系统通知入队","auth.verify.requested":"申请邮箱验证","auth.verify.completed":"完成邮箱验证","auth.reset.requested":"申请密码重置","auth.reset.completed":"完成密码重置","auth.login.requested":"申请邮箱登录","auth.login.completed":"邮箱登录成功","oidc.login":"企业账号登录","oidc.link":"绑定企业身份","oidc.unlink":"解除企业绑定"});
export function SystemLogs({web}:{web:WebClient}){
  useLocale();
 const [tab,setTab]=useState('audit');
 const audit=useQuery({queryKey:['system-logs'],queryFn:()=>web.systemLogs(),enabled:tab==='audit'});
 const mail=useQuery({queryKey:['mail-jobs'],queryFn:()=>web.mailJobs(),enabled:tab==='mail',refetchInterval:tab==='mail'?5000:false});
 const state:Record<string,string>={pending:t('待发送'),sending:t('发送中'),sent:t('已发送'),dead:t('已终止'),cancelled:t('已取消')};
 const query=tab==='audit'?audit:mail;
 return <div className="settings-workspace"><Tabs id="system-logs" label={t("日志类型")} value={tab} onChange={setTab} items={[{id:'audit',label:t('操作日志')},{id:'mail',label:t('邮件投递')}]}/><section className="panel" role="tabpanel" id={`system-logs-panel-${tab}`} aria-labelledby={`system-logs-tab-${tab}`}><div className="panel-heading"><div><h2>{tab==='audit'?t('系统操作日志'):t('邮件投递记录')}</h2><p>{tab==='audit'?t("最近 50 条操作，共 {{v0}} 条；仅记录操作元信息",{v0:audit.data?.total??0}):t('最近 30 个任务；失败自动重试，最多 5 次')}</p></div></div>{query.isPending?<p className="flow-form" role="status">{t("正在读取日志…")}</p>:query.error?<div className="flow-form"><p role="alert" className="form-error">{t(query.error.message)}</p><button className="secondary-button" onClick={()=>query.refetch()}>{t("重试")}</button></div>:<div className="user-table-wrap"><table>{tab==='audit'?<><thead><tr><th>{t("操作")}</th><th>{t("操作者")}</th><th>{t("时间")}</th></tr></thead><tbody>{audit.data?.items.length?audit.data.items.map(item=><tr key={item.id}><td>{t(actions[item.action]??item.action)}</td><td>{item.actor_id==='bootstrap'?t('首次安装'):item.actor_id.slice(0,12)}</td><td>{new Date(item.created_at*1000).toLocaleString(currentLocale())}</td></tr>):<tr><td colSpan={3}>{t("暂无操作日志")}</td></tr>}</tbody></>:<><thead><tr><th>{t("状态")}</th><th>{t("尝试次数")}</th><th>{t("创建时间")}</th><th>{t("结果")}</th></tr></thead><tbody>{mail.data?.items.length?mail.data.items.map(item=><tr key={item.id}><td>{t(state[item.state]??item.state)}</td><td>{item.attempts}</td><td>{new Date(item.created_at*1000).toLocaleString(currentLocale())}</td><td>{item.last_error==='EXPIRED'?t('邮件已过期'):item.last_error?t('发送失败'):'—'}</td></tr>):<tr><td colSpan={4}>{t("暂无邮件任务")}</td></tr>}</tbody></>}</table></div>}</section></div>;
}
