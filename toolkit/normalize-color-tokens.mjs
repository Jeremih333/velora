import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const stylesheet = resolve('apps/web/src/styles.css');
const source = readFileSync(stylesheet, 'utf8');
if (source.includes('var(--color-on-brand)-space')) {
  throw new Error('Color normalization corrupted the white-space property name.');
}
const colorPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\([^()]+\)|(?<![a-z-])(?:white|black)(?![a-z-])/gu;
const approvedTokenSelector = /^(?::root|\[data-theme='(?:dark|light|amoled)'\])$/u;
const mappings = new Map([
  ['#31204e', 'var(--surface-elevated)'],
  ['#eadcff', 'var(--bg-secondary)'],
  ['#160b2a', 'var(--bg-secondary)'],
  ['#fff', 'var(--color-on-brand)'],
  ['white', 'var(--color-on-brand)'],
  ['#000', 'var(--color-black)'],
  ['black', 'var(--color-black)'],
  ['#9d6cff', 'var(--brand-hover)'],
  ['#7650e9', 'var(--premium-strong)'],
  ['#b570d3', 'var(--premium-soft)'],
  ['#37234f', 'var(--media-surface-start)'],
  ['#151023', 'var(--media-surface-end)'],
  ['#f6c75b', 'var(--warning)'],
  ['#b279ff', 'var(--premium)'],
  ['#5c38bf', 'var(--brand-deep)'],
  ['#166b4a', 'var(--badge-free-text)'],
  ['#dff8ec', 'var(--badge-free-bg)'],
  ['#795b05', 'var(--badge-premium-text)'],
  ['#fff0b9', 'var(--badge-premium-bg)'],
  ['#8151d3', 'var(--message-user-start)'],
  ['#6540b2', 'var(--message-user-end)'],
  ['#ffd9df', 'var(--danger-on-strong)'],
  ['#9f2f47', 'var(--danger-strong)'],
  ['#a26fff', 'var(--brand-vivid)'],
  ['#ad58ff', 'var(--brand-vivid)'],
  ['#e873ba', 'var(--premium-accent)'],
  ['#766b88', 'var(--service-idle)'],
  ['rgb(5 3 12 / 68%)', 'var(--backdrop)'],
  ['rgb(12 8 20 / 28%)', 'color-mix(in srgb, var(--bg-secondary) 28%, transparent)'],
  ['rgb(0 0 0 / 42%)', 'color-mix(in srgb, var(--color-black) 42%, transparent)'],
  ['rgb(0 0 0 / 34%)', 'color-mix(in srgb, var(--color-black) 34%, transparent)'],
  ['rgba(0, 0, 0, 0.2)', 'color-mix(in srgb, var(--color-black) 20%, transparent)'],
  ['rgba(0, 0, 0, 0.26)', 'color-mix(in srgb, var(--color-black) 26%, transparent)'],
  ['rgba(0, 0, 0, 0.28)', 'color-mix(in srgb, var(--color-black) 28%, transparent)'],
  ['rgba(0, 0, 0, 0.3)', 'color-mix(in srgb, var(--color-black) 30%, transparent)'],
  ['rgba(0, 0, 0, 0.34)', 'color-mix(in srgb, var(--color-black) 34%, transparent)'],
  ['rgba(0, 0, 0, 0.45)', 'color-mix(in srgb, var(--color-black) 45%, transparent)'],
  ['rgba(0, 0, 0, 0.5)', 'color-mix(in srgb, var(--color-black) 50%, transparent)'],
  ['rgba(5, 3, 12, 0.66)', 'color-mix(in srgb, var(--bg-secondary) 66%, transparent)'],
  ['rgba(5, 3, 12, 0.7)', 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)'],
  ['rgba(10, 7, 18, 0.7)', 'var(--overlay-dark)'],
  ['rgba(255, 255, 255, 0.04)', 'color-mix(in srgb, var(--color-on-brand) 4%, transparent)'],
  ['rgba(255, 255, 255, 0.16)', 'color-mix(in srgb, var(--color-on-brand) 16%, transparent)'],
  ['rgba(255, 255, 255, 0.2)', 'color-mix(in srgb, var(--color-on-brand) 20%, transparent)'],
  ['rgba(255, 255, 255, 0.65)', 'color-mix(in srgb, var(--color-on-brand) 65%, transparent)'],
  ['rgba(255, 255, 255, 0.72)', 'color-mix(in srgb, var(--color-on-brand) 72%, transparent)'],
  ['rgba(255, 255, 255, 0.76)', 'color-mix(in srgb, var(--color-on-brand) 76%, transparent)'],
  ['rgba(255, 255, 255, 0.9)', 'color-mix(in srgb, var(--color-on-brand) 90%, transparent)'],
  ['rgba(65, 39, 94, 0.08)', 'color-mix(in srgb, var(--brand-active) 8%, transparent)'],
  ['rgba(111, 64, 205, 0.34)', 'color-mix(in srgb, var(--brand-active) 34%, transparent)'],
  ['rgba(115, 231, 189, 0.12)', 'color-mix(in srgb, var(--success) 12%, transparent)'],
  ['rgba(115, 231, 189, 0.45)', 'color-mix(in srgb, var(--success) 45%, transparent)'],
  ['rgba(118, 107, 136, 0.12)', 'color-mix(in srgb, var(--service-idle) 12%, transparent)'],
  ['rgba(123, 77, 225, 0.35)', 'color-mix(in srgb, var(--premium-strong) 35%, transparent)'],
  ['rgba(15, 10, 26, 0.58)', 'var(--surface-note)'],
  ['rgba(26, 18, 45, 0.72)', 'var(--surface-card-end)'],
  ['rgba(42, 30, 70, 0.88)', 'var(--surface-card-start)'],
]);

const normalized = source.replace(/([^{}]+)\{([^{}]*)\}/gu, (block, rawSelector, body) => {
  const selector = rawSelector.trim().replace(/\s+/gu, ' ');
  if (approvedTokenSelector.test(selector)) return block;
  const normalizedBody = body.replace(colorPattern, (color) => {
    const replacement = mappings.get(color.toLowerCase());
    if (!replacement) throw new Error(`Unmapped component color ${color} in ${selector}.`);
    return replacement;
  });
  return `${rawSelector}{${normalizedBody}}`;
});

if (normalized === source) {
  process.stdout.write('Colors already normalized.\n');
} else {
  writeFileSync(stylesheet, normalized);
  process.stdout.write('Colors normalized.\n');
}
