// Author: yunnuo <ymz@ebox.vip>
// Description: Shared hash route metadata; backend authorization remains authoritative.
import type { Bootstrap } from '@unicore/sdk';

export const routes = {
  overview: { label: '工作台概览', title: '一份核心，无限可能', description: '从这里出发，让同一份业务逻辑运行于 Web、桌面与命令行。' },
  lab: { label: '核心实验室', title: '探索核心的每一种可能', description: '修改输入、运行用例，验证跨形态一致的执行结果。' },
  admin: { label: '平台仪表盘', title: '平台仪表盘', description: '从真实认证活动与审计记录了解实例运行情况。', permission: 'dashboard:read' },
  users: { label: '用户管理', title: '用户管理', description: '管理账号、角色和状态，权限由服务端逐一校验。', permission: 'users:read' },
  roles: { label: '角色权限', title: '角色权限', description: '让业务角色各司其职，让每一次授权都有边界。', permission: 'roles:read' },
  site: { label: '实例设置', title: '实例设置', description: '集中配置站点、安全与外观，保存后跨重启保留。', permission: 'settings:read' },
  account: { label: '账号安全', title: '账号安全', description: '连接企业身份，保留可用的本地登录方式。', authenticated: true },
  'not-found': { label: '页面不存在', title: '页面不存在', description: '这个地址尚未注册，请通过导航进入已有页面。' },
} as const;
export type Page = keyof typeof routes;
export function pageFromHash(hash: string): Page {
  const path = hash.replace(/^#/, '').split('?')[0];
  if (path === 'settings') return 'site';
  if (!path || /^oidc=(success|failed|link_required)$/.test(path) || path === 'verify-email' || path === 'reset-password') return 'overview';
  return Object.hasOwn(routes, path) ? path as Page : 'not-found';
}
export function canAccess(page: Page, metadata?: Bootstrap): boolean {
  if (!metadata) return false;
  if (page === 'site' && metadata.profile !== 'web-platform') return metadata.capabilities.settings;
  const route = routes[page];
  if ('authenticated' in route) return metadata.profile === 'web-platform' && !!metadata.current_user;
  return !('permission' in route) || (metadata.profile === 'web-platform' && !!metadata.current_user?.permissions.includes(route.permission));
}
