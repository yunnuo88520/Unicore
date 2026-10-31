// Author: yunnuo <ymz@ebox.vip>
// Description: Generate isolated documentation/template/Wiki candidates and exact inventories without building or publishing a release.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { copyDistribution, distributionPlan, inventory } from './distribution.mjs';
import { createProject } from './create-project.mjs';
import { generateWiki } from './wiki.mjs';

export function verifyDistribution({source, output}) {
  source = resolve(source); output = resolve(output);
  if (existsSync(output)) throw Error('Candidate output must not exist');
  if (output === source || output.startsWith(source + '/')) throw Error('Candidate output must be outside the source tree');
  mkdirSync(output, {recursive: true});
  const release = join(output, 'user-release'), project = join(output, 'project-template'), wiki = join(output, 'public-wiki');
  const releaseFiles = copyDistribution(source, release, 'user-release');
  assert.deepEqual(inventory(release), releaseFiles);
  createProject({source, directory: project, name: 'Candidate Application', slug: 'candidate-application', module: 'example.test/candidate/application', bundle: 'test.example.candidate'});
  const projectFiles = distributionPlan(source, 'project-template').map(file => file.target).concat(['README.md', 'README.en.md', 'project.provenance.json', 'docs/developer/context.gen.md']).sort();
  assert.deepEqual(inventory(project), projectFiles);
  const pages = generateWiki({sourceRoot: source, output: wiki});
  assert.deepEqual(inventory(wiki), [...pages.keys()].sort());
  const forbidden = /(?:^|\/)(?:04-ai|adr|evidence[^/]*|acceptance[^/]*|commercial-[^/]*|workspace-preservation[^/]*|documentation-productization-audit[^/]*)(?:\/|\.|$)|(?:^|\/)(?:secret\.key|installation\.json|bootstrap\.token|\.env(?:\..*)?)$|\.(?:db(?:-wal|-shm)?|pem|p12|pfx|p8|key)$/i;
  const outputs = {};
  for (const [name, directory] of Object.entries({'user-release': release, 'project-template': project, 'public-wiki': wiki})) {
    const files = inventory(directory); assert(!files.some(path => forbidden.test(path)), `${name} leaked an internal or sensitive path`);
    for (const path of files.filter(path => name !== 'project-template' || path.startsWith('docs/') || path.startsWith('.agents/') || ['README.md', 'README.en.md', 'AGENTS.md', 'CONTRIBUTING.md', 'SECURITY.md', 'SUPPORT.md'].includes(path))) {
      assert(!/(?:\/Users\/|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|docs\/04-ai|docs\/adr|workspace-preservation|documentation-productization-audit)/.test(readFileSync(join(directory, path), 'utf8')), `${name}/${path} leaked private content`);
    }
    outputs[name] = files.map(path => ({path, sha256: createHash('sha256').update(readFileSync(join(directory, path))).digest('hex')}));
    writeFileSync(join(output, `${name}-files.json`), JSON.stringify(outputs[name], null, 2) + '\n');
  }
  writeFileSync(join(output, 'summary.json'), JSON.stringify({author: 'yunnuo <ymz@ebox.vip>', scope: 'distribution-only candidates; no binaries built, no publication or product runtime validation', counts: Object.fromEntries(Object.entries(outputs).map(([name, files]) => [name, files.length])), all_passed: true}, null, 2) + '\n');
  return outputs;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--source' || args[2] !== '--output') throw Error('Use --source SOURCE --output NEW_DIRECTORY');
  console.log(JSON.stringify(Object.fromEntries(Object.entries(verifyDistribution({source: args[1], output: args[3]})).map(([name, files]) => [name, files.length]))));
}
