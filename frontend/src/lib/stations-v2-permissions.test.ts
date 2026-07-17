import { describe, expect, it } from 'vitest';
import {
  STATIONS_V2_PERMISSION_KEYS,
  evaluateStationsV2Permission,
  mapLegacyStationsModuleToV2,
  resolveStationsV2Permissions,
} from './stations-v2-permissions';

describe('stations-v2-permissions', () => {
  it('maps legacy read to read and view_activity', () => {
    const mapped = mapLegacyStationsModuleToV2({ read: true });
    expect(mapped.read).toBe(true);
    expect(mapped.view_activity).toBe(true);
    expect(mapped.create).toBe(false);
  });

  it('prefers explicit stationsV2 over legacy stations module', () => {
    const resolved = resolveStationsV2Permissions({
      stationsV2: { read: true, create: false },
      stations: { read: true, write: true, manage: true },
    });
    expect(resolved?.create).toBe(false);
    expect(resolved?.archive).toBe(false);
  });

  it('denies when permissions are missing', () => {
    expect(evaluateStationsV2Permission(null, 'stations.read')).toBe(false);
    expect(resolveStationsV2Permissions({ dashboard: { read: true } })).toBeNull();
  });

  it('defines resolver output for every permission key', () => {
    const resolved = resolveStationsV2Permissions({
      stationsV2: Object.fromEntries(STATIONS_V2_PERMISSION_KEYS.map((key) => [key, true])),
    });
    for (const key of STATIONS_V2_PERMISSION_KEYS) {
      expect(resolved?.[key]).toBe(true);
    }
  });
});
