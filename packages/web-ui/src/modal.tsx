/** Author: yunnuo <ymz@ebox.vip>
 * Description: Native accessible modal with focus containment, Escape and return-to-trigger behavior.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function Modal({title,onClose,pending=false,children}:{title:string;onClose:()=>void;pending?:boolean;children:ReactNode}) {
 const ref=useRef<HTMLDialogElement>(null);const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{const element=ref.current!;const previous=document.activeElement as HTMLElement|null;if(element.showModal)element.showModal();else element.setAttribute('open','');element.querySelector<HTMLElement>('input:not([tabindex="-1"]),select,textarea,[data-autofocus]')?.focus();return()=>{if(element.close)element.close();previous?.focus();};},[]);
 return createPortal(<dialog ref={ref} className="form-dialog" aria-label={title} onCancel={event=>{event.preventDefault();if(!pending)close.current();}} onClick={event=>{if(event.target===event.currentTarget&&!pending)close.current();}}><div className="dialog-content"><header className="dialog-heading"><h2>{title}</h2><button type="button" className="icon-button" aria-label={`关闭${title}`} disabled={pending} onClick={onClose}><X size={19}/></button></header>{children}</div></dialog>,document.body);
}
