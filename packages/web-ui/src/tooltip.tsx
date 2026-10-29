// Author: yunnuo <ymz@ebox.vip>
// Description: Shared hover and keyboard tooltip that never shifts its trigger.
import { t, useLocale } from './i18n';
import { cloneElement, useId, useState, type ReactElement, type HTMLAttributes } from 'react';
export function Tooltip({label,children}:{label:string;children:ReactElement<HTMLAttributes<HTMLElement>>}){
  useLocale();
  const [open,setOpen]=useState(false),id=useId();
  return <span className="ui-tooltip-anchor" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)} onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)} onKeyDown={event=>{if(event.key==='Escape')setOpen(false);}}>{cloneElement(children,{'aria-describedby':open?id:undefined})}{open&&<span className="ui-tooltip" id={id} role="tooltip">{t(label)}</span>}</span>;
}
