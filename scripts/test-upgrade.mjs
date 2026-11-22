// Author: yunnuo <ymz@ebox.vip>
// Description: Upgrade a disposable installed instance from an explicit Git revision, then restore its pre-upgrade snapshot with the old binary.
// Drivers: UPGRADE_DRIVER=sqlite (default) | postgres | mysql with UPGRADE_DSN (and UPGRADE_RESTORE_DSN
// plus the maintenance *_CONTAINER variables for native dump tools). Old-version capabilities are read
// from the actual old tree: a capability that exists in the old revision must keep working after the
// upgrade and after the matched-binary restore; missing capabilities are recorded instead of assumed.
import {execFileSync,spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,openSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {randomBytes,createHash} from 'node:crypto';
import {request,expect} from '@playwright/test';
const ref=process.env.UPGRADE_FROM_REF;if(!ref)throw Error('Set UPGRADE_FROM_REF to an explicit trusted local commit/tag');
const driver=process.env.UPGRADE_DRIVER??'sqlite';
if(!['sqlite','postgres','mysql'].includes(driver))throw Error(`Unsupported UPGRADE_DRIVER ${driver}; use sqlite, postgres or mysql`);
const dsn=process.env.UPGRADE_DSN??'';
if(driver!=='sqlite'&&!dsn)throw Error(`Set UPGRADE_DSN to a dedicated empty ${driver} database for the upgraded instance`);
const restoreDsn=process.env.UPGRADE_RESTORE_DSN??'';
if(driver!=='sqlite'&&!restoreDsn)throw Error(`Set UPGRADE_RESTORE_DSN to a second dedicated empty ${driver} database for the pre-upgrade restore rehearsal`);
const container=driver==='postgres'?process.env.UNICORE_MAINTENANCE_POSTGRES_CONTAINER??'':driver==='mysql'?process.env.UNICORE_MAINTENANCE_MYSQL_CONTAINER??'':'';
const revision=execFileSync('git',['rev-parse','--verify',`${ref}^{commit}`],{encoding:'utf8'}).trim();
const headCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
// Identity guard: a same-commit or same-tree "upgrade" would be a rebuild masquerading as a
// cross-version migration; fail with the boundary instead of producing meaningless evidence.
if(revision===headCommit)throw Error('UPGRADE_FROM_REF resolves to the current commit; a cross-version upgrade must start from a different release commit');
const oldTree=execFileSync('git',['rev-parse',`${revision}^{tree}`],{encoding:'utf8'}).trim();
const headTree=execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim();
if(oldTree===headTree)throw Error('UPGRADE_FROM_REF has the same source tree as HEAD; refusing a same-content rebuild posing as an upgrade. Choose a trusted older release with real content changes.');
const root=mkdtempSync(join(tmpdir(),'unicore-upgrade-')),old=join(root,'old'),data=join(root,'data'),restored=join(root,'restored');mkdirSync(old);
let child,client;
const stop=async()=>{if(child&&child.exitCode===null){const ended=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await ended;}};
const allocate=async()=>{const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));return port;};
const port=await allocate(),url=`http://127.0.0.1:${port}`;
const start=async(binary,directory)=>{child=spawn(binary,['--listen',`127.0.0.1:${port}`,'--data-dir',directory],{stdio:['ignore',openSync(join(root,'server-stdout.log'),'a'),(globalThis.__serverStderr=openSync(join(root,'server-stderr.log'),'a'))],env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('APP_')))});let lastErr='';await expect.poll(async()=>{try{const r=await fetch(`${url}/api/v1/health/live`);if(r.status!==200)lastErr='status '+r.status;return r.status;}catch(e){lastErr=String(e);return 0;}},{timeout:20000}).toBe(200).catch(()=>{throw Error('server '+binary+' failed to serve: '+lastErr+' stdout='+((()=>{try{return readFileSync(join(root,'server-stdout.log'),'utf8').slice(-1500)}catch{return '(none)'}})())+' stderr='+((()=>{try{return readFileSync(join(root,'server-stderr.log'),'utf8').slice(-1500)}catch{return '(none)'}})()))});};
const identity=JSON.parse(readFileSync('product.identity.json','utf8'));
const ops=resolve('build/bin',identity.cli.opsCommand),current=resolve('build/bin/server');
const password='isolated-upgrade-test-password';
const env={...process.env,UNICORE_BACKUP_PASSPHRASE:randomBytes(32).toString('base64')};
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const dumpFlags=container?['--database-tools-container',container]:[];
const sanitizeDsn=value=>{
  const postgres=value.match(/^postgres(?:ql)?:\/\/[^/]+(\/\w+)/);
  if(postgres)return `postgres://***${postgres[1]}`;
  const mysql=value.match(/tcp\(([^)]+)\)\/(\w+)/);
  if(mysql)return `mysql://***@tcp(${mysql[1]})/${mysql[2]}`;
  return driver;
};
const databaseName=value=>{
  const postgres=value.match(/^postgres(?:ql)?:\/\/[^/]+\/(\w+)(?:\?.*)?$/);
  if(postgres)return postgres[1];
  const mysql=value.match(/tcp\([^)]+\)\/(\w+)(?:\?.*)?$/);
  if(mysql)return mysql[1];
  throw Error(`Cannot read the dedicated database name from the ${driver} DSN`);
};
try{
 const archive=execFileSync('git',['archive',revision],{maxBuffer:64<<20});execFileSync('tar',['-xf','-','-C',old],{input:archive});
 // Old-version capability expectations come from the old tree itself, never from hope.
 const capabilities={notes:existsSync(join(old,'internal/modules/notes/module.go')),files:existsSync(join(old,'internal/adapter/http/storage.go'))};
 const oldVersion=readFileSync(join(old,'VERSION'),'utf8').trim();
 execFileSync('go',['build','-o',join(root,'old-server'),'./cmd/server'],{cwd:old,stdio:'inherit'});
 execFileSync('go',['build','-o',join(root,'old-ops'),'./cmd/ops'],{cwd:old,stdio:'inherit'});
 await start(join(root,'old-server'),data);client=await request.newContext({baseURL:url});
 const token=readFileSync(join(data,'bootstrap.token'),'utf8').trim();
 expect((await client.post('/api/v1/install/complete',{headers:{'X-Bootstrap-Token':token},data:{profile:'web-platform',database:{driver,dsn},site_name:'Upgrade fixture',base_url:url,admin_username:'admin',admin_email:'admin@example.test',admin_password:password}})).status()).toBe(200);
 const bootstrap=async()=>(await(await client.get('/api/v1/admin/bootstrap')).json()).data;
 let boot=await bootstrap();let headers={'Origin':url,'X-CSRF-Token':boot.csrf_token};
 expect((await client.patch('/api/v1/admin/settings',{headers,data:{changes:[{key:'site.name',value:'Preserved upgrade brand'}]}})).status()).toBe(200);
 expect((await client.post('/api/v1/admin/users',{headers,data:{username:'member',email:'member@example.test',password,role:'user'}})).status()).toBe(200);
 // Business fixtures: a legacy note and a real uploaded attachment exercise the SQL and blob
 // paths end to end. A capability present in the old tree must answer 200; accepting 404 for
 // it would let a broken data path pass as a successful upgrade.
 let legacyNote=null;
 if(capabilities.notes){
   const response=await client.post('/api/v1/admin/notes',{headers,data:{title:'Before upgrade',body:'preserve previous business data',status:'open',attachment_ids:[]}});
   expect(response.status()).toBe(200);legacyNote=(await response.json()).data;
 }else expect((await client.post('/api/v1/admin/notes',{headers,data:{title:'Before upgrade',body:'preserve previous business data',status:'open',attachment_ids:[]}})).status()).toBe(404);
 const downloadAttachment=async()=>{const access=await client.post(`/api/v1/admin/files/${attachment.file_id}/access`,{headers,data:{}});expect(access.status()).toBe(200);const granted=(await access.json()).data;const response=await client.get(granted.url);expect(response.status()).toBe(200);return Buffer.from(await response.body());};
 let attachment=null;const attachmentBytes=randomBytes(48);
 if(capabilities.files){
   const created=await client.post('/api/v1/admin/files/uploads',{headers,data:{original_name:'upgrade-fixture.bin',mime_type:'application/octet-stream',size:attachmentBytes.length}});
   expect(created.status()).toBe(200);const grant=(await created.json()).data;
   expect(grant.direct).toBe(false);
   expect((await client.put(grant.url,{headers:{...headers,'Content-Type':'application/octet-stream'},data:attachmentBytes})).status()).toBe(200);
   const completed=await client.post(`${grant.url.replace(/\/content$/,'/complete')}`,{headers});
   expect(completed.status()).toBe(200);attachment=(await completed.json()).data;
   expect(await downloadAttachment()).toEqual(attachmentBytes);
 }
 const instance=JSON.parse(readFileSync(join(data,'installation.json'))).instance,keyHash=hash(join(data,'secret.key'));
 await stop();const backup=join(root,'before.age');
 const snapshot=JSON.parse(execFileSync(join(root,'old-ops'),['backup','--data-dir',data,'--output',backup,...dumpFlags],{env,encoding:'utf8'}));
 // Catalog single track: the generation stamp is 1 on both sides of the upgrade. Anything else
 // means an unsupported preview baseline; restore with the matching old release instead.
 if(snapshot.schema!==1)throw Error(`Refusing to upgrade: backup schema generation ${snapshot.schema} is outside the frozen catalog (1). This preview baseline has no in-place upgrade path; restore it with the matching old release and migrate data per the release notes.`);
 await start(current,data);boot=await bootstrap();expect(boot.site_name).toBe('Preserved upgrade brand');expect(JSON.parse(readFileSync(join(data,'installation.json'))).instance).toBe(instance);expect(hash(join(data,'secret.key'))).toBe(keyHash);
 expect((await(await client.get('/api/v1/admin/users')).json()).data.total).toBe(2);
 if(legacyNote){const preserved=(await(await client.get('/api/v1/admin/notes')).json()).data.items.find(item=>item.id===legacyNote.id);expect(preserved.body).toBe(legacyNote.body);expect(preserved.version).toBe(legacyNote.version);}
 if(attachment)expect(await downloadAttachment()).toEqual(attachmentBytes);
 headers={'Origin':url,'X-CSRF-Token':boot.csrf_token};const note=(await(await client.post('/api/v1/admin/notes',{headers,data:{title:'After upgrade',body:'business migration',status:'open',attachment_ids:[]}})).json()).data;expect(note.version).toBe(1);
 await stop();const afterSnapshot=JSON.parse(execFileSync(ops,['backup','--data-dir',data,'--output',join(root,'after.age'),...dumpFlags],{env,encoding:'utf8'}));expect(afterSnapshot.schema).toBe(1);await start(current,data);expect((await(await client.get('/api/v1/admin/notes')).json()).data.items.some(item=>item.id===note.id)).toBe(true);await stop();
 const restoreDatabase=driver==='sqlite'?null:databaseName(restoreDsn);
 if(driver==='sqlite')execFileSync(join(root,'old-ops'),['restore','--input',backup,'--data-dir',restored,'--base-url',url],{env,stdio:'pipe'});
 else execFileSync(join(root,'old-ops'),['restore','--input',backup,'--data-dir',restored,'--base-url',url,'--confirm-database',restoreDatabase,...dumpFlags],{env:{...env,UNICORE_RESTORE_DATABASE_DSN:restoreDsn},stdio:'pipe'});
 await start(join(root,'old-server'),restored);boot=await bootstrap();expect(boot.site_name).toBe('Preserved upgrade brand');expect((await(await client.get('/api/v1/admin/users')).json()).data.total).toBe(2);expect(hash(join(restored,'secret.key'))).toBe(keyHash);
 const restoredNotes=await client.get('/api/v1/admin/notes');if(legacyNote){expect(restoredNotes.status()).toBe(200);const restoredItems=(await restoredNotes.json()).data.items;expect(restoredItems.length).toBe(1);expect(restoredItems[0].id).toBe(legacyNote.id);}else expect(restoredNotes.status()).toBe(404);
 if(attachment)expect(await downloadAttachment()).toEqual(attachmentBytes);
 const evidence={from_revision:revision,from_tree:oldTree,from_version:oldVersion,to_revision:headCommit,to_tree:headTree,to_version:readFileSync('VERSION','utf8').trim(),from_ref:ref,to_worktree:true,profile:'web-platform',driver,database:sanitizeDsn(dsn||'embedded sqlite'),restore_database:restoreDatabase,files_backed_up:snapshot.files,capabilities,schema:snapshot.schema,generation_before:snapshot.schema,generation_after:afterSnapshot.schema,upgrade:true,restart:true,restore_old_binary:true,source_instance_preserved:true};
 mkdirSync('build/acceptance/developer-kit',{recursive:true});
 writeFileSync(`build/acceptance/developer-kit/upgrade-${driver}.json`,JSON.stringify(evidence,null,2)+'\n');console.log(`PASS ${driver} previous revision upgrade, business migration, restart and pre-upgrade backup restored with previous binary`);
}finally{await stop();if(client)await client.dispose();rmSync(root,{recursive:true,force:true});}
