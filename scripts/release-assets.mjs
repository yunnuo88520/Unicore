// Author: yunnuo <ymz@ebox.vip>
// Description: Package native desktop builds and verify a complete release from one source commit.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFeatures } from './build-features.mjs';

const json = path => JSON.parse(readFileSync(path, 'utf8'));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
function source(root) {
  return { version: readFileSync(join(root, 'VERSION'), 'utf8').trim(), commit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd:root,encoding:'utf8'}).trim() };
}
export function packageDesktop(root = process.cwd()) {
  const {version,commit} = source(root), product = json(join(root,'package.json')).name;
  const config = json(join(root,'cmd/desktop/wails.json'));
  const os = process.platform, arch = {x64:'amd64',arm64:'arm64'}[process.arch];
  if (!['linux','darwin','windows'].includes(os === 'win32' ? 'windows' : os) || !arch) throw Error('Unsupported native runner');
  const targetOS = os === 'win32' ? 'windows' : os;
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(product) || !/^\d+\.\d+\.\d+$/.test(version) || config.info.productVersion !== version) throw Error('Invalid product/version metadata');
  const binary = os === 'darwin' ? `${config.name}.app` : config.outputfilename + (os === 'win32' ? '.exe' : '');
  const built = join(root,'build/desktop/bin',binary);
  if (!existsSync(built)) throw Error(`Missing native build: ${binary}`);
  const name = `${product}-desktop-${targetOS}-${arch}-v${version}`;
  const staging = join(root,'build/native-staging',name), output = join(root,'build/native-releases');
  rmSync(staging,{recursive:true,force:true}); mkdirSync(staging,{recursive:true}); mkdirSync(output,{recursive:true});
  cpSync(built,join(staging,binary),{recursive:true});
  for (const file of ['LICENSE','CHANGELOG.md','VERSION']) cpSync(join(root,file),join(staging,file));
  const metadata = {version,channel:'development',profile:'desktop',os:targetOS,arch,commit,build_time:new Date().toISOString(),features:readFeatures().features,migration_level:1,business_migration_level:1,offline_backup:false,signature:null};
  writeFileSync(join(staging,'manifest.json'),JSON.stringify(metadata,null,2)+'\n');
  writeFileSync(join(staging,'README_DESKTOP.md'),`<!-- Author: yunnuo <ymz@ebox.vip> -->\n# Unicore ${version}\n\n原生 ${targetOS}/${arch} 开发预览。解压后运行 ${binary}。没有平台登录或管理功能。Linux 需要 GTK3/WebKitGTK 4.0，Windows 需要 WebView2。系统签名/公证尚未接入，不承诺各系统窗口均已实测。\n\nhttps://github.com/yunnuo88520/Unicore/wiki\n`);
  const artifact = name+'.tar.gz';
  execFileSync('tar',['-czf',join(output,artifact),'-C',join(root,'build/native-staging'),name],{env:{...process.env,COPYFILE_DISABLE:'1'}});
  writeFileSync(join(output,name+'.manifest.json'),JSON.stringify({...metadata,artifact,sha256:hash(join(output,artifact))},null,2)+'\n');
  console.log(`Packaged ${artifact}`);
}
export function assembleRelease(directory, {version,commit}) {
  const manifest = json(join(directory,'manifest.json'));
  if (manifest.version !== version || !/^[a-f0-9]{40}$/.test(commit)) throw Error('Release version/source mismatch');
  const artifacts = [...manifest.artifacts];
  for (const file of readdirSync(directory).filter(file=>file.endsWith('.manifest.json'))) artifacts.push(json(join(directory,file)));
  const seen = new Set(), targets = new Set();
  for (const item of artifacts) {
    const target = `${item.profile}/${item.os}/${item.arch}`;
    if (item.version !== version || !/^[a-f0-9]{7,40}$/.test(item.commit) || !commit.startsWith(item.commit)) throw Error('Mixed version/source artifacts');
    if (!/^[a-zA-Z0-9._-]+\.tar\.gz$/.test(item.artifact) || seen.has(item.artifact) || targets.has(target)) throw Error('Invalid/duplicate release artifact');
    if (hash(join(directory,item.artifact)) !== item.sha256) throw Error(`Checksum mismatch: ${item.artifact}`);
    if (item.signature !== null) throw Error('Unexpected signing claim');
    seen.add(item.artifact); targets.add(target);
  }
  const expected = ['web-platform/linux/amd64','web-platform/linux/arm64','web-standalone/linux/amd64','web-standalone/linux/arm64',...['linux','darwin','windows'].flatMap(os=>['amd64','arm64'].map(arch=>`cli/${os}/${arch}`))];
  if (artifacts.length !== 13 || expected.some(target=>!targets.has(target)) || ['linux','darwin','windows'].some(os=>!artifacts.some(item=>item.profile==='desktop'&&item.os===os&&['amd64','arm64'].includes(item.arch)))) throw Error('Incomplete Web/CLI/native release matrix');
  const archives = readdirSync(directory).filter(file=>file.endsWith('.tar.gz'));
  if (archives.length !== seen.size || archives.some(file=>!seen.has(file))) throw Error('Unexpected archive in release bundle');
  artifacts.sort((a,b)=>a.artifact.localeCompare(b.artifact));
  writeFileSync(join(directory,'checksums.txt'),artifacts.map(item=>`${item.sha256}  ${item.artifact}`).join('\n')+'\n');
  writeFileSync(join(directory,'manifest.json'),JSON.stringify({version,source_commit:commit,channel:'development',artifacts},null,2)+'\n');
  for (const file of readdirSync(directory).filter(file=>file.endsWith('.manifest.json'))) rmSync(join(directory,file));
  console.log(`Verified ${artifacts.length} release archives from ${commit}`);
  return artifacts;
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2]==='desktop') packageDesktop();
  else if (process.argv[2]==='assemble' && process.argv[3]) assembleRelease(resolve(process.argv[3]),source(process.cwd()));
  else throw Error('Use release-assets.mjs desktop|assemble <directory>');
}
