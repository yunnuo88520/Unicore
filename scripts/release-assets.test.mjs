// Author: yunnuo <ymz@ebox.vip>
// Description: A release must reject missing, altered or mixed-source build artifacts.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {assembleRelease} from './release-assets.mjs';
import {desktopDownloads} from './desktop-downloads.mjs';

test('release assembly rejects tampering, partial matrices and mixed commits',()=>{
  const dir=mkdtempSync(join(tmpdir(),'unicore-release-check-'));
  const commit='a'.repeat(40), version='0.1.1', bytes=Buffer.from('archive fixture');
  try {
    const entry={version,commit,signature:null,profile:'web-platform',os:'linux',arch:'amd64',artifact:'example.tar.gz',sha256:createHash('sha256').update(bytes).digest('hex')};
    writeFileSync(join(dir,entry.artifact),bytes);
    const manifest=()=>writeFileSync(join(dir,'manifest.json'),JSON.stringify({version,artifacts:[entry]}));
    manifest(); assert.throws(()=>assembleRelease(dir,{version,commit}),/Incomplete/);
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
