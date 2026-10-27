/** Author: yunnuo <ymz@ebox.vip> */
export function Switch({id,checked,onChange,disabled=false}:{id:string;checked:boolean;onChange:(value:boolean)=>void;disabled?:boolean}){
 return <span className="setting-switch"><input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={event=>onChange(event.target.checked)}/><span aria-hidden="true" className="switch-track"><i/></span><span aria-hidden="true">{checked?'已开启':'已关闭'}</span></span>;
}
