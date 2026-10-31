// Author: yunnuo <ymz@ebox.vip>
// Description: Native code signing/notarization with temporary credentials and independently verified claims.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,readdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const run=(command,args,env=process.env)=>execFileSync(command,args,{env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:25*60*1000});
function signtool(){
 const base=join(process.env['ProgramFiles(x86)']??'C:\\Program Files (x86)','Windows Kits','10','bin');
 const versions=readdirSync(base).filter(v=>/^10\./.test(v)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
 for(const version of versions){const file=join(base,version,'x64','signtool.exe');if(existsSync(file))return file;}
 throw Error('Windows SDK signtool is required');
}
export function verifyPlatform(file,application){
 try{
  if(process.platform==='darwin'){
   run('/usr/bin/codesign',['--verify','--strict','--deep','-R',`=identifier "${application}" and anchor apple generic`,file]);
   const details=execFileSync('/usr/bin/codesign',['-d','--verbose=4',file],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
   // codesign details are written to stderr; stapler plus Gatekeeper establish notarization independently.
   void details;run('/usr/bin/xcrun',['stapler','validate',file]);
   const assessment=execFileSync('/usr/sbin/spctl',['--assess','--type','execute','--verbose=2',file],{encoding:'utf8',stdio:['ignore','pipe','pipe']});void assessment;
   return 'developer-id-notarized';
  }
  if(process.platform==='win32'){
   run(signtool(),['verify','/pa','/all',file]);
   run('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$s=Get-AuthenticodeSignature -LiteralPath $env:UNICORE_VERIFY_TARGET; if ($s.Status -ne 'Valid') { exit 1 }"],{...process.env,UNICORE_VERIFY_TARGET:file});
   return 'authenticode';
  }
 }catch{/* Missing/invalid system signature is an explicit preview status. */}
 return 'unsigned';
}
export function signPlatform(root=process.cwd(),env=process.env){
 const mode=env.UNICORE_PLATFORM_SIGNING??'unsigned';if(!['unsigned','required'].includes(mode))throw Error('UNICORE_PLATFORM_SIGNING must be unsigned or required');
 const config=JSON.parse(readFileSync(join(root,'cmd/desktop/wails.json'),'utf8'));
 const identity=JSON.parse(readFileSync(join(root,'assets/brand/identity.json'),'utf8')).bundleId;
 const file=join(root,'build/desktop/bin',process.platform==='darwin'?config.name+'.app':config.outputfilename+(process.platform==='win32'?'.exe':''));
 if(!existsSync(file))throw Error('Native desktop build is missing');
 if(mode==='required'&&process.platform!=='linux'){
  const names=process.platform==='darwin'?['MACOS_CERTIFICATE_P12','MACOS_CERTIFICATE_PASSWORD','MACOS_SIGNING_IDENTITY','APPLE_NOTARY_KEY_P8','APPLE_NOTARY_KEY_ID','APPLE_NOTARY_ISSUER']:['WINDOWS_CERTIFICATE_PFX','WINDOWS_CERTIFICATE_PASSWORD'];
  if(names.some(name=>!env[name]))throw Error('Required native signing credentials are incomplete');
  const temp=mkdtempSync(join(tmpdir(),'unicore-native-sign-'));let keychain;
  try{
   if(process.platform==='darwin'){
    const cert=join(temp,'certificate.p12'),key=join(temp,'notary.p8');keychain=join(temp,'signing.keychain-db');
    writeFileSync(cert,Buffer.from(env.MACOS_CERTIFICATE_P12,'base64'),{mode:0o600});writeFileSync(key,Buffer.from(env.APPLE_NOTARY_KEY_P8,'base64'),{mode:0o600});const password=randomBytes(32).toString('hex');
    run('security',['create-keychain','-p',password,keychain]);run('security',['set-keychain-settings','-lut','21600',keychain]);run('security',['unlock-keychain','-p',password,keychain]);
    run('security',['import',cert,'-k',keychain,'-P',env.MACOS_CERTIFICATE_PASSWORD,'-T','/usr/bin/codesign']);
    run('security',['set-key-partition-list','-S','apple-tool:,apple:,codesign:','-s','-k',password,keychain]);
    run('/usr/bin/codesign',['--force','--options','runtime','--timestamp','--keychain',keychain,'--sign',env.MACOS_SIGNING_IDENTITY,file]);
    const zip=join(temp,'notarize.zip');run('/usr/bin/ditto',['-c','-k','--keepParent',file,zip]);
    run('/usr/bin/xcrun',['notarytool','submit',zip,'--key',key,'--key-id',env.APPLE_NOTARY_KEY_ID,'--issuer',env.APPLE_NOTARY_ISSUER,'--wait','--timeout','20m']);
    run('/usr/bin/xcrun',['stapler','staple',file]);
   }else{
    const cert=join(temp,'certificate.pfx');writeFileSync(cert,Buffer.from(env.WINDOWS_CERTIFICATE_PFX,'base64'),{mode:0o600});
    run(signtool(),['sign','/f',cert,'/p',env.WINDOWS_CERTIFICATE_PASSWORD,'/fd','SHA256','/tr','http://timestamp.digicert.com','/td','SHA256',file]);
   }
  }catch{throw Error('Native signing or notarization failed; no signed release may be claimed');}
  finally{if(keychain){try{run('security',['delete-keychain',keychain]);}catch{}}rmSync(temp,{recursive:true,force:true});}
 }
 const status=verifyPlatform(file,identity);if(mode==='required'&&process.platform!=='linux'&&status==='unsigned')throw Error('Native signature verification failed');
 console.log(`Native signature: ${status}`);return status;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{signPlatform();}catch(e){console.error(e.message);process.exitCode=1;}}
