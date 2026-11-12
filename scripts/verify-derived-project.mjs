// Author: yunnuo <ymz@ebox.vip>
// Description: Create a genuinely renamed application and run its own full checks and builds, without changing or publishing the framework checkout.
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {snapshotFramework,verificationGitEnv} from '../tests/tooling/framework-source.mjs';
import {updateTemplateBranch} from './framework-template.mjs';
import {createProject} from './create-project.mjs';

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
  console.log(`Verifying renamed application: ${app}`);
  const pnpm=process.platform==='win32'?'pnpm.cmd':'pnpm';
  const run=(command,args)=>execFileSync(command,args,{cwd:app,env:{...process.env,CI:'true'},stdio:'inherit'});
  run(pnpm,['install','--frozen-lockfile']);
  run('make',['docs']);
  run('make',['test']);
  run('make',['build-web','build-cli','build-ops']);
  run(join(app,'build/bin',process.platform==='win32'?'harbor-desk.exe':'harbor-desk'),['--help']);
  writeFileSync(join(output,'result.txt'),'PASS renamed application: docs, full tests, Web/CLI/ops builds and renamed CLI entry point\n');
  console.log(`PASS real derived project; evidence: ${output}`);
}finally{
  rmSync(fixture.directory,{recursive:true,force:true});
}
