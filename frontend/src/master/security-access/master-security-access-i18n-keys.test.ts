import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OFFICIAL_PRODUCT_LOCALE_CODES } from '../../i18n/locales';

const i18nDir = join(dirname(fileURLToPath(import.meta.url)), '../../i18n/translations');

function extractKeys(modulePath: string): string[] {
  const text = readFileSync(modulePath, 'utf8');
  const keys: string[] = [];
  const re = /['"]master\.securityAccess\.[^'"]+['"]\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    keys.push(m[0].replace(/['"]/g, '').replace(/\s*:$/, ''));
  }
  return keys.sort();
}

describe('master.securityAccess nine-locale key parity (USR-P1B F-002)', () => {
  const enKeys = extractKeys(join(i18nDir, 'master.security-access.v1.en.ts'));

  for (const locale of OFFICIAL_PRODUCT_LOCALE_CODES) {
    it(`locale ${locale} defines the same master.securityAccess keys as en`, () => {
      const localeKeys = extractKeys(join(i18nDir, `master.security-access.v1.${locale}.ts`));
      expect(localeKeys).toEqual(enKeys);
    });
  }

  it('does not use window._saSearch in SecurityUsersTab', () => {
    const usersTab = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'tabs/SecurityUsersTab.tsx'),
      'utf8',
    );
    expect(usersTab).not.toMatch(/window\._saSearch/);
    expect(usersTab).toContain('useDebouncedValue');
  });
});