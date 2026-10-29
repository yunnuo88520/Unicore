// Author: yunnuo <ymz@ebox.vip>
// Description: Render server-validated business HTML with a defensive browser allowlist, without translating its content.
import {useMemo} from 'react';
export function safeContentHTML(value:string){
 const doc=new DOMParser().parseFromString(value,'text/html');
 const allowed=new Set(['P','BR','STRONG','B','EM','I','U','UL','OL','LI','A','BLOCKQUOTE','H1','H2','H3','H4','H5','H6','CODE','PRE','HR']);
 const walk=(parent:Element)=>{for(const child of [...parent.children]){if(!allowed.has(child.tagName)){child.remove();continue;}for(const attribute of [...child.attributes]){let valid=false;if(child.tagName==='A'&&attribute.name==='href'){try{const url=new URL(attribute.value);valid=['http:','https:'].includes(url.protocol)&&!!url.hostname&&!url.username&&!url.password;}catch{/* Unsafe links lose their href. */}}if(!valid)child.removeAttribute(attribute.name);}walk(child);}};
 walk(doc.body);return doc.body.innerHTML;
}
export function RichContent({html}:{html:string}){const safe=useMemo(()=>safeContentHTML(html),[html]);return <div className="announcement-content rich-surface" dangerouslySetInnerHTML={{__html:safe}}/>;}
export function contentSummary(source:string){return new DOMParser().parseFromString(source,'text/html').body.textContent?.replace(/\s+/g,' ').trim()??'';}
