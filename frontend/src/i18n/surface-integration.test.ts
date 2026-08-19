import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const masterTopBar = readFileSync(join(__dirname, '../master/components/TopBar.tsx'), 'utf8');
const operatorHeader = readFileSync(join(__dirname, '../operator/components/OperatorHeader.tsx'), 'utf8');

describe('master and operator structural i18n integration', () => {
  it('lets Master chrome consume platform useLanguage metadata', () => {
    expect(masterTopBar).toContain('useLanguage');
    expect(masterTopBar).toContain('localeMetadata.nativeName');
    expect(masterTopBar).toContain('formattingLocale');
  });

  it('lets Operator header consume platform formatting locale', () => {
    expect(operatorHeader).toContain('useLanguage');
    expect(operatorHeader).toContain('formattingLocale');
    expect(operatorHeader).not.toContain("toLocaleTimeString('de-DE'");
  });
});
