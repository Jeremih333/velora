import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const stylesheet = resolve('apps/web/src/styles.css');
const source = readFileSync(stylesheet, 'utf8');
const spacingProperty =
  /^(?:margin(?:-(?:top|right|bottom|left))?|padding(?:-(?:top|right|bottom|left))?|gap|row-gap|column-gap)$/u;

const pixelMappings = new Map([
  ['1', 'var(--space-2)'],
  ['2', 'var(--space-2)'],
  ['3', 'var(--space-4)'],
  ['4', 'var(--space-4)'],
  ['5', 'var(--space-6)'],
  ['6', 'var(--space-6)'],
  ['7', 'var(--space-8)'],
  ['8', 'var(--space-8)'],
  ['9', 'var(--space-8)'],
  ['10', 'var(--space-12)'],
  ['11', 'var(--space-12)'],
  ['12', 'var(--space-12)'],
  ['13', 'var(--space-12)'],
  ['14', 'var(--space-16)'],
  ['15', 'var(--space-16)'],
  ['16', 'var(--space-16)'],
  ['17', 'var(--space-16)'],
  ['18', 'var(--space-20)'],
  ['19', 'var(--space-20)'],
  ['20', 'var(--space-20)'],
  ['22', 'var(--space-24)'],
  ['24', 'var(--space-24)'],
  ['28', 'var(--space-32)'],
  ['30', 'var(--space-32)'],
  ['32', 'var(--space-32)'],
  ['34', 'var(--space-32)'],
  ['42', 'var(--space-40)'],
  ['48', 'var(--space-48)'],
  ['74', 'var(--space-hero-min)'],
  ['102', 'var(--space-nav-clearance)'],
  ['108', 'var(--space-nav-clearance)'],
  ['138', 'var(--space-hero-max)'],
]);

const remMappings = new Map([
  ['0.2', 'var(--space-4)'],
  ['0.25', 'var(--space-4)'],
  ['0.35', 'var(--space-6)'],
  ['0.4', 'var(--space-6)'],
  ['0.42', 'var(--space-6)'],
  ['0.45', 'var(--space-8)'],
  ['0.55', 'var(--space-8)'],
  ['0.65', 'var(--space-12)'],
  ['0.7', 'var(--space-12)'],
  ['0.75', 'var(--space-12)'],
  ['0.8', 'var(--space-12)'],
  ['0.9', 'var(--space-16)'],
  ['1', 'var(--space-16)'],
  ['1.1', 'var(--space-20)'],
  ['1.2', 'var(--space-20)'],
  ['2', 'var(--space-32)'],
  ['2.4', 'var(--space-40)'],
]);

function replaceLength(rawNumber, unit) {
  const negative = rawNumber.startsWith('-');
  const absolute = negative ? rawNumber.slice(1) : rawNumber;
  const replacement = (unit === 'px' ? pixelMappings : remMappings).get(absolute);
  if (!replacement) throw new Error(`Unmapped spacing length: ${rawNumber}${unit}`);
  return negative ? `calc(-1 * ${replacement})` : replacement;
}

const normalized = source.replace(/([a-z-]+):\s*([^;]+);/gu, (declaration, property, value) => {
  if (!spacingProperty.test(property)) return declaration;
  const normalizedValue = value.replace(/(-?\d+(?:\.\d+)?)(px|rem)\b/gu, (_, number, unit) =>
    replaceLength(number, unit),
  );
  return `${property}: ${normalizedValue};`;
});

if (normalized === source) {
  process.stdout.write('Spacing already normalized.\n');
} else {
  writeFileSync(stylesheet, normalized);
  process.stdout.write('Spacing normalized.\n');
}
