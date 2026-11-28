// Author: yunnuo <ymz@ebox.vip>
// Description: Exercise the real distributed source tree, including mapped files, product branding and repeatable upstream merges.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {snapshotFramework} from '../tests/tooling/framework-source.mjs';
import {createProject} from './create-project.mjs';
import {updateTemplateBranch} from './framework-template.mjs';
import {checkTemplate,syncTemplate} from './framework-sync.mjs';
import {applyIdentity,loadIdentity} from './product-identity.mjs';
import {scanResiduals} from './check-product-residuals.mjs';
import {renderAIContext} from './ai-context.mjs';
import {generateMigrations} from './generate-migrations.mjs';

const repository=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const derived=existsSync(join(repository,'project.provenance.json'));
const env={...process.env,GIT_AUTHOR_NAME:'Template regression',GIT_AUTHOR_EMAIL:'template@example.test',GIT_COMMITTER_NAME:'Template regression',GIT_COMMITTER_EMAIL:'template@example.test'};
const git=(root,...args)=>execFileSync('git',['-C',root,...args],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();

test('the real exported template retains the complete migration catalog and generated metadata', {skip:derived?'Framework publisher regression runs in the upstream/template source checkout':false},()=>{
 const {directory,source}=snapshotFramework(repository);
 try{
  // Validate the exported bytes, not the source checkout. Packaging and fresh
  // application startup need every dialect referenced by the framework catalog.
  // Downstream business modules are application-owned, outside this whitelist.
  generateMigrations(source,true);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

// Application checkouts consume the template; publishing a new framework is a
// maintainer operation. Their normal contract, Go, frontend and tooling checks still run.
test('real exported product renames, retains business/theme and merges two framework updates', {skip:derived?'Framework publisher regression runs in the upstream/template source checkout':false},()=>{
 const {directory,source}=snapshotFramework(repository);
 const oldEnv={};for(const key of Object.keys(env).filter(key=>key.startsWith('GIT_AUTHOR_')||key.startsWith('GIT_COMMITTER_'))){oldEnv[key]=process.env[key];process.env[key]=env[key];}
 try{
  const baseline=updateTemplateBranch(source);
  const app=join(directory,'app');
  createProject({source,directory:app,name:'Harbor.Desk',slug:'harbor-desk',module:'example.test/team/harbor-desk',bundle:'test.example.harbor',repository:'https://github.com/example/harbor-desk'});
  assert.equal(git(app,'rev-parse','HEAD^'),baseline.commit);
  assert.equal(JSON.parse(readFileSync(join(app,'project.provenance.json'))).repository,'https://github.com/example/harbor-desk');
  assert.equal(git(app,'remote','get-url','--push','framework'),'disabled://framework');
  assert.equal(git(app,'remote','get-url','origin'),'https://github.com/example/harbor-desk.git');
  assert.ok(existsSync(join(app,'docs/product/framework-upgrade.md')));
  // Inspect the materialized application's instruction routes, not just the publisher whitelist.
  const skillPath='.agents/skills/framework-upstream/SKILL.md';
  const appManifest=JSON.parse(readFileSync(join(app,'framework.manifest.json')));
  assert.ok(appManifest.skills.includes('framework-upstream'));
  assert.equal(readFileSync(join(app,skillPath),'utf8'),readFileSync(join(repository,skillPath),'utf8'));
  const guide='docs/product/framework-upgrade.md';
  const agentGuide=readFileSync(join(app,'AGENTS.md'),'utf8');
  assert.ok(agentGuide.includes(skillPath));
  assert.ok(agentGuide.includes(guide));
  // Agents start at the project root, including when a task only asks for app work.
  assert.match(agentGuide,/`project\.provenance\.json`[\s\S]*先查该上游已有的 Issues 和 PR/);
  assert.match(agentGuide,/上游 Issue[\s\S]*草稿及目标仓库/);
  assert.match(agentGuide,/修复已进入 `framework-template`[\s\S]*`pnpm framework:sync`/);
  assert.match(agentGuide,/业务模块的操作和管理页面默认只放在用户工作台的业务区/);
  assert.match(agentGuide,/只有需求明确指定某个业务页面在此呈现时/);
  assert.match(agentGuide,/\(docs\/product\/development\.md#业务导航规划\)/);
  const appDevelopment=readFileSync(join(app,'docs/product/development.md'),'utf8');
  assert.match(appDevelopment,/^### 业务导航规划$/m);
  assert.match(readFileSync(join(app,'docs/product/development.md'),'utf8'),/上游反馈流程/);
  const appSkill=readFileSync(join(app,skillPath),'utf8');
  assert.match(appSkill,/已有 Issue\/PR/);
  assert.match(appSkill,/最小复现/);
  assert.match(appSkill,/build\//);
  const appUpgrade=readFileSync(join(app,guide),'utf8');
  assert.match(appUpgrade,/应用反馈与框架通用问题/);

  const context=renderAIContext(app);
  assert.ok(context.content.includes('../../'+skillPath));
  assert.equal(appManifest.sources.frameworkUpgrade,guide);
  assert.equal(appManifest.commands.frameworkCheck,'pnpm framework:check');
  assert.equal(appManifest.commands.frameworkSync,'pnpm framework:sync');
  assert.match(readFileSync(join(app,'SUPPORT.md'),'utf8'),/https:\/\/github.com\/example\/harbor-desk\/issues/);
  const deployment=readFileSync(join(app,'docs/product/deployment.md'),'utf8');
  assert.match(deployment,/git clone https:\/\/github.com\/example\/harbor-desk.git harbor-desk-source/);
  assert.match(deployment,/cd harbor-desk-source/);
  assert.match(deployment,/SCHEMA public TO "harbor-desk"/);
  assert.match(deployment,/HARBOR_DESK_IMAGE/);
  applyIdentity(app,loadIdentity(app),true);
  assert.deepEqual(scanResiduals(app),[]);
  const sql=readFileSync(join(app,'migrations/platform/sqlite/0001_initial.sql'));
  assert.deepEqual(sql,readFileSync(join(repository,'migrations/platform/sqlite/0001_initial.sql')));
  mkdirSync(join(app,'internal/business'),{recursive:true});
  const ownership=loadIdentity(app);ownership.author='Application Team <team@example.test>';
  writeFileSync(join(app,'product.identity.json'),JSON.stringify(ownership,null,2)+'\n');
  const business='// Author: Application Team <team@example.test>\npackage business\nimport "example.test/team/harbor-desk/internal/domain"\ntype Ticket struct { domain.BaseEntity; Subject string }\n';
  writeFileSync(join(app,'internal/business/ticket.go'),business);
  const theme=JSON.parse(readFileSync(join(app,'assets/theme/tokens.json')));theme.brand.accent='#1177ee';
  writeFileSync(join(app,'assets/theme/tokens.json'),JSON.stringify(theme,null,2)+'\n');
  git(app,'add','-A');git(app,'commit','-qm','Add independent ticket business and custom theme');
  execFileSync(process.execPath,['scripts/check-authors.mjs'],{cwd:app,env,stdio:'pipe'});
  git(app,'remote','set-url','framework',source);
  for(const number of [1,2]){
   if(number===2){
    const metadata=JSON.parse(readFileSync(join(app,'project.provenance.json')));delete metadata.repository;
    writeFileSync(join(app,'project.provenance.json'),JSON.stringify(metadata,null,2)+'\n');
    git(app,'remote','set-url','origin','git@github.com:example/harbor-desk.git');
    git(app,'add','-A');git(app,'commit','-qm','Exercise older provenance with an SSH origin');
   }
   const path=join(source,'internal/adapter/cli/command.go');
   writeFileSync(path,readFileSync(path,'utf8')+`\n// Upstream regression patch ${number}: github.com/yunnuo/unicore/internal/domain\n`);
   git(source,'add','-A');git(source,'commit','-qm',`Framework regression patch ${number}`);
   updateTemplateBranch(source);
   assert.equal(checkTemplate(app).up_to_date,false);
   syncTemplate(app);
   const identity=loadIdentity(app);
   assert.equal(identity.author,'Application Team <team@example.test>');
   assert.equal(identity.product.name,'Harbor.Desk');assert.equal(identity.go.module,'example.test/team/harbor-desk');
   assert.equal(JSON.parse(readFileSync(join(app,'assets/theme/tokens.json'))).brand.accent,'#1177ee');
   assert.equal(readFileSync(join(app,'internal/business/ticket.go'),'utf8'),business);
   assert.match(readFileSync(join(app,'internal/adapter/cli/command.go'),'utf8'),new RegExp(`patch ${number}: example.test/team/harbor-desk/internal/domain`));
   assert.deepEqual(readFileSync(join(app,'migrations/platform/sqlite/0001_initial.sql')),sql);
   assert.ok(existsSync(join(app,'deploy/tar/harbor-desk.service')));
   assert.equal(existsSync(join(app,'deploy/tar/unicore.service')),false);
   assert.match(readFileSync(join(app,'docs/product/deployment.md'),'utf8'),/https:\/\/github.com\/example\/harbor-desk/);
   applyIdentity(app,identity,true);assert.deepEqual(scanResiduals(app),[]);
   assert.equal(checkTemplate(app).up_to_date,true);assert.equal(git(app,'status','--porcelain'),'');
  }
 }finally{
  rmSync(directory,{recursive:true,force:true});
  for(const [key,value] of Object.entries(oldEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
});

test('exported API registrations enforce the full security matrix for a newly declared root', {timeout:180000,skip:derived?'Framework exporter regression runs in the upstream source checkout':false},()=>{
 const {directory,source}=snapshotFramework(repository);
 try{
  // Add operations to the exported authoritative contract, then compile the
  // real embedded-contract server. No production v2 aliases or policy mocks.
  const path=join(source,'packages/contracts/openapi.json');
  const spec=JSON.parse(readFileSync(path));
  const operation=(oldPath,method,id,patch={})=>{
   const result=structuredClone(spec.paths[oldPath][method]);
   result.operationId=id;Object.assign(result['x-unicore'],patch);return result;
  };
  spec.paths['/api/v2/probe']={get:operation('/api/v1/notes','get','fixtureV2Read'),post:operation('/api/v1/notes','post','fixtureV2Write',{permissions:['notes:update']})};
  spec.paths['/api/v2/admin/probe']={get:operation('/api/v1/admin/announcements','get','fixtureV2Admin')};
  spec.paths['/api/v2/health/live']={get:operation('/api/v1/health/live','get','fixtureV2Health')};
  spec.paths['/api/v2/bootstrap']={get:operation('/api/v1/bootstrap','get','fixtureV2Bootstrap')};
  spec.paths['/api/v2/standalone']={get:operation('/api/v1/settings','get','fixtureV2Standalone')};
  spec.paths['/api/v2/auth/login']={post:operation('/api/v1/auth/login','post','fixtureV2Login')};
  spec.paths['/api/v2/account/tokens']={get:operation('/api/v1/account/tokens','get','fixtureV2Credentials')};
  writeFileSync(path,JSON.stringify(spec,null,2)+'\n');
  execFileSync(process.execPath,['scripts/generate-contracts.mjs'],{cwd:source,stdio:'pipe',timeout:60000});
  const generated=readFileSync(join(source,'packages/contracts/src/operations.gen.ts'),'utf8');
  assert.match(generated,/"path": "\/api\/v2\/probe"/);
  try{
   execFileSync('go',['test','-race','-tags','api_root_fixture','./internal/adapter/http','-run','^TestRegisteredAPIRootContractFixture$','-count=1','-v'],{cwd:source,stdio:'pipe',timeout:150000});
  }catch(error){throw new Error(`API root integration failed:\n${error.stdout??''}\n${error.stderr??''}`,{cause:error});}
 }finally{rmSync(directory,{recursive:true,force:true});}
});
