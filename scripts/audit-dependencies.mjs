// Author: yunnuo <ymz@ebox.vip>
// Description: Gate dependency advisories (low and above) behind an exceptions ledger whose entries always carry a mitigation and an expiry date; audit-service errors and malformed responses fail the gate.
import { readFileSync } from 'node:fs';
import { spawnTool } from './tool-spawn.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SEVERITIES = new Set(['high', 'critical']);

// validateExceptions is offline and runs everywhere: every entry must be
// complete and unexpired, otherwise the gate fails before any audit request.
export function validateExceptions(document, today = new Date()) {
  if (!document || !Array.isArray(document.exceptions)) throw Error('audit exceptions file must contain an exceptions array');
  const seen = new Set();
  for (const entry of document.exceptions) {
    const label = entry?.advisory || entry?.package || '?';
    if (typeof entry.package !== 'string' || !entry.package) throw Error(`exception ${label}: missing package`);
    if (typeof entry.advisory !== 'string' || !entry.advisory) throw Error(`exception ${label}: missing advisory id`);
    if (!SEVERITIES.has(entry.severity)) throw Error(`exception ${entry.advisory}: severity must be high or critical`);
    if (typeof entry.mitigation !== 'string' || entry.mitigation.trim().length < 4) throw Error(`exception ${entry.advisory}: mitigation must explain why the risk is accepted`);
    if (typeof entry.expires_on !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.expires_on)) throw Error(`exception ${entry.advisory}: expires_on must be YYYY-MM-DD`);
    if (new Date(`${entry.expires_on}T23:59:59Z`) < today) throw Error(`exception ${entry.advisory} expired on ${entry.expires_on}; re-triage or remove it`);
    if (seen.has(entry.advisory)) throw Error(`duplicate exception ${entry.advisory}`);
    seen.add(entry.advisory);
  }
  return document.exceptions;
}

// The audit service answers with a report even when it rejects the request:
// error payloads parse as JSON but carry no advisories bucket, and treating
// them as "zero advisories" would print PASS over a failed check.
export function auditReport(raw) {
  let report;
  try { report = JSON.parse(raw); } catch { throw Error('pnpm audit produced invalid JSON; run pnpm audit manually and triage'); }
  const advisories = report && typeof report === 'object' && !Array.isArray(report) ? report.advisories : undefined;
  if (!advisories || typeof advisories !== 'object') {
    const keys = report && typeof report === 'object' && !Array.isArray(report) ? Object.keys(report).join(',') || 'an empty object' : `a ${Array.isArray(report) ? 'array' : typeof report}`;
    throw Error(`pnpm audit answered ${keys} instead of an audit report; the audit service may have failed; run pnpm audit manually and triage`);
  }
  return advisories;
}

export function advisoriesFromAudit(raw) {
  // Every severity blocks: the ledger records the accepted risk per advisory,
  // and low/moderate entries deserve the same reviewed-expiry treatment.
  const bucket = auditReport(raw);
  return (Array.isArray(bucket) ? bucket : Object.values(bucket))
    .map(item => ({
      package: item.module_name ?? 'unknown',
      advisory: item.github_advisory_id || item.url || String(item.id ?? 'unknown'),
      severity: item.severity ?? 'unknown',
    }));
}

export function reconcile(advisories, exceptions) {
  const byId = new Map(exceptions.map(entry => [entry.advisory, entry]));
  const uncovered = [];
  for (const item of advisories) {
    const exception = byId.get(item.advisory);
    if (!exception || exception.package !== item.package || exception.severity !== item.severity) {
      uncovered.push(`${item.severity} ${item.package} ${item.advisory}`);
      continue;
    }
    console.log(`excepted: ${item.severity} ${item.package} ${item.advisory} (until ${exception.expires_on})`);
  }
  return uncovered;
}

function main() {
  const document = JSON.parse(readFileSync('scripts/audit-exceptions.json', 'utf8'));
  const exceptions = validateExceptions(document);
  console.log(`audit exceptions ledger: ${exceptions.length} active entries, none expired`);
  // pnpm audit exits non-zero when advisories exist, so spawn and keep stdout.
  const run = spawnTool('pnpm', ['audit', '--json']);
  if (run.ok === false && (run.kind === 'not-found' || run.kind === 'launch-failed')) {
    throw Error(`pnpm audit could not run (${run.reason}); run pnpm audit manually and triage`);
  }
  const uncovered = reconcile(advisoriesFromAudit(run.output.trim()), exceptions);
  if (uncovered.length) {
    throw Error(`uncovered advisories (low and above); upgrade or add a reviewed, expiring exception:\n${uncovered.join('\n')}`);
  }
  console.log('PASS dependency audit within the reviewed exceptions ledger');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
