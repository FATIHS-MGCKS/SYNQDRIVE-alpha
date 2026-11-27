import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'App.tsx'),
  'utf8',
);

describe('USR-P1B master App shell (F-001)', () => {
  it('does not mount legacy platform-user listAll or CRUD handlers', () => {
    expect(appSource).not.toMatch(/\bapi\.users\.listAll\b/);
    expect(appSource).not.toMatch(/\bhandleAddUser\b/);
    expect(appSource).not.toMatch(/\bhandleUpdateUser\b/);
    expect(appSource).not.toMatch(/\bhandleDeleteUser\b/);
    expect(appSource).not.toMatch(/\bsetUsers\b/);
    expect(appSource).not.toMatch(/\bmapApiUser\b/);
  });

  it('keeps SecurityAccessHub as the security-access entry surface', () => {
    expect(appSource).toContain('SecurityAccessHub');
    expect(appSource).toContain('security-access');
  });
});