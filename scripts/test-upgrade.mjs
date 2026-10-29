// Author: yunnuo <ymz@ebox.vip>
// Description: Upgrade a disposable installed instance from an explicit Git revision, then restore its pre-upgrade snapshot with the old binary.
import {execFileSync,spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {randomBytes,createHash} from 'node:crypto';
import {request,expect} from '@playwright/test';
const ref=process.env.UPGRADE_FROM_REF;if(!ref)throw Error('Set UPGRADE_FROM_REF to an explicit trusted local commit/tag');
const revision=execFileSync('git',['rev-parse','--verify',`${ref}^{commit}`],{encoding:'utf8'}).trim();
const root=mkdtempSync(join(tmpdir(),'unicore-upgrade-')),old=join(root,'old'),data=join(root,'data'),restored=join(root,'restored');mkdirSync(old);
let child,client;
const stop=async()=>{if(child&&child.exitCode===null){const ended=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await ended;}};
const allocate=async()=>{const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));return port;};
const port=await allocate(),url=`http://127.0.0.1:${port}`;
const start=async(binary,directory)=>{child=spawn(binary,['--listen',`127.0.0.1:${port}`,'--data-dir',directory],{stdio:'ignore',env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('APP_')))});await expect.poll(async()=>{try{return(await fetch(`${url}/api/v1/health/live`)).status;}catch{return 0;}},{timeout:20000}).toBe(200);};
const ops=resolve('build/bin/unicore-ops'),current=resolve('build/bin/server');
const password='isolated-upgrade-test-password';
const env={...process.env,UNICORE_BACKUP_PASSPHRASE:randomBytes(32).toString('base64')};
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
try{
 const archive=execFileSync('git',['archive',revision],{maxBuffer:64<<20});execFileSync('tar',['-xf','-','-C',old],{input:archive});
 execFileSync('go',['build','-o',join(root,'old-server'),'./cmd/server'],{cwd:old,stdio:'inherit'});
 await start(join(root,'old-server'),data);client=await request.newContext({baseURL:url});
 const token=readFileSync(join(data,'bootstrap.token'),'utf8').trim();
 expect((await client.post('/api/v1/install/complete',{headers:{'X-Bootstrap-Token':token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Upgrade fixture',base_url:url,admin_username:'admin',admin_email:'admin@example.test',admin_password:password}})).status()).toBe(200);
 const bootstrap=async()=>(await(await client.get('/api/v1/admin/bootstrap')).json()).data;
 let boot=await bootstrap();let headers={'Origin':url,'X-CSRF-Token':boot.csrf_token};
 expect((await client.patch('/api/v1/admin/settings',{headers,data:{changes:[{key:'site.name',value:'Preserved upgrade brand'}]}})).status()).toBe(200);
 expect((await client.post('/api/v1/admin/users',{headers,data:{username:'member',email:'member@example.test',password,role:'user'}})).status()).toBe(200);
 const legacyResponse=await client.post('/api/v1/admin/notes',{headers,data:{title:'Before upgrade',body:'preserve previous business data',status:'open',attachment_ids:[]}});expect([200,404]).toContain(legacyResponse.status());const legacyNote=legacyResponse.status()===200?(await legacyResponse.json()).data:null;
 const instance=JSON.parse(readFileSync(join(data,'installation.json'))).instance,keyHash=hash(join(data,'secret.key'));
 await stop();const backup=join(root,'before.age');
 const snapshot=JSON.parse(execFileSync(ops,['backup','--data-dir',data,'--output',backup],{env,encoding:'utf8'}));
 expect(snapshot.business_schema).toBe(legacyNote?1:0);
 await start(current,data);boot=await bootstrap();expect(boot.site_name).toBe('Preserved upgrade brand');expect(JSON.parse(readFileSync(join(data,'installation.json'))).instance).toBe(instance);expect(hash(join(data,'secret.key'))).toBe(keyHash);
 expect((await(await client.get('/api/v1/admin/users')).json()).data.total).toBe(1);
 if(legacyNote){const preserved=(await(await client.get('/api/v1/admin/notes')).json()).data.items.find(item=>item.id===legacyNote.id);expect(preserved.body).toBe(legacyNote.body);expect(preserved.version).toBe(legacyNote.version);}
 headers={'Origin':url,'X-CSRF-Token':boot.csrf_token};const note=(await(await client.post('/api/v1/admin/notes',{headers,data:{title:'After upgrade',body:'business migration',status:'open',attachment_ids:[]}})).json()).data;expect(note.version).toBe(1);
 await stop();const afterSnapshot=JSON.parse(execFileSync(ops,['backup','--data-dir',data,'--output',join(root,'after.age')],{env,encoding:'utf8'}));expect(afterSnapshot.schema).toBe(11);expect(afterSnapshot.business_schema).toBe(2);await start(current,data);expect((await(await client.get('/api/v1/admin/notes')).json()).data.items.some(item=>item.id===note.id)).toBe(true);await stop();
 execFileSync(ops,['restore','--input',backup,'--data-dir',restored,'--base-url',url],{env,stdio:'pipe'});
 await start(join(root,'old-server'),restored);boot=await bootstrap();expect(boot.site_name).toBe('Preserved upgrade brand');expect((await(await client.get('/api/v1/admin/users')).json()).data.total).toBe(1);expect(hash(join(restored,'secret.key'))).toBe(keyHash);
 const restoredNotes=await client.get('/api/v1/admin/notes');if(legacyNote){expect(restoredNotes.status()).toBe(200);const restoredItems=(await restoredNotes.json()).data.items;expect(restoredItems.length).toBe(1);expect(restoredItems[0].id).toBe(legacyNote.id);}else expect(restoredNotes.status()).toBe(404);
 const evidence={from_revision:revision,to_revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),to_worktree:true,profile:'web-platform',driver:'sqlite',schema:afterSnapshot.schema,business_before:snapshot.business_schema,business_after:afterSnapshot.business_schema,upgrade:true,restart:true,restore_old_binary:true,source_instance_preserved:true};
 mkdirSync('build/acceptance/developer-kit',{recursive:true});writeFileSync('build/acceptance/developer-kit/upgrade.json',JSON.stringify(evidence,null,2)+'\n');console.log('PASS previous revision upgrade, business migration, restart and pre-upgrade backup restored with previous binary');
}finally{await stop();if(client)await client.dispose();rmSync(root,{recursive:true,force:true});}
