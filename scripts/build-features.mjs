// Author: yunnuo <ymz@ebox.vip>
// Description: Strict compile-time flags shared by Vite, Make and archive builds.
import { pathToFileURL } from 'node:url';
import { readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

// Module editions come from the Go module manifest; the same list drives the
// Makefile tag validation and the frontend feature projection.
export function moduleEditions() {
  // Anchor on this script so nested Vite roots (apps/web) resolve the repo root.
  const manifest = JSON.parse(readFileSync(new URL('../internal/module/manifest.json', import.meta.url), 'utf8'));
  return manifest.modules.filter(item => item.edition).map(item => ({ slug: item.slug, edition: item.edition, default: item.default ?? false, disabledTag: item.disabled_tag }));
}

export function readFeatures(env = process.env) {
  const read = (name, fallback) => {
    const value = env[name] ?? String(fallback);
    if (value !== 'true' && value !== 'false') throw new Error(`${name} must be true or false`);
    return value === 'true';
  };
  const editions = { license: { edition: 'license', default: false }, updater: { edition: 'updater', default: true } };
  for (const item of moduleEditions()) editions[item.slug] = item;
  // Unknown FEATURE_* names fail the build instead of being silently ignored.
  for (const name of Object.keys(env)) {
    if (name.startsWith('FEATURE_') && !Object.values(editions).some(item => name === `FEATURE_${item.edition.toUpperCase()}`)) {
      throw new Error(`${name} does not match any known feature edition`);
    }
  }
  const features = {};
  const tags = [];
  for (const [key, item] of Object.entries(editions)) {
    const enabled = read(`FEATURE_${item.edition.toUpperCase()}`, item.default);
    features[key] = enabled;
    if (enabled && !item.disabledTag) tags.push(item.edition);
    if (!enabled && item.disabledTag) tags.push(item.disabledTag);
  }
  return { features, tags: tags.join(',') };
}

export function featureBuild() {
  const { features } = readFeatures();
  let output;
  return {
    define: { __FEATURE_LICENSE__: JSON.stringify(features.license), __FEATURE_UPDATER__: JSON.stringify(features.updater), __FEATURE_NOTES__: JSON.stringify(features.notes) },
    plugin: {
      name: 'unicore-features',
      configResolved(config) { if (config.command === 'build') output = resolve(config.root, config.build.outDir, config.build.assetsDir); },
      // Keep generated root brand assets, but never embed stale chunks from another edition.
      buildStart() { if (output) rmSync(output, { recursive: true, force: true }); },
      generateBundle() { this.emitFile({ type: 'asset', fileName: 'features.json', source: JSON.stringify({ ...features, integration: features.updater ? 'signed-updates' : 'disabled' }) + '\n' }); },
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { tags } = readFeatures();
  console.log(process.argv.includes('--tags') ? tags : 'PASS compile-time feature flags');
}
