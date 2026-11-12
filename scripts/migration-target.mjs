// Author: yunnuo <ymz@ebox.vip>
// Description: Bind release targets to checked Catalog projections, never handwritten migration levels.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMetadata } from './generate-migrations.mjs';

export function migrationTarget(profile, root = process.cwd()) {
  const metadata = buildMetadata(root);
  if (readFileSync(join(root, 'migrations/metadata.gen.json'), 'utf8') !== JSON.stringify(metadata, null, 2) + '\n') throw Error('Stale migration metadata; run pnpm generate:migrations');
  const target = metadata.profiles[profile];
  if (!target) throw Error(`Unknown migration profile ${profile}`);
  return {schema_generation: target.namespaces.length ? metadata.schema_generation : '', schema_fingerprint: target.schema_fingerprint, namespace_versions: target.levels};
}
