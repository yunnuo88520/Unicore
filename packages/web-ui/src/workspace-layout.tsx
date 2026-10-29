// Author: yunnuo <ymz@ebox.vip>
// Description: Single structural shell for Web and Wails; pages supply content without owning navigation offsets.
import {useEffect,type ReactNode} from 'react';
import {useI18n} from './i18n';

type WorkspaceLayoutProps={
  navigation:ReactNode;header:ReactNode;children:ReactNode;overlays?:ReactNode;
  navigationOpen:boolean;onNavigationClose:()=>void;contentClassName?:string;
};
export function WorkspaceLayout({navigation,header,children,overlays,navigationOpen,onNavigationClose,contentClassName=''}:WorkspaceLayoutProps){
  const {t}=useI18n();
  useEffect(()=>{
    if(!navigationOpen)return;
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape')onNavigationClose();};
    window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);
  },[navigationOpen,onNavigationClose]);
  return <div className="app-shell" dir="ltr">
    <a className="skip-link" href="#main-content" onClick={event=>{event.preventDefault();document.getElementById('main-content')?.focus();}}>{t('跳至主要内容')}</a>
    {navigationOpen&&<button className="nav-scrim" aria-label={t('关闭导航')} onClick={onNavigationClose}/>}
    <aside id="workspace-navigation" className={`sidebar ${navigationOpen?'is-open':''}`} aria-label={t('主导航')}>{navigation}</aside>
    <div className="main-shell"><header className="topbar">{header}</header><main id="main-content" tabIndex={-1} className={`main-content ${contentClassName}`}>{children}</main></div>
    {overlays}
  </div>;
}
