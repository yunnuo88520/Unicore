/** Author: yunnuo <ymz@ebox.vip>
 * Description: Shared offline-first update history, explicit checks and confirmed signed installation.
 */
import { t, useLocale, currentLocale } from './i18n';
import {useEffect,useRef,useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {ArrowRight,CheckCircle2,Download,History,LoaderCircle,RefreshCw,ShieldCheck,WifiOff} from 'lucide-react';
import type {AppClient,Bootstrap,UpdateRelease} from '@unicore/sdk';
import {Modal} from './modal';
import {Form,Field} from './forms';
import {useMessage} from './message';
import './updates.css';
const busy=(status?:string)=>['downloading','preparing','restarting','swapping','awaiting_health','rolling_back'].includes(status??'');
export function UpdatePanel({client,metadata}:{client:AppClient;metadata:Bootstrap}){
  useLocale();
 const [confirm,setConfirm]=useState(false),[backup,setBackup]=useState(false);const messages=useMessage(),queries=useQueryClient();const initiated=useRef(false);
 const query=useQuery({queryKey:['system-updates'],queryFn:()=>client.updates!.overview(),enabled:!!client.updates,refetchInterval:q=>busy(q.state.data?.job.status)?1000:false,retry:2});
 const check=useMutation({mutationFn:()=>client.updates!.check(),onSuccess:data=>{queries.setQueryData(['system-updates'],data);if(data.last_error)messages.warning(t('暂时无法完成检查，更新日志已保留'));else if(data.available)messages.success(t('发现新版本'));else messages.info(t('已完成版本检查'));}});
 const apply=useMutation({mutationFn:()=>client.updates!.apply({version:query.data!.latest_version,backup_confirmed:backup}),onSuccess:()=>{initiated.current=true;setConfirm(false);setBackup(false);messages.info(t('更新任务已开始，准备完成后将重启'));void query.refetch();}});
 const data=query.data,running=busy(data?.job.status);
 useEffect(()=>{if(initiated.current&&data&&!busy(data.job.status)&&['completed','rolled_back','failed'].includes(data.job.status)){initiated.current=false;if(data.job.status==='completed')messages.success(t('新版本已通过启动确认'));else messages.warning(data.job.message);if(client.transport==='http'&&data.current_version!==metadata.version)window.location.reload();}},[data?.job.status,data?.current_version]);
 return <div className="update-page">
  <section className="panel update-status" aria-label={t("在线更新")}><div className="panel-heading"><div><h2><Download size={19}/>{t("在线更新")}</h2><p>{t("检查新版本，验证更新包后安装并重启。")}</p></div><div className="update-actions"><button className="secondary-button" disabled={check.isPending||running||!data} onClick={()=>check.mutate()}>{check.isPending?<LoaderCircle size={15} className="spin"/>:<RefreshCw size={15}/>}{t("检查更新")}</button><button className="primary-button" disabled={!data?.can_apply||running} onClick={()=>{setBackup(false);setConfirm(true);}}><Download size={15}/>{t("更新并重启")}</button></div></div>
  <div className="update-version"><div><span>{t("当前版本")}</span><strong>v{data?.current_version??metadata.version}</strong></div><ArrowRight size={17}/><div><span>{t("最新版本")}</span><strong>{data?.latest_version?`v${data.latest_version}`:t('等待检查')}</strong></div><span className={`subtle-badge ${data?.available?'update-new':''}`}>{running?t('更新进行中'):data?.available?t('发现新版本'):data?.checked_at?t('已完成检查'):t('尚未联网检查')}</span></div>
  {data?.last_error&&<p className="update-network" role="status"><WifiOff size={16}/>{data.last_error}</p>}
  {data?.verified&&data.available&&<p className="update-trust"><ShieldCheck size={16}/>{t("更新包已通过发行者签名与兼容性检查")}</p>}
  {data&&!running&&<p className="help-text">{data.can_apply?t('安装前请备份实例数据；更新不会覆盖数据目录。'):data.reason}</p>}
  {running&&<div className="update-progress" role="status"><span><LoaderCircle size={15} className="spin"/>{t(data?.job.message)}</span><progress value={data?.job.progress??0} max={100} aria-label={t("更新进度")}/><small>{t("重启期间连接会短暂中断，页面将自动重连。")}</small></div>}
  {data?.job.status&&['completed','rolled_back','failed'].includes(data.job.status)&&<div className={`update-outcome ${data.job.status==='completed'?'is-success':''}`} role="status"><CheckCircle2 size={16}/><span>{t(data.job.message)}{data.job.finished_at&&` · ${new Date(data.job.finished_at).toLocaleString(currentLocale())}`}</span></div>}
  {query.isError&&<p className="update-network" role="alert">{running?t('服务正在重启，正在尝试重新连接。'):t('暂时无法读取本机更新信息。')}<button className="text-button" onClick={()=>query.refetch()}>{t("重试")}</button></p>}
  <div className="update-source"><span>{data?.source??t('本机版本记录')}{data?.channel==='preview'?t(' · 开发预览渠道'):''}</span><small>{data?.checked_at?t("上次检查 {{v0}}",{v0:new Date(data.checked_at).toLocaleString(currentLocale())}):t('仅在点击检查时联网')}</small></div>
  </section>
  <section className="panel update-history" aria-label={t("更新日志")}><div className="panel-heading"><div><h2><History size={19}/>{t("更新日志")}</h2><p>{t("随应用内置，保留已获取的版本历史，离线也能阅读。")}</p></div><span className="subtle-badge">{t("{{count}} 个版本",{count:data?.history.length??0})}</span></div>
   <div className="update-history-list">{query.isPending?<p className="help-text" role="status">{t("正在读取本机版本记录…")}</p>:data?.history.length?data.history.map((release,index)=><article className="update-release" key={release.version}><header><div><h3>v{release.version}</h3>{release.version===data.current_version&&<span className="subtle-badge">{t("当前")}</span>}{index===0&&<span className="subtle-badge update-new">{t("最新记录")}</span>}</div><time dateTime={release.published_at}>{new Date(release.published_at).toLocaleDateString(currentLocale())}</time></header><ReleaseNotes release={release}/><footer><small>{release.source}{release.prerelease?t(' · 开发预览'):''}</small>{/^https:\/\//.test(release.url)&&<a href={release.url} target="_blank" rel="noopener noreferrer">{t("查看发行详情")}</a>}</footer></article>):<p className="help-text">{t("此应用尚未内置版本记录，请维护项目的 CHANGELOG 后重新构建。")}</p>}</div>
  </section>
  {confirm&&data&&<Modal title={t("确认更新并重启")} pending={apply.isPending} onClose={()=>setConfirm(false)}><Form className="flow-form update-confirm" pending={apply.isPending} onSubmit={event=>{event.preventDefault();apply.mutate();}}><p className="help-text">{t("即将从 v{{current}} 更新到 v{{latest}}。下载与校验完成后服务会短暂重启，启动确认失败会恢复旧程序。",{current:data.current_version,latest:data.latest_version})}</p><Field name="backup_confirmed" label={t("我已备份数据库、文件、配置和实例密钥")}><input type="checkbox" required checked={backup} onChange={event=>setBackup(event.target.checked)}/></Field><p className="help-text">{t("需要数据库结构迁移的版本须按部署手册人工升级。本次操作只接受兼容的签名更新包。")}</p><div className="dialog-actions"><button className="secondary-button" type="button" onClick={()=>setConfirm(false)}>{t("取消")}</button><button className="primary-button" disabled={!backup||apply.isPending}>{apply.isPending?<LoaderCircle size={15} className="spin"/>:<Download size={15}/>}{t("确认更新")}</button></div></Form></Modal>}
 </div>;
}
// A small text-only Markdown subset; remote HTML, images and executable links are never interpreted.
function ReleaseNotes({release}:{release:UpdateRelease}){
  useLocale();
 const lines=release.notes.split('\n').filter(line=>line.trim()&&!/^<!--/.test(line));
 return <div className="update-notes">{lines.map((line,index)=>/^[-*] /.test(line)?<p className="update-note-item" key={index}><span aria-hidden="true">•</span>{line.slice(2).replace(/`([^`]+)`/g,'$1')}</p>:<p className={/^#{1,6} /.test(line)?'update-note-heading':''} key={index}>{line.replace(/^#{1,6} /,'').replace(/`([^`]+)`/g,'$1')}</p>)}</div>;
}
