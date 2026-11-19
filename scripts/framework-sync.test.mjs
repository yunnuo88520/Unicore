// Author: yunnuo <ymz@ebox.vip>
// Description: End-to-end template sync: independent template history, ancestor-based derivation, upstream merges, second sync and conflict refusal.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,symlinkSync,mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {updateTemplateBranch} from './framework-template.mjs';
import {createProject} from './create-project.mjs';
import {checkTemplate,syncTemplate,continueTemplateSync,abortTemplateSync,graftTemplateAncestry} from './framework-sync.mjs';
import {applyIdentity,loadIdentity} from './product-identity.mjs';

process.env.GIT_AUTHOR_NAME='Fixture';process.env.GIT_AUTHOR_EMAIL='fixture@example.test';
process.env.GIT_COMMITTER_NAME='Fixture';process.env.GIT_COMMITTER_EMAIL='fixture@example.test';

const sh=(dir,...args)=>execFileSync('git',['-C',dir,...args],{stdio:['ignore','pipe','pipe']}).toString().trim();
const shThrow=(dir,...args)=>assert.throws(()=>execFileSync('git',['-C',dir,...args],{stdio:['ignore','pipe','pipe']}));

const GUIDE='# Guide\n\nRun unicore-ops backup; service unicore.service; volume unicore_data.\n';

const SERVICE='[Unit]\nDescription=Unicore application server\n\n[Service]\nUser=unicore\nGroup=unicore\nWorkingDirectory=/var/lib/unicore\nEnvironmentFile=-/etc/unicore/unicore.env\nExecStart=/opt/unicore/current/bin/server\n';

function makeSource(){
 const fixtureRoot=mkdtempSync(join(tmpdir(),'unicore-sync-'));
 const root=join(fixtureRoot,'source');mkdirSync(root);
 const files={'go.mod':'module github.com/yunnuo/unicore\n','VERSION':'0.1.0\n','Makefile':'LDFLAGS := -X $(GO_MODULE)/internal/buildinfo.Version=$(VERSION)\n','framework.manifest.json':'{}','assets/updates/config.json':'{"repository":"upstream/repo","keys":{"upstream":"test"}}','package.json':'{\n  "name": "unicore",\n  "version": "0.1.0",\n  "scripts": {\n    "dev": "vite"\n  },\n  "dependencies": {\n    "framework-sdk": "^0.1.0"\n  }\n}\n','assets/theme/tokens.json':'{\n  "author": "yunnuo <ymz@ebox.vip>",\n  "brand": {\n    "name": "Unicore",\n    "accent": "#6662ec"\n  }\n}\n','assets/theme/resolved.gen.json':'{\n  "brand": {\n    "name": "Unicore",\n    "accent": "#6662ec"\n  }\n}\n','assets/brand/identity.json':'{\n  "author": "yunnuo <ymz@ebox.vip>",\n  "bundleId": "vip.ebox.unicore"\n}\n','assets/brand/wordmark.svg':'<svg><text x="82" y="54">Unicore<tspan fill="#6662ec">.</tspan></text></svg>\n','cmd/desktop/wails.json':'{\n  "name": "Unicore",\n  "outputfilename": "unicore-desktop",\n  "info": {\n    "productName": "Unicore",\n    "productVersion": "0.1.0",\n    "comments": "Unicore · Go + React"\n  }\n}\n','packages/contracts/openapi.json':'{\n  "info": {\n    "title": "Unicore platform foundation API"\n  },\n  "paths": {}\n}\n','apps/web/index.html':'<!doctype html><html><head><meta name="description" content="Unicore · 一份核心" /><title>Unicore · 工作空间</title></head><body></body></html>\n','apps/web/admin.html':'<!doctype html><html><head><meta name="description" content="Unicore · 一份核心" /><title>Unicore · 管理后台</title></head><body></body></html>\n','apps/desktop/index.html':'<!doctype html><html><head><title>Unicore · 桌面工作空间</title></head><body></body></html>\n','apps/web/public/site.webmanifest':'{"name":"Unicore","short_name":"Unicore"}','apps/desktop/public/site.webmanifest':'{"name":"Unicore","short_name":"Unicore"}','internal/adapter/cli/command.go':'// github.com/yunnuo/unicore/internal/buildinfo\npackage cli\n','product.identity.json':'{\n  "author": "yunnuo <ymz@ebox.vip>",\n  "schemaVersion": 1,\n  "product": {"name": "Unicore", "slug": "unicore", "vendor": "yunnuo", "description": "一份核心，运行于每个终端"},\n  "go": {"module": "github.com/yunnuo/unicore"},\n  "cli": {"command": "unicore", "opsCommand": "unicore-ops", "description": "Unicore — one core, every interface"},\n  "desktop": {"bundleId": "vip.ebox.unicore", "outputName": "unicore-desktop"},\n  "deployment": {"serviceName": "unicore", "serviceUser": "unicore", "installDirectory": "/opt/unicore", "dataDirectory": "/var/lib/unicore", "image": "unicore", "volume": "unicore_data"},\n  "release": {"artifactPrefix": "unicore"}\n}\n','deploy/tar/unicore.service':SERVICE,'deploy/tar/nginx.conf.example':'server {\n    root /opt/unicore/current/web;\n}\n','deploy/docker/compose.yaml':'services:\n  app:\n    image: ${UNICORE_IMAGE:-unicore:local}\n    volumes:\n      - unicore_data:/data\nvolumes:\n  unicore_data:\n','deploy/docker/compose.dev.yaml':'services:\n  db:\n    environment:\n      POSTGRES_USER: unicore\n','deploy/docker/Dockerfile':'FROM scratch\nLABEL org.opencontainers.image.title="Unicore"\n','docs/product/guide.md':GUIDE,'main.go':'package main // github.com/yunnuo/unicore/internal/domain\n','.gitignore':'build/\nnode_modules/\n','LICENSE':'MIT license fixture','.agents/skills/sample/SKILL.md':'---\nname: sample\ndescription: Fixture task\n---\n','private.txt':'framework-only, never exported'};
 const manifest={format_version:1,documents:[{source:'docs/product/guide.md',target:'docs/product/guide.md',audiences:['user-release','project-template','public-wiki'],slug:'Home',title:'Guide'}],template_files:Object.keys(files).filter(p=>!['private.txt','docs/product/guide.md'].includes(p))};
 manifest.template_files.push('distribution/manifest.json','AGENTS.md',{source:'main.go',target:'internal/mapped-example.go'});
 files['distribution/manifest.json']=JSON.stringify(manifest,null,2)+'\n';
 files['framework.manifest.json']=JSON.stringify({contract:'packages/contracts/openapi.json',readFirst:['AGENTS.md'],profiles:{},sources:{},skills:['sample'],commands:{},contextOutput:'docs/developer/context.gen.md'});
 files['AGENTS.md']='application instructions';
 files['packages/contracts/openapi.json']=JSON.stringify({info:{title:'Unicore platform foundation API'},paths:{},components:{schemas:{}}},null,2)+'\n';
 for(const [p,text] of Object.entries(files)){mkdirSync(dirname(join(root,p)),{recursive:true});writeFileSync(join(root,p),text);}
 mkdirSync(join(root,'.agents/skills'),{recursive:true});
 sh(root,'init','-q');sh(root,'add','-A');sh(root,'-c','user.name=Framework','-c','user.email=framework@example.test','commit','-qm','framework baseline');
 return {source: root, fixtureRoot};
}

function derive(source){
 const options={source,directory:join(dirname(source),'app'),name:'My Product',slug:'my-product',module:'example.test/team/product',bundle:'test.example.product'};
 createProject(options);
 const derived=options.directory;
 sh(derived,'remote','set-url','framework',source); // offline fixture: the framework remote points at the local source repo
 return derived;
}

function upstreamStep(source,version,edit){
 edit();
 sh(source,'add','-A');sh(source,'-c','user.name=Framework','-c','user.email=framework@example.test','commit','-qm',`framework ${version}`);
 return updateTemplateBranch(source);
}

test('framework-template is an independent whitelist-only history',()=>{
 const {source,fixtureRoot}=makeSource();
 try{
  const first=updateTemplateBranch(source);
  assert.equal(first.updated,true);
  shThrow(source,'rev-parse','--verify',`${first.commit}^`);
  // Traceability: the template commit must record the framework source commit it exported.
  assert.equal(first.source_commit,sh(source,'rev-parse','HEAD'));
  assert.match(sh(source,'log','-1','--format=%B',first.commit),new RegExp(`Source: ${first.source_commit}`));
  const listed=sh(source,'ls-tree','-r','--name-only',first.commit).split('\n');
  assert.ok(listed.includes('product.identity.json'));
  assert.ok(listed.includes('deploy/tar/unicore.service'));
  assert.ok(!listed.includes('private.txt'));
  assert.equal(updateTemplateBranch(source).updated,false);
  writeFileSync(join(source,'docs/product/guide.md'),GUIDE+'Upstream adds a section.\n');
  sh(source,'add','-A');sh(source,'-c','user.name=Framework','-c','user.email=framework@example.test','commit','-qm','framework edit');
  const second=updateTemplateBranch(source);
  assert.equal(second.updated,true);assert.equal(second.parent,first.commit);
 }finally{rmSync(fixtureRoot,{recursive:true,force:true});}
});

test('derivation bases the baseline on the template commit and sync merges upstream',()=>{
 const {source,fixtureRoot}=makeSource();
 try{
  const t1=updateTemplateBranch(source);
  const derived=derive(source);
  assert.equal(sh(derived,'rev-parse','HEAD^'),t1.commit);
  const provenance=JSON.parse(readFileSync(join(derived,'project.provenance.json')));
  assert.equal(provenance.template_revision,t1.commit);
  mkdirSync(join(derived,'internal/business'),{recursive:true});
  writeFileSync(join(derived,'internal/business/business.go'),'package business\n');
  writeFileSync(join(derived,'assets/theme/tokens.json'),readFileSync(join(derived,'assets/theme/tokens.json'),'utf8').replace('#6662ec','#1177ee'));
  sh(derived,'add','-A');sh(derived,'commit','-qm','product work');
  upstreamStep(source,'0.2.0',()=>{
   writeFileSync(join(source,'VERSION'),'0.2.0\n');
   writeFileSync(join(source,'deploy/tar/unicore.service'),SERVICE+'\n# upstream improvement\n');
   writeFileSync(join(source,'docs/product/guide.md'),GUIDE+'Upstream adds a section.\n');
   writeFileSync(join(source,'internal/adapter/cli/command.go'),'// framework touch github.com/yunnuo/unicore/internal/buildinfo\npackage cli\n');
  });
  const preview=checkTemplate(derived);
  assert.equal(preview.up_to_date,false);assert.equal(preview.upstream_template_version,'0.2.0');
  const result=syncTemplate(derived);
  assert.ok(result.merged_commit);
  const service=readFileSync(join(derived,'deploy/tar/my-product.service'),'utf8');
  assert.match(service,/upstream improvement/);
  assert.match(service,/User=my-product/);
  const guide=readFileSync(join(derived,'docs/product/guide.md'),'utf8');
  assert.match(guide,/NEW|Upstream adds a section/);assert.match(guide,/my-product-ops/);
  assert.match(readFileSync(join(derived,'internal/adapter/cli/command.go'),'utf8'),/example\.test\/team\/product\/internal\/buildinfo/);
  // The application owns its product version: the framework upgrade delivers new
  // framework code but never bumps or overwrites the application's own VERSION.
  assert.equal(readFileSync(join(derived,'VERSION'),'utf8').trim(),'0.1.0');
  assert.match(readFileSync(join(derived,'assets/theme/tokens.json'),'utf8'),/#1177ee/);
  assert.ok(existsSync(join(derived,'internal/business/business.go')));
  assert.equal(JSON.parse(readFileSync(join(derived,'product.identity.json'))).product.slug,'my-product');
  assert.equal(sh(derived,'status','--porcelain'),'');
  assert.equal(sh(derived,'rev-list','--parents','-n','1','HEAD').split(' ').length,3);
  assert.doesNotThrow(()=>applyIdentity(derived,loadIdentity(derived),true));
  assert.equal(existsSync(join(derived,'deploy/tar/unicore.service')),false);
  // Second sync must keep working.
  upstreamStep(source,'0.3.0',()=>{
   writeFileSync(join(source,'VERSION'),'0.3.0\n');
   writeFileSync(join(source,'docs/product/guide.md'),GUIDE+'Upstream adds a section.\nUpstream adds another section.\n');
   writeFileSync(join(source,'deploy/tar/unicore.service'),SERVICE+'\n# upstream improvement\n# second upstream improvement\n');
  });
  writeFileSync(join(derived,'internal/business/more.go'),'package business\n');
  sh(derived,'add','-A');sh(derived,'commit','-qm','more product work');
  syncTemplate(derived);
  assert.equal(readFileSync(join(derived,'VERSION'),'utf8').trim(),'0.1.0');
  const service2=readFileSync(join(derived,'deploy/tar/my-product.service'),'utf8');
  assert.match(service2,/second upstream improvement/);assert.match(service2,/User=my-product/);
  assert.match(readFileSync(join(derived,'docs/product/guide.md'),'utf8'),/another section/);
  assert.ok(existsSync(join(derived,'internal/business/more.go')));
  assert.equal(sh(derived,'status','--porcelain'),'');
  assert.doesNotThrow(()=>applyIdentity(derived,loadIdentity(derived),true));
 }finally{rmSync(fixtureRoot,{recursive:true,force:true});}
});

test('sync refuses and leaves the tree untouched on real conflicts',()=>{
 const {source,fixtureRoot}=makeSource();
 try{
  updateTemplateBranch(source);
  const derived=derive(source);
  writeFileSync(join(derived,'docs/product/guide.md'),'# Guide\n\nLocal runbook overrides.\n');
  sh(derived,'add','-A');sh(derived,'commit','-qm','local runbook rewrite');
  const head=sh(derived,'rev-parse','HEAD');
  upstreamStep(source,'0.2.0',()=>{
   writeFileSync(join(source,'VERSION'),'0.2.0\n');
   writeFileSync(join(source,'docs/product/guide.md'),'# Guide\n\nUpstream rewrites the guide.\n');
  });
  assert.throws(()=>syncTemplate(derived),/Upstream merge conflicts/);
  assert.equal(sh(derived,'rev-parse','HEAD'),head);
  assert.equal(sh(derived,'status','--porcelain'),'');
  assert.match(readFileSync(join(derived,'docs/product/guide.md'),'utf8'),/Local runbook overrides/);
  // Resolve in the isolated worktree, preserving both local and upstream prose.
  const pending=JSON.parse(readFileSync(join(derived,'build/framework-sync-state.json')));
  writeFileSync(join(pending.worktree,'docs/product/guide.md'),'# Guide\n\nUpstream rewrites the guide.\nLocal runbook overrides.\n');
  sh(pending.worktree,'add','docs/product/guide.md');
  const result=continueTemplateSync(derived);
  assert.ok(result.merged_commit);
  assert.match(readFileSync(join(derived,'docs/product/guide.md'),'utf8'),/Upstream rewrites the guide/);
  assert.match(readFileSync(join(derived,'docs/product/guide.md'),'utf8'),/Local runbook overrides/);
  assert.match(readFileSync(join(derived,'assets/theme/tokens.json'),'utf8'),/#6662ec/);
  assert.equal(sh(derived,'status','--porcelain'),'');
 }finally{rmSync(fixtureRoot,{recursive:true,force:true});}
});

test('upstream structure never overwrites application package.json content',()=>{
 const {source,fixtureRoot}=makeSource();
 try{
  updateTemplateBranch(source);const derived=derive(source);
  const pkg=JSON.parse(readFileSync(join(derived,'package.json'),'utf8'));
  pkg.version='0.1.5';pkg.scripts.deploy='app-deploy';pkg.dependencies['app-sdk']='^9.9.9';
  writeFileSync(join(derived,'package.json'),JSON.stringify(pkg,null,2)+'\n');
  writeFileSync(join(derived,'VERSION'),'0.1.5\n');
  sh(derived,'add','-A');sh(derived,'commit','-qm','Application dependencies and scripts');
  const head=sh(derived,'rev-parse','HEAD');
  upstreamStep(source,'0.2.0',()=>{
   writeFileSync(join(source,'VERSION'),'0.2.0\n');
   const up=JSON.parse(readFileSync(join(source,'package.json'),'utf8'));
   up.version='0.2.0';up.scripts['release-docs']='node scripts/docs.mjs';up.dependencies['template-extra']='^0.2.0';
   writeFileSync(join(source,'package.json'),JSON.stringify(up,null,2)+'\n');
  });
  assert.throws(()=>syncTemplate(derived),/Upstream merge conflicts/);
  // The application branch must not advance while the business conflict is unresolved.
  assert.equal(sh(derived,'rev-parse','HEAD'),head);
  assert.equal(sh(derived,'status','--porcelain'),'');
  const pending=JSON.parse(readFileSync(join(derived,'build/framework-sync-state.json')));
  // Manual resolution: upstream structure plus every application side kept.
  const union={name:'unicore',version:'0.1.5',scripts:{dev:'vite',deploy:'app-deploy','release-docs':'node scripts/docs.mjs'},dependencies:{'framework-sdk':'^0.1.0','app-sdk':'^9.9.9','template-extra':'^0.2.0'}};
  writeFileSync(join(pending.worktree,'package.json'),JSON.stringify(union,null,2)+'\n');
  sh(pending.worktree,'add','package.json');
  const result=continueTemplateSync(derived);
  assert.ok(result.merged_commit);
  const final=JSON.parse(readFileSync(join(derived,'package.json'),'utf8'));
  assert.equal(final.version,'0.1.5');
  assert.equal(final.scripts.dev,'vite');
  assert.equal(final.scripts.deploy,'app-deploy');
  assert.equal(final.scripts['release-docs'],'node scripts/docs.mjs');
  assert.equal(final.dependencies['framework-sdk'],'^0.1.0');
  assert.equal(final.dependencies['app-sdk'],'^9.9.9');
  assert.equal(final.dependencies['template-extra'],'^0.2.0');
  assert.equal(readFileSync(join(derived,'VERSION'),'utf8').trim(),'0.1.5');
  assert.equal(sh(derived,'status','--porcelain'),'');
 }finally{rmSync(fixtureRoot,{recursive:true,force:true});}
});

test('business API paths stay manual and both sides survive the resolution',()=>{
 const {source,fixtureRoot}=makeSource();
 try{
  updateTemplateBranch(source);const derived=derive(source);
  const api=JSON.parse(readFileSync(join(derived,'packages/contracts/openapi.json'),'utf8'));
  api.paths['/business/items']={get:{summary:'Application business listing',responses:{}}};
  writeFileSync(join(derived,'packages/contracts/openapi.json'),JSON.stringify(api,null,2)+'\n');
  sh(derived,'add','-A');sh(derived,'commit','-qm','Application business API');
  const head=sh(derived,'rev-parse','HEAD');
  upstreamStep(source,'0.2.0',()=>{
   writeFileSync(join(source,'VERSION'),'0.2.0\n');
   const up=JSON.parse(readFileSync(join(source,'packages/contracts/openapi.json'),'utf8'));
   up.paths['/platform/status']={get:{summary:'Platform status',responses:{}}};
   writeFileSync(join(source,'packages/contracts/openapi.json'),JSON.stringify(up,null,2)+'\n');
  });
  assert.throws(()=>syncTemplate(derived),/Upstream merge conflicts/);
  assert.equal(sh(derived,'rev-parse','HEAD'),head);
  assert.equal(sh(derived,'status','--porcelain'),'');
  const pending=JSON.parse(readFileSync(join(derived,'build/framework-sync-state.json')));
  const union={info:{title:'Unicore platform foundation API'},paths:{'/platform/status':{get:{summary:'Platform status',responses:{}}},'/business/items':{get:{summary:'Application business listing',responses:{}}}},components:{schemas:{}}};
  writeFileSync(join(pending.worktree,'packages/contracts/openapi.json'),JSON.stringify(union,null,2)+'\n');
  sh(pending.worktree,'add','packages/contracts/openapi.json');
  continueTemplateSync(derived);
  const final=JSON.parse(readFileSync(join(derived,'packages/contracts/openapi.json'),'utf8'));
  assert.ok(final.paths['/business/items']);
  assert.ok(final.paths['/platform/status']);
  assert.equal(sh(derived,'status','--porcelain'),'');
 }finally{rmSync(fixtureRoot,{recursive:true,force:true});}
});

test('version-only projection conflicts resolve automatically at the application version',()=>{
 const {source,fixtureRoot}=makeSource();
 try{
  updateTemplateBranch(source);const derived=derive(source);
  const pkg=JSON.parse(readFileSync(join(derived,'package.json'),'utf8'));
  pkg.version='0.1.5';
  writeFileSync(join(derived,'package.json'),JSON.stringify(pkg,null,2)+'\n');
  writeFileSync(join(derived,'VERSION'),'0.1.5\n');
  sh(derived,'add','-A');sh(derived,'commit','-qm','Application release 0.1.5');
  upstreamStep(source,'0.2.0',()=>{
   writeFileSync(join(source,'VERSION'),'0.2.0\n');
   const up=JSON.parse(readFileSync(join(source,'package.json'),'utf8'));
   up.version='0.2.0';
   writeFileSync(join(source,'package.json'),JSON.stringify(up,null,2)+'\n');
  });
  // No manual step: the only overlap is the version field itself.
  const result=syncTemplate(derived);
  assert.ok(result.merged_commit);
  const final=JSON.parse(readFileSync(join(derived,'package.json'),'utf8'));
  assert.equal(final.version,'0.1.5');
  assert.equal(final.scripts.dev,'vite');
  assert.equal(final.dependencies['framework-sdk'],'^0.1.0');
  assert.equal(readFileSync(join(derived,'VERSION'),'utf8').trim(),'0.1.5');
  assert.equal(existsSync(join(derived,'build/framework-sync-state.json')),false);
  assert.equal(sh(derived,'status','--porcelain'),'');
 }finally{rmSync(fixtureRoot,{recursive:true,force:true});}
});

test('a same-named version field in business content stays a manual conflict',()=>{
 const {source,fixtureRoot}=makeSource();
 try{
  updateTemplateBranch(source);const derived=derive(source);
  // package.json: a business config block carrying its own version key; both
  // sides append it at the same position, so the regions collide.
  const pkg=JSON.parse(readFileSync(join(derived,'package.json'),'utf8'));
  pkg.version='0.1.5';pkg.config={version:'app-v2'};
  writeFileSync(join(derived,'package.json'),JSON.stringify(pkg,null,2)+'\n');
  writeFileSync(join(derived,'VERSION'),'0.1.5\n');
  sh(derived,'add','-A');sh(derived,'commit','-qm','Business config with its own version key');
  const head=sh(derived,'rev-parse','HEAD');
  upstreamStep(source,'0.2.0',()=>{
   writeFileSync(join(source,'VERSION'),'0.2.0\n');
   const up=JSON.parse(readFileSync(join(source,'package.json'),'utf8'));
   up.version='0.2.0';up.config={version:'template-v9'};
   writeFileSync(join(source,'package.json'),JSON.stringify(up,null,2)+'\n');
  });
  assert.throws(()=>syncTemplate(derived),/Upstream merge conflicts/);
  assert.equal(sh(derived,'rev-parse','HEAD'),head);
  // The nested version key is not the projection path: the file stays conflicted.
  const pending=JSON.parse(readFileSync(join(derived,'build/framework-sync-state.json')));
  const conflicted=sh(pending.worktree,'diff','--name-only','--diff-filter=U').split('\n');
  assert.ok(conflicted.includes('package.json'),`package.json should stay conflicted: ${conflicted}`);
  // Manual resolution: upstream's additions plus every application side kept.
  const union={name:'unicore',version:'0.1.5',scripts:{dev:'vite'},dependencies:{'framework-sdk':'^0.1.0'},config:{version:'app-v2',channel:'stable'}};
  writeFileSync(join(pending.worktree,'package.json'),JSON.stringify(union,null,2)+'\n');
  sh(pending.worktree,'add','package.json');
  continueTemplateSync(derived);
  const final=JSON.parse(readFileSync(join(derived,'package.json'),'utf8'));
  assert.equal(final.version,'0.1.5');
  assert.equal(final.config.version,'app-v2');
  assert.equal(final.config.channel,'stable');
  assert.equal(sh(derived,'status','--porcelain'),'');
 }finally{rmSync(fixtureRoot,{recursive:true,force:true});}
});

test('an OpenAPI business schema named version stays a manual conflict',()=>{
 const {source,fixtureRoot}=makeSource();
 try{
  updateTemplateBranch(source);const derived=derive(source);
  const api=JSON.parse(readFileSync(join(derived,'packages/contracts/openapi.json'),'utf8'));
  api.components.schemas.License={type:'object',required:['version'],properties:{version:{type:'string'},plan:{type:'string'}}};
  api.components.schemas.License.properties.version.examples=['9.9.9'];
  writeFileSync(join(derived,'packages/contracts/openapi.json'),JSON.stringify(api,null,2)+'\n');
  sh(derived,'add','-A');sh(derived,'commit','-qm','Business schema carries its own version property');
  const head=sh(derived,'rev-parse','HEAD');
  upstreamStep(source,'0.2.0',()=>{
   writeFileSync(join(source,'VERSION'),'0.2.0\n');
   const up=JSON.parse(readFileSync(join(source,'packages/contracts/openapi.json'),'utf8'));
   up.components.schemas.License={type:'object',required:['version'],properties:{version:{type:'string'},plan:{type:'string'}}};
   up.components.schemas.License.properties.version.examples=['8.8.8'];
   writeFileSync(join(source,'packages/contracts/openapi.json'),JSON.stringify(up,null,2)+'\n');
  });
  assert.throws(()=>syncTemplate(derived),/Upstream merge conflicts/);
  assert.equal(sh(derived,'rev-parse','HEAD'),head);
  const pending=JSON.parse(readFileSync(join(derived,'build/framework-sync-state.json')));
  const conflicted=sh(pending.worktree,'diff','--name-only','--diff-filter=U').split('\n');
  assert.ok(conflicted.includes('packages/contracts/openapi.json'),`openapi.json should stay conflicted: ${conflicted}`);
  // Manual resolution: upstream's structure plus the application's own value.
  const union={info:{title:'Unicore platform foundation API'},paths:{},components:{schemas:{License:{type:'object',required:['version'],properties:{version:{type:'string',examples:['9.9.9']},plan:{type:'string'}}}}}};
  writeFileSync(join(pending.worktree,'packages/contracts/openapi.json'),JSON.stringify(union,null,2)+'\n');
  sh(pending.worktree,'add','packages/contracts/openapi.json');
  continueTemplateSync(derived);
  const final=JSON.parse(readFileSync(join(derived,'packages/contracts/openapi.json'),'utf8'));
  assert.deepEqual(final.components.schemas.License.properties.version.examples,['9.9.9']);
  assert.equal(sh(derived,'status','--porcelain'),'');
 }finally{rmSync(fixtureRoot,{recursive:true,force:true});}
});

test('graft picks the exact creation baseline through a same-version template roll',()=>{
 const {source,fixtureRoot}=makeSource();
 try{
  // A: create the application from this template state (archive-created, so
  // the provenance records only the framework version and input digests).
  const t1=updateTemplateBranch(source);
  const plain=join(fixtureRoot,'archive');mkdirSync(plain);
  cpSync(source,plain,{recursive:true,filter:p=>!/([\\/])\.git([\\/]|$)/.test(p)});
  const derived=createProject({source:plain,directory:join(fixtureRoot,'app-archive'),name:'My Product',slug:'my-product',module:'example.test/team/product',bundle:'test.example.product'});
  sh(derived,'remote','set-url','framework',source);
  assert.equal(JSON.parse(readFileSync(join(derived,'project.provenance.json'))).template_revision,null);
  mkdirSync(join(derived,'internal/business'),{recursive:true});
  writeFileSync(join(derived,'internal/business/business.go'),'package business\n');
  sh(derived,'add','-A');sh(derived,'commit','-qm','product work');
  // B: a whitelist file added WITHOUT a version bump — the template history
  // now carries two commits at the same framework version.
  writeFileSync(join(source,'docs/product/extra.md'),'# Extra\n');
  const manifest=JSON.parse(readFileSync(join(source,'distribution/manifest.json')));
  manifest.template_files.push('docs/product/extra.md');
  writeFileSync(join(source,'distribution/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  sh(source,'add','-A');sh(source,'-c','user.name=Framework','-c','user.email=framework@example.test','commit','-qm','same-version whitelist addition');
  const t2=updateTemplateBranch(source);
  assert.equal(t2.version,'0.1.0');assert.notEqual(t2.commit,t1.commit);
  // C: the version bump.
  const t3=upstreamStep(source,'0.2.0',()=>{
   writeFileSync(join(source,'VERSION'),'0.2.0\n');
   writeFileSync(join(source,'deploy/tar/unicore.service'),SERVICE+'\n# upstream improvement\n');
  });
  // The graft must attach the exact creation baseline (input digests and
  // whitelist-set equality), never the newest same-version commit.
  const headBeforeGraft=sh(derived,'rev-parse','HEAD');
  const grafted=graftTemplateAncestry(derived);
  assert.equal(grafted.grafted,t1.commit);
  assert.equal(grafted.evidence,'creation input digests');
  assert.equal(sh(derived,'rev-parse','--verify',grafted.backup),headBeforeGraft);
  // The sync after grafting delivers B's whitelist file and keeps the business change.
  const preSync=sh(derived,'rev-parse','HEAD');
  const result=syncTemplate(derived);
  assert.ok(result.merged_commit);
  assert.ok(existsSync(join(derived,'docs/product/extra.md')));
  assert.ok(existsSync(join(derived,'internal/business/business.go')));
  assert.equal(sh(derived,'merge-base',preSync,t3.commit),t1.commit);
  assert.match(readFileSync(join(derived,'deploy/tar/my-product.service'),'utf8'),/upstream improvement/);
  assert.equal(sh(derived,'status','--porcelain'),'');
  // Grafting twice is refused: ancestry already exists.
  assert.throws(()=>graftTemplateAncestry(derived),/already shares template ancestry/);
 }finally{rmSync(fixtureRoot,{recursive:true,force:true});}
});

test('graft refuses when the creation evidence cannot identify a baseline',()=>{
 const {source,fixtureRoot}=makeSource();
 try{
  updateTemplateBranch(source);
  const plain=join(fixtureRoot,'archive');mkdirSync(plain);
  cpSync(source,plain,{recursive:true,filter:p=>!/([\\/])\.git([\\/]|$)/.test(p)});
  const derived=createProject({source:plain,directory:join(fixtureRoot,'app-archive'),name:'My Product',slug:'my-product',module:'example.test/team/product',bundle:'test.example.product'});
  sh(derived,'remote','set-url','framework',source);
  mkdirSync(join(derived,'internal/business'),{recursive:true});
  writeFileSync(join(derived,'internal/business/business.go'),'package business\n');
  sh(derived,'add','-A');sh(derived,'commit','-qm','product work');
  // Provenance without a template revision or input digests cannot identify
  // the exact creation baseline: the graft refuses and nothing changes.
  const provenancePath=join(derived,'project.provenance.json');
  const stripped=JSON.parse(readFileSync(provenancePath));
  delete stripped.template_revision; delete stripped.input_files;
  writeFileSync(provenancePath,JSON.stringify(stripped,null,2)+'\n');
  sh(derived,'add','-A');sh(derived,'commit','-qm','Drop creation evidence');
  const head=sh(derived,'rev-parse','HEAD');
  assert.throws(()=>graftTemplateAncestry(derived),/cannot identify the creation baseline/);
  assert.equal(sh(derived,'rev-parse','HEAD'),head);
  assert.equal(sh(derived,'status','--porcelain'),'');
  assert.equal(existsSync(join(derived,'build/framework-sync-state.json')),false);
 }finally{rmSync(fixtureRoot,{recursive:true,force:true});}
});


test('validation failure never advances or dirties the application branch',()=>{
 const {source,fixtureRoot}=makeSource();
 try{
  updateTemplateBranch(source); const derived=derive(source);
  const head=sh(derived,'rev-parse','HEAD');
  upstreamStep(source,'0.2.0',()=>{
   writeFileSync(join(source,'VERSION'),'0.2.0\n');
   writeFileSync(join(source,'docs/product/guide.md'),GUIDE+'UNICORE BRAND LEAK\n');
  });
  assert.throws(()=>syncTemplate(derived),/Residue scan/);
  assert.equal(sh(derived,'rev-parse','HEAD'),head);
  assert.equal(sh(derived,'status','--porcelain'),'');
  assert.equal(existsSync(join(derived,'build/framework-sync-state.json')),false);
 }finally{rmSync(fixtureRoot,{recursive:true,force:true});}
});

test('preparation errors leave product names and staged files untouched',()=>{
 const {source,fixtureRoot}=makeSource();
 try{
  updateTemplateBranch(source); const derived=derive(source);
  const manifest=JSON.parse(readFileSync(join(derived,'distribution/manifest.json')));
  manifest.template_files.push({source:'main.go',target:'../outside.go'});
  writeFileSync(join(derived,'distribution/manifest.json'),JSON.stringify(manifest));
  sh(derived,'add','-A');sh(derived,'commit','-qm','Exercise malformed template path');
  const head=sh(derived,'rev-parse','HEAD');
  upstreamStep(source,'0.2.0',()=>writeFileSync(join(source,'VERSION'),'0.2.0\n'));
  assert.throws(()=>syncTemplate(derived),/Unsafe distribution path/);
  assert.equal(sh(derived,'rev-parse','HEAD'),head);
  assert.equal(sh(derived,'status','--porcelain'),'');
  assert.ok(existsSync(join(derived,'deploy/tar/my-product.service')));
  assert.equal(existsSync(join(derived,'deploy/tar/unicore.service')),false);
 }finally{rmSync(fixtureRoot,{recursive:true,force:true});}
});

test('a merge command error cannot masquerade as a successful sync',()=>{
 const {source,fixtureRoot}=makeSource();
 try{
  updateTemplateBranch(source);const derived=derive(source); const head=sh(derived,'rev-parse','HEAD');
  upstreamStep(source,'0.2.0',()=>writeFileSync(join(source,'VERSION'),'0.2.0\n'));
  sh(derived,'config','merge.verifySignatures','true');
  assert.throws(()=>syncTemplate(derived),/signature|Command failed/);
  assert.equal(sh(derived,'rev-parse','HEAD'),head);assert.equal(sh(derived,'status','--porcelain'),'');
 }finally{rmSync(fixtureRoot,{recursive:true,force:true});}
});

test('abort discards only the isolated conflict, and continue refuses concurrent application edits',()=>{
 const {source,fixtureRoot}=makeSource();let derived;
 try{
  updateTemplateBranch(source);derived=derive(source);
  writeFileSync(join(derived,'docs/product/guide.md'),'Local rewrite\n');
  sh(derived,'add','-A');sh(derived,'commit','-qm','Customize guide');
  const head=sh(derived,'rev-parse','HEAD');
  upstreamStep(source,'0.2.0',()=>writeFileSync(join(source,'docs/product/guide.md'),'Upstream rewrite\n'));
  assert.throws(()=>syncTemplate(derived),/Upstream merge conflicts/);
  writeFileSync(join(derived,'README.md'),'New application work\n');
  assert.throws(()=>continueTemplateSync(derived),/changed during sync/);
  abortTemplateSync(derived);
  assert.equal(sh(derived,'rev-parse','HEAD'),head);
  assert.equal(readFileSync(join(derived,'README.md'),'utf8'),'New application work\n');
  assert.equal(existsSync(join(derived,'build/framework-sync-state.json')),false);
 }finally{if(derived&&existsSync(join(derived,'build/framework-sync-state.json')))abortTemplateSync(derived);rmSync(fixtureRoot,{recursive:true,force:true});}
});

test('template publication continues a remote-only template history',()=>{
 const {source,fixtureRoot}=makeSource();
 try{
  const first=updateTemplateBranch(source);
  sh(source,'update-ref','refs/remotes/origin/framework-template',first.commit);
  sh(source,'branch','-D','framework-template');
  writeFileSync(join(source,'VERSION'),'0.2.0\n');sh(source,'add','-A');sh(source,'commit','-qm','Next framework version');
  const next=updateTemplateBranch(source);
  assert.equal(next.parent,first.commit);
  assert.equal(sh(source,'merge-base',next.commit,first.commit),first.commit);
 }finally{rmSync(fixtureRoot,{recursive:true,force:true});}
});


test('a fresh clone fetches existing template history even without a tracking ref',()=>{
 const {source,fixtureRoot}=makeSource();
 try{
  const first=updateTemplateBranch(source);const fresh=join(fixtureRoot,'fresh');
  sh(fixtureRoot,'clone','--quiet',source,fresh);
  sh(fresh,'update-ref','-d','refs/remotes/origin/framework-template');
  const result=updateTemplateBranch(fresh);
  assert.equal(result.commit,first.commit);assert.equal(result.parent,first.commit);
  assert.equal(sh(fresh,'rev-parse','framework-template'),first.commit);
 }finally{rmSync(fixtureRoot,{recursive:true,force:true});}
});

test('divergent published history is rejected without replacing the local template',()=>{
 const {source,fixtureRoot}=makeSource();
 try{
  const first=updateTemplateBranch(source);
  const other=sh(source,'commit-tree',first.tree,'-m','Exercise a divergent orphan');
  sh(source,'update-ref','refs/remotes/origin/framework-template',other);
  assert.throws(()=>updateTemplateBranch(source),/histories diverged/);
  assert.equal(sh(source,'rev-parse','framework-template'),first.commit);
 }finally{rmSync(fixtureRoot,{recursive:true,force:true});}
});

test('sync never follows a product projection symlink outside the isolated worktree',t=>{
 if(process.platform==='win32'){t.skip('Symlinks need explicit Windows privileges');return;}
 const {source,fixtureRoot}=makeSource();
 try{
  updateTemplateBranch(source);const derived=derive(source);
  const external=join(fixtureRoot,'shared-theme.json');const original=readFileSync(join(derived,'assets/theme/tokens.json'),'utf8');
  writeFileSync(external,original);rmSync(join(derived,'assets/theme/tokens.json'));symlinkSync(external,join(derived,'assets/theme/tokens.json'));
  sh(derived,'add','-A');sh(derived,'commit','-qm','Use an external theme link');const head=sh(derived,'rev-parse','HEAD');
  upstreamStep(source,'0.2.0',()=>writeFileSync(join(source,'VERSION'),'0.2.0\n'));
  assert.throws(()=>syncTemplate(derived),/links are forbidden/);
  assert.equal(readFileSync(external,'utf8'),original);assert.equal(sh(derived,'rev-parse','HEAD'),head);assert.equal(sh(derived,'status','--porcelain'),'');
 }finally{rmSync(fixtureRoot,{recursive:true,force:true});}
});


test('an ignored application file cannot be overwritten by a new upstream file',()=>{
 const {source,fixtureRoot}=makeSource();
 try{
  updateTemplateBranch(source);const derived=derive(source);
  writeFileSync(join(derived,'.gitignore'),readFileSync(join(derived,'.gitignore'),'utf8')+'local-cache.txt\n');
  sh(derived,'add','.gitignore');sh(derived,'commit','-qm','Keep application-local cache private');
  writeFileSync(join(derived,'local-cache.txt'),'Application data must survive\n');const head=sh(derived,'rev-parse','HEAD');
  upstreamStep(source,'0.2.0',()=>{
   writeFileSync(join(source,'local-cache.txt'),'Upstream example\n');
   const manifest=JSON.parse(readFileSync(join(source,'distribution/manifest.json')));manifest.template_files.push('local-cache.txt');
   writeFileSync(join(source,'distribution/manifest.json'),JSON.stringify(manifest));
  });
  assert.throws(()=>syncTemplate(derived),/overwritten|Command failed/);
  assert.equal(readFileSync(join(derived,'local-cache.txt'),'utf8'),'Application data must survive\n');
  assert.equal(sh(derived,'rev-parse','HEAD'),head);assert.equal(sh(derived,'status','--porcelain'),'');
 }finally{rmSync(fixtureRoot,{recursive:true,force:true});}
});
