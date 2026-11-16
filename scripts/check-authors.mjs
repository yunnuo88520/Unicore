// Author: yunnuo <ymz@ebox.vip>
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const files = execFileSync('rg', ['--files', '--no-require-git', '--hidden', '-g', '!.git', '-g', '!.zcode/**'], { encoding: 'utf8' }).trim().split('\n');
const authors = ['yunnuo <ymz@ebox.vip>'];
if (existsSync('project.provenance.json')) {
  const owner = JSON.parse(readFileSync('product.identity.json','utf8')).author;
  if (typeof owner === 'string' && /^[^<>]+ <[^<>\s]+@[^<>\s]+>$/.test(owner)) authors.push(owner);
}
// A skill whose SKILL.md frontmatter declares another author is vendored
// third-party content; coding.md exempts third-party files from this metadata.
const thirdPartySkills = new Set();
for (const file of files) {
  const skill = file.match(/^(\.agents\/skills\/[^/]+)\/SKILL\.md$/);
  if (!skill) continue;
  const front = (readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] ?? '';
  const declared = (front.match(/^\s*author:\s*(.+)$/m) || [])[1];
  if (declared && !authors.some(author => declared.includes((author.match(/<([^>]+)>/) || [])[1] ?? author))) thirdPartySkills.add(skill[1]);
}
const missing = files.filter(path => /\.(go|tsx?|mjs|css|ya?ml|sh|sql|html|svg|md)$/.test(path) && !path.includes('.gen.') && !path.endsWith('pnpm-lock.yaml')).filter(path => {
  if ([...thirdPartySkills].some(dir => path.startsWith(dir + '/'))) return false;
  const header = readFileSync(path, 'utf8').slice(0, 1200);
  return !authors.some(author => author === 'yunnuo <ymz@ebox.vip>' ? header.includes('yunnuo') && header.includes('ymz@ebox.vip') : header.includes(author));
});
if (missing.length) { console.error(`Missing author metadata:\n${missing.join('\n')}`); process.exit(1); }
console.log('PASS handwritten source author metadata');
