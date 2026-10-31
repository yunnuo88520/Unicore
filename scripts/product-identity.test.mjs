// Author: yunnuo <ymz@ebox.vip>
// Description: Strict identity validation, surgical mixed-file updates, idempotent writes and read-only checks.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {applyIdentity,ciSecretPrefix,identityGenGo,loadIdentity,setJSONStringField,validateIdentity} from './product-identity.mjs';

const identity=validateIdentity({author:'yunnuo <ymz@ebox.vip>',schemaVersion:1,product:{name:'My Product',slug:'my-product'},go:{module:'example.test/team/product'},cli:{command:'my-product',opsCommand:'my-product-ops'},desktop:{bundleId:'test.example.product',outputName:'my-product-desktop'},deployment:{serviceName:'my-product',serviceUser:'my-product',installDirectory:'/opt/my-product',dataDirectory:'/var/lib/my-product',image:'my-product',volume:'my-product_data'},release:{artifactPrefix:'my-product'}});

test('identity schema rejects unsafe, unknown or domain fields',()=>{
 assert.equal(ciSecretPrefix('my-product'),'MY_PRODUCT');
 assert.throws(()=>validateIdentity({...identity,schemaVersion:2}),/schemaVersion/);
 assert.throws(()=>validateIdentity({...identity,website:{url:'https://x.test'}}),/not part of the product identity schema/);
 assert.throws(()=>validateIdentity({...identity,product:{...identity.product,slug:'Bad_Slug'}}),/product\.slug/);
 assert.throws(()=>validateIdentity({...identity,go:{module:'example.test/../team'}}),/traverse/);
 assert.throws(()=>validateIdentity({...identity,deployment:{...identity.deployment,dataDirectory:'/var/lib/../etc'}}),/traverse/);
 assert.throws(()=>validateIdentity({...identity,desktop:{...identity.desktop,bundleId:'com.wails'}}),/bundleId/);
 assert.throws(()=>validateIdentity({...identity,product:{name:identity.product.name,slug:identity.product.slug,vendor:'Yunnuo Inc'}}),/vendor/);
 assert.throws(()=>validateIdentity({...identity,cli:{command:'my-product'}}),/cli\.opsCommand is required/);
});

test('setJSONStringField rewrites exactly one field and keeps every other byte',()=>{
 const text='{\n  "author": "someone",\n  "brand": {\n    "name": "Old",\n    "accent": "#6662ec"\n  },\n  "info": {\n    "name": "nested"\n  }\n}\n';
 assert.equal(setJSONStringField(text,['brand','name'],'New Product'),text.replace('"name": "Old"','"name": "New Product"'));
 assert.match(setJSONStringField(text,['info','name'],'x'),/"name": "x"/);
 const wails='{\n  "name": "Old",\n  "outputfilename": "old-desktop",\n  "author": {\n    "name": "keepme"\n  }\n}\n';
 const renamed=setJSONStringField(wails,['name'],'New');
 assert.match(renamed,/^\{\n  "name": "New",/);
 assert.match(renamed,/"name": "keepme"/);
 assert.throws(()=>setJSONStringField(text,['brand','missing'],'x'),/matched 0 lines/);
 assert.throws(()=>setJSONStringField(text,['missing','name'],'x'),/declarations/);
});

test('applyIdentity is idempotent, preserves user fields and check mode never writes',()=>{
 const root=mkdtempSync(join(tmpdir(),'unicore-identity-'));
 try{
  const files={'assets/theme/tokens.json':'{\n  "author": "theme",\n  "brand": {\n    "name": "Old",\n    "accent": "#6662ec"\n  },\n  "modes": {}\n}\n','assets/brand/identity.json':'{\n  "author": "brand",\n  "bundleId": "old.example.product"\n}\n','cmd/desktop/wails.json':'{\n  "name": "Old",\n  "outputfilename": "old-desktop",\n  "info": {\n    "productName": "Old",\n    "productVersion": "9.9.9"\n  }\n}\n','go.mod':'module example.test/team/product\n\ngo 1.26.10\n','Makefile':'LDFLAGS := -X $(GO_MODULE)/internal/buildinfo.Version=1\n'};
  for(const [p,text] of Object.entries(files)){mkdirSync(dirname(join(root,p)),{recursive:true});writeFileSync(join(root,p),text);}
  mkdirSync(join(root,'internal/buildinfo'),{recursive:true});
  writeFileSync(join(root,'product.identity.json'),JSON.stringify(identity,null,2)+'\n');
  assert.equal(loadIdentity(root).product.slug,'my-product');
  applyIdentity(root,identity,false);
  const snapshot=Object.fromEntries([...Object.keys(files),'internal/buildinfo/identity.gen.go'].map(p=>[p,readFileSync(join(root,p),'utf8')]));
  applyIdentity(root,identity,false);
  for(const [p,text] of Object.entries(snapshot))assert.equal(readFileSync(join(root,p),'utf8'),text,`second run changed ${p}`);
  assert.equal(JSON.parse(snapshot['assets/theme/tokens.json']).brand.name,'My Product');
  assert.match(snapshot['assets/theme/tokens.json'],/#6662ec/);
  assert.equal(JSON.parse(snapshot['assets/brand/identity.json']).bundleId,'test.example.product');
  const wails=JSON.parse(snapshot['cmd/desktop/wails.json']);
  assert.equal(wails.name,'My Product');assert.equal(wails.outputfilename,'my-product-desktop');
  assert.equal(wails.info.productName,'My Product');assert.equal(wails.info.productVersion,'9.9.9');
  assert.equal(snapshot['internal/buildinfo/identity.gen.go'],identityGenGo(identity));
  writeFileSync(join(root,'assets/theme/tokens.json'),files['assets/theme/tokens.json']);
  assert.throws(()=>applyIdentity(root,identity,true),/stale/);
  assert.equal(readFileSync(join(root,'assets/theme/tokens.json'),'utf8'),files['assets/theme/tokens.json']);
  writeFileSync(join(root,'go.mod'),'module other.test/team\n');
  assert.throws(()=>applyIdentity(root,identity,false),/go\.mod module/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
