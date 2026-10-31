// Author: yunnuo <ymz@ebox.vip>
// Description: User-only dashboard widget; disabled platform feeds disappear, detail is reauthorized on every open.
import {useCallback,useEffect,useState} from 'react';
import {keepPreviousData,useQuery} from '@tanstack/react-query';
import {Megaphone,ChevronRight,ChevronDown,Pause,Play,Info,CheckCircle2,AlertTriangle,OctagonAlert} from 'lucide-react';
import type {WebClient,AnnouncementPublic} from '@unicore/sdk';
import {useI18n,currentLocale,defineMessages} from './i18n';
import {Modal} from './modal';
import {RichContent,contentSummary} from './rich-content';
import './announcements.css';
export const announcementTypes=defineMessages({info:'通知',success:'好消息',warning:'注意事项',error:'重要提醒'});
const icons={info:Info,success:CheckCircle2,warning:AlertTriangle,error:OctagonAlert};
export function AnnouncementType({type}:{type:AnnouncementPublic['type']}){const {t}=useI18n();const Icon=icons[type];return <span className={`announcement-type is-${type}`}><Icon size={13}/>{t(announcementTypes[type])}</span>;}
const feedSize=5;
export function AnnouncementCard({web}:{web:WebClient}){
 const {t}=useI18n();
 const [cursor,setCursor]=useState({page:1,index:0}),[selected,setSelected]=useState('');
 const [hovered,setHovered]=useState(false),[focused,setFocused]=useState(false),[stopped,setStopped]=useState(false);
 const [reducedMotion,setReducedMotion]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const query=useQuery({queryKey:['announcements',cursor.page,feedSize],queryFn:()=>web.announcements(cursor.page,feedSize),placeholderData:keepPreviousData,refetchInterval:60000,refetchOnWindowFocus:'always'});
 const feed=query.data;
 const index=feed?Math.min(query.isPlaceholderData?feed.items.length-1:cursor.index,feed.items.length-1):0;
 const item=feed?.items[index];
 const advance=useCallback(()=>{
  if(!feed?.items.length||query.isPlaceholderData)return;
  setCursor(current=>current.index+1<feed.items.length?{...current,index:current.index+1}:{page:current.page*feedSize<feed.total?current.page+1:1,index:0});
 },[feed,query.isPlaceholderData]);
 useEffect(()=>{
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const changed=()=>setReducedMotion(media.matches);media.addEventListener('change',changed);
  return()=>media.removeEventListener('change',changed);
 },[]);
 useEffect(()=>{
  if(feed&&!query.isPlaceholderData&&cursor.page>Math.max(1,Math.ceil(feed.total/feedSize)))setCursor({page:1,index:0});
 },[feed,query.isPlaceholderData,cursor.page]);
 useEffect(()=>{
  if(!feed?.enabled||feed.total<2||query.isFetching||reducedMotion||stopped||hovered||focused||selected)return;
  const timer=window.setInterval(()=>{if(!document.hidden)advance();},5000);
  return()=>window.clearInterval(timer);
 },[feed,query.isFetching,reducedMotion,stopped,hovered,focused,selected,advance]);
 if(query.isPending||(feed&&(!feed.enabled||feed.total===0)))return null;
 return <article className="panel announcement-card" data-multiple={!!feed&&feed.total>1} aria-label={t('平台公告')} onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocusCapture={()=>setFocused(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setFocused(false);}}>
 <div className="announcement-ticker-label"><Megaphone size={17}/><h2>{t('平台公告')}</h2></div>
 <div className="announcement-ticker-body">
 {query.error?<div className="announcement-ticker-state"><span role="alert">{t('公告暂时无法加载')}</span><button className="text-button" onClick={()=>query.refetch()}>{t('重试')}</button></div>:item&&<button className="announcement-feed-item" onClick={()=>setSelected(item.id)} aria-label={t('查看公告：{{content}}',{content:contentSummary(item.content_html)})}><span key={item.id} className="announcement-ticker-slide"><span className={`announcement-feed-dot is-${item.type}`} title={t(announcementTypes[item.type])}/><span className="announcement-ticker-summary">{contentSummary(item.content_html)}</span><time dateTime={new Date(item.publish_at*1000).toISOString()}>{new Date(item.publish_at*1000).toLocaleDateString(currentLocale(),{month:'2-digit',day:'2-digit'})}</time><ChevronRight size={15}/></span></button>}
 </div>
 {item&&feed&&feed.total>1&&<div className="announcement-ticker-controls"><span className="announcement-ticker-count">{(feed.page-1)*feedSize+index+1}<span>/</span>{feed.total}</span>{!reducedMotion&&<button className="icon-button" aria-label={t(stopped?'继续公告轮播':'暂停公告轮播')} title={t(stopped?'继续公告轮播':'暂停公告轮播')} onClick={()=>setStopped(value=>!value)}>{stopped?<Play size={13}/>:<Pause size={13}/>}</button>}<button className="icon-button" aria-label={t('下一条公告')} title={t('下一条公告')} disabled={query.isFetching} onClick={advance}><ChevronDown size={15}/></button></div>}
 {selected&&<AnnouncementDetail web={web} id={selected} onClose={()=>setSelected('')}/>}
 </article>;
}
function AnnouncementDetail({web,id,onClose}:{web:WebClient;id:string;onClose:()=>void}){
 const {t}=useI18n();const query=useQuery({queryKey:['announcement',id],queryFn:()=>web.announcement(id),staleTime:0,gcTime:0,retry:false});
 return <Modal title={t('公告详情')} onClose={onClose}>{query.isPending?<div className="announcement-empty" role="status">{t('正在读取公告…')}</div>:query.error?<div className="announcement-empty"><p role="alert">{t(query.error.message)}</p><button className="secondary-button" onClick={()=>query.refetch()}>{t('重试')}</button></div>:query.data&&<><div className="announcement-detail-meta"><AnnouncementType type={query.data.type}/><time>{new Date(query.data.publish_at*1000).toLocaleString(currentLocale())}</time></div><RichContent html={query.data.content_html}/></>}<div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>{t('关闭')}</button></div></Modal>;
}
