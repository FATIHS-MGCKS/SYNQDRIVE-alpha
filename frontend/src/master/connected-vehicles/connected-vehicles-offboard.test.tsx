import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { canOffboardRegisteredVehicle, normalizeRegistryLifecycle } from './registry-lifecycle.utils';
import { parseApiErrorCode, parseBlockingReasons } from './vehicle-offboard.errors';
import { urlToCvQuery } from './cv.utils';
import { en } from '../../i18n/translations/en';

const frontendRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('connected vehicles offboard (VO5C-P2A)', () => {
  it('A/O/N — lifecycle gating for offboard action', () => {
    expect(
      canOffboardRegisteredVehicle({
        vehicleId: 'v1',
        organizationId: 'o1',
        registryLifecycle: 'ACTIVE',
      }),
    ).toBe(true);
    expect(
      canOffboardRegisteredVehicle({
        vehicleId: 'v1',
        organizationId: 'o1',
        registryLifecycle: 'OFFBOARDED',
      }),
    ).toBe(false);
    expect(
      canOffboardRegisteredVehicle({
        vehicleId: 'v1',
        organizationId: 'o1',
        registryLifecycle: 'ARCHIVED',
      }),
    ).toBe(false);
    expect(normalizeRegistryLifecycle(undefined)).toBe('UNKNOWN');
    expect(
      canOffboardRegisteredVehicle({
        vehicleId: 'v1',
        organizationId: 'o1',
        registryLifecycle: null,
      }),
    ).toBe(false);
  });

  it('P — registry lifecycle filter defaults to ACTIVE in list URL state', () => {
    const q = urlToCvQuery({});
    expect(q.registryLifecycle).toBe('ACTIVE');
    const all = urlToCvQuery({ cvRegistryLifecycle: 'all' });
    expect(all.registryLifecycle).toBe('all');
  });

  it('K — operational blockers parsed from structured API error', () => {
    const err = Object.assign(new Error('[OFFBOARD_OPERATIONALLY_BLOCKED] blocked'), {
      details: { blockingReasons: ['ACTIVE_RENTAL', 'ONGOING_TRIP'] },
    });
    expect(parseApiErrorCode(err.message)).toBe('OFFBOARD_OPERATIONALLY_BLOCKED');
    expect(parseBlockingReasons(err)).toEqual(['ACTIVE_RENTAL', 'ONGOING_TRIP']);
  });

  it('C — Connected Vehicles hub does not reference legacy deregister', () => {
    const hubSrc = readFileSync(
      path.join(frontendRoot, 'src/master/connected-vehicles/ConnectedVehiclesHub.tsx'),
      'utf8',
    );
    const drawerSrc = readFileSync(
      path.join(frontendRoot, 'src/master/connected-vehicles/ConnectedVehicleDetailDrawer.tsx'),
      'utf8',
    );
    expect(hubSrc).not.toMatch(/deregister/i);
    expect(drawerSrc).not.toMatch(/deregister/i);
    expect(hubSrc).toMatch(/useVehicleOffboard|onOffboard/);
  });

  it('R — native locales define master.cv offboard keys (tr uses en fallback per registry)', () => {
    const locales = ['de', 'en', 'pl', 'fr', 'cs', 'nl', 'es', 'it'];
    const required = Object.keys(en).filter((k) => k.startsWith('master.cv.'));
    for (const locale of locales) {
      const file = path.join(frontendRoot, `src/i18n/translations/${locale}.ts`);
      const src = readFileSync(file, 'utf8');
      for (const key of required) {
        expect(src).toContain(`'${key}'`);
      }
    }
    const trSrc = readFileSync(path.join(frontendRoot, 'src/i18n/translations/tr.ts'), 'utf8');
    expect(trSrc).not.toContain('master.cv.offboard.action');
  });
});
