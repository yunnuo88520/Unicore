// Author: yunnuo <ymz@ebox.vip>
// Description: Export only declared template files, preserve licensing/identity and reject dirty or unsafe inputs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createProject} from './create-project.mjs';

test('project export and destination boundaries',()=>{
 const root=mkdtempSync(join(tmpdir(),'unicore-creator-')),source=join(root,'source');mkdirSync(source);
 const files={'go.mod':'module github.com/yunnuo/unicore\n','Makefile':'LDFLAGS := -X $(GO_MODULE)/internal/buildinfo.Version=$(VERSION)\n','framework.manifest.json':'{}','assets/updates/config.json':'{"repository":"upstream/repo","keys":{"upstream":"test"}}','package.json':'{\n  "name": "unicore",\n  "version": "0.1.0"\n}\n','assets/theme/tokens.json':'{\n  "author": "yunnuo <ymz@ebox.vip>",\n  "brand": {\n    "name": "Unicore",\n    "accent": "#6662ec"\n  }\n}\n','assets/brand/identity.json':'{\n  "author": "yunnuo <ymz@ebox.vip>",\n  "bundleId": "vip.ebox.unicore"\n}\n','cmd/desktop/wails.json':'{\n  "name": "Unicore",\n  "outputfilename": "unicore-desktop",\n  "info": {\n    "productName": "Unicore",\n    "productVersion": "0.1.0",\n    "comments": "Unicore · Go + React"\n  }\n}\n','packages/contracts/openapi.json':'{\n  "info": {\n    "title": "Unicore platform foundation API"\n  },\n  "paths": {}\n}\n','apps/web/index.html':'<!doctype html><html><head><meta name="description" content="Unicore · 一份核心，运行于每个终端" /><title>Unicore · 工作空间</title></head><body></body></html>\n','apps/web/admin.html':'<!doctype html><html><head><meta name="description" content="Unicore · 一份核心，运行于每个终端" /><title>Unicore · 管理后台</title></head><body></body></html>\n','apps/desktop/index.html':'<!doctype html><html><head><title>Unicore · 桌面工作空间</title></head><body></body></html>\n','assets/theme/resolved.gen.json':'{\n  "brand": {\n    "name": "Unicore",\n    "accent": "#6662ec"\n  }\n}\n','assets/brand/wordmark.svg':'<svg><text x="82" y="54">Unicore<tspan fill="#6662ec">.</tspan></text></svg>\n','apps/web/public/site.webmanifest':'{"name":"Unicore","short_name":"Unicore"}','apps/desktop/public/site.webmanifest':'{"name":"Unicore","short_name":"Unicore"}','deploy/tar/unicore':'#!/bin/sh\nunicore_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$unicore_dir/bin/server" "$@"\n','deploy/tar/unicorehelp':'#!/bin/sh\nunicore_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$unicore_dir/bin/server" help "$@"\n','deploy/tar/unicore.service':'[Unit]\nDescription=Unicore application server\n\n[Service]\nUser=unicore\nGroup=unicore\nWorkingDirectory=/var/lib/unicore\nEnvironmentFile=-/etc/unicore/unicore.env\nExecStart=/opt/unicore/current/bin/server\n','deploy/tar/nginx.conf.example':'server {\n    root /opt/unicore/current/web;\n}\n','deploy/docker/compose.yaml':'services:\n  app:\n    image: ${UNICORE_IMAGE:-unicore:local}\n    volumes:\n      - unicore_data:/data\nvolumes:\n  unicore_data:\n','deploy/docker/compose.dev.yaml':'services:\n  db:\n    environment:\n      POSTGRES_USER: unicore\n','deploy/docker/Dockerfile':'FROM scratch\nLABEL org.opencontainers.image.title="Unicore"\n','main.go':'package main // github.com/yunnuo/unicore/internal/domain\n','LICENSE':'MIT license fixture','data/private.txt':'must not copy','.env':'must not copy'};
 try{
  for(const [p,text] of Object.entries(files)){mkdirSync(dirname(join(source,p)),{recursive:true});writeFileSync(join(source,p),text);}
  const framework={contract:'packages/contracts/openapi.json',readFirst:['AGENTS.md'],profiles:{},sources:{},skills:['sample'],commands:{},contextOutput:'docs/developer/context.gen.md'};
  files['framework.manifest.json']=JSON.stringify(framework);
  files['AGENTS.md']='application instructions';
  files['packages/contracts/openapi.json']=JSON.stringify({info:{title:'Unicore platform foundation API'},paths:{},components:{schemas:{}}},null,2)+'\n';
  files['docs/public/start.md']='# Guide';
  files['.agents/skills/sample/SKILL.md']='---\nname: sample\ndescription: Fixture task\n---\n';
  const distribution={format_version:1,documents:[{source:'docs/public/start.md',target:'docs/public/start.md',audiences:['user-release','project-template','public-wiki'],slug:'Home',title:'Guide'}],template_files:Object.keys(files).filter(p=>!['data/private.txt','.env','docs/public/start.md'].includes(p))};
  distribution.template_files.push('distribution/manifest.json');
  files['distribution/manifest.json']=JSON.stringify(distribution);
  for(const [p,text] of Object.entries(files)){mkdirSync(dirname(join(source,p)),{recursive:true});writeFileSync(join(source,p),text);}
  mkdirSync(join(source,'.agents/skills'),{recursive:true});
  const git=(...args)=>execFileSync('git',['-C',source,...args],{stdio:'pipe'});
  git('init','-q');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','-qm','fixture');
  writeFileSync(join(source,'untracked.txt'),'must not copy');
  mkdirSync(join(source,'docs/04-ai'),{recursive:true});writeFileSync(join(source,'docs/04-ai/audit.md'),'must not copy');git('add','docs/04-ai/audit.md');git('-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','-qm','Add excluded fixture');
  const options={source,directory:join(root,'app'),name:'My Product',slug:'my-product',module:'example.test/team/product',bundle:'test.example.product'};
  createProject(options);
  assert.equal(JSON.parse(readFileSync(join(options.directory,'package.json'))).name,'my-product');
  const trust=JSON.parse(readFileSync(join(options.directory,'assets/updates/config.json')));assert.equal(trust.repository,'');assert.deepEqual(trust.keys,{});assert.equal(trust.allow_unsigned_platform,false);
  assert.equal(JSON.parse(readFileSync(join(options.directory,'assets/theme/tokens.json'))).brand.name,'My Product');
  const identity=JSON.parse(readFileSync(join(options.directory,'product.identity.json')));
  assert.equal(identity.product.name,'My Product');assert.equal(identity.go.module,'example.test/team/product');
  assert.equal(identity.cli.command,'my-product');assert.equal(identity.cli.opsCommand,'my-product-ops');
  assert.equal(identity.desktop.bundleId,'test.example.product');assert.equal(identity.desktop.outputName,'my-product-desktop');
  assert.equal(identity.deployment.dataDirectory,'/var/lib/my-product');
  assert.match(readFileSync(join(options.directory,'internal/buildinfo/identity.gen.go'),'utf8'),/CLIRootCommand\s+= "my-product"/);
  assert.match(readFileSync(join(options.directory,'apps/web/index.html'),'utf8'),/<title>My Product · 工作空间<\/title>/);
  assert.match(readFileSync(join(options.directory,'apps/web/admin.html'),'utf8'),/<title>My Product · 管理后台<\/title>/);
  assert.equal(JSON.parse(readFileSync(join(options.directory,'packages/contracts/openapi.json'))).info.title,'My Product platform foundation API');
  assert.equal(JSON.parse(readFileSync(join(options.directory,'apps/web/public/site.webmanifest'))).name,'My Product');
  assert.match(readFileSync(join(options.directory,'packages/web-ui/src/product.gen.ts'),'utf8'),/export const productName = "My Product";/);
  assert.equal(existsSync(join(options.directory,'deploy/tar/my-product.service')),true);
  assert.equal(existsSync(join(options.directory,'deploy/tar/unicore.service')),false);
  const service=readFileSync(join(options.directory,'deploy/tar/my-product.service'),'utf8');
  assert.match(service,/User=my-product/);assert.match(service,/\/var\/lib\/my-product/);assert.match(service,/\/etc\/my-product\/my-product\.env/);
  assert.match(readFileSync(join(options.directory,'deploy/docker/compose.yaml'),'utf8'),/MY_PRODUCT_IMAGE/);assert.match(readFileSync(join(options.directory,'deploy/docker/compose.yaml'),'utf8'),/my-product_data/);
  assert.match(readFileSync(join(options.directory,'deploy/docker/Dockerfile'),'utf8'),/org\.opencontainers\.image\.title="My Product"/);
  assert.match(readFileSync(join(options.directory,'main.go'),'utf8'),/example.test\/team\/product\/internal\/domain/);
  assert.match(readFileSync(join(options.directory,'project.provenance.json'),'utf8'),/"revision": "[0-9a-f]{40}"/);
  assert.equal(readFileSync(join(options.directory,'LICENSE'),'utf8'),'MIT license fixture');
  assert.match(readFileSync(join(options.directory,'README.md'),'utf8'),/\]\(README\.en\.md\)/);
  assert.match(readFileSync(join(options.directory,'README.en.md'),'utf8'),/My Product[\s\S]*example\.test\/team\/product[\s\S]*test\.example\.product/);
  assert.match(readFileSync(join(options.directory,'README.en.md'),'utf8'),/\]\(README\.md\)/);
  for(const p of ['.git','.env','data/private.txt','untracked.txt','docs/04-ai/audit.md'])assert.equal(existsSync(join(options.directory,p)),false);
  for(const directory of [options.directory,source,join(source,'nested')])assert.throws(()=>createProject({...options,directory}));
  assert.throws(()=>createProject({...options,directory:join(root,'bad'),module:'../../oops'}));
  writeFileSync(join(source,'main.go'),'package main // reviewed working change\n');
  assert.throws(()=>createProject({...options,directory:join(root,'dirty')}),/uncommitted/);
  assert.equal(existsSync(join(root,'dirty')),false);
  createProject({...options,directory:join(root,'reviewed'),allowDirty:true});
  const provenance=JSON.parse(readFileSync(join(root,'reviewed/project.provenance.json')));
  assert.equal(provenance.source_mode,'reviewed-working-tree');assert(provenance.input_files.some(file=>file.target==='main.go'&&file.sha256.length===64));
  rmSync(join(source,'main.go'));symlinkSync('LICENSE',join(source,'main.go'));assert.throws(()=>createProject({...options,directory:join(root,'symlink'),allowDirty:true}),/links/);
  assert.equal(existsSync(join(root,'symlink')),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
