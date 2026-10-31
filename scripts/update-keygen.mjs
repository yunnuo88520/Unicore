// Author: yunnuo <ymz@ebox.vip>
// Description: Generate an OTA signing key locally; commit only the public key and keep the private key external.
import {generateKeyPairSync} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,relative,isAbsolute,sep} from 'node:path';
const [privatePath,id]=process.argv.slice(2);
if(!privatePath||!id||!/^[a-z][a-z0-9-]{1,63}$/.test(id))throw Error('Use update-keygen.mjs /private/external/key.pem unique-key-id');
const relation=relative(process.cwd(),resolve(privatePath));if(!relation||(!relation.startsWith('..'+sep)&&relation!=='..'&&!isAbsolute(relation)))throw Error('Private key must be stored outside the repository');
const configPath='assets/updates/config.json',config=JSON.parse(readFileSync(configPath,'utf8'));
if(Object.hasOwn(config.keys,id))throw Error('Key ID already exists');
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
writeFileSync(resolve(privatePath),privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600,flag:'wx'});
config.keys[id]=Buffer.from(publicKey.export({format:'jwk'}).x,'base64url').toString('base64');
writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
console.log('Public key added to assets/updates/config.json. Store the private file in your release secret store; never commit it.');
