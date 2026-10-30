// Author: yunnuo <ymz@ebox.vip>
// Description: Explicit, shared distribution plans; never discover distributable files by Git tracking or directory recursion.
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, posix, resolve } from 'node:path';

export const audiences = ['user-release', 'project-template', 'public-wiki'];
const internal = /(?:^|\/)(?:04-ai|adr|maintainer|00-product|01-architecture|evidence[^/]*|acceptance[^/]*|workspace-preservation[^/]*|commercial-[^/]*|documentation-productization-audit[^/]*)(?:\/|\.|$)/i;
const sensitive = /(?:^|\/)(?:\.git|node_modules|data|build)(?:\/|$)|(?:^|\/)(?:\.env(?:\..*)?|secret\.key|installation\.json|bootstrap\.token)$|\.(?:db(?:-wal|-shm)?|pem|p12|pfx|p8|key)$/i;
export function safePath(path) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || path.includes('\\') || path.includes(':') || path.split('/').some(part => !part || part === '.' || part === '..') || /[\x00-\x1f]/.test(path)) throw Error(`Unsafe distribution path: ${path}`);
  return path;
}
export function regularFile(root, path) {
  safePath(path);
  let current = resolve(root);
  for (const part of path.split('/')) {
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw Error(`Distribution links are forbidden: ${path}`);
  }
  if (!lstatSync(current).isFile()) throw Error(`Distribution input is not a regular file: ${path}`);
  return current;
}
export function readDistribution(root) {
  const config = JSON.parse(readFileSync(regularFile(root, 'distribution/manifest.json'), 'utf8'));
  if (config.format_version !== 1 || !Array.isArray(config.documents) || !Array.isArray(config.template_files)) throw Error('Invalid distribution manifest');
  const seen = new Set(), slugs = new Set();
  for (const doc of config.documents) {
    safePath(doc.source); safePath(doc.target);
    if (internal.test(doc.source) || internal.test(doc.target) || sensitive.test(doc.source) || sensitive.test(doc.target) || !doc.source.endsWith('.md') || !doc.target.endsWith('.md')) throw Error(`Internal documentation cannot be distributed: ${doc.source}`);
    if (seen.has(doc.target) || !Array.isArray(doc.audiences) || !doc.audiences.length || doc.audiences.some(value => !audiences.includes(value))) throw Error('Duplicate document or invalid audience');
    seen.add(doc.target);
    if (doc.audiences.includes('public-wiki')) {
      if (doc.source !== doc.target) throw Error('Wiki document paths must be canonical');
      if (!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(doc.slug ?? '') || !doc.title || slugs.has(doc.slug)) throw Error('Invalid or duplicate public Wiki page');
      slugs.add(doc.slug);
    }
  }
  if (!slugs.has('Home')) throw Error('Public Wiki Home is required');
  for (const entry of config.template_files) {
    const file = typeof entry === 'string' ? {source: entry, target: entry} : entry;
    safePath(file.source); safePath(file.target);
    if (internal.test(file.source) || internal.test(file.target) || sensitive.test(file.source) || sensitive.test(file.target)) throw Error(`Forbidden template file: ${file.target}`);
  }
  return config;
}
export function distributionPlan(root, audience) {
  if (!audiences.includes(audience)) throw Error(`Unknown audience: ${audience}`);
  const config = readDistribution(root);
  const files = config.documents.filter(doc => doc.audiences.includes(audience)).map(doc => ({source: doc.source, target: doc.target}));
  if (audience === 'user-release') files.push({source: 'LICENSE', target: 'LICENSE'});
  if (audience === 'project-template') files.push(...config.template_files.map(file => typeof file === 'string' ? {source: file, target: file} : file));
  const targets = new Set();
  for (const file of files) {
    if (targets.has(file.target)) throw Error(`Duplicate distribution target: ${file.target}`);
    targets.add(file.target); regularFile(root, file.source);
  }
  return files.sort((a, b) => a.target < b.target ? -1 : a.target > b.target ? 1 : 0);
}
export function validateLink(target, source, allowed) {
  if (!target || target.startsWith('#')) return;
  let decoded;
  try { decoded = decodeURIComponent(target); } catch { throw Error(`Invalid link encoding in ${source}`); }
  if (/^[a-z][a-z0-9+.-]*:/i.test(decoded)) {
    if (!/^(?:https?:|mailto:)/i.test(decoded) || internal.test(decoded) || /(?:github\.com\/[^/]+\/[^/]+\/(?:(?:blob|tree)\/|wiki(?:\/|$))|raw\.githubusercontent\.com\/)/i.test(decoded)) throw Error(`Non-public link in ${source}: ${target}`);
    return;
  }
  if (decoded.startsWith('/') || decoded.includes('\\')) throw Error(`Unsafe public link in ${source}: ${target}`);
  const path = posix.normalize(posix.join(posix.dirname(source), decoded.split(/[?#]/)[0]));
  if (internal.test(path) || !allowed.has(path)) throw Error(`Link leaves distribution whitelist in ${source}: ${target}`);
}
export function validateDocuments(root, plan) {
  const allowed = new Set(plan.map(file => file.target));
  for (const file of plan.filter(file => file.target.endsWith('.md'))) {
    const text = readFileSync(regularFile(root, file.source), 'utf8');
    // Unsupported reference/HTML forms fail closed instead of bypassing link closure.
    const prose = text.replace(/(^```[^\n]*\n[\s\S]*?^```[^\n]*$)/gm, '');
    if (/<(?:a|img|iframe)\b|^\s*\[[^\]]+\]:|\]\s*\[[^\]]*\]/im.test(prose)) throw Error(`Unsupported public link syntax: ${file.source}`);
    for (const match of prose.matchAll(/\]\(([^)]+)\)/g)) validateLink(match[1].replace(/^<|>$/g, '').split(/\s+"/)[0], file.target, allowed);
    for (const match of prose.matchAll(/https?:\/\/[^\s<>"')]+/g)) validateLink(match[0], file.target, allowed);
  }
}
export function copyDistribution(root, directory, audience) {
  directory = resolve(directory);
  if (existsSync(directory) && lstatSync(directory).isSymbolicLink()) throw Error('Distribution output root is a link');
  const plan = distributionPlan(root, audience);
  if (audience !== 'project-template') validateDocuments(root, plan);
  if (audience === 'project-template' && existsSync(directory) && inventory(directory).length) throw Error('Template output must be empty');
  if (audience === 'user-release' && existsSync(join(directory, 'docs'))) {
    const allowed = new Set(plan.map(file => file.target));
    if (inventory(join(directory, 'docs')).some(path => !allowed.has(`docs/${path}`))) throw Error('Release output contains non-whitelisted documentation');
  }
  for (const file of plan) {
    const target = join(directory, file.target);
    if (existsSync(target)) throw Error(`Refusing to overwrite distribution output: ${file.target}`);
    for (let parent = dirname(target); parent !== resolve(directory); parent = dirname(parent)) {
      if (parent === dirname(parent)) throw Error('Output escapes distribution directory');
      if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) throw Error('Distribution output parent is a link');
    }
    mkdirSync(dirname(target), {recursive: true}); cpSync(regularFile(root, file.source), target);
  }
  return plan.map(file => file.target);
}
export function inventory(directory) {
  const result = [];
  function walk(path = '') {
    for (const entry of readdirSync(join(directory, path), {withFileTypes: true})) {
      const file = path ? `${path}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) result.push(file);
      else throw Error(`Unexpected output link or special file: ${file}`);
    }
  }
  walk(); return result.sort();
}
