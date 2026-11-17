// Author: yunnuo <ymz@ebox.vip>
// Description: Create a genuinely renamed application and run its own full checks and builds, without changing or publishing the framework checkout.
// Modes: full (default) runs docs, tests and Web/CLI/ops builds; desktop runs the native desktop build,
// packaging and packaged-entry verification on a native runner, proving the exported whitelist keeps
// every desktop input (Objective-C bridge files, embedded images, DMG resources, packaging entry points).
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
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
  createProject({source:fixture.source,directory:app,name:'Harbor Desk',slug:'harbor-desk',module:'example.test/verification/harbor-desk',bundle:'test.example.harbordesk',repository:'https://github.com/example/harbor-desk'});
  console.log(`Verifying renamed application (${mode}): ${app}`);
  const pnpm=process.platform==='win32'?'pnpm.cmd':'pnpm';
  const run=(command,args)=>execFileSync(command,args,{cwd:app,env:{...process.env,CI:'true'},stdio:'inherit'});
  run(pnpm,['install','--frozen-lockfile']);
  if(mode==='full'){
    run('make',['docs']);
    run('make',['test']);
    run('make',['build-web','build-cli','build-ops']);
    run(join(app,'build/bin',process.platform==='win32'?'harbor-desk.exe':'harbor-desk'),['--help']);
    writeFileSync(join(output,'result.txt'),'PASS renamed application: docs, full tests, Web/CLI/ops builds and renamed CLI entry point\n');
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
