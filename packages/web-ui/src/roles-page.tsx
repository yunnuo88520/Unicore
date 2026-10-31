/** Author: yunnuo <ymz@ebox.vip>
 * Description: Read-only administrator/member role boundaries.
 */
import { t, useLocale } from './i18n';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import type { WebClient } from '@unicore/sdk';

export const roleLabel = (id: string, name = id) => id === 'super_admin' ? t('管理员') : id === 'user' ? t('普通用户') : name;

export function RoleManagement({ web }: { web: WebClient }) {
  useLocale();
  const query = useQuery({ queryKey: ['roles'], queryFn: () => web.roles() });
  return <section className="panel"><div className="panel-heading"><div><h2>{t("角色权限")}</h2><p>{t("管理员与普通用户两种固定角色，权限由服务端统一校验")}</p></div><span className="subtle-badge">{t("固定角色")}</span></div>
    {query.isPending ? <p role="status">{t("正在加载角色…")}</p> : query.isError ? <div><p role="alert">{t(query.error.message)}</p><button className="secondary-button" onClick={() => query.refetch()}>{t("重新加载")}</button></div> : <>
      <div className="role-cards">{query.data.items.map(role => <article className="role-card" key={role.id}><span className="role-symbol"><ShieldCheck size={20} /></span><div className="role-card-content"><strong>{roleLabel(role.id)}</strong><small>{t("{{count}} 位用户",{count:role.user_count})}</small><p>{role.id === 'super_admin' ? t('管理用户、全局设置和平台数据') : t('使用工作空间、管理本人账号和本地外观')}</p></div></article>)}</div>
      <div className="user-table-wrap"><table><thead><tr><th>{t("能力")}</th><th>{t("管理员")}</th><th>{t("普通用户")}</th></tr></thead><tbody><tr><td>{t("工作空间、本人账号、本地外观")}</td><td>{t("允许")}</td><td>{t("允许")}</td></tr>{query.data.permissions.map(permission => <tr key={permission.id}><td><strong>{t(permission.name)}</strong><small className="help-text"> {permission.id}</small></td><td><CheckCircle2 size={16} aria-label={t("允许")} /></td><td>{t("禁止")}</td></tr>)}</tbody></table></div>
      <p className="role-notice help-text">{t("全局设置的菜单、页面与 API 仅管理员可访问；外观只影响当前客户端，不同步到服务器。")}</p>
    </>}
  </section>;
}
