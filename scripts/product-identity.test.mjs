// Author: yunnuo <ymz@ebox.vip>
// Description: Strict identity validation, surgical mixed-file updates, idempotent writes and read-only checks.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {applyIdentity,ciSecretPrefix,identityGenGo,loadIdentity,setHTMLString,setJSONStringField,validateIdentity} from './product-identity.mjs';

const identity=validateIdentity({author:'yunnuo <ymz@ebox.vip>',schemaVersion:1,product:{name:'My Product',slug:'my-product',description:'基于 Unicore 构建'},go:{module:'example.test/team/product'},cli:{command:'my-product',opsCommand:'my-product-ops',description:'My Product CLI'},desktop:{bundleId:'test.example.product',outputName:'my-product-desktop'},deployment:{serviceName:'my-product',serviceUser:'my-product',installDirectory:'/opt/my-product',dataDirectory:'/var/lib/my-product',image:'my-product',volume:'my-product_data'},release:{artifactPrefix:'my-product'}});

const files={
 'assets/theme/tokens.json':'{\n  "author": "theme",\n  "brand": {\n    "name": "Old",\n    "accent": "#6662ec"\n  },\n  "modes": {}\n}\n',
 'assets/theme/resolved.gen.json':'{\n  "brand": {\n    "name": "Old",\n    "accent": "#6662ec"\n  },\n  "light": {}\n}\n',
 'assets/brand/wordmark.svg':'<svg><text x="82" y="54">Old<tspan fill="#6662ec">.</tspan></text></svg>\n',
 'assets/brand/identity.json':'{\n  "author": "brand",\n  "bundleId": "old.example.product"\n}\n',
 'cmd/desktop/wails.json':'{\n  "name": "Old",\n  "outputfilename": "old-desktop",\n  "info": {\n    "productName": "Old",\n    "productVersion": "9.9.9",\n    "comments": "Old · Go + React"\n  }\n}\n',
 'package.json':'{\n  "name": "old",\n  "version": "9.9.9"\n}\n',
 'packages/contracts/openapi.json':'{\n  "info": {\n    "title": "Old platform foundation API"\n  },\n  "paths": {}\n}\n',
 'apps/web/index.html':'<!doctype html><html><head><meta name="description" content="Old · stale" /><title>Old · 工作空间</title></head><body></body></html>\n',
 'apps/web/admin.html':'<!doctype html><html><head><meta name="description" content="Old · stale" /><title>Old · 管理后台</title></head><body></body></html>\n',
 'apps/desktop/index.html':'<!doctype html><html><head><title>Old · 桌面工作空间</title></head><body></body></html>\n',
 'apps/web/public/site.webmanifest':'{"name":"Old","short_name":"Old"}',
 'apps/desktop/public/site.webmanifest':'{"name":"Old","short_name":"Old"}',
 'deploy/tar/unicore':'#!/bin/sh\nunicore_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\n',
 'deploy/tar/unicorehelp':'#!/bin/sh\nunicore_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\n',
 'deploy/tar/unicore.service':'[Unit]\nDescription=Unicore application server\n\n[Service]\nUser=unicore\nGroup=unicore\nWorkingDirectory=/var/lib/unicore\nEnvironmentFile=-/etc/unicore/unicore.env\nExecStart=/opt/unicore/current/bin/server\n',
 'deploy/tar/nginx.conf.example':'server {\n    root /opt/unicore/current/web;\n}\n',
 'deploy/docker/compose.yaml':'services:\n  app:\n    image: ${UNICORE_IMAGE:-unicore:local}\n    volumes:\n      - unicore_data:/data\nvolumes:\n  unicore_data:\n',
 'deploy/docker/compose.dev.yaml':'services:\n  db:\n    environment:\n      POSTGRES_USER: unicore\n',
 'deploy/docker/Dockerfile':'FROM scratch\nLABEL org.opencontainers.image.title="Unicore"\n',
 'docs/product/guide.md':'# Guide\n\nRun unicore-ops backup or deploy/tar/unicore; service unicore.service; volume unicore_data.\n',
 'distribution/manifest.json':'{"documents":[{"source":"docs/product/guide.md","target":"docs/product/guide.md","audiences":["project-template"]}]}',
 'go.mod':'module example.test/team/product\n\ngo 1.26.10\n',
 'Makefile':'LDFLAGS := -X $(GO_MODULE)/internal/buildinfo.Version=1\n',
};

function project(){
 const root=mkdtempSync(join(tmpdir(),'unicore-identity-'));
 for(const [p,text] of Object.entries(files)){mkdirSync(dirname(join(root,p)),{recursive:true});writeFileSync(join(root,p),text);}
 mkdirSync(join(root,'internal/buildinfo'),{recursive:true});
 mkdirSync(join(root,'packages/web-ui/src'),{recursive:true});
 writeFileSync(join(root,'product.identity.json'),JSON.stringify(identity,null,2)+'\n');
 return root;
}

test('identity schema rejects unsafe, unknown or domain fields',()=>{
 assert.equal(ciSecretPrefix('my-product'),'MY_PRODUCT');
 assert.throws(()=>validateIdentity({...identity,schemaVersion:2}),/schemaVersion/);
 assert.throws(()=>validateIdentity({...identity,website:{url:'https://x.test'}}),/not part of the product identity schema/);
 assert.throws(()=>validateIdentity({...identity,product:{...identity.product,slug:'Bad_Slug'}}),/product\.slug/);
 assert.throws(()=>validateIdentity({...identity,go:{module:'example.test/../team'}}),/traverse/);
 assert.throws(()=>validateIdentity({...identity,deployment:{...identity.deployment,dataDirectory:'/var/lib/../etc'}}),/traverse/);
 assert.throws(()=>validateIdentity({...identity,desktop:{...identity.desktop,bundleId:'com.wails'}}),/bundleId/);
 assert.throws(()=>validateIdentity({...identity,cli:{...identity.cli,description:'bad\nline'}}),/cli\.description/);
 assert.throws(()=>validateIdentity({...identity,cli:{command:'my-product'}}),/cli\.opsCommand is required/);
});

test('setJSONStringField and setHTMLString rewrite exactly one occurrence',()=>{
 const text='{\n  "author": "someone",\n  "brand": {\n    "name": "Old",\n    "accent": "#6662ec"\n  },\n  "info": {\n    "name": "nested"\n  }\n}\n';
 assert.equal(setJSONStringField(text,['brand','name'],'New Product'),text.replace('"name": "Old"','"name": "New Product"'));
 assert.match(setJSONStringField(text,['info','name'],'x'),/"name": "x"/);
 const wails='{\n  "name": "Old",\n  "author": {\n    "name": "keepme"\n  }\n}\n';
 const renamed=setJSONStringField(wails,['name'],'New');
 assert.match(renamed,/^\{\n  "name": "New",/);
 assert.match(renamed,/"name": "keepme"/);
 assert.throws(()=>setJSONStringField(text,['brand','missing'],'x'),/matched 0 lines/);
 assert.throws(()=>setJSONStringField(text,['missing','name'],'x'),/declarations/);
 const html='<html><title>Old</title><title>Old</title></html>';
 assert.throws(()=>setHTMLString(html,'<title>[^<]*</title>','<title>New</title>'),/matched 2 occurrences/);
 assert.equal(setHTMLString('<meta name="description" content="Old"/>','(<meta name="description" content=")[^"]*(")','$1New$2'),'<meta name="description" content="New"/>');
});

test('applyIdentity applies every projection idempotently and check mode never writes',()=>{
 const root=project();
 try{
  assert.equal(loadIdentity(root).product.slug,'my-product');
  applyIdentity(root,identity,false);
  const renamed=['deploy/tar/unicore','deploy/tar/unicorehelp','deploy/tar/unicore.service'];
  const paths=[...Object.keys(files).filter(p=>!renamed.includes(p)),'deploy/tar/my-product','deploy/tar/my-producthelp','deploy/tar/my-product.service','internal/buildinfo/identity.gen.go','packages/web-ui/src/product.gen.ts'];
  const snapshot=Object.fromEntries(paths.map(p=>[p,readFileSync(join(root,p),'utf8')]));
  applyIdentity(root,identity,false);
  for(const [p,text] of Object.entries(snapshot))assert.equal(readFileSync(join(root,p),'utf8'),text,`second run changed ${p}`);
  assert.equal(JSON.parse(snapshot['assets/theme/tokens.json']).brand.name,'My Product');
  assert.equal(JSON.parse(snapshot['assets/theme/resolved.gen.json']).brand.name,'My Product');
  assert.match(snapshot['assets/brand/wordmark.svg'],/<text x="82" y="54">My Product<tspan/);
  assert.match(snapshot['assets/theme/tokens.json'],/#6662ec/);
  assert.equal(JSON.parse(snapshot['assets/brand/identity.json']).bundleId,'test.example.product');
  const wails=JSON.parse(snapshot['cmd/desktop/wails.json']);
  assert.equal(wails.name,'My Product');assert.equal(wails.outputfilename,'my-product-desktop');
  assert.equal(wails.info.productName,'My Product');assert.equal(wails.info.productVersion,'9.9.9');
  assert.equal(JSON.parse(snapshot['package.json']).name,'my-product');
  assert.equal(JSON.parse(snapshot['package.json']).version,'9.9.9');
  assert.equal(JSON.parse(snapshot['packages/contracts/openapi.json']).info.title,'My Product platform foundation API');
  assert.match(snapshot['apps/web/index.html'],/<title>My Product · 工作空间<\/title>/);
  assert.match(snapshot['apps/web/index.html'],/content="My Product · 基于 Unicore 构建"/);
  assert.match(snapshot['apps/web/admin.html'],/<title>My Product · 管理后台<\/title>/);
  assert.match(snapshot['apps/desktop/index.html'],/<title>My Product · 桌面工作空间<\/title>/);
  assert.equal(JSON.parse(snapshot['apps/web/public/site.webmanifest']).name,'My Product');
  assert.match(snapshot['packages/web-ui/src/product.gen.ts'],/export const productName = "My Product";/);
  assert.match(snapshot['internal/buildinfo/identity.gen.go'],/CLIRootDescription = "My Product CLI"/);
  assert.equal(existsSync(join(root,'deploy/tar/old.service')),false);
  assert.match(snapshot['deploy/tar/my-product.service'],/User=my-product/);
  assert.match(snapshot['deploy/tar/my-product.service'],/\/var\/lib\/my-product/);
  assert.match(snapshot['deploy/tar/my-product.service'],/\/etc\/my-product\/my-product\.env/);
  assert.match(snapshot['deploy/tar/my-product.service'],/Description=My Product application server/);
  assert.match(snapshot['deploy/tar/my-product'],/my-product_dir/);
  assert.match(snapshot['deploy/docker/compose.yaml'],/MY_PRODUCT_IMAGE/);
  assert.match(snapshot['deploy/docker/compose.yaml'],/my-product_data/);
  assert.match(snapshot['deploy/docker/compose.dev.yaml'],/POSTGRES_USER: my-product/);
  assert.match(snapshot['deploy/tar/nginx.conf.example'],/root \/opt\/my-product\/current\/web;/);
  assert.match(snapshot['deploy/docker/Dockerfile'],/org\.opencontainers\.image\.title="My Product"/);
  assert.match(snapshot['docs/product/guide.md'],/Run my-product-ops backup or deploy\/tar\/my-product; service my-product\.service; volume my-product_data\./);
  // check mode is read-only: a stale token field fails without writing
  writeFileSync(join(root,'assets/theme/tokens.json'),files['assets/theme/tokens.json']);
  assert.throws(()=>applyIdentity(root,identity,true),/stale/);
  assert.equal(readFileSync(join(root,'assets/theme/tokens.json'),'utf8'),files['assets/theme/tokens.json']);
  writeFileSync(join(root,'go.mod'),'module other.test/team\n');
  assert.throws(()=>applyIdentity(root,identity,false),/go\.mod module/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
