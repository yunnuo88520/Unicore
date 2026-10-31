// Author: yunnuo <ymz@ebox.vip>
// Description: Package native desktop builds and verify a complete release from one source commit.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFeatures } from './build-features.mjs';
import { verifyPlatform } from './platform-sign.mjs';
import { desktopDownloads } from './desktop-downloads.mjs';
import { loadIdentity } from './product-identity.mjs';

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
  const compiledFeatures=json(join(root,'apps/desktop/static/features.json'));
  for(const [feature,value] of Object.entries(readFeatures().features))if(compiledFeatures[feature]!==value)throw Error('Native feature flags differ from packaging flags');
  const platformSignature=verifyPlatform(built,json(join(root,'assets/brand/identity.json')).bundleId);
  if(process.env.UNICORE_PLATFORM_SIGNING==='required'&&targetOS!=='linux'&&platformSignature==='unsigned')throw Error('Required native signature is missing');
  const metadata = {platform_signature:platformSignature,version,channel:'development',profile:'desktop',os:targetOS,arch,commit,build_time:new Date().toISOString(),features:readFeatures().features,migration_level:1,business_migration_level:2,offline_backup:false,signature:null};
  writeFileSync(join(staging,'manifest.json'),JSON.stringify(metadata,null,2)+'\n');
  writeFileSync(join(staging,'README_DESKTOP.md'),`<!-- Author: yunnuo <ymz@ebox.vip> -->\n# ${loadIdentity(root).product.name} ${version}\n\n原生 ${targetOS}/${arch} 开发预览。macOS 推荐下载 DMG，将 app 拖到 Applications；Windows 推荐直接下载运行 exe；本归档解压后运行 ${binary}，同时供 OTA 使用。没有平台登录或管理功能。Linux 需要 GTK3/WebKitGTK 4.0，Windows 需要 WebView2。系统签名状态：${platformSignature}。unsigned 为未完成操作系统签名的开发预览；OTA 另须发行者签名清单。不承诺各系统窗口均已实测。\n\n## English\n\nNative ${targetOS}/${arch} development preview. On macOS, use the DMG and drag the app into Applications; on Windows, run the EXE directly. Extract this archive and run ${binary}; it also serves as the OTA transport. No platform login or administration is included. Linux needs GTK3/WebKitGTK 4.0; Windows needs WebView2. OS signature: ${platformSignature}. Unsigned previews have no OS signing/notarization; OTA separately requires the publisher-signed manifest. Not every native window has been manually exercised.\n\nhttps://github.com/yunnuo88520/Unicore/wiki\n`);
  const artifact = name+'.tar.gz';
  execFileSync('tar',['-czf',join(output,artifact),'-C',join(root,'build/native-staging'),name],{env:{...process.env,COPYFILE_DISABLE:'1'}});
  const downloads=desktopDownloads({root,output,name,built,binary,targetOS,application:config.name,platformSignature});
  writeFileSync(join(output,name+'.manifest.json'),JSON.stringify({...metadata,artifact,sha256:hash(join(output,artifact)),downloads},null,2)+'\n');
  writeFileSync(join(output,name+'.checksums.txt'),[{artifact,sha256:hash(join(output,artifact))},...downloads].map(item=>`${item.sha256}  ${item.artifact}`).join('\n')+'\n');
  console.log(`Packaged ${artifact}`);
}
export function assembleRelease(directory, {version,commit}) {
  const manifest = json(join(directory,'manifest.json'));
  if (manifest.version !== version || !/^[a-f0-9]{40}$/.test(commit)) throw Error('Release version/source mismatch');
  const artifacts = [...manifest.artifacts];
  for (const file of readdirSync(directory).filter(file=>file.endsWith('.manifest.json'))) artifacts.push(json(join(directory,file)));
  const seen = new Set(), targets = new Set(), downloads = [];
  for (const item of artifacts) {
    const target = `${item.profile}/${item.os}/${item.arch}`;
    if (item.version !== version || !/^[a-f0-9]{7,40}$/.test(item.commit) || !commit.startsWith(item.commit)) throw Error('Mixed version/source artifacts');
    if (!/^[a-zA-Z0-9._-]+\.tar\.gz$/.test(item.artifact) || seen.has(item.artifact) || targets.has(target)) throw Error('Invalid/duplicate release artifact');
    if (hash(join(directory,item.artifact)) !== item.sha256) throw Error(`Checksum mismatch: ${item.artifact}`);
    if (item.signature !== null) throw Error('Unexpected archive signature field');
    if (!['unsigned','developer-id-notarized','authenticode'].includes(item.platform_signature??'unsigned')) throw Error('Invalid platform signature status');
    seen.add(item.artifact); targets.add(target);
    const nativeFormat=item.os==='darwin'?'dmg':item.os==='windows'?'portable-exe':null;
    const extra=item.downloads??[];
    if(!Array.isArray(extra)||extra.length!==(item.profile==='desktop'&&nativeFormat?1:0))throw Error('Missing/unexpected desktop download');
    for(const download of extra){
      const extension=nativeFormat==='dmg'?'.dmg':'.exe';
      if(download.format!==nativeFormat||download.artifact!==item.artifact.replace(/\.tar\.gz$/,extension)||seen.has(download.artifact))throw Error('Invalid/duplicate desktop download');
      if(hash(join(directory,download.artifact))!==download.sha256)throw Error(`Checksum mismatch: ${download.artifact}`);
      seen.add(download.artifact);downloads.push(download);
    }
  }
  const expected = ['web-platform/linux/amd64','web-platform/linux/arm64','web-standalone/linux/amd64','web-standalone/linux/arm64',...['linux','darwin','windows'].flatMap(os=>['amd64','arm64'].map(arch=>`cli/${os}/${arch}`))];
  if (artifacts.length !== 13 || expected.some(target=>!targets.has(target)) || ['linux','darwin','windows'].some(os=>!artifacts.some(item=>item.profile==='desktop'&&item.os===os&&['amd64','arm64'].includes(item.arch)))) throw Error('Incomplete Web/CLI/native release matrix');
  const archives = readdirSync(directory).filter(file=>/\.(tar\.gz|dmg|exe)$/.test(file));
  if (archives.length !== seen.size || archives.some(file=>!seen.has(file))) throw Error('Unexpected archive in release bundle');
  artifacts.sort((a,b)=>a.artifact.localeCompare(b.artifact));
  writeFileSync(join(directory,'checksums.txt'),[...artifacts,...downloads].sort((a,b)=>a.artifact.localeCompare(b.artifact)).map(item=>`${item.sha256}  ${item.artifact}`).join('\n')+'\n');
  writeFileSync(join(directory,'manifest.json'),JSON.stringify({version,source_commit:commit,channel:'development',artifacts},null,2)+'\n');
  for (const file of readdirSync(directory).filter(file=>file.endsWith('.manifest.json'))) rmSync(join(directory,file));
  for (const file of readdirSync(directory).filter(file=>file.endsWith('.checksums.txt'))) rmSync(join(directory,file));
  console.log(`Verified ${artifacts.length} release archives from ${commit}`);
  return artifacts;
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2]==='desktop') packageDesktop();
  else if (process.argv[2]==='assemble' && process.argv[3]) assembleRelease(resolve(process.argv[3]),source(process.cwd()));
  else throw Error('Use release-assets.mjs desktop|assemble <directory>');
}
