// Author: yunnuo <ymz@ebox.vip>
import {defineMessages} from './i18n';
// Description: Single source of page facts (labels, permissions, icons, nav groups); backend authorization remains authoritative.
import type { Bootstrap } from '@unicore/sdk';
import { Bell, Circle, Cloud, FileText, FlaskConical, FolderOpen, LayoutDashboard, Mail, Megaphone, Monitor, NotebookPen, PackageCheck, ScrollText, Settings2, ShieldCheck, UserCog, UserRound, Webhook, type LucideIcon } from 'lucide-react';

export const routes = defineMessages({
  overview: { label: '工作台概览', title: '一份核心，无限可能', description: '从这里出发，让同一份业务逻辑运行于 Web、桌面与命令行。', icon: LayoutDashboard },
  lab: { label: '核心实验室', title: '探索核心的每一种可能', description: '修改输入、运行用例，验证跨形态一致的执行结果。', icon: FlaskConical },
  notes:{label:'我的笔记',title:'我的笔记',description:'记录想法、跟进事项，让每一次进展都有迹可循。',permission:'notes:access',icon:NotebookPen},
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
  logs: { label:'系统日志',title:'系统日志',description:'查看真实操作与邮件投递记录。',permission:'logs:read',icon:ScrollText,group:'system' },
  edition: { label:'系统更新',title:'系统更新',description:'查看版本记录，检查并安装可信的新版本。',permission:'updates:read',icon:PackageCheck,group:'system' },
  roles: { label: '角色权限', title: '角色权限', description: '维护用户角色的权限点与成员分配。', permission: 'roles:read', icon: ShieldCheck, group: 'administration' },
  menus: { label: '菜单管理', title: '菜单管理', description: '调整用户端导航的顺序、分组与可见性。', permission: 'menus:write', icon: LayoutDashboard, group: 'administration' },
  dictionaries: { label: '数据字典', title: '数据字典', description: '维护业务表单可复用的枚举字典。', permission: 'dictionaries:read', icon: FileText, group: 'administration' },
  account: { label: '个人资料', title: '个人资料', description: '管理昵称、邮箱与账号信息。', authenticated: true, icon: UserRound, group: 'personal' },
 'account-security': {label:'安全设置',title:'安全设置',description:'管理密码、双重验证与企业账号绑定。',authenticated:true,icon:ShieldCheck,group:'personal'},
 'account-sessions': {label:'登录会话',title:'登录会话',description:'查看登录设备，及时下线不再使用的会话。',authenticated:true,icon:Monitor,group:'personal'},
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
export function isAdministrator(metadata?: Bootstrap): boolean {
  return metadata?.profile === 'web-platform' && metadata.identity_realm === 'administrator' && metadata.current_user?.roles.length === 1 && metadata.current_user.roles[0] === 'super_admin';
}
export function canAccess(page: Page, metadata?: Bootstrap): boolean {
  if (!metadata) return false;
  if (page === 'edition') return metadata.profile==='web-platform' ? isAdministrator(metadata) && ((__FEATURE_UPDATER__ && metadata.capabilities.updater) || (__FEATURE_LICENSE__ && metadata.capabilities.license)) : __FEATURE_UPDATER__ && metadata.capabilities.updater;
  if (page === 'site') return metadata.capabilities.settings && (metadata.profile !== 'web-platform' || !!metadata.current_user);
  // Notes exist in every database profile: standalone and desktop keep the
  // capability check, web-platform additionally gates on the role grant.
  if (page === 'notes') {
    if (!metadata.capabilities.database) return false;
    if (metadata.profile !== 'web-platform') return true;
    return !!metadata.current_user && metadata.current_user.permissions.includes('notes:access');
  }
  const route = routes[page];
  if (metadata.profile !== 'web-platform') return !('permission' in route) && !('authenticated' in route);
  if (!metadata.current_user) return false;
  const permission = 'permission' in route ? route.permission : null;
  // One permission point gates the page, its buttons and its API: the builtin
  // super_admin holds the full catalogue, user-realm roles resolve assignable
  // grants from the database.
  if (permission && !metadata.current_user.permissions.includes(permission)) return false;
  if ((route as { group?: string }).group === 'administration' && !isAdministrator(metadata)) return false;
  return true;
}
