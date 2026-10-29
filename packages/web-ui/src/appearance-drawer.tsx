// Author: yunnuo <ymz@ebox.vip>
// Description: Shared local preference schema, direction-stable previews and an accessible modal drawer.
import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {Check,Languages,RotateCcw,X} from 'lucide-react';
import {preferenceOptions,resetAppearance,setPreferences,usePreferences,type Preferences} from './preferences';
import {defineMessages,useI18n} from './i18n';

type PreferenceLabels={ [K in keyof Preferences]: Record<Preferences[K],string> };
const labels=defineMessages({
  theme:{system:'跟随系统',light:'浅色',dark:'深色'},
  accent:{brand:'默认',rose:'玫瑰',emerald:'翡翠',ocean:'海洋',amber:'琥珀',slate:'石墨'},
  radius:{default:'自动',none:'直角',small:'小',medium:'中',large:'大',round:'圆润'},
  density:{default:'自动',compact:'紧凑',comfortable:'舒适',large:'大字号'},
  sidebar:{plain:'标准',inset:'内嵌',floating:'悬浮'},
  layout:{default:'默认',compact:'紧凑',full:'全宽布局'},
  content:{full:'全宽',centered:'居中'},
  locale:{'zh-CN':'中文',en:'English'},
}) satisfies PreferenceLabels;
const groups=defineMessages([
  {name:'theme',title:'主题'},{name:'accent',title:'配色预设'},
  {name:'radius',title:'圆角'},{name:'density',title:'密度'},
  {name:'sidebar',title:'侧边栏'},{name:'layout',title:'布局'},
  {name:'content',title:'内容布局'},{name:'locale',title:'语言'},
]) satisfies readonly {name:keyof Preferences;title:string}[];

function PreferencePreview({name,value}:{name:keyof Preferences;value:string}){
  if(name==='locale')return <Languages size={19}/>;
  if(name==='density')return <b>{({default:'Aa',compact:'A',comfortable:'A+',large:'A++'} as Record<string,string>)[value]}</b>;
  if(name==='radius')return <i className="radius-sample"/>;
  if(name==='accent')return <i className={`palette-sample palette-${value}`}/>;
  return <><i className="mini-sidebar"><b/><b/><b/></i><i className="mini-content"><b/><b/><b/></i></>;
}
function Choices<K extends keyof Preferences>({name,title,current}:{name:K;title:string;current:Preferences[K]}){
  const {t}=useI18n();
  return <fieldset className={`preference-group preference-${name}`}>
    <legend>{t(title)}</legend><div className="preference-options">
      {preferenceOptions[name].map(value=>{
        const selected=current===value;
        return <button type="button" key={value} className="preference-choice" aria-pressed={selected} onClick={()=>setPreferences({[name]:value})}>
          <span className={`preference-preview preview-${name}`} data-preview={value} aria-hidden="true">
            <PreferencePreview name={name} value={value}/>
            {selected&&<span className="preference-check"><Check size={10}/></span>}
          </span><span>{t((labels[name] as Record<string,string>)[value])}</span>
        </button>;
      })}
    </div>
  </fieldset>;
}
export function AppearanceControls(){
  const current=usePreferences();
  // The workspace and its controls keep a stable left-to-right order.
  return <div className="appearance-controls" dir="ltr">
    {groups.map(({name,title})=><Choices key={name} name={name} title={title} current={current[name]}/>)}
  </div>;
}
export function AppearanceDrawer({onClose}:{onClose:()=>void}){
  const {t}=useI18n();
  const ref=useRef<HTMLDialogElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const element=ref.current!,previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    if(element.showModal)element.showModal();else element.setAttribute('open','');
    element.querySelector<HTMLButtonElement>('[data-close]')?.focus();
    return()=>{if(element.close)element.close();document.body.style.overflow=overflow;previous?.focus();};
  },[]);
  return createPortal(<dialog ref={ref} className="appearance-drawer" dir="ltr" aria-labelledby="appearance-drawer-title" aria-describedby="appearance-drawer-description"
    onCancel={event=>{event.preventDefault();close.current();}} onClick={event=>{if(event.target===event.currentTarget)close.current();}}>
    <div className="drawer-shell">
      <header className="drawer-header"><div><h2 id="appearance-drawer-title">{t('主题设置')}</h2><p id="appearance-drawer-description">{t('按你的偏好调整外观与布局。')}</p></div>
        <button className="icon-button" data-close aria-label={t('关闭主题设置')} onClick={onClose}><X size={19}/></button>
      </header>
      <div className="drawer-scroll"><AppearanceControls/></div>
      <footer className="drawer-footer"><small>{t('即时生效，仅保存在当前客户端。')}</small>
        <button className="secondary-button" onClick={resetAppearance}><RotateCcw size={15}/>{t('重置外观')}</button>
      </footer>
    </div>
  </dialog>,document.body);
}
