// Author: yunnuo <ymz@ebox.vip>
// Description: Create a genuinely renamed application, customize it like a real downstream
// (non-default brand accent, an independent business migration namespace and its module
// descriptor) and run its own full checks and builds, without changing or publishing the
// framework checkout. Modes: full (default) runs docs, tests and Web/CLI/ops builds; desktop
// runs the native desktop build, packaging and packaged-entry verification on a native runner,
// proving the exported whitelist keeps every desktop input (Objective-C bridge files, embedded
// images, DMG resources, packaging entry points); upgrade creates the application from a real
// previous release template (previous tag's source with its own freshly generated
// framework-template), commits the same customization and syncs to the current template, proving
// business sources, theme, module, migrations and the author policy survive a real upgrade with
// a verifiable common ancestor and a pre-sync backup branch.
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {snapshotFramework,verificationGitEnv} from '../tests/tooling/framework-source.mjs';
import {updateTemplateBranch} from './framework-template.mjs';
import {createProject} from './create-project.mjs';
import {checkTemplate,syncTemplate,continueTemplateSync} from './framework-sync.mjs';

const mode=process.argv[2]??'full';
if(!['full','desktop','upgrade'].includes(mode)) throw Error('Use node scripts/verify-derived-project.mjs [full|desktop|upgrade] [<old-tag>]');
const repository=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(existsSync(join(repository,'project.provenance.json'))) throw Error('Run this publisher verification in the framework source checkout; use make test in an application.');
Object.assign(process.env,verificationGitEnv());
mkdirSync(join(repository,'build'),{recursive:true});
const output=mkdtempSync(join(repository,'build/derived-verification-'));
const app=join(output,'application');
let fixture=null,oldTemplate=null;
const git=(...args)=>execFileSync('git',['--no-optional-locks','-C',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
// The application team owns its identity: business sources (module descriptor, SQL)
// carry their own author header, and the author-policy checks accept it via identity.
const goModule='example.test/verification/harbor-desk';
const drillAuthor='Drill Team <drill@example.test>';
// Downstream customization exactly where framework tests used to hardcode defaults:
// a non-default brand accent and an independent business migration namespace with its
// module descriptor, all authored by the application team.
function editJSON(root,path,fn){const full=join(root,path);const value=JSON.parse(readFileSync(full,'utf8'));fn(value);writeFileSync(full,JSON.stringify(value,null,2)+'\n');}
function addWorkorders(){
  editJSON(app,'assets/theme/tokens.json',tokens=>{tokens.brand.accent='#1177ee';});
  for(const dialect of ['sqlite','postgres','mysql']){
    const directory=join(app,'migrations/modules/workorders',dialect);
    mkdirSync(directory,{recursive:true});
    writeFileSync(join(directory,'0001_initial.sql'),'-- Author: Drill Team <drill@example.test>\nCREATE TABLE workorder_requests (id INTEGER PRIMARY KEY, subject TEXT NOT NULL);\n');
  }
  editJSON(app,'migrations/catalog.json',catalog=>{
    catalog.namespaces.push({id:'module.workorders',depends_on:['core'],migrations:[{version:1,files:{sqlite:'modules/workorders/sqlite/0001_initial.sql',postgres:'modules/workorders/postgres/0001_initial.sql',mysql:'modules/workorders/mysql/0001_initial.sql'}}]});
    for(const profile of ['web-platform','web-standalone','desktop']) catalog.profiles[profile].namespaces.push('module.workorders');
  });
  mkdirSync(join(app,'internal/modules/workorders'),{recursive:true});
  writeFileSync(join(app,'internal/modules/workorders/module.go'),`// Author: Drill Team <drill@example.test>\n// Description: Workorders module descriptor for the derived-application regression drill.\npackage workorders\n\nimport (\n\t"${goModule}/internal/contracts"\n\t"${goModule}/internal/module"\n)\n\n// Module aggregates the workorders facts the platform registries consume. The HTTP\n// mount is left to the derived application per docs/product/development.md.\nvar Module = module.Module{\n\tSlug: "workorders",\n\tTitle: "工单",\n\tDescription: "派生应用回归演练业务：独立迁移命名空间与模块描述符",\n\tIcon: "ClipboardList",\n\tOrder: 1,\n\tPermissions: []contracts.PermissionDefinition{\n\t\t{ID: "workorders:access", Name: "使用工单", Description: "访问工单页面", Group: "业务权限", Assignable: true},\n\t},\n\tNavigation: []contracts.NavigationPage{\n\t\t{ID: "workorders", Surfaces: []string{"administrator"}, Permission: "workorders:access"},\n\t},\n\tMigrations: "workorders",\n\tEnabled: true,\n}\n`);
  editJSON(app,'internal/module/manifest.json',manifest=>{manifest.modules.push({slug:'workorders',edition:'',default:true,title:'工单'});});
}
// A real downstream re-applies its own customization when upstream also moved a file;
// catalog.json is the one shared file the drill owns additions to.
function reapplyWorkordersCatalog(root){editJSON(root,'migrations/catalog.json',catalog=>{if(!catalog.namespaces.some(n=>n.id==='module.workorders'))catalog.namespaces.push({id:'module.workorders',depends_on:['core'],migrations:[{version:1,files:{sqlite:'modules/workorders/sqlite/0001_initial.sql',postgres:'modules/workorders/postgres/0001_initial.sql',mysql:'modules/workorders/mysql/0001_initial.sql'}}]});for(const profile of ['web-platform','web-standalone','desktop'])if(!catalog.profiles[profile].namespaces.includes('module.workorders'))catalog.profiles[profile].namespaces.push('module.workorders');});}

try{
  if(mode==='upgrade'){
    // The upgrade path starts from a real previous template: clone the previous
    // release tag's source (single branch, template ref stripped) and generate its
    // own framework-template there, exactly like the maintainer did at that release.
    // "Previous" means a version below the checkout's own VERSION: a dev branch that
    // merged the current release still has that release tag as its nearest ancestor.
    let oldRef=process.argv[3]??null;
    if(!oldRef){
      const current=readFileSync(join(repository,'VERSION'),'utf8').trim();
      const [cx,cy,cz]=current.split('.').map(Number);
      const older=tag=>{const [x,y,z]=tag.replace(/^v/,'').split('.').map(Number);return x<cx||(x===cx&&(y<cy||(y===cy&&z<cz)));};
      oldRef=git(repository,'tag','-l','v*','--sort=-v:refname').split('\n').find(older);
      if(!oldRef) throw Error('No release tag below the current VERSION exists; pass one explicitly: node scripts/verify-derived-project.mjs upgrade <tag>');
    }
    const oldSource=join(output,'old-source');
    execFileSync('git',['clone','--quiet','--no-hardlinks','--single-branch',repository,oldSource],{stdio:['ignore','pipe','pipe']});
    git(oldSource,'checkout','--detach',oldRef);
    // The old template roots its own lineage here: the published template ref must
    // not leak in through origin, or the old template would chain onto the new one.
    git(oldSource,'remote','remove','origin');
    oldTemplate=updateTemplateBranch(oldSource).commit;
    createProject({source:oldSource,directory:app,name:'Harbor Desk',slug:'harbor-desk',module:goModule,bundle:'test.example.harbordesk',repository:'https://github.com/example/harbor-desk',author:drillAuthor});
    console.log(`Verifying upgrade from ${oldRef} (template ${oldTemplate.slice(0,12)}): ${app}`);
  }else{
    fixture=snapshotFramework(repository);
    updateTemplateBranch(fixture.source);
    createProject({source:fixture.source,directory:app,name:'Harbor Desk',slug:'harbor-desk',module:goModule,bundle:'test.example.harbordesk',repository:'https://github.com/example/harbor-desk',author:drillAuthor});
    console.log(`Verifying renamed application (${mode}): ${app}`);
  }
  // Windows spawn refuses .cmd shims without a shell (Node EINVAL, CVE-2024-27980);
  // resolve pnpm through cmd.exe there, keep direct exec on POSIX.
  const windowsShell=process.platform==='win32';
  const run=(command,args,cwd=app)=>execFileSync(command,args,{cwd,env:{...process.env,CI:'true'},stdio:'inherit',shell:windowsShell});
  if(mode==='upgrade'){
    addWorkorders();
    git(app,'add','-A');
    git(app,'commit','-qm','Add workorders business, custom theme and application author');
    const moduleGo=readFileSync(join(app,'internal/modules/workorders/module.go'));
    const businessSQL=readFileSync(join(app,'migrations/modules/workorders/sqlite/0001_initial.sql'));
    const preSyncHead=git(app,'rev-parse','HEAD');
    // The current template must CONTINUE the old lineage, exactly like published
    // cross-release templates, or the sync would lose its common ancestor.
    fixture=snapshotFramework(repository);
    git(fixture.source,'fetch',join(output,'old-source'),'refs/heads/framework-template:refs/heads/framework-template');
    const newTemplate=updateTemplateBranch(fixture.source).commit;
    git(app,'remote','set-url','framework',fixture.source);
    const check=checkTemplate(app);
    if(check.up_to_date) throw Error('upgrade drill expected a pending template update');
    if(check.conflict_files?.length) console.log(`Preview conflicts (resolved below like a real downstream): ${check.conflict_files.join(', ')}`);
    let report;
    try{report=syncTemplate(app);}
    catch(error){
      if(!/Upstream merge conflicts/.test(error.message)) throw error;
      // Resolve like a real downstream: product-owned surfaces keep our side; every
      // framework file takes upstream, and the catalog additions get re-applied.
      const stage=error.message.match(/files in (.+), then run/)?.[1];
      if(!stage) throw error;
      const ours=new Set(['README.md','README.en.md','assets/theme/tokens.json']);
      const conflicted=error.message.split('\n').slice(1).map(line=>line.trim()).filter(Boolean);
      for(const path of conflicted) git(stage,'checkout',ours.has(path)?'--ours':'--theirs','--',path);
      if(conflicted.includes('migrations/catalog.json')) reapplyWorkordersCatalog(stage);
      for(const path of conflicted) git(stage,'add','--',path);
      report=continueTemplateSync(app);
    }
    // After the sync HEAD descends from both sides, so the verifiable ancestor of the
    // upgrade is the pre-sync application commit's merge base with the new template.
    if(git(app,'merge-base',preSyncHead,newTemplate)!==oldTemplate) throw Error(`sync common ancestor is not the old template commit ${oldTemplate.slice(0,12)}`);
    if(!report.backup_branch?.startsWith('backup/pre-sync-')||git(app,'rev-parse','--verify',report.backup_branch)!==preSyncHead) throw Error(`backup branch ${report.backup_branch} does not preserve the pre-sync commit`);
    if(Buffer.compare(readFileSync(join(app,'internal/modules/workorders/module.go')),moduleGo)!==0) throw Error('module descriptor changed during sync');
    if(Buffer.compare(readFileSync(join(app,'migrations/modules/workorders/sqlite/0001_initial.sql')),businessSQL)!==0) throw Error('business migration changed during sync');
    if(JSON.parse(readFileSync(join(app,'assets/theme/tokens.json'),'utf8')).brand.accent!=='#1177ee') throw Error('custom brand accent lost in sync');
    if(JSON.parse(readFileSync(join(app,'product.identity.json'),'utf8')).author!==drillAuthor) throw Error('application author lost in sync');
    console.log(`Synchronized to template ${newTemplate.slice(0,12)}; backup ${report.backup_branch}; ${report.files_changed.length} upstream files`);
    rmSync(join(output,'old-source'),{recursive:true,force:true});
  }else if(mode==='full'){
    // Desktop mode packages the untouched template export: adding the workorders
    // customization here would leave the committed migration metadata stale, because
    // this mode never runs make docs to regenerate it.
    addWorkorders();
  }
  run('pnpm',['install','--frozen-lockfile']);
  if(mode==='full'||mode==='upgrade'){
    run('make',['docs']);
    run('make',['test']);
    // The customization must survive generation and be reflected in the artifacts.
    const resolved=JSON.parse(readFileSync(join(app,'assets/theme/resolved.gen.json'),'utf8'));
    if(resolved.brand.accent!=='#1177ee') throw Error('custom brand accent did not survive theme generation');
    const catalogGo=readFileSync(join(app,'migrations/catalogdata/catalog.gen.go'),'utf8');
    if(!catalogGo.includes('module.workorders')) throw Error('workorders namespace did not survive catalog generation');
    run('make',['build-web','build-cli','build-ops']);
    run(join(app,'build/bin',process.platform==='win32'?'harbor-desk.exe':'harbor-desk'),['--help']);
    run(process.execPath,['scripts/check-authors.mjs']);
    if(mode==='full'){
      writeFileSync(join(output,'result.txt'),'PASS renamed application: docs, full tests, Web/CLI/ops builds and renamed CLI entry point on a customized application\n');
    }else{
      writeFileSync(join(output,'result.txt'),`PASS upgraded application: real old-template sync kept business sources, theme, migrations and authorship; docs, full tests and builds pass with ancestor ${oldTemplate.slice(0,12)} and backup branch\n`);
    }
  }else{
    run('make',['build-desktop']);
    run('make',['package-desktop']);
    run(process.execPath,[join('scripts','check-release-entrypoints.mjs'),'desktop']);
    writeFileSync(join(output,'result.txt'),'PASS renamed application desktop: native build, packaging and packaged entry point verification\n');
  }
  console.log(`PASS real derived project; evidence: ${output}`);
}finally{
  if(fixture) rmSync(fixture.directory,{recursive:true,force:true});
}
