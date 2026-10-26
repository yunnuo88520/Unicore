// Author: yunnuo <ymz@ebox.vip>
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('rg', ['--files', '--hidden', '-g', '!.git'], { encoding: 'utf8' }).trim().split('\n');
const missing = files.filter(path => /\.(go|tsx?|mjs|css|ya?ml|sh|sql|html|svg|md)$/.test(path) && !path.includes('.gen.') && !path.endsWith('pnpm-lock.yaml')).filter(path => {
  const header = readFileSync(path, 'utf8').slice(0, 1200);
  return !header.includes('yunnuo') || !header.includes('ymz@ebox.vip');
});
if (missing.length) { console.error(`Missing author metadata:\n${missing.join('\n')}`); process.exit(1); }
console.log('PASS handwritten source author metadata');
