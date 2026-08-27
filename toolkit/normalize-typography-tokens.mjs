import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const stylesheet = resolve('apps/web/src/styles.css');
const source = readFileSync(stylesheet, 'utf8');

const mappings = new Map([
  ['0.72rem', 'var(--type-body-sm-size)'],
  ['0.74rem', 'var(--type-body-sm-size)'],
  ['0.75rem', 'var(--type-body-sm-size)'],
  ['0.78rem', 'var(--type-body-compact-size)'],
  ['0.8rem', 'var(--type-body-compact-size)'],
  ['0.82rem', 'var(--type-body-compact-size)'],
  ['0.86rem', 'var(--type-body-compact-size)'],
  ['1rem', 'var(--type-body-lg-size)'],
  ['8px', 'var(--type-micro-size)'],
  ['9px', 'var(--type-overline-size)'],
  ['10px', 'var(--type-caption-size)'],
  ['11px', 'var(--type-label-size)'],
  ['12px', 'var(--type-body-sm-size)'],
  ['13px', 'var(--type-body-compact-size)'],
  ['14px', 'var(--type-body-size)'],
  ['15px', 'var(--type-body-lg-size)'],
  ['16px', 'var(--type-body-lg-size)'],
  ['17px', 'var(--type-heading-sm-size)'],
  ['18px', 'var(--type-heading-sm-size)'],
  ['19px', 'var(--type-heading-sm-size)'],
  ['20px', 'var(--type-heading-sm-size)'],
  ['21px', 'var(--type-heading-md-size)'],
  ['22px', 'var(--type-heading-md-size)'],
  ['23px', 'var(--type-heading-md-size)'],
  ['24px', 'var(--type-heading-md-size)'],
  ['25px', 'var(--type-heading-lg-size)'],
  ['26px', 'var(--type-heading-lg-size)'],
  ['27px', 'var(--type-heading-lg-size)'],
  ['30px', 'var(--type-heading-xl-size)'],
  ['44px', 'var(--type-cover-mark-size)'],
  ['46px', 'var(--type-cover-mark-size)'],
  ['64px', 'var(--type-cover-mark-lg-size)'],
  ['clamp(16px, 4.3vw, 20px)', 'var(--type-body-lg-size)'],
  ['clamp(20px, 4vw, 30px)', 'var(--type-heading-md-size)'],
  ['clamp(22px, 5vw, 31px)', 'var(--type-heading-lg-size)'],
  ['clamp(22px, 6vw, 30px)', 'var(--type-heading-lg-size)'],
  ['clamp(30px, 7vw, 48px)', 'var(--type-heading-xl-size)'],
  ['clamp(32px, 10vw, 46px)', 'var(--type-heading-xl-size)'],
  ['clamp(34px, 8vw, 54px)', 'var(--type-heading-xl-size)'],
  ['clamp(42px, 11vw, 72px)', 'var(--type-display-size)'],
]);

const normalized = source.replace(/font-size:\s*([^;]+);/g, (declaration, rawValue) => {
  const value = rawValue.trim();
  if (value.startsWith('var(--type-')) return declaration;
  const replacement = mappings.get(value);
  if (!replacement) {
    throw new Error(`Unmapped font-size value: ${value}`);
  }
  return `font-size: ${replacement};`;
});

if (normalized === source) {
  process.stdout.write('Typography sizes already normalized.\n');
} else {
  writeFileSync(stylesheet, normalized);
  process.stdout.write('Typography sizes normalized.\n');
}
