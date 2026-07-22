import { MembershipRole, MembershipStatus } from '@prisma/client';
import {
  computeEffectiveAccess,
  evaluateModuleAccessDecision,
  evaluateStationAccessDecision,
  isModuleAccessAllowed,
} from './effective-access-engine';

const activeWorker = {
  role: MembershipRole.WORKER,
  status: MembershipStatus.ACTIVE,
  organizationId: 'org-a',
};

describe('EffectiveAccessEngine', () => {
  describe('module permission semantics', () => {
    it('manage implies write and read', () => {
      const access = computeEffectiveAccess({
        membership: {
          ...activeWorker,
          permissions: { bookings: { read: false, write: false, manage: true } },
        },
      });
      expect(isModuleAccessAllowed(access, 'bookings', 'read')).toBe(true);
      expect(isModuleAccessAllowed(access, 'bookings', 'write')).toBe(true);
      expect(isModuleAccessAllowed(access, 'bookings', 'manage')).toBe(true);
    });

    it('write implies read but not manage', () => {
      const access = computeEffectiveAccess({
        membership: {
          ...activeWorker,
          permissions: { bookings: { read: false, write: true, manage: false } },
        },
      });
      expect(isModuleAccessAllowed(access, 'bookings', 'read')).toBe(true);
      expect(isModuleAccessAllowed(access, 'bookings', 'write')).toBe(true);
      expect(isModuleAccessAllowed(access, 'bookings', 'manage')).toBe(false);
    });

    it('read only allows read', () => {
      const access = computeEffectiveAccess({
        membership: {
          ...activeWorker,
          permissions: { bookings: { read: true, write: false, manage: false } },
        },
      });
      expect(isModuleAccessAllowed(access, 'bookings', 'read')).toBe(true);
      expect(isModuleAccessAllowed(access, 'bookings', 'write')).toBe(false);
    });

    it('unknown module key denies access', () => {
      const access = computeEffectiveAccess({
        membership: {
          ...activeWorker,
          permissions: { bookings: { read: true, write: true, manage: true } },
        },
      });
      const evaluation = evaluateModuleAccessDecision(access, 'evil-module', 'read');
      expect(evaluation.decision).toBe('UNKNOWN_CONFIGURATION');
    });

    it('missing permission denies access', () => {
      const access = computeEffectiveAccess({
        membership: {
          ...activeWorker,
          permissions: { dashboard: { read: true, write: false } },
        },
      });
      expect(isModuleAccessAllowed(access, 'users-roles', 'read')).toBe(false);
      const evaluation = evaluateModuleAccessDecision(access, 'users-roles', 'read');
      expect(evaluation.decision).toBe('DENY');
    });
  });

  describe('direct allow/deny overrides', () => {
    it('applies direct overrides on top of inherited template permissions', () => {
      const access = computeEffectiveAccess({
        membership: {
          ...activeWorker,
          organizationRoleId: 'role-1',
          permissions: { bookings: { read: true, write: true, manage: false } },
        },
        organizationRole: {
          id: 'role-1',
          permissions: { bookings: { read: true, write: false, manage: false } },
        },
      });
      expect(access.directOverrides).toEqual({
        bookings: { read: true, write: true, manage: false },
      });
      expect(isModuleAccessAllowed(access, 'bookings', 'write')).toBe(true);
    });

    it('explicit deny override removes inherited write', () => {
      const access = computeEffectiveAccess({
        membership: {
          ...activeWorker,
          organizationRoleId: 'role-1',
          permissions: { bookings: { read: true, write: false, manage: false } },
        },
        organizationRole: {
          id: 'role-1',
          permissions: { bookings: { read: true, write: true, manage: false } },
        },
        directPermissionOverrides: {
          bookings: { read: true, write: false, manage: false },
        },
      });
      expect(isModuleAccessAllowed(access, 'bookings', 'write')).toBe(false);
    });
  });

  describe('station scope', () => {
    const stationsV2 = { stationsScopeV2Enabled: true };

    it('ALL stations bypasses station checks', () => {
      const access = computeEffectiveAccess({
        membership: {
          ...activeWorker,
          stationScope: 'ALL',
          stationIds: [],
        },
        resourceContext: stationsV2,
      });
      expect(access.stationScope).toBe('ALL');
      expect(access.stationBypass).toBe(true);
      expect(evaluateStationAccessDecision(access, 'station-x')).toBe('ALLOW');
    });

    it('SELECTED stations allow only listed ids', () => {
      const access = computeEffectiveAccess({
        membership: {
          ...activeWorker,
          stationIds: ['s-1', 's-2'],
        },
        resourceContext: stationsV2,
      });
      expect(access.stationScope).toBe('SELECTED');
      expect(evaluateStationAccessDecision(access, 's-1')).toBe('ALLOW');
      expect(evaluateStationAccessDecision(access, 's-99')).toBe('DENY');
    });

    it('SINGLE station scope for worker restricts to one station', () => {
      const access = computeEffectiveAccess({
        membership: {
          ...activeWorker,
          stationScope: 'station-42',
          stationIds: [],
        },
        resourceContext: stationsV2,
      });
      expect(access.stationScope).toBe('SINGLE');
      expect(access.effectiveStationIds).toEqual(['station-42']);
      expect(evaluateStationAccessDecision(access, 'station-42')).toBe('ALLOW');
      expect(evaluateStationAccessDecision(access, 'wrong-station')).toBe('DENY');
    });
  });

  describe('membership status', () => {
    it('suspended membership denies module access', () => {
      const access = computeEffectiveAccess({
        membership: {
          ...activeWorker,
          status: MembershipStatus.SUSPENDED,
          permissions: { bookings: { read: true, write: true, manage: true } },
        },
      });
      expect(access.membershipActive).toBe(false);
      expect(isModuleAccessAllowed(access, 'bookings', 'read')).toBe(false);
    });
  });

  describe('admin bypass', () => {
    it('MASTER_ADMIN bypasses all module checks', () => {
      const access = computeEffectiveAccess({
        platformRole: 'MASTER_ADMIN',
      });
      expect(access.roleSource).toBe('MASTER_ADMIN');
      expect(isModuleAccessAllowed(access, 'users-roles', 'manage')).toBe(true);
      expect(access.privilegedCapabilities).toContain('platform.admin-bypass');
    });

    it('ORG_ADMIN bypasses module checks via membership role', () => {
      const access = computeEffectiveAccess({
        membership: {
          role: MembershipRole.ORG_ADMIN,
          status: MembershipStatus.ACTIVE,
          organizationId: 'org-a',
        },
      });
      expect(access.roleSource).toBe('ORG_ADMIN');
      expect(isModuleAccessAllowed(access, 'users-roles', 'manage')).toBe(true);
      expect(access.stationBypass).toBe(true);
    });

    it('custom admin role with users-roles.manage is privileged but not full bypass', () => {
      const access = computeEffectiveAccess({
        membership: {
          ...activeWorker,
          organizationRoleId: 'custom-admin',
          permissions: {
            'users-roles': { read: true, write: true, manage: true },
            dashboard: { read: true, write: false, manage: false },
          },
        },
        organizationRole: {
          id: 'custom-admin',
          membershipRole: MembershipRole.SUB_ADMIN,
          permissions: {
            'users-roles': { read: true, write: true, manage: true },
          },
        },
      });
      expect(access.roleSource).toBe('template');
      expect(access.privilegedCapabilities).toContain('users-roles.manage');
      expect(isModuleAccessAllowed(access, 'billing', 'manage')).toBe(false);
    });
  });

  describe('cross-tenant resource', () => {
    it('records cross-tenant denial reason for non-admin', () => {
      const access = computeEffectiveAccess({
        membership: {
          ...activeWorker,
          organizationId: 'org-a',
          permissions: { bookings: { read: true, write: false } },
        },
        resourceContext: { organizationId: 'org-b' },
      });
      expect(access.decisionReasons).toContain('deny:cross-tenant-resource');
    });

    it('MASTER_ADMIN is not cross-tenant blocked', () => {
      const access = computeEffectiveAccess({
        platformRole: 'MASTER_ADMIN',
        resourceContext: { organizationId: 'org-b' },
      });
      expect(access.decisionReasons).not.toContain('deny:cross-tenant-resource');
    });
  });

  describe('output contract', () => {
    it('returns required snapshot fields', () => {
      const access = computeEffectiveAccess({
        membership: {
          ...activeWorker,
          organizationRoleId: 'role-1',
          permissions: { bookings: { read: true, write: false } },
        },
        organizationRole: {
          id: 'role-1',
          permissions: { bookings: { read: true, write: false } },
        },
      });
      expect(access).toMatchObject({
        effectiveRole: MembershipRole.WORKER,
        roleSource: 'template',
        roleVersion: expect.any(Number),
        permissionVersion: expect.any(Number),
        inheritedPermissions: { bookings: { read: true, write: false, manage: false } },
        effectivePermissions: expect.any(Object),
        stationScope: expect.any(String),
        privilegedCapabilities: expect.any(Array),
        deniedCapabilities: expect.any(Array),
        decisionReasons: expect.any(Array),
        calculatedAt: expect.any(String),
      });
    });
  });
});
