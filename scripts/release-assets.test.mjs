// Author: yunnuo <ymz@ebox.vip>
// Description: A release must reject missing, altered or mixed-source build artifacts.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdtempSync,writeFileSync,readFileSync,readdirSync,mkdirSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {assembleRelease} from './release-assets.mjs';
import {releaseFiles,checkReleaseLayout} from './release-layout.mjs';
import {distributionPlan} from './distribution.mjs';
import {loadIdentity} from './product-identity.mjs';
import {convertDmg,desktopDownloads} from './desktop-downloads.mjs';

test('DMG conversion succeeds while the original image retains a native exclusive lock', {skip: process.platform !== 'darwin'}, () => {
  const dir = mkdtempSync(join(tmpdir(), 'unicore-dmg-lock-'));
  const stage = join(dir, 'stage'), source = join(dir, 'source.dmg'), target = join(dir, 'target.dmg'), mount = join(dir, 'mounted');
  let mounted = false;
  try {
    mkdirSync(stage);
    mkdirSync(mount);
    writeFileSync(join(stage, 'payload.txt'), 'native DMG lock regression\n');
    execFileSync('/usr/bin/hdiutil', ['create', '-fs', 'HFS+', '-volname', 'UnicoreDmgLock', '-srcfolder', stage, '-format', 'UDRW', source], {stdio: 'pipe'});
    const original = readFileSync(source);
    // Hold the same POSIX image-file lock documented by hdiutil's EAGAIN error.
    // It stays held throughout conversion; elapsed time and retries cannot pass.
    execFileSync('python3', ['-c', `
import fcntl, subprocess, sys
source, target, module, node = sys.argv[1:]
with open(source, 'r+b') as image:
    fcntl.lockf(image, fcntl.LOCK_EX | fcntl.LOCK_NB)
    blocked = subprocess.run(['/usr/bin/hdiutil', 'convert', source, '-format', 'UDZO', '-o', target + '.blocked.dmg'], capture_output=True)
    assert blocked.returncode != 0, 'Expected the source image lock to block direct conversion'
    subprocess.run([node, '--input-type=module', '-e', 'const {convertDmg} = await import(process.argv[1]); convertDmg(process.argv[2], process.argv[3]);', module, source, target], check=True)
`, source, target, pathToFileURL(resolve('scripts/desktop-downloads.mjs')).href, process.execPath], {stdio: 'pipe', timeout: 60000});
    assert.deepEqual(readFileSync(source), original);
    execFileSync('/usr/bin/hdiutil', ['verify', target], {stdio: 'pipe'});
    execFileSync('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, target], {stdio: 'pipe'});
    mounted = true;
    assert.equal(readFileSync(join(mount, 'payload.txt'), 'utf8'), 'native DMG lock regression\n');
  } finally {
    try {
      if (mounted) execFileSync('/usr/bin/hdiutil', ['detach', mount], {stdio: 'pipe'});
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  }
});

test('DMG conversion preserves image bytes and cleans its private copy on success or failure', () => {
  const dir = mkdtempSync(join(tmpdir(), 'unicore-dmg-copy-'));
  const source = join(dir, 'source.dmg'), target = join(dir, 'target.dmg');
  const bytes = Buffer.from('complete image including Finder metadata');
  const forbidden = Object.assign(new Error('conversion denied'), {stderr: Buffer.from('hdiutil: permission denied')});
  try {
    writeFileSync(source, bytes);
    let snapshot;
    convertDmg(source, target, (command, args) => {
      assert.equal(command, '/usr/bin/hdiutil');
      snapshot = args[1];
      assert.notEqual(snapshot, source);
      assert.deepEqual(readFileSync(snapshot), bytes);
      assert.deepEqual(args, ['convert', snapshot, '-format', 'UDZO', '-o', target]);
    });
    assert.equal(existsSync(snapshot), false);
    assert.deepEqual(readFileSync(source), bytes);

    writeFileSync(target, 'existing download');
    let attempts = 0;
    assert.throws(() => convertDmg(source, target, () => {
      attempts++;
      throw forbidden;
    }), error => error === forbidden);
    assert.equal(attempts, 1);
    assert.equal(readFileSync(target, 'utf8'), 'existing download');
    assert.deepEqual(readdirSync(dir).sort(), ['source.dmg', 'target.dmg']);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('release assembly rejects tampering, partial matrices and mixed commits',()=>{
  const dir=mkdtempSync(join(tmpdir(),'unicore-release-check-'));
  const commit='a'.repeat(40), version='0.1.1', bytes=Buffer.from('archive fixture');
  try {
    const entry={version,commit,signature:null,profile:'web-platform',os:'linux',arch:'amd64',artifact:'example.tar.gz',sha256:createHash('sha256').update(bytes).digest('hex')};
    writeFileSync(join(dir,entry.artifact),bytes);
    const manifest=()=>writeFileSync(join(dir,'manifest.json'),JSON.stringify({version,artifacts:[entry]}));
    manifest(); assert.throws(()=>assembleRelease(dir,{version,commit}),/Incomplete/);
    entry.channel='stable'; manifest(); assert.throws(()=>assembleRelease(dir,{version,commit}),/Mixed release channels/);
    delete entry.channel;
    entry.commit='b'.repeat(40); manifest(); assert.throws(()=>assembleRelease(dir,{version,commit}),/Mixed/);
    entry.commit=commit; entry.sha256='0'.repeat(64); manifest(); assert.throws(()=>assembleRelease(dir,{version,commit}),/Checksum/);
    entry.artifact='../outside.tar.gz'; manifest(); assert.throws(()=>assembleRelease(dir,{version,commit}),/Invalid/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('portable Windows download preserves the exact native executable bytes',()=>{
  const root=mkdtempSync(join(tmpdir(),'unicore-portable-exe-'));
  try{
    const output=join(root,'downloads'),built=join(root,'application.exe'),bytes=Buffer.from('native executable fixture');
    mkdirSync(output);writeFileSync(built,bytes);
    const [download]=desktopDownloads({root,output,name:'unicore-desktop-windows-amd64-v0.1.1',built,targetOS:'windows'});
    assert.equal(download.format,'portable-exe');
    assert.deepEqual(readFileSync(join(output,download.artifact)),bytes);
    assert.equal(download.sha256,createHash('sha256').update(bytes).digest('hex'));
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('complete bundle checks DMG and portable EXE while retaining thirteen OTA archives',()=>{
  const dir=mkdtempSync(join(tmpdir(),'unicore-download-check-'));
  const commit='a'.repeat(40),version='0.1.1',bytes=Buffer.from('isolated artifact fixture');
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const targets=[...['web-platform','web-standalone'].flatMap(profile=>['amd64','arm64'].map(arch=>[profile,'linux',arch])),...['linux','darwin','windows'].flatMap(os=>['amd64','arm64'].map(arch=>['cli',os,arch])),...['linux','darwin','windows'].map(os=>['desktop',os,'amd64'])];
  const artifacts=targets.map(([profile,os,arch])=>({version,commit,signature:null,profile,os,arch,artifact:`test-${profile}-${os}-${arch}.tar.gz`,sha256}));
  try {
    for(const item of artifacts){
      writeFileSync(join(dir,item.artifact),bytes);
      if(item.profile==='desktop'&&item.os!=='linux'){
        const artifact=item.artifact.replace(/\.tar\.gz$/,item.os==='darwin'?'.dmg':'.exe');
        item.downloads=[{artifact,sha256,format:item.os==='darwin'?'dmg':'portable-exe'}];
        writeFileSync(join(dir,artifact),bytes);
      }
    }
    const save=()=>writeFileSync(join(dir,'manifest.json'),JSON.stringify({version,artifacts}));
    const mac=artifacts.find(item=>item.os==='darwin'&&item.profile==='desktop');
    save();assert.equal(assembleRelease(dir,{version,commit}).length,13);
    const checksums=readFileSync(join(dir,'checksums.txt'),'utf8').trim().split('\n');
    assert.equal(checksums.length,15);
    for(const extension of ['.dmg','.exe'])assert(checksums.some(line=>line.endsWith(extension)));
    mac.downloads[0].sha256='0'.repeat(64);save();assert.throws(()=>assembleRelease(dir,{version,commit}),/Checksum/);
    mac.downloads[0].artifact='../outside.dmg';save();assert.throws(()=>assembleRelease(dir,{version,commit}),/Invalid/);
    mac.downloads=[];save();assert.throws(()=>assembleRelease(dir,{version,commit}),/Missing/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});


test('every user archive rejects unrelated documentation, duplicate launchers and extra binaries',()=>{
 const root=process.cwd(), identity=loadIdentity(root);
 assert.deepEqual(distributionPlan(root,'user-release'),[{source:'LICENSE',target:'LICENSE'}]);
 for(const [profile,os,binary] of [['web-platform','linux'],['web-standalone','linux'],['cli','linux'],['cli','windows'],['desktop','linux','unicore-desktop'],['desktop','windows','unicore-desktop.exe'],['desktop','darwin','Unicore.app']]){
  const directory=mkdtempSync(join(tmpdir(),'unicore-minimal-'));
  const options={profile,os,identity,binary};
  try{
   for(const file of releaseFiles(options)){
    if(file.endsWith('.app')) {mkdirSync(join(directory,file,'Contents','MacOS'),{recursive:true});writeFileSync(join(directory,file,'Contents','MacOS','unicore-desktop'),'native fixture');}
    else {mkdirSync(join(directory,...file.split('/').slice(0,-1)),{recursive:true});writeFileSync(join(directory,file),'fixture');}
   }
   checkReleaseLayout(directory,options);
   for(const extra of ['docs/internal.md','unicorehelp','bin/server','bin/unicore-ops','web/assets/main.js','CHANGELOG.md']){
    mkdirSync(join(directory,...extra.split('/').slice(0,-1)),{recursive:true});writeFileSync(join(directory,extra),'must not ship');
    assert.throws(()=>checkReleaseLayout(directory,options),/unexpected files/);
    rmSync(join(directory,extra));
   }
   rmSync(join(directory,'VERSION'));
   assert.throws(()=>checkReleaseLayout(directory,options),/unexpected files/);
  }finally{rmSync(directory,{recursive:true,force:true});}
 }
});
