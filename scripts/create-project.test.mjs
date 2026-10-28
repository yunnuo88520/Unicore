// Author: yunnuo <ymz@ebox.vip>
// Description: Export only tracked sources, preserve licensing, customize identity and reject unsafe/overwriting destinations.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createProject} from './create-project.mjs';

test('project export and destination boundaries',()=>{
 const root=mkdtempSync(join(tmpdir(),'unicore-creator-')),source=join(root,'source');mkdirSync(source);
 const files={'go.mod':'module github.com/yunnuo/unicore\n','framework.manifest.json':'{}','package.json':'{"name":"unicore"}','assets/theme/tokens.json':'{"brand":{"name":"Unicore"}}','assets/brand/identity.json':'{"bundleId":"vip.ebox.unicore"}','cmd/desktop/wails.json':'{"name":"Unicore","info":{}}','main.go':'package main // github.com/yunnuo/unicore/internal/domain\n','LICENSE':'MIT license fixture','data/private.txt':'must not copy','.env':'must not copy'};
 try{
  for(const [p,text] of Object.entries(files)){mkdirSync(dirname(join(source,p)),{recursive:true});writeFileSync(join(source,p),text);}
  const git=(...args)=>execFileSync('git',['-C',source,...args],{stdio:'pipe'});
  git('init','-q');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','-qm','fixture');
  writeFileSync(join(source,'untracked.txt'),'must not copy');
  const options={source,directory:join(root,'app'),name:'My Product',slug:'my-product',module:'example.test/team/product',bundle:'test.example.product'};
  createProject(options);
  assert.equal(JSON.parse(readFileSync(join(options.directory,'package.json'))).name,'my-product');
  assert.equal(JSON.parse(readFileSync(join(options.directory,'assets/theme/tokens.json'))).brand.name,'My Product');
  assert.match(readFileSync(join(options.directory,'main.go'),'utf8'),/example.test\/team\/product\/internal\/domain/);
  assert.match(readFileSync(join(options.directory,'project.provenance.json'),'utf8'),/"revision": "[0-9a-f]{40}"/);
  assert.equal(readFileSync(join(options.directory,'LICENSE'),'utf8'),'MIT license fixture');
  for(const p of ['.git','.env','data/private.txt','untracked.txt'])assert.equal(existsSync(join(options.directory,p)),false);
  for(const directory of [options.directory,source,join(source,'nested')])assert.throws(()=>createProject({...options,directory}));
  assert.throws(()=>createProject({...options,directory:join(root,'bad'),module:'../../oops'}));
  symlinkSync('main.go',join(source,'link.go'));git('add','link.go');assert.throws(()=>createProject({...options,directory:join(root,'symlink')}));
  assert.equal(existsSync(join(root,'symlink')),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
