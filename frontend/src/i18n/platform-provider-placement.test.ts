import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(__dirname, '../App.tsx'), 'utf8');
const rentalAppSource = readFileSync(join(__dirname, '../rental/App.tsx'), 'utf8');

describe('platform provider placement', () => {
  it('mounts exactly one primary LanguageProvider at the application root', () => {
    expect(appSource).toContain("import { LanguageProvider } from './i18n/LanguageContext'");
    expect((appSource.match(/<LanguageProvider>/g) ?? []).length).toBe(1);
  });

  it('documents transitional nested Rental LanguageProvider until I18N-INTEGRATION-2', () => {
    // INTEGRATION-1 mounts platform provider at root only; rental/i18n remains authoritative
    // for /rental/* until product shim consolidation lands in INTEGRATION-2.
    const hasNestedRentalProvider =
      rentalAppSource.includes('<LanguageProvider') ||
      rentalAppSource.includes("import { LanguageProvider }");
    expect(hasNestedRentalProvider).toBe(true);
  });
});
