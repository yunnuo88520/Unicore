// Author: yunnuo <ymz@ebox.vip>
// Description: Recursively enforce shared tokens and synchronized shell icons.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sourceDirs = ['packages/theme/src', 'packages/web-ui/src', 'packages/ui/src', 'packages/form/src'];
const defaultRoot = fileURLToPath(new URL('../', import.meta.url));

/** Walk nested components without following symlinks outside the source boundary. */
export function designSources(root) {
  const walk = directory => readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    if (entry.isSymbolicLink() || entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : entry.isFile() && /\.(?:css|tsx?|jsx)$/.test(entry.name) ? [path] : [];
  });
  return sourceDirs.flatMap(dir => existsSync(join(root, dir)) ? walk(join(root, dir)) : []);
}

export function checkDesignSources(root = defaultRoot) {
  const entries = designSources(root);
  const contents = new Map(entries.map(file => [file, readFileSync(file, 'utf8')]));
  // Definitions may themselves live in nested stylesheet directories.
  const definedTokens = new Set(entries.filter(file => file.endsWith('.css')).flatMap(file => [...contents.get(file).matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1])));
  for (const [file, text] of contents) {
    const name = relative(root, file);
    // Fixtures may deliberately contain undefined variables, raw colors and emoji.
    if (/(?:\.test\.|\.spec\.|__tests__\/)/.test(name)) continue;
    for (const match of text.matchAll(/var\(\s*(--[\w-]+)/g)) {
      // Template-built presets resolve at runtime; Radix owns its positioning variables.
      if (match[1].endsWith('-') || match[1].startsWith('--radix-')) continue;
      if (!definedTokens.has(match[1])) throw new Error(`${name}: undefined design token ${match[1]}`);
    }
    if (!name.includes('.gen.') && (/#[0-9a-f]{3,8}\b/i.test(text) || /\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\s*\(/i.test(text))) {
      throw new Error(`${name}: move raw palette colors into assets/theme/tokens.json`);
    }
    if (/[\u{1F000}-\u{1FAFF}\uFE0F\u20E3]/u.test(text)) throw new Error(`${name}: use Lucide/SVG icons instead of emoji`);
  }
  return entries.length;
}

export function checkDesign(root = defaultRoot) {
  checkDesignSources(root);
  const digest = file => createHash('sha256').update(readFileSync(join(root, file))).digest('hex');
  for (const app of ['web', 'desktop']) for (const [source, target] of [['mark.svg', 'favicon.svg'], ['favicon.ico', 'favicon.ico'], ['icon-180.png', 'apple-touch-icon.png'], ['icon-192.png', 'icon-192.png'], ['icon-512.png', 'icon-512.png']]) {
    if (digest(`assets/brand/${source}`) !== digest(`apps/${app}/public/${target}`)) throw new Error(`${app}/${target} is stale; run pnpm design:generate`);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  checkDesign();
  console.log('PASS recursive shared design tokens and synchronized Web/Desktop brand assets');
}
