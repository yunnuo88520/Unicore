/** Author: yunnuo <ymz@ebox.vip>
 * Description: Shared resumable upload modal with byte progress, pause, retry and explicit abandonment.
 */
import {useEffect,useRef,useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Upload,File,Pause,Play,LoaderCircle,ShieldCheck,Trash2} from 'lucide-react';
import {AppError,type AppClient,type FileEntry,type UploadProgress,type UploadStage} from '@unicore/sdk';
import {t,useLocale} from './i18n';
import {Modal} from './modal';
import {Form} from './forms';
import {useMessage} from './message';
const bytes=(n:number)=>n>=1073741824?`${(n/1073741824).toFixed(1)} GiB`:n>=1048576?`${(n/1048576).toFixed(1)} MiB`:`${(n/1024).toFixed(1)} KiB`;
export function FileUploadDialog({client,resume,onClose}:{client:AppClient;resume?:FileEntry;onClose:()=>void}){
 useLocale();const api=client.files!;const message=useMessage();const cache=useQueryClient();
 const [file,setFile]=useState<globalThis.File|null>(null),[dragging,setDragging]=useState(false),[stage,setStage]=useState<UploadStage>('hashing');
 const [session,setSession]=useState(resume?.file_id),[paused,setPaused]=useState(!!resume),[hashBytes,setHashBytes]=useState(0);
 const [progress,setProgress]=useState<UploadProgress>({loaded:0,total:resume?.size??0,completedParts:0,totalParts:0});
 const input=useRef<HTMLInputElement>(null),abort=useRef<AbortController|null>(null);
 useEffect(()=>()=>abort.current?.abort(),[]);
 const policy=useQuery({queryKey:['file-upload-policy'],queryFn:()=>api.uploadPolicy()});
 const status=useQuery({queryKey:['upload-session',resume?.file_id],queryFn:()=>api.uploadStatus(resume!.file_id),enabled:!!resume});
 useEffect(()=>{if(status.data){const v=status.data;setProgress({loaded:v.parts.reduce((sum,p)=>sum+p.size,0),total:v.file.size,completedParts:v.parts.length,totalParts:v.part_count});}},[status.data]);
 const upload=useMutation({mutationFn:async()=>{
  abort.current=new AbortController();setPaused(false);setHashBytes(0);
  try{return await api.uploadFile(file!,{resumeId:session,signal:abort.current.signal,onStage:setStage,onHashProgress:setHashBytes,onProgress:setProgress,onSession:value=>{setSession(value.file.file_id);void cache.invalidateQueries({queryKey:['files']});}});}
  catch(error){if(error instanceof AppError&&error.code==='REQUEST_CANCELLED'){setPaused(true);return null;}setPaused(true);throw error;}
 },onSuccess:result=>{if(result){message.success(t('文件上传完成'));onClose();}}});
 const discard=useMutation({mutationFn:()=>api.deleteFile(session!),onSuccess:()=>{message.success(t('上传已取消，临时分片将自动清理'));onClose();}});
 const pending=upload.isPending||discard.isPending;
 const pick=(value:globalThis.File|null)=>{setFile(value);upload.reset();};
 const tooLarge=!!file&&!!policy.data&&!session&&file.size>policy.data.max_size;
 const percent=stage==='hashing'&&upload.isPending?Math.round(hashBytes/(file?.size||1)*100):Math.round(progress.loaded/(progress.total||1)*100);
 const selected=file??resume;
 return <Modal title={resume?t('继续上传'):t('上传文件')} onClose={onClose} pending={pending}><Form className="flow-form upload-form" pending={pending} error={upload.error} onSubmit={()=>{if(file&&!tooLarge)upload.mutate();}}>
 <input ref={input} className="visually-hidden" type="file" aria-label={t('选择文件')} disabled={pending} tabIndex={-1} onChange={event=>pick(event.target.files?.[0]??null)}/>
 <button data-autofocus type="button" className={`upload-zone ${dragging?'is-dragging':''} ${selected?'has-file':''}`} disabled={pending} onClick={()=>input.current?.click()} onDragOver={event=>{event.preventDefault();if(!pending)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);if(!pending){if(event.dataTransfer.files.length>1)message.info(t('每次上传一个文件，请分别添加'));pick(event.dataTransfer.files[0]??null);}}}>
 <span className="upload-zone-icon"><Upload size={24}/></span><strong>{dragging?t('松开即可添加文件'):session?t('重新选择原文件以继续'):file?t('点击替换，或拖入其他文件'):t('将文件拖到这里')}</strong><span>{policy.data?t('单文件最大 {{size}} · 支持分片续传',{size:bytes(policy.data.max_size)}):t('正在读取策略…')}</span></button>
 {selected&&<div className="upload-file-card"><span className="upload-file-icon"><File size={23}/></span><div><strong>{file?.name??resume?.original_name}</strong><small>{bytes(selected.size)}{resume&&!file?` · ${t('等待选择原文件')}`:''}</small></div>{file&&<span className="subtle-badge">{t('已选择')}</span>}</div>}
 {tooLarge&&<p className="form-error" role="alert">{t('文件超过管理员设置的大小上限')}</p>}
 {(pending||session)&&<div className="upload-status" role="status"><div>{pending?<LoaderCircle className="spin" size={16}/>:<Pause size={16}/>}<strong>{discard.isPending?t('正在取消上传'):upload.isPending?stage==='hashing'?t('正在核对文件内容'):stage==='confirming'?t('正在确认文件'):t('正在传输文件'):t('上传已暂停')}</strong><span className="upload-percent">{percent}%</span></div><progress aria-label={t('上传进度')} max={100} value={percent}/><small>{stage==='hashing'&&pending?t('核对内容以安全恢复，文件不会重复上传。'):stage==='confirming'&&pending?t('正在校验并合并分片，请稍候。'):t('已上传 {{loaded}} / {{total}} · {{done}} / {{count}} 个分片',{loaded:bytes(progress.loaded),total:bytes(progress.total),done:progress.completedParts,count:progress.totalParts})}</small></div>}
 <p className="upload-privacy"><ShieldCheck size={15}/>{session?t('关闭或刷新后，可从文件列表继续；超期分片会自动清理。'):t('文件保持私有，仅本人和管理员可访问。')}</p>
 <div className="dialog-actions upload-dialog-actions">{session&&!pending&&<button type="button" className="text-button upload-discard" disabled={discard.isPending} onClick={()=>discard.mutate()}><Trash2 size={14}/>{t('放弃上传')}</button>}<button type="button" className="secondary-button" disabled={discard.isPending||stage==='confirming'&&upload.isPending} onClick={()=>{if(upload.isPending)abort.current?.abort();else onClose();}}>{upload.isPending?<><Pause size={15}/>{t('暂停上传')}</>:session?t('稍后继续'):t('取消')}</button><button className="primary-button" disabled={!file||pending||tooLarge||policy.isPending||policy.isError||(status.isPending||status.isError)&&!!resume}>{pending?<LoaderCircle className="spin" size={16}/>:paused?<Play size={16}/>:<Upload size={16}/>}{pending?t('处理中…'):session?t('继续上传'):t('开始上传')}</button></div>
 {policy.isError&&<p role="alert">{t(policy.error.message)} <button type="button" className="text-button" onClick={()=>policy.refetch()}>{t('重试')}</button></p>}
 {status.isError&&<p role="alert">{t('上传会话不可用，请删除后重新上传')} <button type="button" className="text-button" onClick={()=>status.refetch()}>{t('重试')}</button></p>}
 </Form></Modal>;
}
