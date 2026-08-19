// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from '../locales';

const __dirname = dirname(fileURLToPath(import.meta.url));
const selectorSource = readFileSync(join(__dirname, 'LanguageSelector.tsx'), 'utf8');
const loginSource = readFileSync(join(__dirname, '../../pages/LoginPage.tsx'), 'utf8');
const topBarSource = readFileSync(join(__dirname, '../../rental/components/TopBar.tsx'), 'utf8');

describe('LanguageSelector', () => {
  it('derives all language options from SUPPORTED_LOCALES only', () => {
    expect(selectorSource).toContain('SUPPORTED_LOCALES.map');
    expect(selectorSource).toContain("t('languageSelector.label'");
    expect(selectorSource).not.toMatch(/Deutsch|English|Polski/);
    expect(SUPPORTED_LOCALES).toHaveLength(9);
  });

  it('is shared by Login and Rental TopBar', () => {
    expect(loginSource).toContain("LanguageSelector variant=\"login-menu\"");
    expect(topBarSource).toContain('LanguageSelector variant="topbar-pill"');
    expect(loginSource).not.toMatch(/useState<['"]en['"] \| ['"]de['"]>/);
  });
});
