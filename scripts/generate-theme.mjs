// Author: yunnuo <ymz@ebox.vip>
// Description: Validate and compile the single design source into CSS and Go/email values.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { derivePalette } from '../packages/theme/src/derive.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const modeKeys = ['bg', 'surface', 'surface-alt', 'surface-raised', 'surface-inset', 'surface-hover', 'text', 'muted', 'border', 'border-strong', 'success', 'danger', 'info', 'warning', 'avatar-bg', 'avatar-text', 'terminal-bg', 'terminal-bar', 'terminal-line', 'terminal-text', 'terminal-dim', 'terminal-info', 'terminal-warn', 'terminal-error', 'terminal-debug', ...Array.from({ length: 8 }, (_, i) => `chart-${i + 1}`)];
export const typographyRoles = ['display', 'title', 'headline', 'body', 'caption'];
const fail = (path, requirement) => { throw new Error(`Invalid theme source: ${path} ${requirement}`); };
function object(value, path, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object');
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, 'is required');
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${path}.${key}`, 'is not supported');
}
function number(value, path, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(path, `must be finite and between ${min} and ${max}`);
}
function text(value, path) {
  if (typeof value !== 'string' || !value.trim() || value.length > 512 || /[;{}<>\\\r\n\u0000-\u001f]|url\s*\(|\/\*/i.test(value)) fail(path, 'must be a nonempty, safe literal string');
}
function color(value, path) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) fail(path, 'must be a #RRGGBB color');
}
function scale(values, path, min, max) {
  if (!Array.isArray(values) || !values.length) fail(path, 'must be a nonempty increasing scale');
  values.forEach((value, index) => {
    number(value, `${path}[${index}]`, min, max);
    if (!Number.isInteger(value) || index > 0 && value <= values[index - 1]) fail(path, 'must contain unique increasing integers');
  });
}
function length(value, path) {
  if (typeof value !== 'string' || !/^(?:\d+(?:\.\d+)?)(?:px|rem)$/.test(value) || parseFloat(value) <= 0 || parseFloat(value) > 4096) fail(path, 'must be a positive px/rem length up to 4096');
}
function easing(value, path) {
  if (typeof value !== 'string') fail(path, 'must be a cubic-bezier curve');
  const match = /^cubic-bezier\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/.exec(value);
  if (!match || match.slice(1).some(n => !Number.isFinite(Number(n)) || Number(n) < 0 || Number(n) > 1)) fail(path, 'must be a cubic-bezier curve with coordinates between 0 and 1');
}

/** Fail before writing anything: modes stay flat string maps for Go and runtime consumers. */
export function validateThemeSource(source) {
  object(source, 'theme', ['author', 'brand', 'presets', 'modes', 'typography', 'shape', 'spacing', 'icons', 'motion', 'layout']);
  if (source.author !== 'yunnuo <ymz@ebox.vip>') fail('author', 'must contain the source author');
  object(source.brand, 'brand', ['name', 'accent']);
  text(source.brand.name, 'brand.name');
  color(source.brand.accent, 'brand.accent');
  if (!source.presets || typeof source.presets !== 'object' || Array.isArray(source.presets)) fail('presets', 'must be an object');
  for (const [key, value] of Object.entries(source.presets)) {
    if (!/^[a-z]+$/.test(key) || key === 'brand') fail(`presets.${key}`, 'must be a lowercase, non-reserved identifier');
    color(value, `presets.${key}`);
  }
  object(source.modes, 'modes', ['light', 'dark']);
  for (const mode of ['light', 'dark']) {
    object(source.modes[mode], `modes.${mode}`, modeKeys);
    for (const key of modeKeys) color(source.modes[mode][key], `modes.${mode}.${key}`);
    if (new Set(Array.from({ length: 8 }, (_, i) => source.modes[mode][`chart-${i + 1}`].toLowerCase())).size !== 8) fail(`modes.${mode}`, 'must provide eight distinct chart colors');
  }
  object(source.typography, 'typography', ['sans', 'mono', 'scale', 'sizes', 'roles']);
  for (const font of ['sans', 'mono']) text(source.typography[font], `typography.${font}`);
  number(source.typography.scale, 'typography.scale', 0.5, 2);
  scale(source.typography.sizes, 'typography.sizes', 1, 128);
  // Legacy utility aliases are a public API; do not silently generate unresolved references.
  for (const size of [10, 11, 12, 13, 15, 17, 20, 23, 27, 32]) if (!source.typography.sizes.includes(size)) fail('typography.sizes', `must retain utility size ${size}`);
  object(source.typography.roles, 'typography.roles', typographyRoles);
  let previousSize = Infinity;
  for (const role of typographyRoles) {
    const value = source.typography.roles[role], path = `typography.roles.${role}`;
    object(value, path, ['size', 'lineHeight', 'weight', 'tracking']);
    number(value.size, `${path}.size`, 8, 128);
    if (!source.typography.sizes.includes(value.size)) fail(`${path}.size`, 'must appear in typography.sizes');
    if (value.size >= previousSize) fail(`${path}.size`, 'must be smaller than the preceding role');
    previousSize = value.size;
    number(value.lineHeight, `${path}.lineHeight`, 1, 2);
    number(value.weight, `${path}.weight`, 100, 900);
    if (!Number.isInteger(value.weight)) fail(`${path}.weight`, 'must be an integer');
    if (typeof value.tracking !== 'string' || !/^-?(?:0|0?\.\d+)em$/.test(value.tracking) || Math.abs(parseFloat(value.tracking)) > 0.1) fail(`${path}.tracking`, 'must be an em length between -0.1 and 0.1');
  }
  object(source.shape, 'shape', ['scale', 'radii']);
  number(source.shape.scale, 'shape.scale', 0, 2);
  scale(source.shape.radii, 'shape.radii', 0, 64);
  for (const radius of [4, 6, 8, 10, 12, 16, 20]) if (!source.shape.radii.includes(radius)) fail('shape.radii', `must retain utility radius ${radius}`);
  object(source.spacing, 'spacing', ['unit', 'scale']);
  length(source.spacing.unit, 'spacing.unit');
  number(source.spacing.scale, 'spacing.scale', 0.5, 2);
  object(source.icons, 'icons', ['strokeWidth']);
  number(source.icons.strokeWidth, 'icons.strokeWidth', 0.5, 4);
  object(source.motion, 'motion', ['fast', 'normal', 'slow', 'easeStandard', 'easeEnter', 'easeExit']);
  let previousDuration = 0;
  for (const key of ['fast', 'normal', 'slow']) {
    const value = source.motion[key];
    if (typeof value !== 'string' || !/^\d+(?:\.\d+)?(?:ms|s)$/.test(value)) fail(`motion.${key}`, 'must be an ms/s duration');
    const duration = parseFloat(value) * (value.endsWith('ms') ? 1 : 1000);
    if (duration <= previousDuration || duration > 2000) fail(`motion.${key}`, 'must increase from fast to slow and stay within 2000ms');
    previousDuration = duration;
  }
  for (const key of ['easeStandard', 'easeEnter', 'easeExit']) easing(source.motion[key], `motion.${key}`);
  object(source.layout, 'layout', ['sidebar', 'sidebarCompact', 'sidebarSmall', 'contentMax', 'dialogMax']);
  for (const [key, value] of Object.entries(source.layout)) length(value, `layout.${key}`);
  return source;
}

export function compileTheme(source) {
  validateThemeSource(source);
  const resolved = { brand: source.brand, typography: source.typography, ...derivePalette(source.brand.accent, source.modes) };
  const common = {
    'font-sans': source.typography.sans, 'font-mono': source.typography.mono,
    'space-unit': `calc(${source.spacing.unit} * ${source.spacing.scale} * var(--ui-space-scale, 1))`,
    'icon-stroke': source.icons.strokeWidth, 'motion-fast': source.motion.fast, 'motion-normal': source.motion.normal, 'motion-slow': source.motion.slow,
    'motion-ease-standard': source.motion.easeStandard, 'motion-ease-enter': source.motion.easeEnter, 'motion-ease-exit': source.motion.easeExit,
    sidebar: source.layout.sidebar, 'sidebar-compact': source.layout.sidebarCompact, 'sidebar-small': source.layout.sidebarSmall, 'content-max': source.layout.contentMax, 'dialog-max': source.layout.dialogMax,
    'preset-brand': source.brand.accent,
  };
  for (const size of source.typography.sizes) common[`font-${size}`] = `calc(${size * source.typography.scale}px * var(--ui-font-scale, 1))`;
  for (const radius of source.shape.radii) common[`radius-${radius}`] = `calc(${radius * source.shape.scale}px * var(--ui-radius-scale, 1))`;
  for (const [role, value] of Object.entries(source.typography.roles)) {
    common[`type-${role}-size`] = `var(--font-${value.size})`;
    common[`type-${role}-line-height`] = value.lineHeight;
    common[`type-${role}-weight`] = value.weight;
    common[`type-${role}-tracking`] = value.tracking;
  }
  for (const [key, color] of Object.entries(source.presets)) common[`preset-${key}`] = color;
  for (const mode of ['light', 'dark']) for (const [key, value] of Object.entries(resolved[mode])) common[`${mode}-${key}`] = value;
  const declarations = values => Object.entries(values).map(([key, value]) => `  --${key}: ${value};`).join('\n');
  const presets = Object.entries(source.presets).map(([id, color]) => {
    const palette = derivePalette(color, source.modes);
    return `:root[data-accent=${id}]{\n${declarations(palette.light)}\n}\n:root[data-accent=${id}][data-theme=dark]{\n${declarations(palette.dark)}\n}\n`;
  }).join('');
  const css = `/* Code generated by scripts/generate-theme.mjs; DO NOT EDIT.\n * Author: yunnuo <ymz@ebox.vip>\n */\n:root {\n${declarations({ ...common, ...resolved.light })}\n}\n:root[data-theme=dark] {\n${declarations(resolved.dark)}\n}\n${presets}@media(prefers-reduced-motion:reduce){:root{--motion-fast:0ms;--motion-normal:0ms;--motion-slow:0ms}*,*::before,*::after{animation-delay:0ms!important;animation-duration:0.01ms!important;animation-iteration-count:1!important;transition-duration:0.01ms!important;scroll-behavior:auto!important}.animate-spin{animation-duration:1.4s!important;animation-iteration-count:infinite!important}.animate-pulse{animation:none!important}}\n`;
  return {
    'assets/theme/resolved.gen.json': JSON.stringify(resolved, null, 2) + '\n',
    'packages/theme/src/tokens.gen.css': css,
    'packages/theme/src/modes.gen.json': JSON.stringify(source.modes, null, 2) + '\n',
    'packages/theme/src/resolved.gen.json': JSON.stringify(resolved, null, 2) + '\n',
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const files = compileTheme(JSON.parse(readFileSync(`${root}assets/theme/tokens.json`, 'utf8')));
  for (const [path, value] of Object.entries(files)) {
    if (process.argv.includes('--check')) {
      if (readFileSync(root + path, 'utf8') !== value) throw new Error(`${path} is stale; run node scripts/generate-theme.mjs`);
    } else writeFileSync(root + path, value);
  }
}
