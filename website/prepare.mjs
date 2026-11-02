// Author: yunnuo <ymz@ebox.vip>
// Description: Build an explicit public-site projection without copying private or maintainer trees.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { distributionPlan, readDistribution, regularFile, safePath } from '../scripts/distribution.mjs';

export const repository = 'https://github.com/yunnuo88520/Unicore';
export const siteURL = 'https://unicore.ebox.vip';
export const root = fileURLToPath(new URL('../', import.meta.url));

export function siteDocuments(sourceRoot = root) {
  // Validate paths and the shared audience policy before selecting any inputs.
  distributionPlan(sourceRoot, 'public-site');
  const documents = readDistribution(sourceRoot).documents.filter(doc => doc.audiences.includes('public-site'));
  for (const doc of documents) {
    if (!doc.target.startsWith('docs/') || !doc.title) throw Error(`Invalid site document: ${doc.source}`);
  }
  return documents;
}

export const pagePath = doc => doc.target.slice('docs/'.length);
export const pageLink = doc => '/' + pagePath(doc).replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '');

export function rewriteLink(target, source, pages, assets, sourceRoot, ref = 'main') {
  if (!target || target.startsWith('#') || /^(?:https?:|mailto:)/i.test(target)) return target;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) throw Error(`Unsafe site link: ${target}`);
  if (target.startsWith('/')) throw Error(`Use repository-relative document links: ${source}: ${target}`);
  const match = target.match(/^([^?#]*)(.*)$/);
  const path = posix.normalize(posix.join(posix.dirname(source), decodeURIComponent(match[1])));
  safePath(path);
  if (pages.has(path)) return pageLink(pages.get(path)) + match[2];
  if (assets.has(path)) return '/' + assets.get(path) + match[2];
  // Source references remain reviewable, but their files are never copied to the site.
  regularFile(sourceRoot, path);
  return `${repository}/blob/${encodeURIComponent(ref)}/${path.split('/').map(encodeURIComponent).join('/')}${match[2]}`;
}

export function rewriteMarkdown(content, transform) {
  // Preserve examples verbatim; rewrite only prose outside fenced and inline code.
  return content.split(/(^ {0,3}(?:`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}(?:`{3,}|~{3,})[^\n]*$)/gm).map((block, index) => {
    if (index % 2) return block;
    return block.split(/(`+[^`\n]*`+)/g).map((part, inline) => inline % 2 ? part : part.replace(/(!?\[[^\]\n]*\])\(([^)\s]+)(\s+"[^"]*")?\)/g,
      (_, label, target, title = '') => `${label}(${transform(target)}${title})`)).join('');
  }).join('');
}

export function prepareSite({ sourceRoot = root, write = true, ref = process.env.DOCS_SOURCE_REF || 'main' } = {}) {
  const config = readDistribution(sourceRoot);
  const documents = siteDocuments(sourceRoot);
  const pages = new Map(documents.map(doc => [doc.source, doc]));
  const assets = new Map();
  const output = new Map();
  for (const asset of config.site_assets ?? []) {
    safePath(asset.target);
    if (!/^(?:assets\/brand|docs\/images)\/.+\.(?:svg|png|jpe?g|webp|ico)$/.test(asset.source) || !/\.(?:svg|png|jpe?g|webp|ico)$/.test(asset.target)) throw Error(`Invalid site asset: ${asset.source}`);
    if (assets.has(asset.source) || output.has(`public/${asset.target}`)) throw Error('Duplicate site asset');
    assets.set(asset.source, asset.target);
    output.set(`public/${asset.target}`, readFileSync(regularFile(sourceRoot, asset.source)));
  }
  for (const doc of documents) {
    const content = readFileSync(regularFile(sourceRoot, doc.source), 'utf8').replace(/<!-- Author: yunnuo <ymz@ebox\.vip> -->\n?/g, '');
    const rendered = rewriteMarkdown(content, target => rewriteLink(target, doc.source, pages, assets, sourceRoot, ref));
    // Inject metadata before either an existing frontmatter block or the document body.
    const editURL = `${repository}/edit/${encodeURIComponent(ref)}/${doc.source}`;
    const metadata = `sourcePath: ${JSON.stringify(doc.source)}\neditURL: ${JSON.stringify(editURL)}\n`;
    output.set(pagePath(doc), rendered.startsWith('---\n') ? rendered.replace('---\n', `---\n${metadata}`) : `---\n${metadata}---\n${rendered}`);
  }
  output.set('public/CNAME', new URL(siteURL).hostname + '\n');
  output.set('public/robots.txt', `User-agent: *\nAllow: /\nSitemap: ${siteURL}/sitemap.xml\n`);
  if (write) {
    const directory = join(sourceRoot, 'build/docs-site');
    rmSync(directory, { recursive: true, force: true });
    for (const [path, content] of output) {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      writeFileSync(join(directory, path), content);
    }
  }
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = prepareSite({ write: !process.argv.includes('--check') });
  console.log(`PASS ${output.size} public-site files ${process.argv.includes('--check') ? 'validated' : 'prepared in build/docs-site'}`);
}
