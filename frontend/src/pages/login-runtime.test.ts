import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const loginPageSource = readFileSync(join(__dirname, 'LoginPage.tsx'), 'utf8');

describe('Login platform locale integration', () => {
  it('does not keep independent Login locale state', () => {
    expect(loginPageSource).toContain('useLanguage()');
    expect(loginPageSource).not.toMatch(/useState<['"]en['"] \| ['"]de['"]>/);
    expect(loginPageSource).not.toMatch(/useState\(\s*['"]de['"]\s*\)/);
  });

  it('uses canonical useLanguage().t for login copy', () => {
    expect(loginPageSource).toContain("t('login.welcomeBack')");
    expect(loginPageSource).not.toContain('login-copy');
    expect(loginPageSource).not.toContain('translateLoginCopy');
  });
});
