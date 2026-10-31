// Author: yunnuo <ymz@ebox.vip>
// Description: Keep documentation/skills discoverable and reject broken local references and command drift.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

execFileSync(process.execPath,['scripts/ai-context.mjs','--check'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/wiki.mjs','--check'],{stdio:'inherit'});
const files=execFileSync('rg',['--files','--no-require-git','--hidden','README.md',...(existsSync('README.en.md') ? ['README.en.md'] : []),'AGENTS.md','CONTRIBUTING.md','CODE_OF_CONDUCT.md','SUPPORT.md','SECURITY.md','CHANGELOG.md','docs','.agents/skills','.github'],{encoding:'utf8'}).trim().split('\n').filter(path=>path.endsWith('.md'));
const failures=[];
for(const file of files){
 const text=readFileSync(file,'utf8');
 for(const match of text.matchAll(/\]\(([^)]+)\)/g)){
  const target=match[1].replace(/^<|>$/g,'').split(/\s+"/)[0].split('#')[0];
  if(!target||/^[a-z][a-z0-9+.-]*:/i.test(target))continue;
  const path=resolve(dirname(file),decodeURIComponent(target));
  if(!existsSync(path))failures.push(`${file}: missing linked resource ${target}`);
 }
}
const manifest=JSON.parse(readFileSync('framework.manifest.json','utf8'));
const pkg=JSON.parse(readFileSync('package.json','utf8'));
const make=readFileSync('Makefile','utf8');
for(const command of Object.values(manifest.commands)){
 if(command.startsWith('pnpm ')&&!pkg.scripts[command.slice(5)])failures.push(`Unknown package command ${command}`);
 if(command.startsWith('make ')&&!new RegExp(`^${command.slice(5)}:`, 'm').test(make))failures.push(`Unknown make target ${command}`);
}
if(failures.length)throw new Error(failures.join('\n'));
console.log(`PASS documentation links, framework manifest, ${manifest.skills.length} discoverable skills and generated AI context`);
