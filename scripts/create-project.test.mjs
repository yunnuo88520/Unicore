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
 const files={'go.mod':'module github.com/yunnuo/unicore\n','framework.manifest.json':'{}','assets/updates/config.json':'{"repository":"upstream/repo","keys":{"upstream":"test"}}','package.json':'{"name":"unicore"}','assets/theme/tokens.json':'{"brand":{"name":"Unicore"}}','assets/brand/identity.json':'{"bundleId":"vip.ebox.unicore"}','cmd/desktop/wails.json':'{"name":"Unicore","info":{}}','main.go':'package main // github.com/yunnuo/unicore/internal/domain\n','LICENSE':'MIT license fixture','data/private.txt':'must not copy','.env':'must not copy'};
 try{
  for(const [p,text] of Object.entries(files)){mkdirSync(dirname(join(source,p)),{recursive:true});writeFileSync(join(source,p),text);}
  const framework={contract:'packages/contracts/openapi.json',readFirst:['AGENTS.md'],profiles:{},sources:{},skills:['sample'],commands:{},contextOutput:'docs/developer/context.gen.md'};
  files['framework.manifest.json']=JSON.stringify(framework);
  files['AGENTS.md']='application instructions';
  files['packages/contracts/openapi.json']=JSON.stringify({paths:{},components:{schemas:{}}});
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
  assert.match(readFileSync(join(options.directory,'main.go'),'utf8'),/example.test\/team\/product\/internal\/domain/);
  assert.match(readFileSync(join(options.directory,'project.provenance.json'),'utf8'),/"revision": "[0-9a-f]{40}"/);
  assert.equal(readFileSync(join(options.directory,'LICENSE'),'utf8'),'MIT license fixture');
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
