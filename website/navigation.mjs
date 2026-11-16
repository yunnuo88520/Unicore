// Author: yunnuo <ymz@ebox.vip>
// Description: Keep public navigation organized by reader task, independently of source directories.
import { pageLink, pagePath } from './prepare.mjs';

export const sections = [
  { id: 'start', title: '开始使用', entry: '/product/', groups: [['start', '入门']] },
  { id: 'develop', title: '开发指南', entry: '/product/development', groups: [['develop', '应用开发'], ['integrate', '接口与集成']] },
  { id: 'guide', title: '使用手册', entry: '/product/workspace', groups: [['guide', '工作台'], ['admin', '平台管理']] },
  { id: 'deploy', title: '部署运维', entry: '/product/deployment', groups: [['deploy', '部署与配置'], ['operate', '数据与安全']] },
  { id: 'reference', title: '技术参考', entry: '/02-standards/backend', groups: [['backend', '后端'], ['frontend', '前端'], ['identity', '产品定制']] },
];

export function publicNavigation(documents) {
  const groups = new Set(sections.flatMap(section => section.groups.map(([id]) => id)));
  const visible = documents.filter(doc => !['docs/index.md', 'docs/en/index.md', 'docs/en/getting-started.md'].includes(doc.target));
  for (const doc of visible) {
    if (!groups.has(doc.site_group)) throw Error(`Missing public navigation group: ${doc.source}`);
    if (!Number.isInteger(doc.site_order)) throw Error(`Missing public navigation order: ${doc.source}`);
  }
  // VitePress resolves sidebars against page.relativePath, including .md.
  // Exact source paths keep /product/index.md from matching every product page.
  const sourcePaths = new Map(visible.map(doc => [pageLink(doc), '/' + pagePath(doc)]));
  const sidebar = {};
  const nav = [];
  for (const section of sections) {
    const items = section.groups.map(([id, text]) => ({
      text,
      items: visible.filter(doc => doc.site_group === id).sort((a, b) => a.site_order - b.site_order).map(doc => ({ text: doc.title, link: pageLink(doc) })),
    }));
    if (items.some(group => !group.items.length)) throw Error(`Empty public navigation section: ${section.id}`);
    const pages = items.flatMap(group => group.items);
    if (!pages.some(page => page.link === section.entry)) throw Error(`Missing section entry: ${section.entry}`);
    for (const page of pages) sidebar[sourcePaths.get(page.link)] = items;
    const routes = pages.map(page => page.link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + (page.link.endsWith('/') ? '(?:index)?' : ''));
    nav.push({ text: section.title, link: section.entry, activeMatch: `^(?:${routes.join('|')})$` });
  }
  return { nav, sidebar };
}
