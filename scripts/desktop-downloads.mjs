// Author: yunnuo <ymz@ebox.vip>
// Description: User-facing native downloads; tar archives remain the OTA transport.
import {execFileSync} from 'node:child_process';
import {cpSync,mkdirSync,rmSync,symlinkSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

export function desktopDownloads({root,output,name,built,binary,targetOS,application,platformSignature}) {
  if(targetOS==='linux')return [];
  const artifact=name+(targetOS==='darwin'?'.dmg':'.exe'), destination=join(output,artifact);
  if(targetOS==='darwin') {
    const stage=join(root,'build/dmg-staging',name);
    rmSync(stage,{recursive:true,force:true});mkdirSync(stage,{recursive:true});
    cpSync(built,join(stage,binary),{recursive:true});
    symlinkSync('/Applications',join(stage,'Applications'));
    cpSync(join(root,'LICENSE'),join(stage,'LICENSE'));
    writeFileSync(join(stage,'安装说明 - Installation.txt'),`将 ${binary} 拖到 Applications 文件夹，然后从应用程序打开。\nDrag ${binary} into Applications, then launch it from Applications.\n\n系统签名 / OS signature: ${platformSignature}\n`);
    execFileSync('/usr/bin/hdiutil',['create','-volname',application,'-srcfolder',stage,'-ov','-format','UDZO',destination],{stdio:'inherit'});
    execFileSync('/usr/bin/hdiutil',['verify',destination],{stdio:'inherit'});
  } else cpSync(built,destination);
  return [{artifact,sha256:createHash('sha256').update(readFileSync(destination)).digest('hex'),format:targetOS==='darwin'?'dmg':'portable-exe'}];
}
