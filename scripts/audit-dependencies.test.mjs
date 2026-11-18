// Author: yunnuo <ymz@ebox.vip>
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advisoriesFromAudit, reconcile, validateExceptions } from './audit-dependencies.mjs';

const future = '2099-12-31';

test('every exception needs package, advisory, severity, mitigation and a future expiry', () => {
  validateExceptions({ exceptions: [{ package: 'x', advisory: 'GHSA-1', severity: 'high', mitigation: 'not reachable in our flows', expires_on: future }] });
  assert.throws(() => validateExceptions({}), /exceptions array/);
  assert.throws(() => validateExceptions({ exceptions: [{ advisory: 'GHSA-2', severity: 'high', mitigation: 'accepted risk here', expires_on: future }] }), /missing package/);
  assert.throws(() => validateExceptions({ exceptions: [{ package: 'x', advisory: 'GHSA-3', severity: 'moderate', mitigation: 'accepted risk here', expires_on: future }] }), /severity/);
  assert.throws(() => validateExceptions({ exceptions: [{ package: 'x', advisory: 'GHSA-4', severity: 'high', mitigation: 'no', expires_on: future }] }), /mitigation/);
  assert.throws(() => validateExceptions({ exceptions: [{ package: 'x', advisory: 'GHSA-5', severity: 'high', mitigation: 'accepted risk here', expires_on: '2026-1-1' }] }), /expires_on/);
  assert.throws(() => validateExceptions({ exceptions: [{ package: 'x', advisory: 'GHSA-6', severity: 'high', mitigation: 'accepted risk here', expires_on: '2000-01-01' }] }), /expired/);
  assert.throws(() => validateExceptions({ exceptions: [
    { package: 'x', advisory: 'GHSA-7', severity: 'high', mitigation: 'accepted risk here', expires_on: future },
    { package: 'x', advisory: 'GHSA-7', severity: 'high', mitigation: 'accepted risk here', expires_on: future },
  ] }), /duplicate/);
});

test('audit report parsing keeps every severity for ledger reconciliation', () => {
  const advisories = advisoriesFromAudit(JSON.stringify({ advisories: {
    1: { module_name: 'a', severity: 'critical', github_advisory_id: 'GHSA-c1' },
    2: { module_name: 'b', severity: 'high', url: 'https://example/h1' },
    3: { module_name: 'c', severity: 'low', github_advisory_id: 'GHSA-l1' },
    4: { module_name: 'd', severity: 'moderate', github_advisory_id: 'GHSA-m1' },
  } }));
  assert.deepEqual(advisories, [
    { package: 'a', advisory: 'GHSA-c1', severity: 'critical' },
    { package: 'b', advisory: 'https://example/h1', severity: 'high' },
    { package: 'c', advisory: 'GHSA-l1', severity: 'low' },
    { package: 'd', advisory: 'GHSA-m1', severity: 'moderate' },
  ]);
});

test('audit-service error payloads and malformed responses fail the gate instead of passing', () => {
  // The registry/audit service answered with an error object (pnpm exited 1):
  // treating it as an empty report printed PASS over a failed check.
  assert.throws(() => advisoriesFromAudit(JSON.stringify({ error: { code: 'ENOTFOUND', summary: 'request failed' } })), /instead of an audit report/);
  assert.throws(() => advisoriesFromAudit(JSON.stringify({ errorCode: 'AUDIT_UNAVAILABLE' })), /instead of an audit report/);
  assert.throws(() => advisoriesFromAudit('{"advisories": null}'), /instead of an audit report/);
  assert.throws(() => advisoriesFromAudit('[]'), /instead of an audit report/);
  assert.throws(() => advisoriesFromAudit('not json at all'), /invalid JSON/);
  // A real report keeps flowing through the non-zero audit exit unchanged.
  assert.equal(advisoriesFromAudit('{"advisories": {}}').length, 0);
});

test('an uncovered low advisory blocks like any other severity', () => {
  const ledger = [{ package: 'a', advisory: 'GHSA-c1', severity: 'critical', expires_on: future }];
  assert.deepEqual(reconcile([{ package: 'c', advisory: 'GHSA-l1', severity: 'low' }], ledger), ['low c GHSA-l1']);
});

test('reconciliation requires package and severity to match the ledger entry', () => {
  const ledger = [{ package: 'a', advisory: 'GHSA-c1', severity: 'critical', expires_on: future }];
  assert.deepEqual(reconcile([{ package: 'a', advisory: 'GHSA-c1', severity: 'critical' }], ledger), []);
  assert.deepEqual(reconcile([{ package: 'a', advisory: 'GHSA-c1', severity: 'high' }], ledger), ['high a GHSA-c1']);
  assert.deepEqual(reconcile([{ package: 'b', advisory: 'GHSA-c1', severity: 'critical' }], ledger), ['critical b GHSA-c1']);
  assert.deepEqual(reconcile([{ package: 'z', advisory: 'GHSA-z9', severity: 'critical' }], ledger), ['critical z GHSA-z9']);
});
