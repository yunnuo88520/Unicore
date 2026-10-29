// Author: yunnuo <ymz@ebox.vip>
// Description: Apply shared device preferences through generated design tokens and live system changes.
import tokens from '../../../assets/theme/resolved.gen.json';
import { useEffect, useSyncExternalStore } from 'react';
import { getPreferences, preferencesKey, setPreferences, usePreferences, type Preferences } from './preferences';

export type Theme = Preferences['theme'];
const mediaSubscribe=(listener:()=>void)=>{const media=window.matchMedia('(prefers-color-scheme: dark)');media.addEventListener('change',listener);return()=>media.removeEventListener('change',listener);};
export function useResolvedTheme(){const p=usePreferences(),dark=useSyncExternalStore(mediaSubscribe,()=>window.matchMedia('(prefers-color-scheme: dark)').matches,()=>false);return p.theme==='system'?(dark?'dark':'light'):p.theme;}
export function useTheme(defaultTheme?: string) {
  const preferences=usePreferences();
  useEffect(()=>{
    try{if(!localStorage.getItem(preferencesKey)&&!localStorage.getItem('unicore.theme')&&['light','dark','system'].includes(defaultTheme??''))setPreferences({theme:defaultTheme as Theme});}catch{/* Use device defaults without persistent storage. */}
  },[defaultTheme]);
  useEffect(()=>{
    const media=window.matchMedia('(prefers-color-scheme: dark)');
    const apply=()=>{
      const p=getPreferences(),root=document.documentElement;
      root.dataset.theme=p.theme==='system'?(media.matches?'dark':'light'):p.theme;
      for(const key of ['accent','radius','density','sidebar','layout','content'] as const)root.dataset[key]=p[key];
      root.dir=p.direction;root.lang=p.locale;
      root.style.setProperty('--ui-font-scale',String({default:1,compact:1,comfortable:1.08,large:1.18}[p.density]));
      root.style.setProperty('--ui-space-scale',String({default:1,compact:.88,comfortable:1.05,large:1.1}[p.density]));
      root.style.setProperty('--ui-radius-scale',String({default:1,none:0,small:.5,medium:1,large:1.4,round:2}[p.radius]));
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content',getComputedStyle(root).getPropertyValue('--brand-accent').trim()||tokens[root.dataset.theme as 'light'|'dark']['brand-accent']);
    };
    apply();media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply);
  },[preferences]);
  return [preferences.theme,(theme:Theme)=>setPreferences({theme})] as const;
}
