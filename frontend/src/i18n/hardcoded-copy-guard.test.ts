import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import inventory from './hardcoded-copy-inventory.json';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ENFORCE_CLEAN_FILES = [
  'pages/LoginPage.tsx',
  'pages/VerificationDonePage.tsx',
  'i18n/components/LanguageSelector.tsx',
  'App.tsx',
];

describe('hardcoded copy guardrails (P2.1 enforce-clean surfaces)', () => {
  it('keeps enforce-clean surface findings at zero in inventory', () => {
    expect(inventory.summary.enforceCleanRemaining).toBe(0);
  });

  it('does not reference the removed login-copy shim in cleaned files', () => {
    for (const relPath of ENFORCE_CLEAN_FILES) {
      const source = readFileSync(join(__dirname, '..', relPath), 'utf8');
      expect(source, relPath).not.toContain('login-copy');
      expect(source, relPath).not.toContain('translateLoginCopy');
    }
  });
});
