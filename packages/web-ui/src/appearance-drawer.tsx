// Author: yunnuo <ymz@ebox.vip>
// Description: Native modal drawer with shared instant local preference controls and focus restoration.
import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {Check,Languages,RotateCcw,X} from 'lucide-react';
import {resetAppearance,setPreferences,usePreferences,type Preferences} from './preferences';
import { t, useLocale } from './i18n';
const labels={theme:{system:'跟随系统',light:'浅色',dark:'深色'},accent:{brand:'默认',rose:'玫瑰',emerald:'翡翠',ocean:'海洋',amber:'琥珀',slate:'石墨'},radius:{default:'自动',none:'直角',small:'小',medium:'中',large:'大',round:'圆润'},density:{default:'自动',compact:'紧凑',comfortable:'舒适',large:'大字号'},sidebar:{plain:'标准',inset:'内嵌',floating:'悬浮'},layout:{default:'默认',compact:'紧凑',full:'全宽布局'},content:{full:'全宽',centered:'居中'},direction:{ltr:'从左到右',rtl:'从右到左'},locale:{'zh-CN':'中文',en:'English'}};
function Choices<K extends keyof Preferences>({name,title,kind=name}:{name:K;title:string;kind?:string}){
  useLocale();const current=usePreferences();
  return <fieldset className={`preference-group preference-${name}`}><legend>{t(title)}</legend><div className="preference-options">{Object.entries(labels[name]).map(([value,label])=><button type="button" key={value} className="preference-choice" aria-pressed={current[name]===value} onClick={()=>setPreferences({[name]:value})}><span className={`preference-preview preview-${kind}`} data-preview={value} aria-hidden="true">{name==='locale'?<Languages size={19}/>:name==='density'?<b>{({default:'Aa',compact:'A',comfortable:'A+',large:'A++'} as Record<string,string>)[value]}</b>:name==='radius'?<i className="radius-sample"/>:name==='accent'?<i className={`palette-sample palette-${value}`}/>:<><i className="mini-sidebar"><b/><b/><b/></i><i className="mini-content"><b/><b/><b/></i></>}{current[name]===value&&<span className="preference-check"><Check size={10}/></span>}</span><span>{t(label)}</span></button>)}</div></fieldset>;
}
export function AppearanceControls(){
  useLocale();
  return <div className="appearance-controls"><Choices name="theme" title={t("主题")}/><Choices name="accent" title={t("配色预设")}/><Choices name="radius" title={t("圆角")}/><Choices name="density" title={t("密度")}/><Choices name="sidebar" title={t("侧边栏")}/><Choices name="layout" title={t("布局")}/><Choices name="content" title={t("内容布局")}/><Choices name="direction" title={t("阅读方向")}/><Choices name="locale" title={t("语言")}/></div>;
}
export function AppearanceDrawer({onClose}:{onClose:()=>void}){
  useLocale();const ref=useRef<HTMLDialogElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{const element=ref.current!,previous=document.activeElement as HTMLElement|null;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';if(element.showModal)element.showModal();else element.setAttribute('open','');element.querySelector<HTMLButtonElement>('[data-close]')?.focus();return()=>{if(element.close)element.close();document.body.style.overflow=overflow;previous?.focus();};},[]);
  return createPortal(<dialog ref={ref} className="appearance-drawer" aria-labelledby="appearance-drawer-title" aria-describedby="appearance-drawer-description" onCancel={event=>{event.preventDefault();close.current();}} onClick={event=>{if(event.target===event.currentTarget)close.current();}}><div className="drawer-shell"><header className="drawer-header"><div><h2 id="appearance-drawer-title">{t('主题设置')}</h2><p id="appearance-drawer-description">{t('按你的偏好调整外观与布局。')}</p></div><button className="icon-button" data-close aria-label={t('关闭主题设置')} onClick={onClose}><X size={19}/></button></header><div className="drawer-scroll"><AppearanceControls/></div><footer className="drawer-footer"><small>{t('即时生效，仅保存在当前客户端。')}</small><button className="secondary-button" onClick={resetAppearance}><RotateCcw size={15}/>{t('重置外观')}</button></footer></div></dialog>,document.body);
}
