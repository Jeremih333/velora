import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Playwright release device matrix', () => {
  it('keeps mobile, tablet and desktop projects in every release browser gate', async () => {
    const [config, packageSource] = await Promise.all([
      readFile(new URL('../../playwright.config.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ]);
    const packageJson: unknown = JSON.parse(packageSource);
    if (typeof packageJson !== 'object' || packageJson === null || Array.isArray(packageJson)) {
      throw new Error('package.json must contain an object.');
    }
    const scriptsValue = (packageJson as Readonly<Record<string, unknown>>)['scripts'];
    if (typeof scriptsValue !== 'object' || scriptsValue === null || Array.isArray(scriptsValue)) {
      throw new Error('package.json scripts must contain an object.');
    }
    const scripts = scriptsValue as Readonly<Record<string, unknown>>;

    expect(config).toContain("{ name: 'android', use: { ...devices['Pixel 7'] } }");
    expect(config).toContain("{ name: 'iphone', use: { ...devices['iPhone 15'] } }");
    expect(config).toContain("{ name: 'tablet', use: { ...devices['iPad Pro 11'] } }");
    expect(config).toContain("{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }");

    for (const scriptName of ['test:e2e', 'test:visual', 'test:a11y']) {
      const script = scripts[scriptName];
      expect(typeof script, `${scriptName} must be a string`).toBe('string');
      expect(script).toContain('--project=iphone');
      expect(script).toContain('--project=android');
      expect(script).toContain('--project=tablet');
      expect(script).toContain('--project=desktop');
    }
  });
});
