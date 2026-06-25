import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', 'components', 'customer-verification');
const FORBIDDEN = /\b(veriff|kyc|selfie|face match|facematch|liveness)\b/i;

function collectTsxFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectTsxFiles(full));
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('customer-verification UI copy', () => {
  it('does not expose Veriff/KYC/Selfie/Liveness terms in user-facing components', () => {
    const files = collectTsxFiles(ROOT);
    const libFile = join(import.meta.dirname, 'customer-verification.ts');
    const allFiles = [...files, libFile];

    for (const file of allFiles) {
      const content = readFileSync(file, 'utf8');
      const withoutConsentBlock = content.replace(
        /DIDIT_CONSENT_TEXT[\s\S]*?;/,
        '',
      );
      expect(
        FORBIDDEN.test(withoutConsentBlock),
        `Forbidden term in ${file}`,
      ).toBe(false);
    }
  });
});
