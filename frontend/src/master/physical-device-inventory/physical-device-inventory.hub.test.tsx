import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { en } from '../../i18n/translations/en';

const hubPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'PhysicalDeviceInventoryHub.tsx',
);

describe('PhysicalDeviceInventoryHub (P1A)', () => {
  it('uses platform i18n keys and masked serial fields from API', () => {
    const source = readFileSync(hubPath, 'utf8');
    expect(source).toContain('serialNumberMasked');
    expect(source).toContain('api.admin.physicalDeviceInventory');
    expect(en['master.physicalDeviceInventory.title']).toBeTruthy();
    expect(en['master.physicalDeviceInventory.intakeButton']).toBeTruthy();
  });
});
