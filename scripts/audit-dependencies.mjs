// Author: yunnuo <ymz@ebox.vip>
// Description: Gate high and critical dependency advisories behind an exceptions ledger whose entries always carry a mitigation and an expiry date.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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

export function advisoriesFromAudit(raw) {
  const report = JSON.parse(raw);
  const bucket = Array.isArray(report.advisories) ? report.advisories : Object.values(report.advisories ?? {});
  return bucket
    .filter(item => SEVERITIES.has(item.severity))
    .map(item => ({
      package: item.module_name ?? 'unknown',
      advisory: item.github_advisory_id || item.url || String(item.id ?? 'unknown'),
      severity: item.severity,
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
  const run = spawnSync('pnpm', ['audit', '--json'], { encoding: 'utf8' });
  if (run.error) throw run.error;
  const stdout = (run.stdout ?? '').trim();
  const start = stdout.indexOf('{');
  if (start < 0) throw Error(`pnpm audit produced no JSON (exit ${run.status}); run pnpm audit manually and triage`);
  const uncovered = reconcile(advisoriesFromAudit(stdout.slice(start)), exceptions);
  if (uncovered.length) {
    throw Error(`uncovered high/critical advisories; upgrade or add a reviewed, expiring exception:\n${uncovered.join('\n')}`);
  }
  console.log('PASS dependency audit within the reviewed exceptions ledger');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
