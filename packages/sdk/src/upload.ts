/** Author: yunnuo <ymz@ebox.vip>
 * Description: Bounded-memory content fingerprints and cancelable retry delays shared by resumable uploads.
 */
import { sha256 } from '@noble/hashes/sha2.js';
export async function fileFingerprint(file:File,signal?:AbortSignal,onProgress?:(loaded:number)=>void):Promise<string>{
 const hash=sha256.create();const block=8*1024*1024;
 for(let offset=0;offset<file.size;offset+=block){
  signal?.throwIfAborted();hash.update(new Uint8Array(await file.slice(offset,offset+block).arrayBuffer()));onProgress?.(Math.min(offset+block,file.size));
  // Yield between bounded blocks so pause and navigation remain responsive, including HTTP intranets.
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 signal?.throwIfAborted();return Array.from(hash.digest(),b=>b.toString(16).padStart(2,'0')).join('');
}
export function retryDelay(ms:number,signal:AbortSignal):Promise<void>{return new Promise((resolve,reject)=>{
 if(signal.aborted){reject(signal.reason);return;}
 const cancel=()=>{clearTimeout(timer);reject(signal.reason);};const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},ms);signal.addEventListener('abort',cancel,{once:true});
});}
