// Author: yunnuo <ymz@ebox.vip>
// Description: Publisher-authorized Ed25519 OTA manifests, distinct from native signatures and provenance.
import {createPrivateKey,createPublicKey,sign,verify,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export function signUpdates(directory,{root=process.cwd(),privateKey=process.env.UNICORE_UPDATE_SIGNING_KEY,now=new Date()}={}){
 if(!privateKey)throw Error('UNICORE_UPDATE_SIGNING_KEY is required; unsigned OTA manifests are forbidden');
 const key=createPrivateKey(privateKey);if(key.asymmetricKeyType!=='ed25519')throw Error('Ed25519 key required');
 const config=JSON.parse(readFileSync(join(root,'assets/updates/config.json'),'utf8'));
 const publicKey=createPublicKey(key).export({format:'jwk'});const rawPublic=Buffer.from(publicKey.x,'base64url').toString('base64');
 const keyID=Object.entries(config.keys).find(([,value])=>value===rawPublic)?.[0];if(!keyID)throw Error('Signing key must match a committed trusted public key');
 const source=JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8'));if(!/^[a-f0-9]{40}$/.test(source.source_commit))throw Error('Full source commit required');
 const application=JSON.parse(readFileSync(join(root,'assets/brand/identity.json'),'utf8')).bundleId;
 const artifacts=source.artifacts.map(a=>{
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.tar\.gz$/.test(a.artifact))throw Error('Invalid artifact path');
  const file=join(directory,a.artifact),sha256=createHash('sha256').update(readFileSync(file)).digest('hex');if(sha256!==a.sha256)throw Error('Artifact checksum mismatch');
  const status=a.platform_signature??'unsigned';if(!['unsigned','developer-id-notarized','authenticode'].includes(status))throw Error('Invalid native signature claim');
  if(a.profile==='desktop'&&a.os!=='linux'&&!config.allow_unsigned_platform&&status==='unsigned')throw Error('Native signed artifacts required by trust policy');
  return {profile:a.profile,os:a.os,arch:a.arch,migration_level:a.migration_level,business_migration_level:a.business_migration_level,license:!!a.features.license,updater:!!a.features.updater,artifact:a.artifact,sha256,size:statSync(file).size,platform_signature:status};
 });
 const manifest={schema:1,application_id:application,version:source.version,source_commit:source.source_commit,issued_at:now.toISOString(),expires_at:new Date(now.getTime()+365*86400*1000).toISOString(),artifacts};
 const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n'),signature=sign(null,bytes,key);
 if(!verify(null,bytes,createPublicKey(key),signature))throw Error('Signature self verification failed');
 writeFileSync(join(directory,'update-manifest.json'),bytes);writeFileSync(join(directory,'update-manifest.sig'),JSON.stringify({key_id:keyID,algorithm:'ed25519',signature:signature.toString('base64')},null,2)+'\n');
 console.log(`Signed OTA manifest for ${source.version} (${artifacts.length} artifacts)`);return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{if(!process.argv[2])throw Error('Use update-sign.mjs <bundle-directory>');signUpdates(resolve(process.argv[2]));}catch(e){console.error(e.message);process.exitCode=1;}}
