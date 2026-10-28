// Author: yunnuo <ymz@ebox.vip>
// Description: Read-only development prerequisites and optional native/container diagnostics.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
const results=[];
function command(name,args,required=true,accept=()=>true){const p=spawnSync(name,args,{encoding:'utf8',timeout:15000});const ok=p.status===0&&accept(p.stdout+p.stderr);results.push({name:`${name} ${args.join(' ')}`,ok,required});}
const requiredGo=readFileSync('go.mod','utf8').match(/^go (\S+)/m)[1].split('.').map(Number);
command('go',['version'],true,s=>{const actual=s.match(/go(\d+)\.(\d+)\.(\d+)/)?.slice(1).map(Number);return !!actual&&actual.reduce((comparison,n,i)=>comparison||Math.sign(n-(requiredGo[i]??0)),0)>=0;});
command('node',['--version'],true,s=>Number(s.match(/v(\d+)/)?.[1])>=22);
command('pnpm',['--version'],true,s=>s.trim()==='11.25.0');
command('git',['--version']);
command('rg',['--version']);
results.push({name:'workspace dependencies (run make install)',ok:existsSync('node_modules'),required:true});
results.push({name:'VERSION SemVer',ok:/^\d+\.\d+\.\d+\s*$/.test(readFileSync('VERSION','utf8')),required:true});
if(process.argv.includes('--native')){command('wails',['version']);if(process.platform==='darwin')command('xcode-select',['-p']);if(process.platform==='linux'){command('pkg-config',['--exists','gtk+-3.0','webkit2gtk-4.0']);}}
if(process.argv.includes('--docker')){command('docker',['info','--format','{{.OSType}}/{{.Architecture}}']);command('docker',['compose','version']);}
for(const r of results)console.log(`${r.ok?'PASS':'FAIL'} ${r.name}`);
if(results.some(r=>r.required&&!r.ok))process.exitCode=1;
