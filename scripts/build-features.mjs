// Author: yunnuo <ymz@ebox.vip>
// Description: Strict compile-time flags shared by Vite, Make and archive builds.
import { pathToFileURL } from 'node:url';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

export function readFeatures(env = process.env) {
  const read = name => {
    const value = env[name] ?? (name === 'FEATURE_UPDATER' ? 'true' : 'false');
    if (value !== 'true' && value !== 'false') throw new Error(`${name} must be true or false`);
    return value === 'true';
  };
  const features = { license: read('FEATURE_LICENSE'), updater: read('FEATURE_UPDATER') };
  return { features, tags: Object.keys(features).filter(key => features[key]).join(',') };
}

export function featureBuild() {
  const { features } = readFeatures();
  let output;
  return {
    define: { __FEATURE_LICENSE__: JSON.stringify(features.license), __FEATURE_UPDATER__: JSON.stringify(features.updater) },
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
