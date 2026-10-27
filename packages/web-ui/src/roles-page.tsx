/** Author: yunnuo <ymz@ebox.vip>
 * Description: Read-only administrator/member role boundaries.
 */
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import type { WebClient } from '@unicore/sdk';

export const roleLabel = (id: string, name = id) => id === 'super_admin' ? '管理员' : id === 'user' ? '普通用户' : name;

export function RoleManagement({ web }: { web: WebClient }) {
  const query = useQuery({ queryKey: ['roles'], queryFn: () => web.roles() });
  return <section className="panel"><div className="panel-heading"><div><h2>角色权限</h2><p>管理员与普通用户两种固定角色，权限由服务端统一校验</p></div><span className="subtle-badge">固定角色</span></div>
    {query.isPending ? <p role="status">正在加载角色…</p> : query.isError ? <div><p role="alert">{query.error.message}</p><button className="secondary-button" onClick={() => query.refetch()}>重新加载</button></div> : <>
      <div className="role-cards">{query.data.items.map(role => <article className="role-card" key={role.id}><span className="role-symbol"><ShieldCheck size={20} /></span><div className="role-card-content"><strong>{roleLabel(role.id)}</strong><small>{role.user_count} 位用户</small><p>{role.id === 'super_admin' ? '管理用户、全局设置和平台数据' : '使用工作空间、管理本人账号和本地外观'}</p></div></article>)}</div>
      <div className="user-table-wrap"><table><thead><tr><th>能力</th><th>管理员</th><th>普通用户</th></tr></thead><tbody><tr><td>工作空间、本人账号、本地外观</td><td>允许</td><td>允许</td></tr>{query.data.permissions.map(permission => <tr key={permission.id}><td><strong>{permission.name}</strong><small className="help-text"> {permission.id}</small></td><td><CheckCircle2 size={16} aria-label="允许" /></td><td>禁止</td></tr>)}</tbody></table></div>
      <p className="role-notice help-text">全局设置的菜单、页面与 API 仅管理员可访问；外观只影响当前客户端，不同步到服务器。</p>
    </>}
  </section>;
}
