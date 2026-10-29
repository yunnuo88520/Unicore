/** Author: yunnuo <ymz@ebox.vip>
 * Description: Separate administrator/member lists with modal-only account creation.
 */
import { t, useLocale } from './i18n';
import { invalidateAfter } from './queries';
import { Form, Field } from './forms';
import { Modal } from './modal';
import { useMessage } from './message';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import type { Bootstrap, UserCreate, WebClient } from '@unicore/sdk';
export { InstallWizard } from './install-page';
export { LoginPage } from './account-flows';
export { PersistentSettings } from './settings-page';

export function UserManagement({web,metadata,administrators=false}:{web:WebClient;metadata:Bootstrap;administrators?:boolean}) {
  useLocale();
 const message=useMessage();
 const cache=useQueryClient();const kind=administrators?t('管理员'):t('用户'),role=administrators?'super_admin':'user';
 const [search,setSearch]=useState(''),[page,setPage]=useState(1),[creating,setCreating]=useState(false);
 const empty:UserCreate={username:'',email:'',password:'',role};const [input,setInput]=useState<UserCreate>(empty);
 const list=useQuery({queryKey:[administrators?'administrators':'users',search,page],queryFn:()=>administrators?web.administrators(search,page):web.users(search,page)});
 const refresh=()=>{void cache.invalidateQueries({queryKey:[administrators?'administrators':'users']});void invalidateAfter(cache,'users');};
 const create=useMutation({mutationFn:()=>administrators?web.createAdministrator(input):web.createUser(input),onSuccess:()=>{message.success(t("{{v0}}已创建",{v0:kind}));setCreating(false);setInput(empty);refresh();}});
 const update=useMutation({mutationFn:({id,status}:{id:string;status:string})=>administrators?web.updateAdministrator(id,{status,role}):web.updateUser(id,{status,role}),onSuccess:()=>{message.success(t("{{v0}}状态已更新",{v0:kind}));refresh();}});
 return <section className="panel users-panel"><div className="panel-heading"><div><h2>{t("{{kind}}列表",{kind})}</h2><p>{administrators?t('管理后台账号及其启用状态'):t('普通用户创建后立即启用，使用用户登录入口进入工作空间')}</p></div><button className="primary-button" onClick={()=>{setInput(empty);create.reset();setCreating(true);}}><UserPlus size={15}/>{t("新增{{kind}}",{kind})}</button></div>
 {creating&&<Modal title={t("新增{{v0}}",{v0:kind})} pending={create.isPending} onClose={()=>{setCreating(false);setInput(empty);}}><Form schema="UserCreate" value={input} error={create.error} pending={create.isPending} className="flow-form" onSubmit={e=>{e.preventDefault();create.mutate();}}><Field name="username" label={t("账号")}><input required minLength={3} maxLength={64} autoComplete="off" value={input.username} onChange={e=>setInput(v=>({...v,username:e.target.value}))}/></Field><Field name="email" label={t("邮箱")}><input required type="email" maxLength={254} value={input.email} onChange={e=>setInput(v=>({...v,email:e.target.value}))}/></Field><Field name="password" label={t("初始密码")}><input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={input.password} onChange={e=>setInput(v=>({...v,password:e.target.value}))}/></Field><p className="help-text">{administrators?t('使用当前后台入口登录。'):t('创建后即可从 /login 使用初始密码登录，无需邮件验证。')}{t("密码至少 12 位。")}</p><div className="dialog-actions"><button type="button" className="secondary-button" disabled={create.isPending} onClick={()=>{setCreating(false);setInput(empty);}}>{t("取消")}</button><button className="primary-button" disabled={create.isPending}>{create.isPending?t('正在创建…'):t("创建{{v0}}",{v0:kind})}</button></div></Form></Modal>}
 <div className="user-toolbar"><input aria-label={t("搜索{{v0}}",{v0:kind})} placeholder={t("搜索账号或邮箱…")} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/><span>{t("{{count}} 位{{kind}}",{count:list.data?.total??0,kind})}</span></div>
 {list.error&&<p className="form-error" role="alert">{t(list.error.message)}</p>}{list.isError&&<button className="secondary-button" onClick={()=>list.refetch()}>{t("重试")}</button>}
 <div className="user-table-wrap"><table><thead><tr><th>{t("账号")}</th><th>{t("邮箱")}</th><th>{t("身份")}</th><th>{t("状态")}</th><th>{t("操作")}</th></tr></thead><tbody>{list.isPending?<tr><td colSpan={5}>{t("正在加载…")}</td></tr>:list.data?.items.length?list.data.items.map(user=><tr key={user.id}><td><strong>{user.username}</strong>{user.id===metadata.current_user?.id&&<small>{t("当前账号")}</small>}</td><td>{user.email}</td><td>{administrators?t('管理员'):t('普通用户')}</td><td><span className={`status-label ${user.status==='active'?'enabled':''}`}>{user.status==='active'?t('已启用'):user.status==='pending'?t('待验证'):t('已禁用')}</span></td><td><button className="text-button" disabled={update.isPending} onClick={()=>update.mutate({id:user.id,status:user.status==='active'?'disabled':'active'})}>{user.status==='active'?t('禁用'):t('启用')}</button></td></tr>):<tr><td colSpan={5}>{t("没有匹配的{{kind}}",{kind})}</td></tr>}</tbody></table></div><div className="pagination"><button className="secondary-button" disabled={page===1} onClick={()=>setPage(p=>p-1)}>{t("上一页")}</button><span>{t("第 {{page}} 页",{page})}</span><button className="secondary-button" disabled={!list.data||page*list.data.page_size>=list.data.total} onClick={()=>setPage(p=>p+1)}>{t("下一页")}</button></div></section>;
}
