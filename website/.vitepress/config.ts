// Author: yunnuo <ymz@ebox.vip>
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig, type PageData } from 'vitepress';
import { pageLink, prepareSite, repository, root, siteDocuments, siteURL } from '../prepare.mjs';

const version = readFileSync(resolve(root, 'VERSION'), 'utf8').trim();
const documents = siteDocuments();
const channel = JSON.parse(readFileSync(resolve(root, 'assets/updates/config.json'), 'utf8')).channel;
if (!['preview', 'stable'].includes(channel)) throw new Error('Invalid documentation channel');
const require = createRequire(import.meta.url);
// VitePress serializes this function for the browser: it must have no captured variables.
const editPattern = (page: PageData) => page.frontmatter.editURL;
const groups = [
  ['guide', '快速开始', 'Get started', false],
  ['develop', '应用开发', 'Develop', false],
  ['deploy', '部署与运维', 'Deploy & operate', false],
  ['features', '功能与边界', 'Features & boundaries', true],
  ['reference', '框架规范（维护者）', 'Framework internals', true],
] as const;
const sidebar = (english = false) => groups.map(([id, zh, en, collapsed]) => ({
  text: english ? `${en} (中文)` : zh,
  collapsed,
  items: documents.filter(doc => doc.site_group === id).map(doc => ({ text: doc.title, link: pageLink(doc) })),
}));

export default defineConfig({
  title: 'Unicore',
  description: '共享 Go Core 与 React UI，构建 Web、Wails 桌面与 CLI 应用。',
  lang: 'zh-CN',
  srcDir: resolve(root, 'build/docs-site'),
  outDir: resolve(root, 'build/docs-site-dist'),
  cacheDir: resolve(root, 'build/docs-site-cache'),
  cleanUrls: true,
  sitemap: { hostname: siteURL },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/brand/mark.svg' }],
    ['meta', { name: 'theme-color', content: '#635bff' }],
  ],
  transformHead({ pageData }) {
    const path = pageData.relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '');
    return [['link', { rel: 'canonical', href: `${siteURL}/${path}` }]];
  },
  // Repository guides contain literal <placeholders>, not Vue components.
  markdown: { html: false },
  locales: {
    root: {
      label: '简体中文', lang: 'zh-CN',
      themeConfig: {
        nav: [
          { text: '快速开始', link: '/product/index' },
          { text: '部署', link: '/product/deployment' },
          { text: '应用开发', link: '/product/development' },
          { text: '支持范围', link: '/support' },
          { text: `v${version} · ${channel === 'stable' ? '稳定版源码' : '开发预览'}`, items: [
            { text: '当前滚动文档 · 随 main 更新', link: '/03-runbooks/documentation-site' },
            { text: '发行与版本记录', link: `${repository}/releases` },
            { text: '安全策略', link: '/product/security' },
          ] },
        ],
        sidebar: sidebar(),
        outline: { label: '本页目录', level: [2, 3] },
        docFooter: { prev: '上一篇', next: '下一篇' },
        editLink: { text: '在 GitHub 编辑此页', pattern: editPattern },
        sidebarMenuLabel: '目录', returnToTopLabel: '回到顶部', darkModeSwitchLabel: '外观',
        lightModeSwitchTitle: '切换为浅色模式', darkModeSwitchTitle: '切换为深色模式',
        langMenuLabel: '语言', skipToContentLabel: '跳转到内容',
        footer: { message: '基于 MIT 许可发布 · 详细手册目前主要为中文', copyright: `Unicore v${version} · Copyright © yunnuo` },
      },
    },
    en: {
      label: 'English', lang: 'en-US', description: 'One Go Core and shared React UI for Web, Wails desktop, and CLI applications.',
      themeConfig: {
        nav: [
          { text: 'Get started', link: '/en/getting-started' },
          { text: 'Development (中文)', link: '/product/development' },
          { text: 'Support (中文)', link: '/support' },
          { text: `v${version} · ${channel === 'stable' ? 'Stable source' : 'Preview'}`, items: [
            { text: 'Releases & version notes', link: `${repository}/releases` },
            { text: 'Security policy (中文)', link: '/product/security' },
          ] },
        ],
        sidebar: [
          { text: 'Overview', items: [{ text: 'Get started', link: '/en/getting-started' }] },
          ...sidebar(true),
        ],
        outline: { label: 'On this page', level: [2, 3] },
        docFooter: { prev: 'Previous', next: 'Next' },
        editLink: { text: 'Edit this page on GitHub', pattern: editPattern },
        footer: { message: 'Released under the MIT License · Detailed guides are primarily in Chinese', copyright: `Unicore v${version} · Copyright © yunnuo` },
      },
    },
  },
  themeConfig: {
    // Only entry pages are translated; switching languages always opens that locale's home.
    i18nRouting: false,
    logo: { light: '/brand/mark.svg', dark: '/brand/mark-dark.svg' },
    siteTitle: 'Unicore',
    socialLinks: [{ icon: 'github', link: repository }],
    search: { provider: 'local', options: { locales: { root: { translations: {
      button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
      modal: { displayDetails: '显示详细列表', resetButtonTitle: '清除搜索', backButtonTitle: '关闭搜索', noResultsText: '没有找到相关内容', footer: { selectText: '选择', selectKeyAriaLabel: '回车', navigateText: '切换', navigateUpKeyAriaLabel: '向上', navigateDownKeyAriaLabel: '向下', closeText: '关闭', closeKeyAriaLabel: 'Esc' } },
    } } } } },
  },
  vite: {
    resolve: { alias: [
      { find: /^vue$/, replacement: require.resolve('vue/dist/vue.runtime.esm-bundler.js') },
      { find: /^vue\/server-renderer$/, replacement: require.resolve('vue/server-renderer') },
    ] },
    plugins: [{
      name: 'unicore-doc-source-watch',
      configureServer(server) {
        const sources = new Set(documents.map(doc => resolve(root, doc.source)));
        const manifest = resolve(root, 'distribution/manifest.json');
        server.watcher.add([...sources, manifest]);
        server.watcher.on('change', async file => {
          if (file === manifest) { prepareSite(); await server.restart(); }
          else if (sources.has(file)) prepareSite();
        });
      },
    }],
  },
});
