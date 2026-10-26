/** Author: yunnuo <ymz@ebox.vip>
 * Description: Responsive role catalogue and permission editor through the shared client.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, LoaderCircle, LockKeyhole, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import type { Bootstrap, PermissionDefinition, Role, RoleInput, WebClient } from '@unicore/sdk';

export const roleLabel = (id: string, name = id) => id === 'super_admin' ? '超级管理员' : id === 'user' ? '普通用户' : name;

export function RoleManagement({ web, metadata }: { web: WebClient; metadata: Bootstrap }) {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ['roles'], queryFn: () => web.roles() });
  const [selected, setSelected] = useState<Role | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  const writable = !!metadata.current_user?.roles.includes('super_admin') && !!metadata.current_user.permissions.includes('roles:write');
  function refresh(message: string) {
    setNotice(message);
    for (const key of ['roles', 'user-role-options', 'users', 'admin-dashboard', 'bootstrap']) void queryClient.invalidateQueries({ queryKey: [key] });
  }
  return <div className="roles-layout">
    <section className="panel roles-list"><div className="panel-heading"><div><h2>角色列表</h2><p>内置角色保持固定，业务角色按需赋权</p></div>{writable && <button className="primary-button" onClick={() => { setSelected('new'); setNotice(''); }}><Plus size={15} />新增角色</button>}</div>
      {notice && <p className="saved-caption role-notice" role="status"><CheckCircle2 size={14} />{notice}</p>}
      {list.isPending ? <p className="role-notice" role="status">正在加载角色…</p> : list.isError ? <div className="role-notice"><p className="form-error" role="alert">{list.error.message}</p><button className="secondary-button" onClick={() => list.refetch()}>重新加载</button></div> : <div className="role-cards">{list.data.items.map(role => <button className={`role-card ${selected !== 'new' && selected?.id === role.id ? 'selected' : ''}`} key={role.id} onClick={() => { setSelected(role); setNotice(''); }} aria-pressed={selected !== 'new' && selected?.id === role.id}>
        <span className="role-symbol"><ShieldCheck size={20} /></span><span className="role-card-content"><strong>{roleLabel(role.id, role.name)}</strong><small>{role.user_count} 位用户 · {role.permissions.length} 项权限</small></span><span className="subtle-badge">{role.builtin ? '内置' : '业务'}</span>
      </button>)}</div>}
    </section>
    {selected && list.data ? <RoleEditor key={selected === 'new' ? 'new' : selected.id} web={web} role={selected === 'new' ? null : selected} permissions={list.data.permissions} writable={writable} onSaved={role => { setSelected(role); refresh('角色已保存，关联用户的旧会话已撤销。'); }} onDeleted={() => { setSelected(null); refresh('角色已删除。'); }} onCancel={() => setSelected(null)} /> : <section className="panel role-placeholder"><ShieldCheck size={32} /><h2>让每一份权限都有边界</h2><p>选择角色查看权限，或为你的业务新增角色。</p><p className="help-text">身份、角色与实例配置写权限仅属于超级管理员。</p></section>}
  </div>;
}

function RoleEditor({ web, role, permissions, writable, onSaved, onDeleted, onCancel }: { web: WebClient; role: Role | null; permissions: PermissionDefinition[]; writable: boolean; onSaved: (role: Role) => void; onDeleted: () => void; onCancel: () => void }) {
  const [input, setInput] = useState<RoleInput>({ name: role?.name ?? '', permissions: role?.permissions ?? [] });
  const [confirming, setConfirming] = useState(false);
  const readonly = !writable || !!role?.builtin;
  const save = useMutation({ mutationFn: () => role ? web.updateRole(role.id, input) : web.createRole(input), onSuccess: onSaved });
  const remove = useMutation({ mutationFn: () => web.deleteRole(role!.id), onSuccess: onDeleted });
  const busy = save.isPending || remove.isPending;
  const groups = [...new Set(permissions.map(permission => permission.group))];
  return <section className="panel role-editor"><div className="panel-heading"><div><h2>{role ? `${roleLabel(role.id, role.name)} · 权限` : '创建业务角色'}</h2><p>{role?.builtin ? '内置角色不可修改或删除' : readonly ? '你可以查看此角色的权限' : '按职责授予最少权限，保存后立即生效'}</p></div>{role?.builtin && <LockKeyhole size={19} />}</div>
    <form className="flow-form role-form" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
      <label>角色名称<input required maxLength={64} value={input.name} disabled={readonly || busy} onChange={event => { setInput(value => ({ ...value, name: event.target.value })); save.reset(); }} /></label>
      <div className="permission-summary"><strong>{input.permissions.length} 项权限</strong><span>未勾选的权限默认拒绝</span></div>
      {groups.map(group => <fieldset className="permission-group" key={group} disabled={readonly || busy}><legend>{group}</legend>{permissions.filter(permission => permission.group === group).map(permission => <label className="permission-option" key={permission.id}>
        <input type="checkbox" checked={input.permissions.includes(permission.id)} disabled={!permission.assignable || readonly || busy} onChange={event => { setInput(value => ({ ...value, permissions: event.target.checked ? [...value.permissions, permission.id] : value.permissions.filter(id => id !== permission.id) })); save.reset(); }} />
        <span><strong>{permission.name}{!permission.assignable && <small>仅超管</small>}</strong><code>{permission.id}</code><small>{permission.description}</small></span>
      </label>)}</fieldset>)}
      {(save.error || remove.error) && <p className="form-error" role="alert">{(save.error ?? remove.error)?.message}</p>}
      {!readonly && <><p className="help-text">更改角色会撤销关联用户的旧会话和待用验证码，他们需要重新登录。</p><div className="role-actions"><button className="primary-button" disabled={busy}>{save.isPending ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}{role ? '保存角色' : '创建角色'}</button><button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>取消编辑</button>{role && <button type="button" className="text-button role-delete" disabled={busy || role.user_count > 0} onClick={() => setConfirming(true)}><Trash2 size={14} />删除角色</button>}</div>{role && role.user_count > 0 && <p className="help-text">此角色仍关联 {role.user_count} 位用户，解除关联后才能删除。</p>}</>}
      {confirming && <div className="role-confirm" role="alert"><strong>确认删除“{role?.name}”？</strong><p>删除后无法撤销，需要时可重新创建。</p><div className="role-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => { setConfirming(false); remove.reset(); }}>保留角色</button><button className="primary-button" type="button" disabled={busy} onClick={() => remove.mutate()}>{remove.isPending && <LoaderCircle size={14} className="spin" />}确认删除角色</button></div></div>}
    </form>
  </section>;
}
