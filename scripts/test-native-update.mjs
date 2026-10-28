// Author: yunnuo <ymz@ebox.vip>
// Description: Isolated macOS OTA fixture using real Wails binaries and a private HTTPS test channel.
import {execFileSync,spawn} from 'node:child_process';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,mkdirSync,cpSync,readFileSync,writeFileSync,openSync,closeSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:https';
if(process.platform!=='darwin')throw Error('This fixture requires native macOS. Build with make build-desktop first.');
const config=JSON.parse(readFileSync('cmd/desktop/wails.json','utf8')),identity=JSON.parse(readFileSync('assets/brand/identity.json','utf8'));
const current=readFileSync('VERSION','utf8').trim(),parts=current.split('.').map(Number);parts[2]++;const next=parts.join('.');
const base=mkdtempSync(join(tmpdir(),'unicore-native-ota-')),root=join(base,'current'),staging=join(base,'package','release'),data=join(base,'data');
for(const dir of [root,staging,data])mkdirSync(dir,{recursive:true});
const app=config.name+'.app',source=resolve('build/desktop/bin',app);if(!existsSync(source))throw Error('Run make build-desktop first');
cpSync(source,join(root,app),{recursive:true});cpSync(source,join(staging,app),{recursive:true});
const run=(command,args,options={})=>execFileSync(command,args,{stdio:'pipe',...options});
const executable=join(staging,app,'Contents/MacOS',config.outputfilename);
run('go',['build','-tags','desktop,production,updater','-ldflags',`-X github.com/yunnuo/unicore/internal/buildinfo.Version=${next}`,'-o',executable,'./cmd/desktop'],{env:{...process.env,CGO_LDFLAGS:(process.env.CGO_LDFLAGS??'')+' -framework UniformTypeIdentifiers'}});
run('/usr/libexec/PlistBuddy',['-c',`Set :CFBundleShortVersionString ${next}`,join(staging,app,'Contents/Info.plist')]);
run('/usr/libexec/PlistBuddy',['-c',`Set :CFBundleVersion ${next}`,join(staging,app,'Contents/Info.plist')]);
run('/usr/bin/codesign',['--force','--deep','--sign','-',join(staging,app)]);
const os='darwin',arch={arm64:'arm64',x64:'amd64'}[process.arch],commit=run('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
writeFileSync(join(staging,'VERSION'),next+'\n');writeFileSync(join(staging,'manifest.json'),JSON.stringify({version:next,profile:'desktop',os,arch,commit,migration_level:1,business_migration_level:1,features:{license:false,updater:true}}));
const artifact='native-fixture.tar.gz',archive=join(base,artifact);run('tar',['-czf',archive,'-C',join(base,'package'),'release'],{env:{...process.env,COPYFILE_DISABLE:'1'}});
const bytes=readFileSync(archive),pair=generateKeyPairSync('ed25519'),publicKey=Buffer.from(pair.publicKey.export({format:'jwk'}).x,'base64url').toString('base64');
const trust=join(base,'trust.json');writeFileSync(trust,JSON.stringify({repository:'',channel:'preview',keys:{fixture:publicKey},allow_unsigned_platform:true}),{mode:0o600});
const manifest=Buffer.from(JSON.stringify({schema:1,application_id:identity.bundleId,version:next,source_commit:commit,issued_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString(),artifacts:[{artifact,profile:'desktop',os,arch,migration_level:1,business_migration_level:1,license:false,updater:true,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),platform_signature:'unsigned'}]}));
const signature=JSON.stringify({key_id:'fixture',algorithm:'ed25519',signature:sign(null,manifest,pair.privateKey).toString('base64')});
const key=join(base,'tls.key'),cert=join(base,'tls.crt');run('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1']);
const server=createServer({key:readFileSync(key),cert:readFileSync(cert)},(req,res)=>{
 res.setHeader('Content-Type','application/json');switch(req.url){case '/feed':res.end(JSON.stringify({releases:[{version:next,notes:'原生更新测试：签名包、真实 Wails 重启与启动确认。',published_at:new Date().toISOString(),prerelease:true,url:address+'/feed',assets:[{name:'update-manifest.json',url:address+'/update-manifest.json'},{name:'update-manifest.sig',url:address+'/update-manifest.sig'},{name:artifact,url:address+'/'+artifact}]}]}));break;case '/update-manifest.json':res.end(manifest);break;case '/update-manifest.sig':res.end(signature);break;case '/'+artifact:res.setHeader('Content-Type','application/gzip');res.setHeader('Content-Length',bytes.length);res.end(bytes);break;default:res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const address='https://127.0.0.1:'+server.address().port;
const log=openSync(join(base,'native.log'),'a');const child=spawn(join(root,app,'Contents/MacOS',config.outputfilename),[],{env:{...process.env,APP_DATA_DIR:data,APP_UPDATE_TRUST_FILE:trust,APP_UPDATE_FEED_URL:address+'/feed',APP_UPDATE_CA_FILE:cert},stdio:['ignore',log,log]});closeSync(log);
console.log(JSON.stringify({base,from:current,to:next,pid:child.pid,feed:address+'/feed'}));
console.log('In the real Unicore window: open 系统更新, 检查更新, 更新并重启, confirm backup. No existing instance is used.');
const timer=setInterval(()=>{try{const state=JSON.parse(readFileSync(join(data,'updates/state.json'),'utf8'));if(['completed','rolled_back','failed'].includes(state.status)){console.log(JSON.stringify(state));clearInterval(timer);}}catch{}},1000);
process.on('SIGINT',()=>{clearInterval(timer);child.kill('SIGTERM');server.close();process.exit(0);});
