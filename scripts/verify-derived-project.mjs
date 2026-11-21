// Author: yunnuo <ymz@ebox.vip>
// Description: Create a genuinely renamed application, customize it like a real downstream
// (non-default brand accent, an independent business migration namespace and its module
// descriptor) and run its own full checks and builds, without changing or publishing the
// framework checkout. Modes: full (default) runs docs, tests and Web/CLI/ops builds; desktop
// runs the native desktop build, packaging and packaged-entry verification on a native runner,
// proving the exported whitelist keeps every desktop input (Objective-C bridge files, embedded
// images, DMG resources, packaging entry points); upgrade creates the application from the
// current template, commits an application release with its own version and changelog, writes
// business data, then framework:sync to a rolled-forward template lineage with a real conflict
// scene — proving business sources, theme, module, migrations, data, version and the author
// policy survive a normal upgrade with a verifiable common ancestor and a pre-sync backup
// branch.
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {snapshotFramework,verificationGitEnv} from '../tests/tooling/framework-source.mjs';
import {updateTemplateBranch} from './framework-template.mjs';
import {createProject} from './create-project.mjs';
import {checkTemplate} from './framework-sync.mjs';

const mode=process.argv[2]??'full';
if(!['full','desktop','upgrade'].includes(mode)) throw Error('Use node scripts/verify-derived-project.mjs [full|desktop|upgrade]');
const repository=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(existsSync(join(repository,'project.provenance.json'))) throw Error('Run this publisher verification in the framework source checkout; use make test in an application.');
Object.assign(process.env,verificationGitEnv());
mkdirSync(join(repository,'build'),{recursive:true});
const output=mkdtempSync(join(repository,'build/derived-verification-'));
const app=join(output,'application');
let fixture=null,creationTemplate=null,creationVersion=null;
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
    // The upgrade path walks what a real downstream walks: create from the
    // current template, commit an application release, then framework:sync to
    // a rolled-forward template lineage. The 0.1.x experiments are not upgrade
    // sources, and their compensation flows (the old bundled syncer, the
    // one-time tooling migration and the missing-ancestor graft) are retired
    // with them. The application repository deliberately differs from the
    // product slug.
    fixture=snapshotFramework(repository);
    updateTemplateBranch(fixture.source);
    creationTemplate=updateTemplateBranch(fixture.source).commit;
    creationVersion=readFileSync(join(fixture.source,'VERSION'),'utf8').trim();
    createProject({source:fixture.source,directory:app,name:'Harbor Desk',slug:'harbor-desk',
      module:goModule,bundle:'test.example.harbordesk',repository:'https://github.com/example/harbor-desk-app',author:drillAuthor});
    // The upgrade syncs against the local rolled lineage, not the public remote.
    git(app,'remote','set-url','framework',fixture.source);
    if(git(app,'rev-parse','HEAD^')!==creationTemplate) throw Error(`the application does not descend from the creation template commit ${creationTemplate.slice(0,12)}`);
    console.log(`Verifying upgrade from the current template lineage (${creationTemplate.slice(0,12)}): ${app}`);
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
    addWorkorders(drillAuthor);
    writeDataProbe();

    // Regenerate the projections BEFORE the customization commit: the data probe
    // compiles against the embedded catalog, which only knows module.workorders
    // after catalogdata has been regenerated. A real downstream commits these
    // generated artifacts with the customization. The customization also
    // performs the application's own 2.3.4 release: its VERSION, its app-owned
    // changelog replacing the framework history, and the version projections.
    run('pnpm',['install','--frozen-lockfile']);
    writeFileSync(join(app,'VERSION'),'2.3.4\n');
    writeFileSync(join(app,'CHANGELOG.md'),`<!-- Author: yunnuo <ymz@ebox.vip> -->\n# Changelog\n\nAll notable changes to this application are documented here. The framework's own release history lives upstream and reaches this repository through framework source upgrades; it is not part of this file.\n\n## 2.3.4 — ${new Date().toISOString().slice(0,10)}\n\n### 中文\n\n- 基于 Unicore ${creationVersion} 创建。\n\n### English\n\n- Created from Unicore ${creationVersion}.\n\n## Unreleased\n`);
    run('pnpm',['version:sync']);
    run('make',['docs']);
    git(app,'add','-A');
    git(app,'commit','-qm','Add workorders business, custom theme and application release 2.3.4');
    const moduleGo=readFileSync(join(app,'internal/modules/workorders/module.go'));
    const businessSQL=readFileSync(join(app,'migrations/modules/workorders/sqlite/0001_initial.sql'));
    const customizationHead=git(app,'rev-parse','HEAD');
    // Business data written through the application must survive the upgrade:
    // apply its migrations, insert one workorders row and record the ledger.
    mkdirSync(join(output,'data'),{recursive:true});
    process.env.PROBE_DB=join(output,'data','unicore.db');
    const preSyncProbe=execFileSync('go',['run','./build/probe','write'],{cwd:app,env:{...process.env,CI:'true'},encoding:'utf8',stdio:['ignore','pipe','pipe']});
    if(!preSyncProbe.includes('[probe] ledger module.workorders=1')) throw Error(`pre-sync probe did not record the business migration ledger:\n${preSyncProbe}`);
    // A real republication rolls the template forward: a whitelist file is
    // added and the framework version moves on. The application (released
    // 2.3.4 on its own) now has a pending update whose common ancestor is the
    // creation template commit.
    writeFileSync(join(fixture.source,'docs/product/upgrade-roll.md'),'<!-- Author: yunnuo <ymz@ebox.vip> -->\n# Framework template roll evidence\n');
    const rollManifest=JSON.parse(readFileSync(join(fixture.source,'distribution/manifest.json')));
    rollManifest.template_files.push('docs/product/upgrade-roll.md');
    writeFileSync(join(fixture.source,'distribution/manifest.json'),JSON.stringify(rollManifest,null,2)+'\n');
    const integratedVersion='0.1.8';
    writeFileSync(join(fixture.source,'VERSION'),integratedVersion+'\n');
    execFileSync('pnpm',['version:sync'],{cwd:fixture.source,env:{...process.env,CI:'true'},stdio:['ignore','pipe','inherit']});
    git(fixture.source,'add','-A');git(fixture.source,'commit','-qm','framework template roll: whitelist evidence file and framework version');
    const newTemplate=updateTemplateBranch(fixture.source).commit;
    if(newTemplate===creationTemplate) throw Error('the template roll did not produce a new template commit');
    const preSyncHead=git(app,'rev-parse','HEAD');
    if(preSyncHead!==customizationHead) throw Error('the application branch moved before the sync');
    // The upgrade itself runs through the project's own command.
    const check=checkTemplate(app);
    if(check.up_to_date) throw Error('upgrade drill expected a pending template update');
    if(check.conflict_files?.length) console.log(`Preview conflicts (resolved below like a real downstream): ${check.conflict_files.join(', ')}`);
    const attempted=tryRun('pnpm',['framework:sync']);
    if(attempted.ok) throw Error('expected the sync to stop for manual conflict resolution');
    // A same-file edit on both sides (the app released its own VERSION while
    // the framework moved on) stops the sync for manual resolution.
    const stage=attempted.output.match(/files in (.+), then run/)?.[1];
    if(!stage) throw Error(`sync failed without a conflict scene:\n${attempted.output.slice(-800)}`);
    // Resolve like a real downstream: product-owned surfaces keep our side; every
    // framework file takes upstream, and the catalog additions get re-applied. The
    // conflict list is the path-shaped lines pnpm relays from the syncer.
    const ours=new Set(['README.md','README.en.md','assets/theme/tokens.json','VERSION','CHANGELOG.md']);
    const conflicted=attempted.output.split('\n').map(l=>l.trim())
      .filter(line=>line&&!/\s/.test(line)&&/^[\w./-]+$/.test(line)&&line!==stage);
    if(!conflicted.length) throw Error(`sync failed without a conflict scene:\n${attempted.output}`);
    for(const path of conflicted) git(stage,'checkout',ours.has(path)?'--ours':'--theirs','--',path);
    if(conflicted.includes('migrations/catalog.json')) reapplyWorkordersCatalog(stage);
    for(const path of conflicted) git(stage,'add','--',path);
    run('pnpm',['framework:sync','--continue']);
    // catalog.gen.go and metadata.gen.json are framework-owned generated files a
    // conflict resolves to upstream, so the merged catalog.json (with the derived
    // workorders namespace) must be regenerated into the embedded executor input
    // before anything boots — otherwise the ledger check fail-closes on the lost
    // namespace, exactly like a real downstream skipping its post-sync generation.
    run('pnpm',['generate:migrations']);
    const backups=git(app,'for-each-ref','--format=%(refname:short)','refs/heads/backup/pre-sync-*').split('\n').filter(Boolean);
    if(backups.length!==1||git(app,'rev-parse','--verify',backups[0])!==preSyncHead) throw Error(`backup branch ${backups.join(',')} does not preserve the pre-sync commit ${preSyncHead.slice(0,12)}`);
    // After the sync HEAD descends from both sides, so the verifiable ancestor of the
    // upgrade is the pre-sync application commit's merge base with the new template.
    if(git(app,'merge-base',preSyncHead,newTemplate)!==creationTemplate) throw Error(`sync common ancestor is not the creation template commit ${creationTemplate.slice(0,12)}`);
    if(Buffer.compare(readFileSync(join(app,'internal/modules/workorders/module.go')),moduleGo)!==0) throw Error('module descriptor changed during sync');
    if(Buffer.compare(readFileSync(join(app,'migrations/modules/workorders/sqlite/0001_initial.sql')),businessSQL)!==0) throw Error('business migration changed during sync');
    if(JSON.parse(readFileSync(join(app,'assets/theme/tokens.json'),'utf8')).brand.accent!=='#1177ee') throw Error('custom brand accent lost in sync');
    // The old generator's identity author is what the project was born with; the
    // upgrade must preserve it, not the drill's author.
    if(JSON.parse(readFileSync(join(app,'product.identity.json'),'utf8')).author!==drillAuthor) throw Error('application author lost in sync');
    const upstreamFiles=git(app,'diff','--name-only',`${preSyncHead}..HEAD`).split('\n').filter(Boolean).length;
    console.log(`Synchronized to template ${newTemplate.slice(0,12)}; backup ${backups[0]}; ${upstreamFiles} upstream files`);
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
    if(provenance.framework_integration?.framework_version!==integratedVersion||provenance.framework_integration?.template_commit!==newTemplate) throw Error(`provenance did not record the integrated framework:\n${JSON.stringify(provenance.framework_integration)}`);
    if(provenance.author!==drillAuthor) throw Error('application author lost in provenance');
    const appChangelog=readFileSync(join(app,'CHANGELOG.md'),'utf8');
    if(provenance.framework_version!==creationVersion) throw Error(`creation framework version was lost: ${provenance.framework_version}`);
    if(!appChangelog.includes(`## 2.3.4 — `)||!appChangelog.includes(`Created from Unicore ${creationVersion}`)) throw Error('application changelog history was lost');
    if(/\n## 0\.1\./.test(appChangelog)) throw Error('framework release history leaked into the application changelog');
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
    if(!existsSync(join(app,'docs/product/upgrade-roll.md'))) throw Error('the rolled template file was not delivered by the sync');
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
      writeFileSync(join(output,'result.txt'),`PASS upgraded application: framework:sync to the rolled template lineage kept business sources, theme, migrations, data, version and authorship; docs, full tests and builds pass with ancestor ${creationTemplate.slice(0,12)} and backup branch\n`);
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
