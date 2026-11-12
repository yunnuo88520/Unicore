// Author: yunnuo <ymz@ebox.vip>
// Description: Runtime OTA selectors match the Catalog metadata used to package and sign releases.
package updating

import (
	"encoding/json"
	"errors"
	"github.com/yunnuo/unicore/internal/edition"
	"github.com/yunnuo/unicore/internal/updates"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestRuntimeTargetsMatchReleaseCatalog(t *testing.T) {
	raw, err := os.ReadFile("../../../migrations/metadata.gen.json")
	if err != nil {
		t.Fatal(err)
	}
	var metadata struct {
		Generation string `json:"schema_generation"`
		Profiles   map[string]struct {
			Fingerprint string `json:"schema_fingerprint"`
		} `json:"profiles"`
	}
	if err = json.Unmarshal(raw, &metadata); err != nil {
		t.Fatal(err)
	}
	for _, profile := range []string{"web-platform", "web-standalone", "desktop"} {
		target := currentTarget(profile)
		if target.SchemaGeneration != metadata.Generation || target.SchemaFingerprint != metadata.Profiles[profile].Fingerprint || len(target.SchemaFingerprint) != 64 {
			t.Fatalf("runtime/release Catalog mismatch: %+v", target)
		}
	}
}

// This crosses the actual JS packager/signer and Go runtime boundary. A
// hand-authored target fixture would reproduce the original constant drift.
func TestPackagedSignedTargetMatchesRuntime(t *testing.T) {
	directory := t.TempDir()
	command := exec.Command("node", "--input-type=module", "-e", `
 import {generateKeyPairSync,createHash} from 'node:crypto';
 import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
 import {join} from 'node:path';
 import {migrationTarget} from './scripts/migration-target.mjs';
 import {signUpdates} from './scripts/update-sign.mjs';
 const dir=process.argv[1],profile=process.argv[2],os=process.argv[3],arch=process.argv[4];
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const key=Buffer.from(publicKey.export({format:'jwk'}).x,'base64url').toString('base64');
 mkdirSync(join(dir,'assets/updates'),{recursive:true});mkdirSync(join(dir,'assets/brand'),{recursive:true});
 writeFileSync(join(dir,'assets/updates/config.json'),JSON.stringify({keys:{test:key},allow_unsigned_platform:true}));
 writeFileSync(join(dir,'assets/brand/identity.json'),JSON.stringify({bundleId:'fixture.application'}));
 const bytes=Buffer.from('isolated transport fixture');writeFileSync(join(dir,'fixture.tar.gz'),bytes);
 const {schema_generation,schema_fingerprint}=migrationTarget(profile);
 writeFileSync(join(dir,'manifest.json'),JSON.stringify({version:'1.0.1',source_commit:'a'.repeat(40),artifacts:[{profile,os,arch,schema_generation,schema_fingerprint,artifact:'fixture.tar.gz',sha256:createHash('sha256').update(bytes).digest('hex'),features:{license:process.argv[5]==='true',updater:true},platform_signature:'unsigned'}]}));
 signUpdates(dir,{root:dir,privateKey:privateKey.export({type:'pkcs8',format:'pem'})});
 writeFileSync(join(dir,'public.txt'),key);
 `, directory, "web-platform", runtime.GOOS, runtime.GOARCH, strconv.FormatBool(edition.License))
	command.Dir = "../../.."
	if out, err := command.CombinedOutput(); err != nil {
		t.Fatalf("packager/signer failed: %s %v", out, err)
	}
	raw, err := os.ReadFile(filepath.Join(directory, "update-manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	signature, err := os.ReadFile(filepath.Join(directory, "update-manifest.sig"))
	if err != nil {
		t.Fatal(err)
	}
	public, err := os.ReadFile(filepath.Join(directory, "public.txt"))
	if err != nil {
		t.Fatal(err)
	}
	trust := updates.Trust{Application: "fixture.application", Keys: map[string]string{"test": string(public)}, AllowUnsignedPlatform: true}
	target := currentTarget("web-platform")
	if _, _, err = updates.Verify(raw, signature, trust, "1.0.0", "1.0.1", target, time.Now()); err != nil {
		t.Fatal("real release selector rejected", err)
	}
	target.SchemaFingerprint = strings.Repeat("0", 64)
	if _, _, err = updates.Verify(raw, signature, trust, "1.0.0", "1.0.1", target, time.Now()); !errors.Is(err, updates.ErrRejected) {
		t.Fatal("different database accepted", err)
	}
}
