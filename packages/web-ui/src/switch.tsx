/** Author: yunnuo <ymz@ebox.vip> */
import { t, useLocale } from './i18n';

export function Switch({id,checked,onChange,disabled=false}:{id:string;checked:boolean;onChange:(value:boolean)=>void;disabled?:boolean}){
  useLocale();
 return <span className="setting-switch"><input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={event=>onChange(event.target.checked)}/><span aria-hidden="true" className="switch-track"><i/></span><span aria-hidden="true">{checked?t('已开启'):t('已关闭')}</span></span>;
}
