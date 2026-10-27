// Author: yunnuo <ymz@ebox.vip>
// Description: Fail native packaging when Wails defaults or stale brand inputs reappear.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=path=>readFileSync(`${root}${path}`);
const identity=JSON.parse(read('assets/brand/identity.json'));
const config=JSON.parse(read('cmd/desktop/wails.json'));
const version=read('VERSION').toString().trim();
if(config.info.productVersion!==version)throw new Error('Native productVersion differs from VERSION; run pnpm version:sync');
for(const [source,target] of [['icon-1024.png','appicon.png'],['favicon.ico','windows/icon.ico']]){
 if(!read(`assets/brand/${source}`).equals(read(`build/desktop/${target}`)))throw new Error(`${target}: stale native brand asset`);
}
for(const dev of [false,true]){
 const plist=read(`build/desktop/darwin/Info${dev?'.dev':''}.plist`).toString();
 if(!plist.includes(`<string>${identity.bundleId}${dev?'.dev':''}</string>`)||plist.includes('com.wails.')||plist.includes('__UNICORE_'))throw new Error('Native bundle identity is missing or still uses Wails defaults');
 if(dev&&!plist.includes('NSAllowsLocalNetworking'))throw new Error('Development plist must allow the loopback Vite server');
}
if(!config.preBuildHooks?.['*/*']?.includes('design:generate'))throw new Error('Raw Wails builds must prepare brand assets before packaging');

if(process.argv.includes('--bundle')&&process.platform==='darwin'){
 const bundle=`${root}build/desktop/bin/${config.name}.app`;
 const plist=JSON.parse(execFileSync('plutil',['-convert','json','-o','-',`${bundle}/Contents/Info.plist`],{encoding:'utf8'}));
 const expectedID=identity.bundleId+(process.argv.includes('--dev')?'.dev':'');
 if(plist.CFBundleIdentifier!==expectedID||plist.CFBundleDisplayName!==config.name||plist.CFBundleExecutable!==config.outputfilename)throw new Error('Packaged app metadata does not match the product identity');
 if(plist.CFBundleVersion!==version||plist.CFBundleShortVersionString!==version)throw new Error('Packaged app version differs from VERSION');
 const icns=readFileSync(`${bundle}/Contents/Resources/${plist.CFBundleIconFile}.icns`);
 if(icns.toString('ascii',0,4)!=='icns'||icns.readUInt32BE(4)!==icns.length)throw new Error('Invalid packaged ICNS');
 const chunks=new Map();
 for(let offset=8;offset<icns.length;){
  const length=icns.readUInt32BE(offset+4);
  if(length<8||offset+length>icns.length)throw new Error('Invalid ICNS chunk');
  chunks.set(icns.toString('ascii',offset,offset+4),icns.subarray(offset+8,offset+length));offset+=length;
 }
 for(const size of ['ic10','ic14','ic13','ic12','ic11'])if(!chunks.has(size))throw new Error(`Missing ICNS resolution ${size}`);
 const pixels=png=>new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024"><image width="1024" height="1024" xlink:href="data:image/png;base64,${png.toString('base64')}"/></svg>`).render().pixels;
 if(!Buffer.from(pixels(chunks.get('ic10'))).equals(Buffer.from(pixels(read('assets/brand/icon-1024.png')))))throw new Error('Packaged ICNS pixels differ from the Unicore brand source');
 console.log(`PASS macOS bundle ${expectedID}, display name, executable and ICNS brand pixels (5 resolutions)`);
}
console.log('PASS native production/development identity and synchronized icon inputs');
