// Author: yunnuo <ymz@ebox.vip>
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,verify} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {signUpdates} from './update-sign.mjs';
test('OTA signing binds trusted publisher, target and exact artifact bytes',()=>{
 const root=mkdtempSync(join(tmpdir(),'unicore-sign-fixture-'));try{
  for(const p of ['assets/updates','assets/brand','bundle'])mkdirSync(join(root,p),{recursive:true});
  const pair=generateKeyPairSync('ed25519'),key=pair.privateKey.export({format:'pem',type:'pkcs8'}),pub=Buffer.from(pair.publicKey.export({format:'jwk'}).x,'base64url').toString('base64');
  writeFileSync(join(root,'assets/updates/config.json'),JSON.stringify({keys:{fixture:pub},allow_unsigned_platform:true}));writeFileSync(join(root,'assets/brand/identity.json'),JSON.stringify({bundleId:'test.unicore.app'}));
  const dir=join(root,'bundle'),bytes=Buffer.from('fixture artifact');writeFileSync(join(dir,'fixture.tar.gz'),bytes);
  const source={version:'1.2.0',source_commit:'a'.repeat(40),artifacts:[{artifact:'fixture.tar.gz',sha256:createHash('sha256').update(bytes).digest('hex'),profile:'web-platform',os:'linux',arch:'amd64',migration_level:9,business_migration_level:1,features:{updater:true,license:false},platform_signature:'unsigned'}]};writeFileSync(join(dir,'manifest.json'),JSON.stringify(source));
  assert.throws(()=>signUpdates(dir,{root,privateKey:''}),/required/);
  const other=generateKeyPairSync('ed25519').privateKey.export({format:'pem',type:'pkcs8'});assert.throws(()=>signUpdates(dir,{root,privateKey:other}),/trusted/);
  const m=signUpdates(dir,{root,privateKey:key});assert.equal(m.artifacts[0].size,bytes.length);assert.equal(m.application_id,'test.unicore.app');
  const signed=readFileSync(join(dir,'update-manifest.json')),sig=JSON.parse(readFileSync(join(dir,'update-manifest.sig'),'utf8'));
  assert.equal(verify(null,signed,pair.publicKey,Buffer.from(sig.signature,'base64')),true);
  writeFileSync(join(dir,'fixture.tar.gz'),'altered');assert.throws(()=>signUpdates(dir,{root,privateKey:key}),/checksum/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
