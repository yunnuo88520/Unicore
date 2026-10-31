// Author: yunnuo <ymz@ebox.vip>
// Description: End-to-end template sync: independent template history, ancestor-based derivation, upstream merges, second sync and conflict refusal.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {updateTemplateBranch} from './framework-template.mjs';
import {createProject} from './create-project.mjs';
import {checkTemplate,syncTemplate} from './framework-sync.mjs';
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
 const files={'go.mod':'module github.com/yunnuo/unicore\n','VERSION':'0.1.0\n','Makefile':'LDFLAGS := -X $(GO_MODULE)/internal/buildinfo.Version=$(VERSION)\n','framework.manifest.json':'{}','assets/updates/config.json':'{"repository":"upstream/repo","keys":{"upstream":"test"}}','package.json':'{\n  "name": "unicore",\n  "version": "0.1.0"\n}\n','assets/theme/tokens.json':'{\n  "author": "yunnuo <ymz@ebox.vip>",\n  "brand": {\n    "name": "Unicore",\n    "accent": "#6662ec"\n  }\n}\n','assets/theme/resolved.gen.json':'{\n  "brand": {\n    "name": "Unicore",\n    "accent": "#6662ec"\n  }\n}\n','assets/brand/identity.json':'{\n  "author": "yunnuo <ymz@ebox.vip>",\n  "bundleId": "vip.ebox.unicore"\n}\n','assets/brand/wordmark.svg':'<svg><text x="82" y="54">Unicore<tspan fill="#6662ec">.</tspan></text></svg>\n','cmd/desktop/wails.json':'{\n  "name": "Unicore",\n  "outputfilename": "unicore-desktop",\n  "info": {\n    "productName": "Unicore",\n    "productVersion": "0.1.0",\n    "comments": "Unicore · Go + React"\n  }\n}\n','packages/contracts/openapi.json':'{\n  "info": {\n    "title": "Unicore platform foundation API"\n  },\n  "paths": {}\n}\n','apps/web/index.html':'<!doctype html><html><head><meta name="description" content="Unicore · 一份核心" /><title>Unicore · 工作空间</title></head><body></body></html>\n','apps/web/admin.html':'<!doctype html><html><head><meta name="description" content="Unicore · 一份核心" /><title>Unicore · 管理后台</title></head><body></body></html>\n','apps/desktop/index.html':'<!doctype html><html><head><title>Unicore · 桌面工作空间</title></head><body></body></html>\n','apps/web/public/site.webmanifest':'{"name":"Unicore","short_name":"Unicore"}','apps/desktop/public/site.webmanifest':'{"name":"Unicore","short_name":"Unicore"}','internal/adapter/cli/command.go':'// github.com/yunnuo/unicore/internal/buildinfo\npackage cli\n','product.identity.json':'{\n  "author": "yunnuo <ymz@ebox.vip>",\n  "schemaVersion": 1,\n  "product": {"name": "Unicore", "slug": "unicore", "vendor": "yunnuo", "description": "一份核心，运行于每个终端"},\n  "go": {"module": "github.com/yunnuo/unicore"},\n  "cli": {"command": "unicore", "opsCommand": "unicore-ops", "description": "Unicore — one core, every interface"},\n  "desktop": {"bundleId": "vip.ebox.unicore", "outputName": "unicore-desktop"},\n  "deployment": {"serviceName": "unicore", "serviceUser": "unicore", "installDirectory": "/opt/unicore", "dataDirectory": "/var/lib/unicore", "image": "unicore", "volume": "unicore_data"},\n  "release": {"artifactPrefix": "unicore"}\n}\n','deploy/tar/unicore':'#!/bin/sh\nunicore_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\n','deploy/tar/unicorehelp':'#!/bin/sh\nunicore_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\n','deploy/tar/unicore.service':SERVICE,'deploy/tar/nginx.conf.example':'server {\n    root /opt/unicore/current/web;\n}\n','deploy/docker/compose.yaml':'services:\n  app:\n    image: ${UNICORE_IMAGE:-unicore:local}\n    volumes:\n      - unicore_data:/data\nvolumes:\n  unicore_data:\n','deploy/docker/compose.dev.yaml':'services:\n  db:\n    environment:\n      POSTGRES_USER: unicore\n','deploy/docker/Dockerfile':'FROM scratch\nLABEL org.opencontainers.image.title="Unicore"\n','docs/product/guide.md':GUIDE,'main.go':'package main // github.com/yunnuo/unicore/internal/domain\n','.gitignore':'build/\nnode_modules/\n','LICENSE':'MIT license fixture','.agents/skills/sample/SKILL.md':'---\nname: sample\ndescription: Fixture task\n---\n','private.txt':'framework-only, never exported'};
 const manifest={format_version:1,documents:[{source:'docs/product/guide.md',target:'docs/product/guide.md',audiences:['user-release','project-template','public-wiki'],slug:'Home',title:'Guide'}],template_files:Object.keys(files).filter(p=>!['private.txt','docs/product/guide.md'].includes(p))};
 manifest.template_files.push('distribution/manifest.json','AGENTS.md');
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
  assert.equal(readFileSync(join(derived,'VERSION'),'utf8').trim(),'0.2.0');
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
  assert.equal(readFileSync(join(derived,'VERSION'),'utf8').trim(),'0.3.0');
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
  // After adopting the upstream version, the sync goes through and product files stay intact.
  writeFileSync(join(derived,'docs/product/guide.md'),'# Guide\n\nUpstream rewrites the guide.\n');
  sh(derived,'add','-A');sh(derived,'commit','-qm','adopt upstream runbook');
  const result=syncTemplate(derived);
  assert.ok(result.merged_commit);
  assert.match(readFileSync(join(derived,'docs/product/guide.md'),'utf8'),/Upstream rewrites the guide/);
  assert.match(readFileSync(join(derived,'assets/theme/tokens.json'),'utf8'),/#6662ec/);
 }finally{rmSync(fixtureRoot,{recursive:true,force:true});}
});
