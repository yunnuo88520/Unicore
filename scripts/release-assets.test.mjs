// Author: yunnuo <ymz@ebox.vip>
// Description: A release must reject missing, altered or mixed-source build artifacts.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {assembleRelease} from './release-assets.mjs';

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
