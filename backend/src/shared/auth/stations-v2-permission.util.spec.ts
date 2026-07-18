import { ForbiddenException } from '@nestjs/common';
import {
  STATIONS_V2_PERMISSION_ACTIONS,
  STATIONS_V2_PERMISSION_KEYS,
} from './stations-v2-permission.constants';
import {
  assertStationsV2Permission,
  evaluateStationsV2Permission,
  mapLegacyStationsModuleToV2,
  normalizeStationsV2Permissions,
  resolveStationsV2Permissions,
} from './stations-v2-permission.util';

describe('stations-v2-permission.util', () => {
  describe('normalizeStationsV2Permissions', () => {
    it('coerces known keys to booleans and drops unknown keys', () => {
      const normalized = normalizeStationsV2Permissions({
        read: true,
        create: 'yes',
        unknown_key: true,
      });

      expect(normalized).toEqual({
        read: true,
        create: false,
        update_master_data: false,
        manage_operations: false,
        activate: false,
        deactivate: false,
        archive: false,
        restore: false,
        set_primary: false,
        manage_home_fleet: false,
        manage_current_location: false,
        manage_transfers: false,
        override_rules: false,
        manage_team: false,
        view_activity: false,
        geocode: false,
      });
    });

    it('returns null when no flags are true', () => {
      expect(normalizeStationsV2Permissions({ read: false })).toBeNull();
      expect(normalizeStationsV2Permissions(null)).toBeNull();
    });
  });

  describe('mapLegacyStationsModuleToV2', () => {
    it('maps read to read and view_activity', () => {
      const mapped = mapLegacyStationsModuleToV2({ read: true });
      expect(mapped.read).toBe(true);
      expect(mapped.view_activity).toBe(true);
      expect(mapped.create).toBe(false);
    });

    it('maps write conservatively without archive, set_primary, geocode', () => {
      const mapped = mapLegacyStationsModuleToV2({ write: true });
      expect(mapped.create).toBe(true);
      expect(mapped.archive).toBe(false);
      expect(mapped.set_primary).toBe(false);
      expect(mapped.geocode).toBe(false);
    });

    it('maps manage to all keys', () => {
      const mapped = mapLegacyStationsModuleToV2({ manage: true });
      for (const key of STATIONS_V2_PERMISSION_KEYS) {
        expect(mapped[key]).toBe(true);
      }
    });
  });

  describe('resolveStationsV2Permissions', () => {
    it('prefers explicit stationsV2 over legacy stations module', () => {
      const resolved = resolveStationsV2Permissions({
        stationsV2: { read: true, create: false },
        stations: { read: true, write: true, manage: true },
      });

      expect(resolved?.read).toBe(true);
      expect(resolved?.create).toBe(false);
      expect(resolved?.archive).toBe(false);
    });

    it('falls back to legacy stations module when stationsV2 is absent', () => {
      const resolved = resolveStationsV2Permissions({
        stations: { read: true, write: true },
      });

      expect(resolved?.read).toBe(true);
      expect(resolved?.view_activity).toBe(true);
      expect(resolved?.create).toBe(true);
      expect(resolved?.archive).toBe(false);
    });

    it('uses explicit all-false stationsV2 instead of legacy stations read', () => {
      const resolved = resolveStationsV2Permissions({
        stationsV2: { read: false },
        stations: { read: true, write: true },
      });

      expect(resolved?.read).toBe(false);
      expect(evaluateStationsV2Permission(resolved, 'stations.read')).toBe(false);
    });
  });

  describe('evaluateStationsV2Permission', () => {
    it('returns false for unknown or missing permissions', () => {
      expect(evaluateStationsV2Permission(null, 'stations.read')).toBe(false);
      expect(
        evaluateStationsV2Permission(
          resolveStationsV2Permissions({ stations: { read: true } }),
          'stations.create',
        ),
      ).toBe(false);
    });

    it('returns true when the resolved flag is set', () => {
      const resolved = resolveStationsV2Permissions({
        stationsV2: { read: true },
      });
      expect(evaluateStationsV2Permission(resolved, 'stations.read')).toBe(true);
    });
  });

  describe('assertStationsV2Permission', () => {
    const prisma = {
      organizationMembership: {
        findFirst: jest.fn(),
      },
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('throws when membership is missing', async () => {
      prisma.organizationMembership.findFirst.mockResolvedValue(null);

      await expect(
        assertStationsV2Permission(prisma, { id: 'user-1' }, 'org-1', 'stations.read'),
      ).rejects.toThrow('You do not have access to this organization');
    });

    it('throws for unknown permission action', async () => {
      await expect(
        assertStationsV2Permission(
          prisma,
          { id: 'user-1' },
          'org-1',
          'stations.unknown' as 'stations.read',
        ),
      ).rejects.toThrow('Unknown permission: stations.unknown');
    });

    it('throws when membership lacks the required permission', async () => {
      prisma.organizationMembership.findFirst.mockResolvedValue({
        permissions: { stationsV2: { read: false } },
      });

      await expect(
        assertStationsV2Permission(prisma, { id: 'user-1' }, 'org-1', 'stations.read'),
      ).rejects.toThrow('Missing permission: stations.read');
    });

    it('allows when membership has explicit stationsV2 permission', async () => {
      prisma.organizationMembership.findFirst.mockResolvedValue({
        permissions: { stationsV2: { read: true } },
      });

      await expect(
        assertStationsV2Permission(prisma, { id: 'user-1' }, 'org-1', 'stations.read'),
      ).resolves.toBeUndefined();
    });

    it('does not bypass org admin without explicit stationsV2 or legacy stations', async () => {
      prisma.organizationMembership.findFirst.mockResolvedValue({
        permissions: { dashboard: { read: true, write: true } },
      });

      await expect(
        assertStationsV2Permission(prisma, { id: 'admin-1' }, 'org-1', 'stations.read'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  it('defines a canonical action for every permission key', () => {
    expect(STATIONS_V2_PERMISSION_ACTIONS).toHaveLength(STATIONS_V2_PERMISSION_KEYS.length);
    for (const key of STATIONS_V2_PERMISSION_KEYS) {
      expect(STATIONS_V2_PERMISSION_ACTIONS).toContain(`stations.${key}`);
    }
  });
});
