// Author: yunnuo <ymz@ebox.vip>
// Description: User-facing native downloads; tar archives remain the OTA transport.
import {execFileSync} from 'node:child_process';
import {copyFileSync,cpSync,existsSync,mkdirSync,mkdtempSync,rmSync,symlinkSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';

const HDIUTIL='/usr/bin/hdiutil';

// Render the drag-to-install backdrop to an exact 660x400 PNG: qlmanage emits a
// 660x660 square thumbnail of the 660-wide SVG, and sips center-crops the middle
// 400 band that the artwork reserves for itself.
function renderDmgBackground(root,application,destination){
  const svg=readFileSync(join(root,'scripts/dmg/background.svg'),'utf8').replaceAll('{{APP_NAME}}',application);
  const work=join(root,'build/dmg-work/render');
  rmSync(work,{recursive:true,force:true});mkdirSync(work,{recursive:true});
  const source=join(work,'background.svg');
  writeFileSync(source,svg);
  execFileSync('/usr/bin/qlmanage',['-t','-s','660','-o',work,source],{stdio:'pipe'});
  renameSync(source+'.png',source+'.square.png');
  execFileSync('/usr/bin/sips',['-c','400','660',source+'.square.png','--out',destination],{stdio:'pipe'});
  rmSync(work,{recursive:true,force:true});
}

// Position icons and the backdrop picture through Finder; CI runners without
// automation rights fail here and the caller falls back to the plain layout.
// NOTE: no `with timeout` wrapper — it breaks `tell disk` target resolution.
function styleDmgVolume(application,binary){
  const script=`tell application "Finder"
    tell disk "${application}"
      open
      set current view of container window to icon view
      set toolbar visible of container window to false
      set statusbar visible of container window to false
      set the bounds of container window to {400, 100, 1060, 500}
      set direc to icon view options of container window
      set arrangement of direc to not arranged
      set icon size of direc to 128
      set text size of direc to 14
      set background picture of direc to file ".background:background.png"
      set position of item "${binary}" of container window to {160, 205}
      set position of item "Applications" of container window to {500, 205}
      close
      open
      delay 1
      close
    end tell
end tell`;
  execFileSync('/usr/bin/osascript',['-e',script],{stdio:'pipe',timeout:45000});
}

function detach(mount){
  try{execFileSync(HDIUTIL,['detach',mount],{stdio:'pipe'});}
  catch{
    try{execFileSync('sleep',['2'],{stdio:'ignore'});execFileSync(HDIUTIL,['detach','-force',mount],{stdio:'pipe'});}
    catch(error){if(existsSync(mount))throw error;}
  }
}

// The kernel releases a mount point asynchronously after hdiutil exits, so a
// remount onto the same path fails with "No such file or directory" when it
// races the teardown. Wait until the stale anchor is gone before re-attaching.
function waitMountReleased(mount){
  for(let attempt=0;attempt<20&&existsSync(mount);attempt++)execFileSync('sleep',['0.5'],{stdio:'ignore'});
}

// DiskImages helpers may retain a POSIX lock on the backing file after detach
// removes its mount point. Convert a private, never-attached copy so teardown
// cannot block conversion. Copy the complete image to preserve Finder metadata.
export function convertDmg(source, destination, run = execFileSync) {
  const work = mkdtempSync(join(dirname(source), '.dmg-convert-'));
  try {
    const snapshot = join(work, 'source.dmg');
    copyFileSync(source, snapshot);
    run(HDIUTIL, ['convert', snapshot, '-format', 'UDZO', '-o', destination], {stdio: ['ignore', 'inherit', 'pipe']});
  } finally {
    rmSync(work, {recursive: true, force: true});
  }
}

export function desktopDownloads({root,output,name,built,binary,targetOS,application,platformSignature}) {
  if(targetOS==='linux')return [];
  const artifact=name+(targetOS==='darwin'?'.dmg':'.exe'), destination=join(output,artifact);
  if(targetOS==='darwin') {
    const stage=join(root,'build/dmg-staging',name);
    rmSync(stage,{recursive:true,force:true});mkdirSync(stage,{recursive:true});
    cpSync(built,join(stage,binary),{recursive:true});
    symlinkSync('/Applications',join(stage,'Applications'));
    mkdirSync(join(stage,'.background'));
    renderDmgBackground(root,application,join(stage,'.background','background.png'));
    const work=join(root,'build/dmg-work');rmSync(join(work,'unsigned.dmg'),{force:true});
    execFileSync(HDIUTIL,['create','-volname',application,'-srcfolder',stage,'-ov','-format','UDRW',join(work,'unsigned.dmg')],{stdio:'inherit'});
    // Mount at the default /Volumes anchor: Finder only addresses disks there,
    // and the styling step talks to the volume through Finder.
    const attach=execFileSync(HDIUTIL,['attach',join(work,'unsigned.dmg')],{encoding:'utf8'});
    const mount=attach.trim().split('\n').pop().split('\t').pop().trim();
    try{
      let styled=false;
      for(let attempt=0;attempt<3&&!styled;attempt++){
        try{styleDmgVolume(application,binary);styled=true;}
        catch(error){
          if(attempt===2)console.warn(`DMG installer styling skipped (${error.message.split('\n')[0]}); shipping the plain layout`);
          else{detach(mount);waitMountReleased(mount);execFileSync(HDIUTIL,['attach','-mountpoint',mount,join(work,'unsigned.dmg')],{stdio:'inherit'});}
        }
      }
    }finally{
      rmSync(join(mount,'.fseventsd'),{recursive:true,force:true});
      // Finder flushes the view settings (.DS_Store) on clean unmount.
      execFileSync('sync',{stdio:'ignore'});
      detach(mount);
    }
    waitMountReleased(mount);
    convertDmg(join(work,'unsigned.dmg'), destination);
    execFileSync(HDIUTIL,['verify',destination],{stdio:'inherit'});
  } else cpSync(built,destination);
  return [{artifact,sha256:createHash('sha256').update(readFileSync(destination)).digest('hex'),format:targetOS==='darwin'?'dmg':'portable-exe'}];
}
