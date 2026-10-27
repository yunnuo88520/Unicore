/** Author: yunnuo <ymz@ebox.vip>
 * Description: Real installation, login, user management and persistent settings using client ports.
 */
import { invalidateAfter } from './queries';
import { Form, Field } from './forms';
import { roleLabel } from './roles-page';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, UserPlus } from 'lucide-react';
import type { Bootstrap, UserCreate, WebClient } from '@unicore/sdk';

function ErrorMessage({ error }: { error: Error | null }) { return error ? <p className="form-error" role="alert">{error.message}</p> : null; }
function Busy({ pending, children }: { pending: boolean; children: React.ReactNode }) { return <>{pending && <LoaderCircle size={15} className="spin" />}{children}</>; }

export { InstallWizard } from './install-page';

export { LoginPage } from './account-flows';

export function AdminDashboard({ web }: { web: WebClient }) {
  const query = useQuery({ queryKey: ['admin-dashboard'], queryFn: () => web.dashboard() });
  if (query.isPending) return <div className="state-card" role="status">正在加载平台统计…</div>;
  if (query.isError) return <div className="state-card"><ErrorMessage error={query.error} /><button className="secondary-button" onClick={() => query.refetch()}>重试</button></div>;
  return <><section className="admin-stats">{[['总用户数', query.data.total_users], ['今日新增（UTC）', query.data.today_new_users], ['近 7 天认证活跃', query.data.active_users_7d]].map(([label, value]) => <article className="panel" key={label}><span>{label}</span><strong>{value}</strong></article>)}</section><section className="panel"><div className="panel-heading"><div><h2>最近审计事件</h2><p>仅记录操作元信息，避免保存敏感内容</p></div></div><div className="audit-list">{query.data.audit.length ? query.data.audit.map(entry => <div key={entry.id}><span>{entry.action}</span><code>{entry.actor_id === 'bootstrap' ? '首次安装' : entry.actor_id.slice(0, 8)}</code><time>{new Date(entry.created_at * 1000).toLocaleString()}</time></div>) : <p className="help-text">暂无审计事件</p>}</div></section></>;
}

export function UserManagement({ web, metadata }: { web: WebClient; metadata: Bootstrap }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(''); const [page, setPage] = useState(1); const [creating, setCreating] = useState(false);
  const [input, setInput] = useState<UserCreate>({ username: '', email: '', password: '', role: 'user' });
  const list = useQuery({ queryKey: ['users', search, page], queryFn: () => web.users(search, page) });
  const roles = useQuery({ queryKey: ['user-role-options'], queryFn: () => web.roleOptions() });
  const options = roles.data?.items ?? [];
  const label = (id: string) => roleLabel(id, options.find(role => role.id === id)?.name ?? id);
  const roleOptions = options.filter(role => role.assignable).map(role => <option key={role.id} value={role.id}>{label(role.id)}</option>);
  const create = useMutation({ mutationFn: () => web.createUser(input), onSuccess: () => { setCreating(false); setInput({ username: '', email: '', password: '', role: 'user' }); void invalidateAfter(queryClient,'users'); } });
  const update = useMutation({ mutationFn: ({ id, status, role }: { id: string; status: string; role: UserCreate['role'] }) => web.updateUser(id, { status, role }), onSuccess: () => { void invalidateAfter(queryClient,'users'); } });
  const canCreate = metadata.current_user?.permissions.includes('users:create'); const canUpdate = metadata.current_user?.roles.includes('super_admin');
  return <section className="panel users-panel"><div className="panel-heading"><div><h2>用户管理</h2><p>搜索账号、关联角色，并控制账号状态</p></div>{canCreate && <button className="primary-button" onClick={() => { setCreating(value => !value); create.reset(); }}><UserPlus size={15} />{creating ? '收起表单' : '新增用户'}</button>}</div>
    {creating && <Form schema="UserCreate" value={input} error={create.error} pending={create.isPending} className="flow-form inline-form" onSubmit={event => { event.preventDefault(); create.mutate(); }}><div className="form-grid"><Field name="username" label="账号"><input required minLength={3} value={input.username} onChange={event => setInput(value => ({ ...value, username: event.target.value }))} /></Field><Field name="email" label="邮箱"><input required type="email" value={input.email} onChange={event => setInput(value => ({ ...value, email: event.target.value }))} /></Field><Field name="password" label="初始密码"><input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={input.password} onChange={event => setInput(value => ({ ...value, password: event.target.value }))} /></Field><label>角色<select value={input.role} onChange={event => setInput(value => ({ ...value, role: event.target.value as UserCreate['role'] }))}>{roleOptions}</select></label></div><button className="primary-button" disabled={create.isPending || roles.isPending || roles.isError}><Busy pending={create.isPending}>创建用户</Busy></button></Form>}
    <div className="user-toolbar"><input aria-label="搜索用户" placeholder="搜索账号或邮箱…" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /><span>{list.data?.total ?? 0} 位用户</span></div><ErrorMessage error={list.error ?? update.error ?? roles.error} />{roles.isError && <button className="secondary-button" onClick={() => roles.refetch()}>重新加载角色</button>}
    <div className="user-table-wrap"><table><thead><tr><th>账号</th><th>邮箱</th><th>角色</th><th>状态</th>{canUpdate && <th>操作</th>}</tr></thead><tbody>{list.isPending ? <tr><td colSpan={5}>正在加载用户…</td></tr> : list.data?.items.length ? list.data.items.map(user => <tr key={user.id}><td><strong>{user.username}</strong>{user.id === metadata.current_user?.id && <small>当前账号</small>}</td><td>{user.email}</td><td>{canUpdate ? <select aria-label={`${user.username} 的角色`} value={user.roles[0]} disabled={update.isPending || roles.isPending || roles.isError} onChange={event => update.mutate({ id: user.id, status: user.status, role: event.target.value as UserCreate['role'] })}>{roleOptions}</select> : user.roles.map(label).join('、')}</td><td><span className={`status-label ${user.status === 'active' ? 'enabled' : ''}`}>{user.status === 'active' ? '已启用' : user.status === 'pending' ? '待验证' : '已禁用'}</span></td>{canUpdate && <td><button className="text-button" disabled={update.isPending || roles.isPending || roles.isError} onClick={() => update.mutate({ id: user.id, role: user.roles[0], status: user.status === 'active' ? 'disabled' : 'active' })}>{user.status === 'active' ? '禁用' : '启用'}</button></td>}</tr>) : <tr><td colSpan={5}>没有匹配的用户</td></tr>}</tbody></table></div><div className="pagination"><button className="secondary-button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {page} 页</span><button className="secondary-button" disabled={!list.data || page * list.data.page_size >= list.data.total} onClick={() => setPage(value => value + 1)}>下一页</button></div>
  </section>;
}

export { PersistentSettings } from './settings-page';
