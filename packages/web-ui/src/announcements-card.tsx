// Author: yunnuo <ymz@ebox.vip>
// Description: User-only dashboard widget; disabled platform feeds disappear, detail is reauthorized on every open.
import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Megaphone,ChevronRight,Info,CheckCircle2,AlertTriangle,OctagonAlert} from 'lucide-react';
import type {WebClient,AnnouncementPublic} from '@unicore/sdk';
import {useI18n,currentLocale,defineMessages} from './i18n';
import {Modal} from './modal';
import {RichContent,contentSummary} from './rich-content';
import './announcements.css';
export const announcementTypes=defineMessages({info:'通知',success:'好消息',warning:'注意事项',error:'重要提醒'});
const icons={info:Info,success:CheckCircle2,warning:AlertTriangle,error:OctagonAlert};
export function AnnouncementType({type}:{type:AnnouncementPublic['type']}){const {t}=useI18n();const Icon=icons[type];return <span className={`announcement-type is-${type}`}><Icon size={13}/>{t(announcementTypes[type])}</span>;}
export function AnnouncementCard({web}:{web:WebClient}){
 const {t}=useI18n();const [page,setPage]=useState(1),[selected,setSelected]=useState('');
 const query=useQuery({queryKey:['announcements',page],queryFn:()=>web.announcements(page),refetchInterval:60000,refetchOnWindowFocus:'always'});
 if(query.data&&!query.data.enabled)return null;
 return <article className="panel announcement-card" aria-label={t('平台公告')}><div className="panel-heading"><div><h2><Megaphone size={18}/>{t('平台公告')}</h2><p>{t('来自平台的最新消息与重要通知')}</p></div><span className="subtle-badge">{query.data?.total??0}</span></div>
 {query.isPending?<div className="announcement-empty" role="status">{t('正在读取公告…')}</div>:query.error?<div className="announcement-empty"><p role="alert">{t(query.error.message)}</p><button className="secondary-button" onClick={()=>query.refetch()}>{t('重试')}</button></div>:!query.data?.items.length?<div className="announcement-empty"><span className="announcement-empty-icon"><Megaphone size={26}/></span><strong>{t('暂无公告')}</strong><p>{t('平台发布新公告后，将在这里展示。')}</p></div>:<div className="announcement-feed">{query.data.items.map(item=><button key={item.id} className="announcement-feed-item" onClick={()=>setSelected(item.id)}><span className={`announcement-feed-dot is-${item.type}`}/><div><div className="announcement-feed-meta"><AnnouncementType type={item.type}/><time dateTime={new Date(item.publish_at*1000).toISOString()}>{new Date(item.publish_at*1000).toLocaleString(currentLocale(),{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</time></div><p>{contentSummary(item.content_html)}</p></div><ChevronRight size={16}/></button>)}</div>}
 {!!query.data?.total&&query.data.total>5&&<div className="announcement-pagination"><button className="text-button" disabled={page===1} onClick={()=>setPage(v=>v-1)}>{t('上一页')}</button><small>{page} / {Math.ceil(query.data.total/5)}</small><button className="text-button" disabled={page*5>=query.data.total} onClick={()=>setPage(v=>v+1)}>{t('下一页')}</button></div>}
 {selected&&<AnnouncementDetail web={web} id={selected} onClose={()=>setSelected('')}/>}
 </article>;
}
function AnnouncementDetail({web,id,onClose}:{web:WebClient;id:string;onClose:()=>void}){
 const {t}=useI18n();const query=useQuery({queryKey:['announcement',id],queryFn:()=>web.announcement(id),staleTime:0,gcTime:0,retry:false});
 return <Modal title={t('公告详情')} onClose={onClose}>{query.isPending?<div className="announcement-empty" role="status">{t('正在读取公告…')}</div>:query.error?<div className="announcement-empty"><p role="alert">{t(query.error.message)}</p><button className="secondary-button" onClick={()=>query.refetch()}>{t('重试')}</button></div>:query.data&&<><div className="announcement-detail-meta"><AnnouncementType type={query.data.type}/><time>{new Date(query.data.publish_at*1000).toLocaleString(currentLocale())}</time></div><RichContent html={query.data.content_html}/></>}<div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>{t('关闭')}</button></div></Modal>;
}
