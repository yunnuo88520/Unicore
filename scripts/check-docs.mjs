// Author: yunnuo <ymz@ebox.vip>
// Description: Keep documentation/skills discoverable and reject broken local references and command drift.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

execFileSync(process.execPath,['scripts/ai-context.mjs','--check'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/wiki.mjs','--check'],{stdio:'inherit'});
// The upstream documentation site is deliberately excluded from application templates.
if(existsSync('website/prepare.mjs')) {
 execFileSync(process.execPath,['--test','website/prepare.test.mjs'],{stdio:'inherit'});
 execFileSync(process.execPath,['website/prepare.mjs','--check'],{stdio:'inherit'});
}
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
// Skill texts also cite repository paths in prose; a renamed source must
// fail here before a stale instruction reaches an AI task. Matches after a
// "make " shorthand or with a trailing Go symbol (blob.Store) are not paths.
const skillTexts=execFileSync('rg',['--files','--no-require-git','.agents/skills'],{encoding:'utf8'}).trim().split('\n').filter(path=>path.endsWith('.md'));
const citedPath=/(?:docs|internal|packages|scripts|migrations|distribution|assets|apps|cmd|tests)\/[A-Za-z0-9][A-Za-z0-9_./-]*/g;
const symbolSuffix=/^(.*\/[^/]+)\.[A-Z][A-Za-z0-9_]*$/;
// Case-exact existence: macOS and Windows filesystems accept the wrong case,
// CI does not, so paths are verified segment by segment against readdir.
const dirCache=new Map();
function caseExactExists(path){
 let current='';
 for(const part of path.split('/')){
  const base=current;
  if(!dirCache.has(base)){
   try{dirCache.set(base,new Set(readdirSync(base||'.',{withFileTypes:true}).map(entry=>entry.name)));}
   catch{dirCache.set(base,new Set());}
  }
  if(!dirCache.get(base).has(part))return false;
  current=current?`${current}/${part}`:part;
 }
 return true;
}
for(const file of skillTexts){
 const text=readFileSync(file,'utf8');
 for(const match of text.matchAll(citedPath)){
  if(match.index>=5 && text.slice(match.index-5,match.index)==='make ')continue;
  let target=match[0].replace(/[.,;:)）`]+$/,'');
  const symbol=target.match(symbolSuffix);
  if(symbol)target=symbol[1];
  if(!caseExactExists(target))failures.push(`${file}: missing cited path ${target}`);
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
