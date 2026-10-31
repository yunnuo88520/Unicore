// Author: yunnuo <ymz@ebox.vip>
// Description: Exercise real packaged entry points on their native CI runner using temporary data only.
import assert from 'node:assert/strict';
import {execFileSync,spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,readlinkSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {loadIdentity} from './product-identity.mjs';

const root=process.cwd(), os=process.platform==='win32'?'windows':process.platform;
const arch={x64:'amd64',arm64:'arm64'}[process.arch];
const identity=loadIdentity();
const json=path=>JSON.parse(readFileSync(path,'utf8'));
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const product=json(join(root,'package.json')).name, version=readFileSync(join(root,'VERSION'),'utf8').trim();
const temporary=mkdtempSync(join(tmpdir(),'unicore-packaged-entrypoints-'));
const environment=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('APP_')));
function verify(directory,item){
  assert.match(item.artifact,/^[a-zA-Z0-9._-]+$/);
  assert.equal(hash(join(directory,item.artifact)),item.sha256,`Checksum mismatch: ${item.artifact}`);
}

async function web(){
  assert.equal(os,'linux','Run Web archive checks on native Linux');
  const directory=resolve(process.argv[3]??'build/releases');
  const artifacts=json(join(directory,'manifest.json')).artifacts.filter(item=>item.os===os&&item.arch===arch&&['web-platform','web-standalone'].includes(item.profile));
  assert.deepEqual(artifacts.map(item=>item.profile).sort(),['web-platform','web-standalone']);
  for(const item of artifacts){
    verify(directory,item);
    const destination=join(temporary,item.profile);mkdirSync(destination);
    execFileSync('tar',['-xzf',join(directory,item.artifact),'-C',destination]);
    const release=join(destination,item.artifact.replace(/\.tar\.gz$/,''));
    for(const name of [identity.cli.command,`${identity.cli.command}help`,'bin/server'])assert(statSync(join(release,name)).mode&0o111);
    const entry=join(release,identity.cli.command), configuration=join(destination,'startup.json');
    const help=execFileSync(join(release,`${identity.cli.command}help`),[],{cwd:destination,env:environment,encoding:'utf8'});
    assert(help.includes('config generate')&&help.includes('/install'));
    execFileSync(entry,['config','generate','--output',configuration],{cwd:destination,env:environment});
    const before=readFileSync(configuration);
    assert.notEqual(spawnSync(entry,['generate-config','--output',configuration],{cwd:destination,env:environment}).status,0);
    assert.deepEqual(readFileSync(configuration),before);
    assert.equal(statSync(configuration).mode&0o777,0o600);
    const settings=json(configuration);settings.listen='127.0.0.1:0';settings.data_dir=join(destination,'private-data');
    writeFileSync(configuration,JSON.stringify(settings));
    execFileSync(entry,['--config',configuration,'--help'],{cwd:destination,env:environment});
    const child=spawn(entry,[],{cwd:destination,env:{...environment,APP_CONFIG:configuration},stdio:['ignore','pipe','pipe']});
    const exited=new Promise(resolve=>child.once('close',resolve));
    child.stderr.resume();
    try{
      const address=await new Promise((resolve,reject)=>{
        const deadline=setTimeout(()=>reject(Error('Packaged Web service startup timed out')),20000);
        let buffer='';
        child.once('error',error=>{clearTimeout(deadline);reject(error);});
        child.once('exit',code=>{clearTimeout(deadline);reject(Error(`Packaged Web service exited during startup: ${code}`));});
        child.stdout.on('data',data=>{
          buffer+=data.toString();
          let newline;
          while((newline=buffer.indexOf('\n'))>=0){
            const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);
            try{const log=JSON.parse(line);if(log.event==='server.start'){clearTimeout(deadline);resolve(log.address);}}catch{/* Ignore non-JSON dependency diagnostics. */}
          }
        });
      });
      for(const path of ['/api/v1/health/live','/install'])assert.equal((await fetch(`http://${address}${path}`,{signal:AbortSignal.timeout(5000)})).status,200);
    }finally{
      child.kill('SIGTERM');
      const deadline=setTimeout(()=>child.kill('SIGKILL'),10000);
      await exited;clearTimeout(deadline);
    }
    console.log(`PASS packaged ${item.profile}: help, private config, overwrite refusal, no-argument startup and /install`);
  }
}

function desktop(){
  const directory=resolve(process.argv[3]??'build/native-releases');
  const name=`${product}-desktop-${os}-${arch}-v${version}`;
  const metadata=json(join(directory,name+'.manifest.json'));
  verify(directory,metadata);
  for(const download of metadata.downloads)verify(directory,download);
  const config=json(join(root,'cmd/desktop/wails.json'));
  if(os==='windows'){
    assert.equal(metadata.downloads.length,1);
    assert.equal(hash(join(directory,metadata.downloads[0].artifact)),hash(join(root,'build/desktop/bin',config.outputfilename+'.exe')));
  }else if(os==='darwin'){
    assert.equal(metadata.downloads.length,1);
    const mount=join(temporary,'volume');mkdirSync(mount);
    execFileSync('/usr/bin/hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,join(directory,metadata.downloads[0].artifact)],{stdio:'pipe'});
    try{
      assert.equal(readlinkSync(join(mount,'Applications')),'/Applications');
      const installed=join(temporary,'Applications',config.name+'.app');
      execFileSync('/usr/bin/ditto',[join(mount,config.name+'.app'),installed]);
      const executable=join('Contents','MacOS',config.outputfilename);
      assert.equal(hash(join(installed,executable)),hash(join(root,'build/desktop/bin',config.name+'.app',executable)));
    }finally{execFileSync('/usr/bin/hdiutil',['detach',mount],{stdio:'pipe'});}
  }else assert.deepEqual(metadata.downloads,[]);
  console.log(`PASS ${os}/${arch} desktop archive and user download; macOS image copied or Windows executable matched when applicable`);
}

try{
  if(process.argv[2]==='web')await web();
  else if(process.argv[2]==='desktop')desktop();
  else throw Error('Use check-release-entrypoints.mjs web|desktop [artifact-directory]');
}finally{rmSync(temporary,{recursive:true,force:true});}
