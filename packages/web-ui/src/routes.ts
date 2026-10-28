// Author: yunnuo <ymz@ebox.vip>
// Description: Shared hash route metadata; backend authorization remains authoritative.
import type { Bootstrap } from '@unicore/sdk';

export const routes = {
  overview: { label: '工作台概览', title: '一份核心，无限可能', description: '从这里出发，让同一份业务逻辑运行于 Web、桌面与命令行。' },
  lab: { label: '核心实验室', title: '探索核心的每一种可能', description: '修改输入、运行用例，验证跨形态一致的执行结果。' },
  notes:{label:'我的笔记',title:'我的笔记',description:'记录想法、跟进事项，让每一次进展都有迹可循。'},
  files:{label:'文件管理',title:'文件管理',description:'统一管理文件，按需获取临时访问链接。',authenticated:true},
  storage:{label:'对象存储',title:'对象存储',description:'按需切换本地与云存储，让业务只关心文件。',permission:'storage:read'},
  users: { label: '用户列表', title: '用户管理', description: '管理账号、角色和状态，权限由服务端逐一校验。', permission: 'users:read' },
  administrators: { label:'管理员列表',title:'管理员管理',description:'独立的后台账号，管理整个实例。',permission:'administrators:read' },
  mail: { label:'邮件设置',title:'邮件设置',description:'配置 SMTP、测试投递与账号邮件流程。',permission:'settings:read' },
  logs: { label:'系统日志',title:'系统日志',description:'查看真实操作与邮件投递记录。',permission:'logs:read' },
  edition: { label:'授权与更新',title:'授权与更新',description:'授权与在线更新服务的接入入口。',permission:'settings:read' },
  roles: { label: '角色权限', title: '角色权限', description: '管理员与普通用户的固定权限边界。', permission: 'roles:read' },
  site: { label: '基础设置', title: '基础设置', description: '集中管理站点、品牌与适用的实例配置。', permission: 'settings:read' },
  account: { label: '账号资料', title: '账号资料', description: '管理本地密码与企业登录绑定。', authenticated: true },
  'not-found': { label: '页面不存在', title: '页面不存在', description: '这个地址尚未注册，请通过导航进入已有页面。' },
} as const;
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
  if (page === 'notes') return metadata.capabilities.database;
  if (page === 'site') return metadata.capabilities.settings && (metadata.profile !== 'web-platform' || !!metadata.current_user);
  const route = routes[page];
  if ('authenticated' in route) return metadata.profile === 'web-platform' && !!metadata.current_user;
  return !('permission' in route) || (isAdministrator(metadata) && !!metadata.current_user?.permissions.includes(route.permission));
}
