// Author: yunnuo <ymz@ebox.vip>
// Description: Shared viewport-bounded tooltip; focus and RTL cannot introduce overflow or move controls.
import {cloneElement,useId,useLayoutEffect,useRef,useState,type ReactElement,type HTMLAttributes} from 'react';
import {createPortal} from 'react-dom';
import {useI18n} from './i18n';

export function Tooltip({label,children}:{label:string;children:ReactElement<HTMLAttributes<HTMLElement>>}){
  const {t,locale}=useI18n();
  const [open,setOpen]=useState(false),[position,setPosition]=useState<{left:number;top:number}|null>(null);
  const anchor=useRef<HTMLSpanElement>(null),tip=useRef<HTMLSpanElement>(null),id=useId();
  useLayoutEffect(()=>{
    if(!open)return;
    const place=()=>{
      if(!anchor.current||!tip.current)return;
      const a=anchor.current.getBoundingClientRect(),b=tip.current.getBoundingClientRect();
      const viewport=window.visualViewport,width=viewport?.width??document.documentElement.clientWidth,height=viewport?.height??innerHeight;
      const x=viewport?.offsetLeft??0,y=viewport?.offsetTop??0,gap=8;
      const left=Math.max(x+gap,Math.min(a.left+(a.width-b.width)/2,x+width-b.width-gap));
      const below=a.bottom+gap,top=below+b.height<=y+height-gap?below:Math.max(y+gap,a.top-b.height-gap);
      setPosition({left,top});
    };
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    window.visualViewport?.addEventListener('resize',place);window.visualViewport?.addEventListener('scroll',place);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);window.visualViewport?.removeEventListener('resize',place);window.visualViewport?.removeEventListener('scroll',place);};
  },[open,label,locale]);
  const dismiss=()=>{setOpen(false);setPosition(null);};
  const describedBy=[children.props['aria-describedby'],open?id:undefined].filter(Boolean).join(' ')||undefined;
  return <span className="ui-tooltip-anchor" ref={anchor} onMouseEnter={()=>setOpen(true)} onMouseLeave={dismiss} onFocus={()=>setOpen(true)} onBlur={dismiss} onKeyDown={event=>{if(event.key==='Escape')dismiss();}}>
    {cloneElement(children,{'aria-describedby':describedBy})}
    {open&&createPortal(<span className="ui-tooltip" ref={tip} id={id} role="tooltip" style={{...position,visibility:position?'visible':'hidden'}}>{t(label)}</span>,anchor.current?.closest('dialog[open]')??document.body)}
  </span>;
}
