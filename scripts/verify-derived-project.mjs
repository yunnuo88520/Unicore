// Author: yunnuo <ymz@ebox.vip>
// Description: Create a genuinely renamed application, customize it like a real downstream
// (non-default brand accent, an independent business migration namespace and its module
// descriptor) and run its own full checks and builds, without changing or publishing the
// framework checkout. Modes: full (default) runs docs, tests and Web/CLI/ops builds; desktop
// runs the native desktop build, packaging and packaged-entry verification on a native runner,
// proving the exported whitelist keeps every desktop input (Objective-C bridge files, embedded
// images, DMG resources, packaging entry points); upgrade creates the application with the OLD
// release's own generator from its own freshly generated framework-template (POSIX from the git
// source with the generator's own ancestry graft; Windows from an exported archive, the real
// missing-ancestor scenario, because the old generator's input check overflows the Windows
// command line), customizes and releases it with the old bundled tooling, verifies the old
// syncer refuses to advance the branch, applies the documented one-time tooling migration and
// then recovers, grafts (when the ancestry is missing) and upgrades through the project's own
// framework:sync commands — proving business sources, theme, module, migrations, data, version
// and the author policy survive a real upgrade with a verifiable common ancestor and a pre-sync
// backup branch.
import {execFileSync} from 'node:child_process';
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {snapshotFramework,verificationGitEnv} from '../tests/tooling/framework-source.mjs';
import {updateTemplateBranch} from './framework-template.mjs';
import {createProject} from './create-project.mjs';
import {checkTemplate} from './framework-sync.mjs';

const mode=process.argv[2]??'full';
if(!['full','desktop','upgrade'].includes(mode)) throw Error('Use node scripts/verify-derived-project.mjs [full|desktop|upgrade] [<old-tag>]');
const repository=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(existsSync(join(repository,'project.provenance.json'))) throw Error('Run this publisher verification in the framework source checkout; use make test in an application.');
Object.assign(process.env,verificationGitEnv());
mkdirSync(join(repository,'build'),{recursive:true});
const output=mkdtempSync(join(repository,'build/derived-verification-'));
const app=join(output,'application');
let fixture=null,oldTemplate=null,oldFrameworkVersion=null;
const git=(...args)=>execFileSync('git',['--no-optional-locks','-C',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
// The application team owns its identity: business sources (module descriptor, SQL)
// carry their own author header, and the author-policy checks accept it via identity.
const goModule='example.test/verification/harbor-desk';
const drillAuthor='Drill Team <drill@example.test>';
// Downstream customization exactly where framework tests used to hardcode defaults:
// a non-default brand accent and an independent business migration namespace with its
// module descriptor, all authored by the application team.
function editJSON(root,path,fn){const full=join(root,path);const value=JSON.parse(readFileSync(full,'utf8'));fn(value);writeFileSync(full,JSON.stringify(value,null,2)+'\n');}
// sqlAuthor: the full drill exercises the application-author policy (the current
// generator accepts the identity author); the upgrade drill targets the previous
// release whose generator only knows the framework author, so its business SQL
// carries that header until the upgrade delivers the wider policy.
function addWorkorders(sqlAuthor){
  editJSON(app,'assets/theme/tokens.json',tokens=>{tokens.brand.accent='#1177ee';});
  for(const dialect of ['sqlite','postgres','mysql']){
    const directory=join(app,'migrations/modules/workorders',dialect);
    mkdirSync(directory,{recursive:true});
    writeFileSync(join(directory,'0001_initial.sql'),`-- Author: ${sqlAuthor}\nCREATE TABLE workorder_requests (id INTEGER PRIMARY KEY, subject TEXT NOT NULL);\n`);
  }
  editJSON(app,'migrations/catalog.json',catalog=>{
    catalog.namespaces.push({id:'module.workorders',depends_on:['core'],migrations:[{version:1,files:{sqlite:'modules/workorders/sqlite/0001_initial.sql',postgres:'modules/workorders/postgres/0001_initial.sql',mysql:'modules/workorders/mysql/0001_initial.sql'}}]});
    for(const profile of ['web-platform','web-standalone','desktop']) catalog.profiles[profile].namespaces.push('module.workorders');
  });
  mkdirSync(join(app,'internal/modules/workorders'),{recursive:true});
  writeFileSync(join(app,'internal/modules/workorders/module.go'),`// Author: ${sqlAuthor}\n// Description: Workorders module descriptor for the derived-application regression drill.\npackage workorders\n\nimport (\n\t"${goModule}/internal/contracts"\n\t"${goModule}/internal/module"\n)\n\n// Module aggregates the workorders facts the platform registries consume. The HTTP\n// mount is left to the derived application per docs/product/development.md.\nvar Module = module.Module{\n\tSlug: "workorders",\n\tTitle: "工单",\n\tDescription: "派生应用回归演练业务：独立迁移命名空间与模块描述符",\n\tIcon: "ClipboardList",\n\tOrder: 1,\n\tPermissions: []contracts.PermissionDefinition{\n\t\t{ID: "workorders:access", Name: "使用工单", Description: "访问工单页面", Group: "业务权限", Assignable: true},\n\t},\n\tNavigation: []contracts.NavigationPage{\n\t\t{ID: "workorders", Surfaces: []string{"user"}, Permission: "workorders:access"},\n\t},\n\tMigrations: "workorders",\n\tEnabled: true,\n}\n`);
  editJSON(app,'internal/module/manifest.json',manifest=>{manifest.modules.push({slug:'workorders',edition:'',default:true,title:'工单'});});
}
// A real downstream re-applies its own customization when upstream also moved a file;
// catalog.json is the one shared file the drill owns additions to.
function reapplyWorkordersCatalog(root){editJSON(root,'migrations/catalog.json',catalog=>{if(!catalog.namespaces.some(n=>n.id==='module.workorders'))catalog.namespaces.push({id:'module.workorders',depends_on:['core'],migrations:[{version:1,files:{sqlite:'modules/workorders/sqlite/0001_initial.sql',postgres:'modules/workorders/postgres/0001_initial.sql',mysql:'modules/workorders/mysql/0001_initial.sql'}}]});for(const profile of ['web-platform','web-standalone','desktop'])if(!catalog.profiles[profile].namespaces.includes('module.workorders'))catalog.profiles[profile].namespaces.push('module.workorders');});}
// Data-survival probe: applies the application's own migrations to a probe SQLite
// database, then writes (pre-sync) or reads back (post-upgrade) a workorders row and
// prints the business migration ledger. It compiles against whatever tree it runs in,
// so the post-sync run exercises the upgraded application code against pre-upgrade data.
function writeDataProbe(){
  mkdirSync(join(app,'build/probe'),{recursive:true});
  writeFileSync(join(app,'build/probe/main.go'),`// Description: Derived-application upgrade drill probe; build/ stays outside the worktree.
package main

import (
	"context"
	"fmt"
	"os"

	"${goModule}/internal/adapter/storage/sqlite"
	"${goModule}/internal/module"
	"${goModule}/internal/modules/workorders"
	"${goModule}/internal/platform"
	"${goModule}/migrations/runner"
)

func main() {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, os.Getenv("PROBE_DB"))
	if err != nil {
		panic(err)
	}
	defer store.DB.Close()
	if err := runner.Apply(ctx, store.DB, runner.Options{Dialect: "sqlite", Profile: "desktop"}); err != nil {
		panic(err)
	}
	if os.Args[1] == "nav" {
		module.Register(workorders.Module)
		for _, page := range platform.NavigationPages() {
			if page.ID == "workorders" {
				fmt.Printf("[probe] registered workorders surfaces: %v\\n", page.Surfaces)
			}
		}
		return
	}
	if os.Args[1] == "write" {
		if _, err := store.ExecContext(ctx, "INSERT INTO workorder_requests (subject) VALUES ('sync-survival-probe')"); err != nil {
			panic(err)
		}
	} else {
		var subject string
		if err := store.QueryRowContext(ctx, "SELECT subject FROM workorder_requests WHERE subject = 'sync-survival-probe'").Scan(&subject); err != nil {
			panic(err)
		}
		fmt.Println("[probe] read back:", subject)
	}
	var namespace string
	var version int
	if err := store.QueryRowContext(ctx, "SELECT namespace, version FROM schema_migrations WHERE namespace = 'module.workorders'").Scan(&namespace, &version); err != nil {
		panic(err)
	}
	fmt.Printf("[probe] ledger %s=%d\\n", namespace, version)
}
`);
}

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
    // Old releases can predate the repository-wide LF attributes. Keep their
    // tracked bytes when a Windows runner has core.autocrlf=true globally.
    execFileSync('git',['clone','--quiet','--no-hardlinks','--single-branch','--no-checkout',
      '--config','core.autocrlf=false','--config','core.eol=lf',repository,oldSource],{stdio:['ignore','pipe','pipe']});
    git(oldSource,'checkout','--detach',oldRef);
    // The old template roots its own lineage here: the published template ref must
    // not leak in through origin, or the old template would chain onto the new one.
    git(oldSource,'remote','remove','origin');
    oldFrameworkVersion=readFileSync(join(oldSource,'VERSION'),'utf8').trim();
    oldTemplate=updateTemplateBranch(oldSource).commit;
    // Creation uses the OLD release's own generator, exactly like the original
    // project was born: its CLI accepts no author or release parameters, so the
    // application carries the framework author and the template VERSION until
    // its own release process runs. On Windows the old generator's selected-
    // inputs check puts ~950 pathspecs on one git command line, which overflows
    // at any CI checkout location — the real-world path there is creating from
    // an exported archive, so the drill creates from a .git-free copy: the old
    // generator runs verbatim and the application starts without template
    // ancestry (the missing-ancestor scenario, grafted later through the
    // project's own migrated tooling). POSIX keeps the git-source creation with
    // the generator's own ancestry graft (the normal scenario). The application
    // repository deliberately differs from the product slug.
    const applicationRepository='https://github.com/example/harbor-desk-app';
    let createCwd=oldSource;
    if(process.platform==='win32'){
      createCwd=join(output,'old-archive');
      cpSync(oldSource,createCwd,{recursive:true,filter:p=>!/[\\/]\.git([\\/]|$)/.test(p)&&p.split(/[\\/]/).at(-1)!=='build'});
    }
    execFileSync('node',['scripts/create-project.mjs','--directory',app,'--name','Harbor Desk','--slug','harbor-desk',
      '--module',goModule,'--bundle','test.example.harbordesk','--repository',applicationRepository],
      {cwd:createCwd,stdio:['ignore','pipe','inherit']});
    // Same-version template roll, exactly like real republications: a whitelist
    // file is added AFTER the application was created, without a version bump,
    // so the lineage now carries two commits at the same framework version.
    // The graft must attach the FIRST one — located through the creation
    // evidence, never the newest same-version commit — and the subsequent sync
    // then delivers the rolled file.
    writeFileSync(join(oldSource,'docs/product/extra-roll.md'),'# Same-version roll evidence\n');
    const rollManifest=JSON.parse(readFileSync(join(oldSource,'distribution/manifest.json')));
    rollManifest.template_files.push('docs/product/extra-roll.md');
    writeFileSync(join(oldSource,'distribution/manifest.json'),JSON.stringify(rollManifest,null,2)+'\n');
    git(oldSource,'add','-A');git(oldSource,'commit','-qm','same-version template roll: whitelist evidence file');
    const rolledTemplate=updateTemplateBranch(oldSource).commit;
    if(rolledTemplate===oldTemplate) throw Error('the same-version template roll did not produce a second commit');
    if(process.platform!=='win32'&&git(app,'rev-parse','HEAD^')!==oldTemplate) throw Error(`the created application does not descend from the old template commit ${oldTemplate.slice(0,12)}`);
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
  // tryRun captures a failing CLI invocation instead of aborting the drill: the
  // refused old-tool sync IS one of the verified outcomes.
  const tryRun=(command,args,cwd=app)=>{
    try { return {ok:true, output:execFileSync(command,args,{cwd,env:{...process.env,CI:'true'},encoding:'utf8',stdio:['ignore','pipe','pipe'],shell:windowsShell})}; }
    catch(error){ return {ok:false, output:`${error.stdout??''}\n${error.stderr??''}`}; }
  };
  if(mode==='upgrade'){
    addWorkorders('yunnuo <ymz@ebox.vip>');
    writeDataProbe();

    // Regenerate the projections BEFORE the customization commit: the data probe
    // compiles against the embedded catalog, which only knows module.workorders
    // after catalogdata has been regenerated. A real downstream commits these
    // generated artifacts with the customization. The old generator created the
    // application at the template VERSION with the framework author, so the
    // customization also performs the application's own 2.3.4 release with the
    // OLD project's own tooling: its VERSION, its app-owned changelog replacing
    // the framework history the old export shipped, and its version projections.
    run('pnpm',['install','--frozen-lockfile']);
    writeFileSync(join(app,'VERSION'),'2.3.4\n');
    writeFileSync(join(app,'CHANGELOG.md'),`<!-- Author: yunnuo <ymz@ebox.vip> -->\n# Changelog\n\nAll notable changes to this application are documented here. The framework's own release history lives upstream and reaches this repository through framework source upgrades; it is not part of this file.\n\n## 2.3.4 — ${new Date().toISOString().slice(0,10)}\n\n### 中文\n\n- 基于 Unicore ${oldFrameworkVersion} 创建。\n\n### English\n\n- Created from Unicore ${oldFrameworkVersion}.\n\n## Unreleased\n`);
    run('pnpm',['version:sync']);
    run('make',['docs']);
    git(app,'add','-A');
    git(app,'commit','-qm','Add workorders business, custom theme and application release 2.3.4');
    const moduleGo=readFileSync(join(app,'internal/modules/workorders/module.go'));
    const businessSQL=readFileSync(join(app,'migrations/modules/workorders/sqlite/0001_initial.sql'));
    const customizationHead=git(app,'rev-parse','HEAD');
    // Business data written through the OLD application must survive the upgrade:
    // apply the old migrations, insert one workorders row and record the ledger.
    mkdirSync(join(output,'data'),{recursive:true});
    process.env.PROBE_DB=join(output,'data','unicore.db');
    const preSyncProbe=execFileSync('go',['run','./build/probe','write'],{cwd:app,env:{...process.env,CI:'true'},encoding:'utf8',stdio:['ignore','pipe','pipe']});
    if(!preSyncProbe.includes('[probe] ledger module.workorders=1')) throw Error(`pre-sync probe did not record the business migration ledger:\n${preSyncProbe}`);
    // The current template must CONTINUE the old lineage, exactly like published
    // cross-release templates, or the sync would lose its common ancestor.
    fixture=snapshotFramework(repository);
    const currentFrameworkVersion=readFileSync(join(fixture.source,'VERSION'),'utf8').trim();
    git(fixture.source,'fetch',join(output,'old-source'),'refs/heads/framework-template:refs/heads/framework-template');
    const newTemplate=updateTemplateBranch(fixture.source).commit;
    git(app,'remote','set-url','framework',fixture.source);
    // The upgrade entry a real project runs is its OWN bundled tooling. The old
    // syncer must refuse to advance the application branch: on POSIX it hits
    // the VERSION conflict (the application released 2.3.4, the template moved
    // on) and auto-resolves nothing; on the archive-created Windows path it
    // refuses earlier with the missing template ancestor. Both refusals keep
    // HEAD untouched, and neither records the provenance integration nor
    // regenerates the version projections.
    const oldCheck=tryRun('pnpm',['framework:check']);
    const oldSync=tryRun('pnpm',['framework:sync']);
    if(oldSync.ok) throw Error('the old bundled syncer completed the upgrade; the drill requires the refusal-then-migration path');
    if(git(app,'rev-parse','HEAD')!==customizationHead) throw Error('the old bundled syncer advanced the application branch');
    console.log(`Old bundled syncer refused as expected (${oldCheck.ok ? 'pending update' : 'missing ancestor'}); migrating the tooling before the first real sync.`);
    // The documented one-time migration for projects created before 0.1.7
    // (docs/product/framework-upgrade.md): refresh the sync toolchain from the
    // pending template BEFORE the first sync — the syncer plus the helpers it
    // imports (all three depend only on node builtins) — so the upgrade itself
    // records the integration, regenerates the version projections and carries
    // the current identity/repository projections.
    git(app,'fetch','framework','framework-template');
    for(const script of ['framework-sync.mjs','product-identity.mjs','check-product-residuals.mjs','distribution.mjs']){
      writeFileSync(join(app,'scripts',script),git(app,'show',`FETCH_HEAD:scripts/${script}`));
      git(app,'add',`scripts/${script}`);
    }
    git(app,'commit','-qm','Refresh framework sync tooling from the pending template');
    // A scene the old tool left behind is cleaned up by the REFRESHED tool
    // through the same user entry — its abort no longer depends on the path
    // handling that could fail on Windows.
    if(existsSync(join(app,'build/framework-sync-state.json'))) run('pnpm',['framework:sync','--abort']);
    if(git(app,'status','--porcelain')) throw Error('the refused old sync left the application worktree dirty');
    // The refused scene's backup branch belongs to that scene; the migration
    // discards it so the real upgrade's backup is the only one.
    for(const branch of git(app,'for-each-ref','--format=%(refname:short)','refs/heads/backup/pre-sync-*').split('\n').filter(Boolean)) git(app,'branch','-D',branch);
    // A project created from an archive has no template ancestor: the
    // refreshed tool grafts the pending template lineage under the existing
    // history through the same user entry (identical trees, messages, authors
    // and dates; only the ancestry is added).
    let hasAncestor=true;
    try{git(app,'merge-base','HEAD','FETCH_HEAD');}catch{hasAncestor=false;}
    if(!hasAncestor) run(process.execPath,['scripts/framework-sync.mjs','graft']);
    const preSyncHead=git(app,'rev-parse','HEAD');
    // The upgrade itself runs through the project's own (now current) command.
    const check=checkTemplate(app);
    if(check.up_to_date) throw Error('upgrade drill expected a pending template update');
    if(check.conflict_files?.length) console.log(`Preview conflicts (resolved below like a real downstream): ${check.conflict_files.join(', ')}`);
    const attempted=tryRun('pnpm',['framework:sync']);
    if(attempted.ok) throw Error('expected the sync to stop for manual conflict resolution');
    const stage=attempted.output.match(/files in (.+), then run/)?.[1];
    if(!stage) throw Error(`sync failed without a conflict scene:\n${attempted.output}`);
    // Resolve like a real downstream: product-owned surfaces keep our side; every
    // framework file takes upstream, and the catalog additions get re-applied. The
    // conflict list is the path-shaped lines pnpm relays from the syncer.
    const ours=new Set(['README.md','README.en.md','assets/theme/tokens.json']);
    const conflicted=attempted.output.split('\n').map(l=>l.trim())
      .filter(line=>line&&!/\s/.test(line)&&/^[\w./-]+$/.test(line)&&line!==stage);
    if(!conflicted.length) throw Error(`sync failed without a conflict scene:\n${attempted.output}`);
    for(const path of conflicted) git(stage,'checkout',ours.has(path)?'--ours':'--theirs','--',path);
    if(conflicted.includes('migrations/catalog.json')) reapplyWorkordersCatalog(stage);
    for(const path of conflicted) git(stage,'add','--',path);
    run('pnpm',['framework:sync','--continue']);
    const backups=git(app,'for-each-ref','--format=%(refname:short)','refs/heads/backup/pre-sync-*').split('\n').filter(Boolean);
    if(backups.length!==1||git(app,'rev-parse','--verify',backups[0])!==preSyncHead) throw Error(`backup branch ${backups.join(',')} does not preserve the pre-sync commit ${preSyncHead.slice(0,12)}`);
    // After the sync HEAD descends from both sides, so the verifiable ancestor of the
    // upgrade is the pre-sync application commit's merge base with the new template.
    if(git(app,'merge-base',preSyncHead,newTemplate)!==oldTemplate) throw Error(`sync common ancestor is not the old template commit ${oldTemplate.slice(0,12)}`);
    if(Buffer.compare(readFileSync(join(app,'internal/modules/workorders/module.go')),moduleGo)!==0) throw Error('module descriptor changed during sync');
    if(Buffer.compare(readFileSync(join(app,'migrations/modules/workorders/sqlite/0001_initial.sql')),businessSQL)!==0) throw Error('business migration changed during sync');
    if(JSON.parse(readFileSync(join(app,'assets/theme/tokens.json'),'utf8')).brand.accent!=='#1177ee') throw Error('custom brand accent lost in sync');
    // The old generator's identity author is what the project was born with; the
    // upgrade must preserve it, not the drill's author.
    if(JSON.parse(readFileSync(join(app,'product.identity.json'),'utf8')).author!=='yunnuo <ymz@ebox.vip>') throw Error('application author lost in sync');
    const upstreamFiles=git(app,'diff','--name-only',`${preSyncHead}..HEAD`).split('\n').filter(Boolean).length;
    console.log(`Synchronized to template ${newTemplate.slice(0,12)}; backup ${backups[0]}; ${upstreamFiles} upstream files`);
    rmSync(join(output,'old-source'),{recursive:true,force:true});
    // The upgraded application reads the pre-upgrade row back through its own code,
    // and the business ledger survives at module.workorders=1.
    const postSyncProbe=execFileSync('go',['run','./build/probe','read'],{cwd:app,env:{...process.env,CI:'true'},encoding:'utf8',stdio:['ignore','pipe','pipe']});
    if(!postSyncProbe.includes('[probe] read back: sync-survival-probe')||!postSyncProbe.includes('[probe] ledger module.workorders=1')) throw Error(`post-sync probe lost the business row or ledger:\n${postSyncProbe}`);
    console.log('[probe] business data survived the upgrade:',postSyncProbe.trim().split('\n').join(' | '));
    // The upgraded application registers the business page for the user workspace
    // only: the menu boundary ships with the template and binds the derived module.
    const navProbe=execFileSync('go',['run','./build/probe','nav'],{cwd:app,env:{...process.env,CI:'true'},encoding:'utf8',stdio:['ignore','pipe','pipe']});
    if(!navProbe.includes('[probe] registered workorders surfaces: [user]')) throw Error(`business page registration exceeds the user workspace:\n${navProbe}`);
    // The application kept its own product version across the framework upgrade,
    // with every projection regenerated from it (version:sync --check passes).
    if(readFileSync(join(app,'VERSION'),'utf8').trim()!=='2.3.4') throw Error('application product version was overwritten by the framework upgrade');
    execFileSync(process.execPath,['scripts/version.mjs','--check'],{cwd:app,env:{...process.env,CI:'true'},stdio:['ignore','pipe','pipe']});
    // Provenance separates the creation origin from the successfully integrated
    // framework, and the app-owned release history and OTA configuration survive.
    const provenance=JSON.parse(readFileSync(join(app,'project.provenance.json'),'utf8'));
    if(provenance.framework_integration?.framework_version!==currentFrameworkVersion||provenance.framework_integration?.template_commit!==newTemplate) throw Error(`provenance did not record the integrated framework:\n${JSON.stringify(provenance.framework_integration)}`);
    if(provenance.author!=='yunnuo <ymz@ebox.vip>') throw Error('application author lost in provenance');
    const appChangelog=readFileSync(join(app,'CHANGELOG.md'),'utf8');
    if(provenance.framework_version!==oldFrameworkVersion) throw Error(`creation framework version was lost: ${provenance.framework_version}`);
    if(!appChangelog.includes(`## 2.3.4 — `)||!appChangelog.includes(`Created from Unicore ${oldFrameworkVersion}`)) throw Error('application changelog history was lost');
    if(/## 0\.1\.6 /.test(appChangelog)) throw Error('framework release history leaked into the application changelog');
    const updates=JSON.parse(readFileSync(join(app,'assets/updates/config.json'),'utf8'));
    if(updates.repository!==''||updates.channel!=='stable'||updates.allow_unsigned_platform!==true) throw Error('application OTA/trust configuration was overwritten');
    // The image reference follows the application's release repository and the
    // upstream feedback flow arrived with the template.
    const appFaq=readFileSync(join(app,'docs/product/faq.md'),'utf8');
    if(!appFaq.includes('ghcr.io/example/harbor-desk-app')||appFaq.includes('ghcr.io/yunnuo88520/')) throw Error('FAQ image reference does not follow the application release repository');
    if(!readFileSync(join(app,'AGENTS.md'),'utf8').includes('遇到疑似框架缺陷时')) throw Error('the upstream feedback flow did not arrive with the template');
    // The same-version roll lives only in the old lineage; the 0.1.7 template
    // legitimately drops that file. The verifiable baseline check is the
    // merge-base assertion above — a graft that had picked the rolled
    // same-version commit would shift the ancestor and fail there.
    if(existsSync(join(app,'docs/product/extra-roll.md'))) throw Error('the rolled pre-baseline file must not survive the 0.1.7 sync');
    console.log('[acceptance] version 2.3.4 kept, provenance dual-tracked, changelog/OTA/image/feedback verified');
  }else if(mode==='full'){
    // Desktop mode packages the untouched template export: adding the workorders
    // customization here would leave the committed migration metadata stale, because
    // this mode never runs make docs to regenerate it.
    addWorkorders('Drill Team <drill@example.test>');
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
      writeFileSync(join(output,'result.txt'),`PASS upgraded application: old bundled syncer refused safely, one-time tooling migration applied${process.platform==='win32'?' with template-ancestry graft':''}, own framework:sync kept business sources, theme, migrations, data, version and authorship; docs, full tests and builds pass with ancestor ${oldTemplate.slice(0,12)} and backup branch\n`);
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
