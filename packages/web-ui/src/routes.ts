// Author: yunnuo <ymz@ebox.vip>
// Description: Single source of page facts (labels, permissions, icons, nav groups); backend authorization remains authoritative.
// Module pages merge in from src/modules; the backend module registry stays authoritative for grants.
import { notes } from './modules/notes';
import {defineMessages} from './i18n';
import type { Bootstrap } from '@unicore/sdk';
import { Bell, BookOpen, Circle, Cloud, FileText, FlaskConical, FolderOpen, LayoutDashboard, ListChecks, Mail, Megaphone, Monitor, Network, NotebookPen, PackageCheck, ScrollText, Settings2, ShieldCheck, UserCog, UserRound, Webhook, type LucideIcon } from 'lucide-react';

export const routes = defineMessages({
  ...notes.routes,
  overview: { label: '工作台概览', title: '一份核心，无限可能', description: '从这里出发，让同一份业务逻辑运行于 Web、桌面与命令行。', icon: LayoutDashboard },
  lab: { label: '核心实验室', title: '探索核心的每一种可能', description: '修改输入、运行用例，验证跨形态一致的执行结果。', icon: FlaskConical },
  files:{label:'文件管理',title:'文件管理',description:'统一管理文件，按需获取临时访问链接。',permission:'files:access',icon:FolderOpen},
  site: { label: '基础设置', title: '基础设置', description: '集中管理站点、品牌与适用的实例配置。', permission: 'settings:read', icon: Settings2, group: 'system' },
  storage:{label:'对象存储',title:'对象存储',description:'按需切换本地与云存储，让业务只关心文件。',permission:'storage:read',icon:Cloud,group:'system'},
  users: { label: '用户列表', title: '用户管理', description: '管理账号、角色和状态，权限由服务端逐一校验。', permission: 'users:read', icon: UserRound, group: 'administration' },
  administrators: { label:'管理员列表',title:'管理员管理',description:'独立的后台账号，管理整个实例。',permission:'administrators:read',icon:UserCog,group:'administration' },
  announcements:{label:'平台公告',title:'平台公告',description:'发布平台消息，让用户及时了解重要动态。',permission:'announcements:read',icon:Megaphone},
  'account-policy': {label:'账户安全',title:'账户安全',description:'配置登录保护、会话超时和管理员与用户的两步验证策略。',permission:'settings:read',icon:ShieldCheck,group:'system'},
  mail: { label:'邮件设置',title:'邮件设置',description:'配置 SMTP、测试投递与账号邮件流程。',permission:'settings:read',icon:Mail,group:'system' },
  'mail-templates': {label:'邮件模板',title:'邮件模板',description:'自定义邮件主题与内容，让每封通知保持一致。',permission:'settings:read',icon:Mail,group:'system'},
  'notification-channels':{label:'通知渠道',title:'通知渠道',description:'配置企业微信或 Webhook，连接外部通知服务。',permission:'settings:read',icon:Webhook,group:'system'},
  'notification-templates':{label:'通知模板',title:'通知模板',description:'管理事件通知的纯文本标题、内容和变量。',permission:'settings:read',icon:FileText,group:'system'},
  'system-notifications':{label:'系统通知',title:'系统通知',description:'按事件和接收对象配置自动通知策略。',permission:'settings:read',icon:Bell,group:'system'},
  logs: { label:'操作日志',title:'操作日志',description:'查看真实操作与邮件投递记录。',permission:'logs:read',icon:ScrollText,group:'system' },
  edition: { label:'系统更新',title:'系统更新',description:'查看版本记录，检查并安装可信的新版本。',permission:'updates:read',icon:PackageCheck,group:'system' },
  roles: { label: '角色权限', title: '角色权限', description: '维护用户角色的权限点与成员分配。', permission: 'roles:read', icon: ShieldCheck, group: 'administration' },
  posts: { label: '岗位管理', title: '岗位管理', description: '维护岗位目录和成员关系，岗位不隐式授予角色。', permission: 'posts:read', icon: UserCog, group: 'administration' },
  'api-operations': { label: 'API 操作目录', title: 'API 操作目录', description: '查看接口安全策略并通过角色独立授权。', permission: 'roles:read', icon: BookOpen, group: 'administration' },
  departments: { label: '部门管理', title: '部门管理', description: '维护部门层级，为数据权限提供组织范围。', permission: 'departments:read', icon: Network, group: 'administration' },
  tasks: { label: '定时任务', title: '定时任务', description: '管理后台定时任务：内置任务启停与手动触发，自建任务在已注册执行器上创建、编辑与删除。', permission: 'tasks:read', icon: ListChecks, group: 'administration' },
  menus: { label: '菜单管理', title: '菜单管理', description: '调整用户端导航的顺序、分组与可见性。', permission: 'menus:write', icon: LayoutDashboard, group: 'administration' },
  dictionaries: { label: '数据字典', title: '数据字典', description: '维护业务表单可复用的枚举字典。', permission: 'dictionaries:read', icon: FileText, group: 'administration' },
  account: { label: '个人资料', title: '个人资料', description: '管理昵称、邮箱与账号信息。', authenticated: true, icon: UserRound, group: 'personal' },
 'account-security': {label:'安全设置',title:'安全设置',description:'管理密码、双重验证与企业账号绑定。',authenticated:true,icon:ShieldCheck,group:'personal'},
 'account-sessions': {label:'登录会话',title:'登录会话',description:'查看登录设备，及时下线不再使用的会话。',authenticated:true,icon:Monitor,group:'personal'},
  // No permission or authenticated marker: reachable whenever the instance publishes /openapi.json (config.APIDocs).
  'api-docs': { label: 'API 文档', title: 'API 文档', description: '浏览与下载 OpenAPI 接口契约。', icon: BookOpen },
  'not-found': { label: '页面不存在', title: '页面不存在', description: '这个地址尚未注册，请通过导航进入已有页面。', icon: Circle },
} as const);
export type Page = keyof typeof routes;
export function pageFromHash(hash: string): Page {
  const path = hash.replace(/^#/, '').split('?')[0];
  if (path === 'settings') return 'site';
 if (path === 'admin') return 'overview';
  if (!path || /^oidc=(success|failed|link_required)$/.test(path) || path === 'verify-email' || path === 'reset-password') return 'overview';
  return Object.hasOwn(routes, path) ? path as Page : 'not-found';
}
// isAdminRealm marks any signed-in administrator-realm operator (super or a
// restricted custom admin role); super_admin semantics stay in isAdministrator.
export function isAdminRealm(metadata?: Bootstrap): boolean {
  return metadata?.profile === 'web-platform' && metadata.identity_realm === 'administrator';
}
export function isAdministrator(metadata?: Bootstrap): boolean {
  return isAdminRealm(metadata) && !!metadata?.current_user?.roles.includes('super_admin');
}
export function canAccess(page: Page, metadata?: Bootstrap): boolean {
  // Management-flavoured pages never render on the user surface — even when a
  // persisted menu tree or a custom role still carries them (existing installs).
  if (metadata?.profile === 'web-platform' && metadata.identity_realm !== 'administrator' &&
    ['site', 'api-docs', 'announcements', 'files'].includes(page)) return false;
  if (metadata?.profile === 'web-platform' && metadata.current_user &&
    !metadata.current_user.roles.includes('super_admin') &&
    !['account', 'account-security', 'account-sessions'].includes(page)) {
    const navigation = metadata.navigation;
    const realm = metadata.identity_realm ?? 'user';
    const sections = new Set(navigation?.sections.filter(section => section.visible &&
      !!section.surfaces?.includes(realm as 'user' | 'administrator')).map(section => section.id));
    const nodes = navigation?.nodes.filter(node => sections.has(node.section_id) &&
      !!node.surfaces?.includes(realm as 'user' | 'administrator')) ?? [];
    const visible = (node: typeof nodes[number]) => {
      const seen = new Set<string>();
      let current: typeof node | undefined = node;
      while (current) {
        if (!current.visible || current.disabled || seen.has(current.id) ||
          !metadata.current_user?.menu_ids?.includes(current.id)) return false;
        seen.add(current.id);
        if (!current.parent_id) return true;
        current = nodes.find(parent => parent.id === current!.parent_id && parent.section_id === node.section_id);
      }
      return false;
    };
    if (!nodes.some(node => node.type === 'page' && node.route_id === page && visible(node))) return false;
  }

  if (!metadata) return false;
  if (page === 'api-docs') return metadata.profile === 'web-platform' || metadata.profile === 'web-standalone';
  // Updates stay super-only: restricted operators never reach the update panel.
  if (page === 'edition') return metadata.profile==='web-platform' ? isAdministrator(metadata) && ((__FEATURE_UPDATER__ && metadata.capabilities.updater) || (__FEATURE_LICENSE__ && metadata.capabilities.license)) : __FEATURE_UPDATER__ && metadata.capabilities.updater;
  if (page === 'site') return metadata.capabilities.settings && (metadata.profile !== 'web-platform' || !!metadata.current_user);
  const route = routes[page];
  // Module pages flagged local exist in every database profile: standalone and
  // desktop keep the capability check, web-platform gates on the role grant.
  if ('local' in route && route.local) {
    if ('database' in route && route.database && !metadata.capabilities.database) return false;
    if (metadata.profile !== 'web-platform') return true;
    return !!metadata.current_user && 'permission' in route && !!route.permission && metadata.current_user.permissions.includes(route.permission);
  }
  if (metadata.profile !== 'web-platform') return !('permission' in route) && !('authenticated' in route);
  if (!metadata.current_user) return false;
  const permission = 'permission' in route ? route.permission : null;
  // Page permissions remain the upper bound in addition to menu grants.
  if (permission && !metadata.current_user.permissions.includes(permission)) return false;
  if ((route as { group?: string }).group === 'administration' && !isAdminRealm(metadata)) return false;
  return true;
}
