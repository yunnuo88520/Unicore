// Author: yunnuo <ymz@ebox.vip>
// Description: Isolated Windows OTA fixture using a real Wails desktop executable and a private HTTPS test channel.
// Usage: node scripts/test-native-update-windows.mjs [--auto]
//   --auto  Attempt UIAutomation to click through the update flow (requires desktop session).
import {migrationTarget} from './migration-target.mjs';
import {execFileSync, spawn} from 'node:child_process';
import {createHash, generateKeyPairSync, sign} from 'node:crypto';
import {mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, openSync, closeSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, dirname} from 'node:path';
import {createServer} from 'node:https';
import {fileURLToPath} from 'node:url';

const auto = process.argv.includes('--auto');
if (process.platform !== 'win32') throw Error('This fixture requires native Windows. Build with wails build first.');
if (process.arch !== 'x64') throw Error('This fixture targets windows/amd64. Use x64 Node.js and a matching Wails build.');

const root_ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root_, 'cmd/desktop/wails.json'), 'utf8'));
const identity = JSON.parse(readFileSync(join(root_, 'assets/brand/identity.json'), 'utf8'));
const product = JSON.parse(readFileSync(join(root_, 'product.identity.json'), 'utf8'));
const features = {license: false, updater: true, notes: true};
const compiledFeatures = JSON.parse(readFileSync(join(root_, 'apps/desktop/static/features.json'), 'utf8'));
for (const [feature, enabled] of Object.entries(features)) {
  if (compiledFeatures[feature] !== enabled) throw Error('Rebuild the desktop with default features: FEATURE_LICENSE=false, FEATURE_UPDATER=true, FEATURE_NOTES=true');
}
const current = readFileSync(join(root_, 'VERSION'), 'utf8').trim();
const parts = current.split('.').map(Number);
parts[2]++;
const next = parts.join('.');

const source = resolve(root_, 'build/desktop/bin', config.outputfilename + '.exe');
if (!existsSync(source)) throw Error('Run wails build first: build/desktop/bin/' + config.outputfilename + '.exe not found');

const base = mkdtempSync(join(tmpdir(), 'unicore-native-ota-'));
const installDir = join(base, 'current');
const staging = join(base, 'package', 'release');
const data = join(base, 'data');
for (const dir of [installDir, staging, data]) mkdirSync(dir, {recursive: true});

const run = (command, args, options = {}) => execFileSync(command, args, {stdio: 'pipe', cwd: root_, ...options});
const commit = run('git', ['rev-parse', 'HEAD'], {cwd: root_, encoding: 'utf8'}).trim();

// 1. Copy current version to the install directory.
cpSync(source, join(installDir, config.outputfilename + '.exe'));
writeFileSync(join(installDir, 'VERSION'), current + '\n');
const migration = migrationTarget('desktop', root_);
const {schema_generation: gen, schema_fingerprint: fp} = migration;
writeFileSync(join(installDir, 'manifest.json'), JSON.stringify({version: current, profile: 'desktop', os: 'windows', arch: 'amd64', commit: commit, ...migration, features}));

// 2. Build the next version into staging using go build (faster than full wails for version-only change).
const goExe = 'go';
const env = {...process.env, CGO_ENABLED: '1', GOOS: 'windows', GOARCH: 'amd64'};
run(goExe, ['build', '-tags', 'desktop,updater', '-ldflags', `-X ${product.go.module}/internal/buildinfo.Version=${next}`, '-o', join(staging, config.outputfilename + '.exe'), './cmd/desktop'], {env});
writeFileSync(join(staging, 'VERSION'), next + '\n');
writeFileSync(join(staging, 'manifest.json'), JSON.stringify({version: next, profile: 'desktop', os: 'windows', arch: 'amd64', commit: commit, ...migration, features}));

// 3. Create tar.gz (bsdtar available on Windows 10+).
const artifact = 'native-fixture.tar.gz';
const archive = join(base, artifact);
run('tar', ['-czf', archive, '-C', join(base, 'package'), 'release']);

// 4. Generate Ed25519 keypair and trust config.
const bytes = readFileSync(archive);
const pair = generateKeyPairSync('ed25519');
const publicKey = Buffer.from(pair.publicKey.export({format: 'jwk'}).x, 'base64url').toString('base64');
const trust = join(base, 'trust.json');
writeFileSync(trust, JSON.stringify({repository: '', channel: 'preview', keys: {fixture: publicKey}, allow_unsigned_platform: true}), {mode: 0o600});

// 5. Sign the update manifest.
const manifest = Buffer.from(JSON.stringify({
  schema: 1,
  application_id: identity.bundleId,
  version: next,
  source_commit: commit,
  issued_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  artifacts: [{
    artifact, profile: 'desktop', os: 'windows', arch: 'amd64',
    schema_generation: gen, schema_fingerprint: fp,
    license: false, updater: true,
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    platform_signature: 'unsigned'
  }]
}));
const signature = JSON.stringify({key_id: 'fixture', algorithm: 'ed25519', signature: sign(null, manifest, pair.privateKey).toString('base64')});

// 6. Generate self-signed TLS certificate using Go.
const tlsKey = join(base, 'tls.key');
const tlsCert = join(base, 'tls.crt');
const certGen = join(base, 'certgen.go');
writeFileSync(certGen, `package main
import ("crypto/rand";"crypto/rsa";"crypto/x509";"crypto/x509/pkix";"encoding/pem";"math/big";"net";"os";"time")
func main(){k,_:=rsa.GenerateKey(rand.Reader,2048);t:=x509.Certificate{SerialNumber:big.NewInt(1),Subject:pkix.Name{CommonName:"127.0.0.1"},NotBefore:time.Now(),NotAfter:time.Now().Add(24*time.Hour),KeyUsage:x509.KeyUsageKeyEncipherment|x509.KeyUsageDigitalSignature,ExtKeyUsage:[]x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},IPAddresses:[]net.IP{net.ParseIP("127.0.0.1")}};d,_:=x509.CreateCertificate(rand.Reader,&t,&t,&k.PublicKey,k);kf,_:=os.Create(os.Args[1]);pem.Encode(kf,&pem.Block{Type:"RSA PRIVATE KEY",Bytes:x509.MarshalPKCS1PrivateKey(k)});kf.Close();cf,_:=os.Create(os.Args[2]);pem.Encode(cf,&pem.Block{Type:"CERTIFICATE",Bytes:d});cf.Close()}
`);
const goEnv = {...env, GOPROXY: 'off'};
run(goExe, ['run', certGen, tlsKey, tlsCert], {env: goEnv});

// 7. Start HTTPS server.
const server = createServer({key: readFileSync(tlsKey), cert: readFileSync(tlsCert)}, (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  switch (req.url) {
    case '/feed':
      res.end(JSON.stringify({releases: [{version: next, notes: '原生更新测试：签名包、真实 Wails 重启与启动确认。', published_at: new Date().toISOString(), prerelease: true, url: '', assets: [
        {name: 'update-manifest.json', url: address + '/update-manifest.json'},
        {name: 'update-manifest.sig', url: address + '/update-manifest.sig'},
        {name: artifact, url: address + '/' + artifact}
      ]}]}));
      break;
    case '/update-manifest.json': res.end(manifest); break;
    case '/update-manifest.sig': res.end(signature); break;
    case '/' + artifact:
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Length', bytes.length);
      res.end(bytes);
      break;
    default: res.writeHead(404).end();
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const address = 'https://127.0.0.1:' + server.address().port;

// 8. Launch the current version with the private test feed.
const log = openSync(join(base, 'native.log'), 'a');
const child = spawn(join(installDir, config.outputfilename + '.exe'), [], {
  env: {...process.env,
    APP_DATA_DIR: data,
    APP_UPDATE_TRUST_FILE: trust,
    APP_UPDATE_FEED_URL: address + '/feed',
    APP_UPDATE_CA_FILE: tlsCert,
  },
  cwd: installDir,
  stdio: ['ignore', log, log],
});
closeSync(log);

console.log(JSON.stringify({base, from: current, to: next, pid: child.pid, feed: address + '/feed', auto}));
console.log(auto
  ? 'UIAutomation will click through the update flow automatically.'
  : 'In the real Unicore window: open 系统更新, 检查更新, 更新并重启, confirm backup. No existing instance is used.');

// 9. Optionally automate UI clicks via PowerShell UIAutomation.
if (auto) {
  const uiScript = join(base, 'ui-automation.ps1');
  writeFileSync(uiScript, '\ufeff' + `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$pid_ = ${child.pid}
$deadline = [DateTime]::UtcNow.AddSeconds(120)
function Find-Window {
  while ([DateTime]::UtcNow -lt $deadline) {
    try {
      $p = Get-Process -Id $pid_ -ErrorAction SilentlyContinue
      if ($p -and $p.MainWindowHandle -ne 0) {
        return [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
      }
    } catch {}
    Start-Sleep -Milliseconds 500
  }
  return $null
}
function Click-ByName($root, $name) {
  $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $name)
  $el = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
  if ($el) {
    $invoke = $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $invoke.Invoke()
    return $true
  }
  return $false
}
$window = Find-Window
if (-not $window) { Write-Error 'Window not found within deadline'; exit 1 }
# Navigate to 系统更新 page
Start-Sleep -Seconds 3
$navDeadline = [DateTime]::UtcNow.AddSeconds(30)
$clicked = $false
while ([DateTime]::UtcNow -lt $navDeadline -and -not $clicked) { $clicked = Click-ByName $window '系统更新'; if (-not $clicked) { Start-Sleep -Milliseconds 500 } }
if (-not $clicked) { Write-Error 'Could not find 系统更新 nav item'; exit 1 }
Start-Sleep -Seconds 2
# Click 检查更新
$checkDeadline = [DateTime]::UtcNow.AddSeconds(30)
$clicked = $false
while ([DateTime]::UtcNow -lt $checkDeadline -and -not $clicked) { $clicked = Click-ByName $window '检查更新'; if (-not $clicked) { Start-Sleep -Milliseconds 500 } }
if (-not $clicked) { Write-Error 'Could not find 检查更新 button'; exit 1 }
Write-Host 'Clicked check update, waiting for apply button...'
# Wait for 更新并重启 to become available
Start-Sleep -Seconds 5
$applyDeadline = [DateTime]::UtcNow.AddSeconds(30)
$clicked = $false
while ([DateTime]::UtcNow -lt $applyDeadline -and -not $clicked) { $clicked = Click-ByName $window '更新并重启'; if (-not $clicked) { Start-Sleep -Milliseconds 1000 } }
if (-not $clicked) { Write-Error 'Could not find enabled 更新并重启 button'; exit 1 }
Start-Sleep -Seconds 2
# Click backup checkbox
$toggled = $false
$toggleDeadline = [DateTime]::UtcNow.AddSeconds(10)
while ([DateTime]::UtcNow -lt $toggleDeadline -and -not $toggled) {
  $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, '我已备份数据库、文件、配置和实例密钥')
  $cb = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
  if ($cb) { $tp = $cb.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern); $tp.Toggle(); $toggled = $true }
  else { Start-Sleep -Milliseconds 500 }
}
if (-not $toggled) { Write-Error 'Could not find backup checkbox'; exit 1 }
Start-Sleep -Seconds 1
# Click 确认更新
$confirmDeadline = [DateTime]::UtcNow.AddSeconds(10)
$clicked = $false
while ([DateTime]::UtcNow -lt $confirmDeadline -and -not $clicked) { $clicked = Click-ByName $window '确认更新'; if (-not $clicked) { Start-Sleep -Milliseconds 500 } }
if (-not $clicked) { Write-Error 'Could not find 确认更新 button'; exit 1 }
Write-Host 'UI automation completed successfully.'
` );
  spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', uiScript], {stdio: 'inherit'});
}

// 10. Monitor state.json for terminal status.
const statePath = join(data, 'updates', 'state.json');
const timer = setInterval(() => {
  try {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    if (['completed', 'rolled_back', 'failed'].includes(state.status)) {
      console.log(JSON.stringify(state));
      clearInterval(timer);
      server.close();
      process.exit(state.status === 'completed' ? 0 : 1);
    }
  } catch {}
}, 1000);

process.on('SIGINT', () => {
  clearInterval(timer);
  child.kill('SIGTERM');
  server.close();
  process.exit(0);
});
