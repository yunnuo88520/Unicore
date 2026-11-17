// Author: yunnuo <ymz@ebox.vip>
// Description: Read-only development prerequisites and optional native/container diagnostics.
// Failures distinguish "not installed", "failed to start" and "version does not meet the requirement".
import { existsSync, readFileSync } from 'node:fs';
import { spawnTool } from './tool-spawn.mjs';
const results=[];
function command(name,args,{required=true,accept=()=>({ok:true})}={}) {
  const run = spawnTool(name, args, { timeout: 15000 });
  const verdict = run.ok ? accept(run.output) : { ok: false, reason: run.reason };
  results.push({ name: `${name} ${args.join(' ')}`, ok: verdict.ok, required, reason: verdict.reason ?? '' });
}
const requiredGo=readFileSync('go.mod','utf8').match(/^go (\S+)/m)[1].split('.').map(Number);
command('go',['version'],{accept:s=>{
  const actual=s.match(/go(\d+)\.(\d+)\.(\d+)/)?.slice(1).map(Number);
  if(!actual)return{ok:false,reason:'unrecognized go version output'};
  return actual.reduce((comparison,n,i)=>comparison||Math.sign(n-(requiredGo[i]??0)),0)>=0?{ok:true}:{ok:false,reason:`go ${requiredGo.join('.')}+ required, found ${actual.join('.')}`};
}});
const supportedNode=JSON.parse(readFileSync('package.json','utf8')).engines.node;
command('node',['--version'],{accept:s=>{
  const actual=s.match(/v(\d+)\.(\d+)\.(\d+)/)?.slice(1).map(Number);
  if(!actual)return{ok:false,reason:'unrecognized node version output'};
  const matching=supportedNode.split('||').some(range=>{
    const minimum=range.trim().match(/^(\^|>=)(\d+)\.(\d+)\.(\d+)$/);
    if(!minimum)return false;
    const required=minimum.slice(2).map(Number);
    const comparison=actual.reduce((result,n,i)=>result||Math.sign(n-required[i]),0);
    return comparison>=0&&(minimum[1]==='>='||actual[0]===required[0]);
  });
  return matching?{ok:true}:{ok:false,reason:`node ${actual.join('.')} does not satisfy engines ${supportedNode}`};
}});
command('pnpm',['--version'],{accept:s=>{
  const actual=s.trim();
  return actual==='11.25.0'?{ok:true}:{ok:false,reason:`pnpm 11.25.0 is pinned, found ${actual||'(empty output)'}`};
}});
command('git',['--version']);
command('rg',['--version']);
results.push({name:'workspace dependencies (run make install)',ok:existsSync('node_modules'),required:true,reason:existsSync('node_modules')?'':'node_modules is missing; run make install'});
results.push({name:'VERSION SemVer',ok:/^\d+\.\d+\.\d+\s*$/.test(readFileSync('VERSION','utf8')),required:true,reason:/^\d+\.\d+\.\d+\s*$/.test(readFileSync('VERSION','utf8'))?'':'VERSION must be MAJOR.MINOR.PATCH'});
if(process.argv.includes('--native')){command('wails',['version']);if(process.platform==='darwin')command('xcode-select',['-p']);if(process.platform==='linux'){command('pkg-config',['--exists','gtk+-3.0','webkit2gtk-4.0']);}}
if(process.argv.includes('--docker')){command('docker',['info','--format','{{.OSType}}/{{.Architecture}}']);command('docker',['compose','version']);}
for(const r of results)console.log(`${r.ok?'PASS':'FAIL'} ${r.name}${r.reason?` (${r.reason})`:''}`);
if(results.some(r=>r.required&&!r.ok))process.exitCode=1;
