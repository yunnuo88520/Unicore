// Author: yunnuo <ymz@ebox.vip>
// Description: Shared permission-aware version capsule and quiet documentation/about footer.
import {useEffect,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {BookOpen,ExternalLink,Info} from 'lucide-react';
import type {AppClient,Bootstrap} from '@unicore/sdk';
import {canAccess} from './routes';
import { t, useLocale } from './i18n';
import { productName } from './product.gen';
import {Tooltip} from './tooltip';
export const workspaceLinks={documentation:'https://github.com/yunnuo88520/Unicore/tree/main/docs',quickStart:'https://github.com/yunnuo88520/Unicore#readme'};
export function VersionBadge({client,metadata,onOpen}:{client:AppClient;metadata?:Bootstrap;onOpen:()=>void}){
  useLocale();const allowed=canAccess('edition',metadata)&&!!metadata?.capabilities.updater;
  const overview=useQuery({queryKey:['system-updates'],queryFn:()=>client.updates!.overview(),enabled:allowed&&!!client.updates,retry:false,staleTime:30000});
  if(!metadata?.version)return null;
  const data=overview.data,status=overview.isError||data?.last_error?'offline':data?.available?'available':data?.checked_at?'latest':'idle';
  const text=status==='offline'?t('暂时无法连接更新源，仍可查看更新日志'):status==='available'?t('有新版本可用'):status==='latest'?t('已是最新版本'):t('查看版本与更新日志');
  const label=t('当前版本 {{version}}，{{status}}',{version:metadata.version,status:t(text)});
  return <Tooltip label={t(text)}>{allowed?<button className={`version-badge status-${status}`} aria-label={t(label)} onClick={onOpen}><span>v{metadata.version}</span><i aria-hidden="true"/></button>:<span className="version-badge" aria-label={t(label)}>v{metadata.version}</span>}</Tooltip>;
}
export function SidebarTools({onAbout}:{onAbout:()=>void}){
  useLocale();const [open,setOpen]=useState(false),ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(!ref.current?.contains(event.target as Node))setOpen(false);};const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);ref.current?.querySelector('button')?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);};},[open]);
  return <div className="sidebar-utilities" ref={ref}><button className="sidebar-help" onClick={()=>setOpen(value=>!value)} aria-expanded={open}><BookOpen size={16}/>{t('文档与帮助')}</button><Tooltip label={t('关于 {{name}}',{name:productName})}><button className="icon-button" aria-label={t('关于 {{name}}',{name:productName})} onClick={onAbout}><Info size={16}/></button></Tooltip>{open&&<div className="sidebar-help-menu"><a href={workspaceLinks.quickStart} target="_blank" rel="noopener noreferrer">{t('快速开始')}<ExternalLink size={13}/></a><a href={workspaceLinks.documentation} target="_blank" rel="noopener noreferrer">{t('开发文档')}<ExternalLink size={13}/></a></div>}</div>;
}
