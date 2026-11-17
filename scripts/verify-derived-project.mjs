// Author: yunnuo <ymz@ebox.vip>
// Description: Create a genuinely renamed application, customize it like a real downstream
// (non-default brand accent, an independent business migration namespace and its module
// descriptor) and run its own full checks and builds, without changing or publishing the
// framework checkout. Modes: full (default) runs docs, tests and Web/CLI/ops builds; desktop
// runs the native desktop build, packaging and packaged-entry verification on a native runner,
// proving the exported whitelist keeps every desktop input (Objective-C bridge files, embedded
// images, DMG resources, packaging entry points).
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {snapshotFramework,verificationGitEnv} from '../tests/tooling/framework-source.mjs';
import {updateTemplateBranch} from './framework-template.mjs';
import {createProject} from './create-project.mjs';

const mode=process.argv[2]??'full';
if(!['full','desktop'].includes(mode)) throw Error('Use node scripts/verify-derived-project.mjs [full|desktop]');
const repository=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(existsSync(join(repository,'project.provenance.json'))) throw Error('Run this publisher verification in the framework source checkout; use make test in an application.');
Object.assign(process.env,verificationGitEnv());
mkdirSync(join(repository,'build'),{recursive:true});
const output=mkdtempSync(join(repository,'build/derived-verification-'));
const fixture=snapshotFramework(repository);
const app=join(output,'application');
try{
  updateTemplateBranch(fixture.source);
  // The application team owns its identity: business sources (module descriptor, SQL)
  // carry their own author header, and the author-policy checks accept it via identity.
  const goModule='example.test/verification/harbor-desk';
  createProject({source:fixture.source,directory:app,name:'Harbor Desk',slug:'harbor-desk',module:goModule,bundle:'test.example.harbordesk',repository:'https://github.com/example/harbor-desk',author:'Drill Team <drill@example.test>'});
  console.log(`Verifying renamed application (${mode}): ${app}`);
  // Windows spawn refuses .cmd shims without a shell (Node EINVAL, CVE-2024-27980);
  // resolve pnpm through cmd.exe there, keep direct exec on POSIX.
  const windowsShell=process.platform==='win32';
  const run=(command,args)=>execFileSync(command,args,{cwd:app,env:{...process.env,CI:'true'},stdio:'inherit',shell:windowsShell});
  run('pnpm',['install','--frozen-lockfile']);
  if(mode==='full'){
    // Downstream customization exactly where framework tests used to hardcode defaults:
    // a non-default brand accent and an independent business migration namespace with its
    // module descriptor, all authored by the application team. Full docs/tests/builds must
    // pass on the customized application.
    const edit=(path,fn)=>{const full=join(app,path);const value=JSON.parse(readFileSync(full,'utf8'));fn(value);writeFileSync(full,JSON.stringify(value,null,2)+'\n');};
    edit('assets/theme/tokens.json',tokens=>{tokens.brand.accent='#1177ee';});
    for(const dialect of ['sqlite','postgres','mysql']){
      const directory=join(app,'migrations/modules/workorders',dialect);
      mkdirSync(directory,{recursive:true});
      writeFileSync(join(directory,'0001_initial.sql'),'-- Author: Drill Team <drill@example.test>\nCREATE TABLE workorder_requests (id INTEGER PRIMARY KEY, subject TEXT NOT NULL);\n');
    }
    edit('migrations/catalog.json',catalog=>{
      catalog.namespaces.push({id:'module.workorders',depends_on:['core'],migrations:[{version:1,files:{sqlite:'modules/workorders/sqlite/0001_initial.sql',postgres:'modules/workorders/postgres/0001_initial.sql',mysql:'modules/workorders/mysql/0001_initial.sql'}}]});
      for(const profile of ['web-platform','web-standalone','desktop']) catalog.profiles[profile].namespaces.push('module.workorders');
    });
    mkdirSync(join(app,'internal/modules/workorders'),{recursive:true});
    writeFileSync(join(app,'internal/modules/workorders/module.go'),`// Author: Drill Team <drill@example.test>\n// Description: Workorders module descriptor for the derived-application regression drill.\npackage workorders\n\nimport (\n\t"${goModule}/internal/contracts"\n\t"${goModule}/internal/module"\n)\n\n// Module aggregates the workorders facts the platform registries consume. The HTTP\n// mount is left to the derived application per docs/product/development.md.\nvar Module = module.Module{\n\tSlug: "workorders",\n\tTitle: "工单",\n\tDescription: "派生应用回归演练业务：独立迁移命名空间与模块描述符",\n\tIcon: "ClipboardList",\n\tOrder: 1,\n\tPermissions: []contracts.PermissionDefinition{\n\t\t{ID: "workorders:access", Name: "使用工单", Description: "访问工单页面", Group: "业务权限", Assignable: true},\n\t},\n\tNavigation: []contracts.NavigationPage{\n\t\t{ID: "workorders", Surfaces: []string{"administrator"}, Permission: "workorders:access"},\n\t},\n\tMigrations: "workorders",\n\tEnabled: true,\n}\n`);
    edit('internal/module/manifest.json',manifest=>{manifest.modules.push({slug:'workorders',edition:'',default:true,title:'工单'});});
    run('make',['docs']);
    run('make',['test']);
    // The customization must survive generation and be reflected in the artifacts.
    const resolved=JSON.parse(readFileSync(join(app,'assets/theme/resolved.gen.json'),'utf8'));
    if(resolved.brand.accent!=='#1177ee') throw Error('custom brand accent did not survive theme generation');
    const catalogGo=readFileSync(join(app,'migrations/catalogdata/catalog.gen.go'),'utf8');
    if(!catalogGo.includes('module.workorders')) throw Error('workorders namespace did not survive catalog generation');
    run('make',['build-web','build-cli','build-ops']);
    run(join(app,'build/bin',process.platform==='win32'?'harbor-desk.exe':'harbor-desk'),['--help']);
    writeFileSync(join(output,'result.txt'),'PASS renamed application: docs, full tests, Web/CLI/ops builds and renamed CLI entry point on a customized application\n');
  }else{
    run('make',['build-desktop']);
    run('make',['package-desktop']);
    run(process.execPath,[join('scripts','check-release-entrypoints.mjs'),'desktop']);
    writeFileSync(join(output,'result.txt'),'PASS renamed application desktop: native build, packaging and packaged entry point verification\n');
  }
  console.log(`PASS real derived project; evidence: ${output}`);
}finally{
  rmSync(fixture.directory,{recursive:true,force:true});
}
