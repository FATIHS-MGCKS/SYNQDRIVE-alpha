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

  it('does not nest a competing LanguageProvider inside Rental', () => {
    expect(rentalAppSource).not.toContain('<LanguageProvider');
    expect(rentalAppSource).not.toContain("import { LanguageProvider }");
  });
});
