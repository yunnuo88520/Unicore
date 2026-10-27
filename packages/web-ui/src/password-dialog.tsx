/** Author: yunnuo <ymz@ebox.vip>
 * Description: Functional self-service password change for either isolated identity realm.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { WebClient } from '@unicore/sdk';
import { Form, Field } from './forms';
import { Modal } from './modal';
import { useMessage } from './message';

export function PasswordDialog({web,onClose}:{web:WebClient;onClose:()=>void}){
 const message = useMessage();
 const [current,setCurrent]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
 const change=useMutation({mutationFn:async()=>{if(password!==confirm)throw new Error('两次新密码不一致');return web.changePassword({current_password:current,password});},onSuccess:()=>{message.success('密码已更新，请重新登录');onClose();}});
 return <Modal title="修改密码" onClose={onClose} pending={change.isPending}><p className="help-text">验证当前密码后设置新密码。成功后该账号的所有设备需重新登录。</p><Form schema="ChangePasswordInput" value={{current_password:current,password}} error={change.error} pending={change.isPending} className="flow-form" onSubmit={event=>{event.preventDefault();change.mutate();}}><Field name="current_password" label="当前密码"><input type="password" required maxLength={128} autoComplete="current-password" value={current} onChange={e=>setCurrent(e.target.value)}/></Field><Field name="password" label="新密码"><input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></Field><label>确认新密码<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><div className="dialog-actions"><button type="button" className="secondary-button" disabled={change.isPending} onClick={onClose}>取消</button><button className="primary-button" disabled={change.isPending}>{change.isPending?'正在保存…':'保存新密码'}</button></div></Form></Modal>;
}
