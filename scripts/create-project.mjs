// Author: yunnuo <ymz@ebox.vip>
// Description: Export tracked framework sources to a fresh application, without secrets, Git history or build outputs.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const frameworkRoot = fileURLToPath(new URL('../', import.meta.url));
export function createProject({ source = frameworkRoot, directory, name, module, bundle, slug }) {
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(slug ?? '')) throw Error('slug must contain 2–40 lowercase letters, digits or hyphens');
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,39}$/u.test(name ?? '')) throw Error('name must contain 2–40 letters, digits, spaces, dots, underscores or hyphens');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]+\/[a-zA-Z0-9_./-]+$/.test(module ?? '') || module.includes('..')) throw Error('module must be a Go module path, e.g. github.com/team/product');
  if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*){2,}$/.test(bundle ?? '')) throw Error('bundle must be a reverse-domain application identifier');
  source = realpathSync(resolve(source)); let target = resolve(directory);
  if (target === source || relative(source, target).split(sep)[0] !== '..' && !isAbsolute(relative(source, target))) throw Error('destination must be outside the framework checkout');
  if (existsSync(target)) throw Error('destination already exists; choose a new directory');
  const paths = execFileSync('git', ['-C', source, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const excluded = /^(?:\.git(?:\/|$)|node_modules\/|build\/|data\/|test-results\/|playwright-report\/|\.env(?:\.|$)|.*\/(?:secret\.key|installation\.json|bootstrap\.token)$)/;
  const selected = paths.filter(path => !excluded.test(path));
  if (!selected.includes('go.mod') || !selected.includes('framework.manifest.json')) throw Error('source is not a tracked Unicore checkout');
  mkdirSync(dirname(target), { recursive: true });
  target = join(realpathSync(dirname(target)),target.split(sep).at(-1));
  if (target === source || relative(source,target).split(sep)[0] !== '..' && !isAbsolute(relative(source,target))) throw Error('destination resolves inside the framework checkout');
  const staging = target + `.creating-${process.pid}`;
  if (existsSync(staging)) throw Error('staging directory already exists');
  mkdirSync(staging);
  try {
    const oldModule = readFileSync(join(source, 'go.mod'), 'utf8').match(/^module (.+)$/m)[1].trim();
    for (const path of selected) {
      if (path.startsWith('/') || path.split('/').includes('..')) throw Error('unsafe source path');
      for (let parent=dirname(join(source,path)); parent!==source; parent=dirname(parent)) if(lstatSync(parent).isSymbolicLink()) throw Error(`source directory links are not supported: ${path}`);
      const from = join(source, path), to = join(staging, path);
      if (!lstatSync(from).isFile()) throw Error(`source links and special files are not supported: ${path}`);
      mkdirSync(dirname(to), { recursive: true }); cpSync(from, to);
      if (/\.(?:go|mjs|mts|ts|tsx|json|md|ya?ml|html)$/.test(path) || ['Makefile','go.mod','Dockerfile'].includes(path.split('/').at(-1))) {
        writeFileSync(to, readFileSync(to, 'utf8').replaceAll(oldModule, module));
      }
    }
    const edit = (path, fn) => { const full = join(staging,path); const value = JSON.parse(readFileSync(full,'utf8')); fn(value); writeFileSync(full,JSON.stringify(value,null,2)+'\n'); };
    edit('assets/updates/config.json', p => { p.repository=''; p.keys={}; p.channel='stable'; p.allow_unsigned_platform=false; });
    edit('package.json', p => { p.name=slug; p.license='MIT'; });
    edit('assets/theme/tokens.json', p => { p.brand.name=name; });
    edit('assets/brand/identity.json', p => { p.bundleId=bundle; });
    edit('cmd/desktop/wails.json', p => { p.name=name; p.outputfilename=slug+'-desktop'; p.info.productName=name; });
    const upstream = execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
    writeFileSync(join(staging,'project.provenance.json'),JSON.stringify({author:'yunnuo <ymz@ebox.vip>',framework:'Unicore',upstream:'https://github.com/yunnuo88520/Unicore',revision:upstream,worktree_modified:execFileSync('git',['-C',source,'status','--porcelain'],{encoding:'utf8'}).trim()!=='',created_at:new Date().toISOString()},null,2)+'\n');
    writeFileSync(join(staging,'README.md'),`<!-- Author: yunnuo <ymz@ebox.vip> -->\n# ${name}\n\n基于 Unicore 的应用。上游版本见 project.provenance.json，保留 LICENSE 与框架作者头。\n\nGo module：${module}；桌面标识：${bundle}。主题/名称入口为 assets/theme/tokens.json，图标入口为 assets/brand/identity.json。\n\n开发：\n\n\`\`\`sh\nmake install\nmake docs\nmake doctor\nmake dev-server\n# 第二个终端\nmake dev-web\n\`\`\`\n\n首次启动访问 /install；平台与本地模式按需选择。业务样板见 docs/03-runbooks/business-example.md，扩展与上游更新见 docs/03-runbooks/framework-upgrade.md。\n\n更新渠道默认清空，避免安装上游框架发行包。按 docs/03-runbooks/updates.md 配置自己的仓库、公钥和发布私钥。\n\n提交前执行 make docs、make test 和受影响构建。\n`);
    // Sources are exported only; package installation and code execution remain explicit next steps.
    renameSync(staging,target);
    return target;
  } catch(error) { rmSync(staging,{recursive:true,force:true}); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args=process.argv.slice(2), options={};
    for(let i=0;i<args.length;i+=2){if(!['--directory','--name','--module','--bundle','--slug'].includes(args[i])||!args[i+1])throw Error('Use --directory PATH --name NAME --slug SLUG --module MODULE --bundle ID');options[args[i].slice(2)]=args[i+1];}
    if(!options.directory)throw Error('--directory is required');
    console.log(`Created ${createProject(options)}\nNext: cd into the project; make install; make docs; make doctor`);
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
