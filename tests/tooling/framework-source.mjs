// Author: yunnuo <ymz@ebox.vip>
// Description: Commit actual whitelisted framework inputs in an isolated source repository for downstream regression checks.
import {execFileSync} from 'node:child_process';
import {cpSync,mkdirSync,mkdtempSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {distributionPlan} from '../../scripts/distribution.mjs';

export const verificationGitEnv = () => ({...process.env,GIT_AUTHOR_NAME:'Template regression',GIT_AUTHOR_EMAIL:'template@example.test',GIT_COMMITTER_NAME:'Template regression',GIT_COMMITTER_EMAIL:'template@example.test'});
export function snapshotFramework(repository) {
  const directory=mkdtempSync(join(tmpdir(),'unicore-real-template-')), source=join(directory,'source');
  mkdirSync(source);
  for(const path of new Set([...distributionPlan(repository,'project-template').map(file=>file.source),'product.identity.json'])) {
    mkdirSync(dirname(join(source,path)),{recursive:true});cpSync(join(repository,path),join(source,path));
  }
  for(const args of [['init','-q','--initial-branch=main'],['add','-A'],['commit','-qm','Snapshot actual framework inputs']]) {
    execFileSync('git',['-C',source,...args],{env:verificationGitEnv(),stdio:'pipe'});
  }
  return {directory,source};
}
