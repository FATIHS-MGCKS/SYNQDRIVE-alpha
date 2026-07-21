import { MembershipRole, MembershipStatus } from '@prisma/client';
import {
  buildVersionSnapshot,
  computePermissionVersionSnapshot,
  computeRoleVersionSnapshot,
  resolveLoginMembership,
  resolveRefreshBinding,
  validateVersionSnapshots,
} from './refresh-session-binding.policy';

describe('refresh-session-binding.policy', () => {
  const orgA = '00000000-0000-4000-8000-0000000000a1';
  const orgB = '00000000-0000-4000-8000-0000000000b1';
  const membershipA = '00000000-0000-4000-8000-0000000000m1';
  const membershipB = '00000000-0000-4000-8000-0000000000m2';
  const userId = '00000000-0000-4000-8000-0000000000u1';

  const membershipFixture = (
    overrides: Partial<{
      id: string;
      organizationId: string;
      role: MembershipRole;
      status: MembershipStatus;
      membershipVersion: number;
      permissions: unknown;
      organizationRoleId: string | null;
    }> = {},
  ) => ({
    id: membershipA,
    userId,
    organizationId: orgA,
    role: MembershipRole.WORKER,
    status: MembershipStatus.ACTIVE,
    membershipVersion: 0,
    permissions: { bookings: { read: true, write: false } },
    organizationRoleId: null,
    ...overrides,
  });

  describe('resolveLoginMembership', () => {
    it('uses the sole active membership for single-org users', () => {
      const m = membershipFixture();
      expect(resolveLoginMembership([m])).toEqual({ ok: true, membership: m });
    });

    it('requires organizationId when multiple active memberships exist', () => {
      const result = resolveLoginMembership([
        membershipFixture({ id: membershipA, organizationId: orgA }),
        membershipFixture({
          id: membershipB,
          organizationId: orgB,
          role: MembershipRole.ORG_ADMIN,
        }),
      ]);
      expect(result).toEqual({
        ok: false,
        code: 'ORGANIZATION_SELECTION_REQUIRED',
        message:
          'Multiple organizations available — organizationId is required at login',
      });
    });

    it('honors explicit organizationId for multi-org login', () => {
      const memberships = [
        membershipFixture({ id: membershipA, organizationId: orgA }),
        membershipFixture({
          id: membershipB,
          organizationId: orgB,
          role: MembershipRole.ORG_ADMIN,
        }),
      ];
      const result = resolveLoginMembership(memberships, {
        requestedOrganizationId: orgB,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.membership?.organizationId).toBe(orgB);
      }
    });

    it('falls back to lastAuthOrganizationId when documented', () => {
      const memberships = [
        membershipFixture({ id: membershipA, organizationId: orgA }),
        membershipFixture({
          id: membershipB,
          organizationId: orgB,
          role: MembershipRole.ORG_ADMIN,
        }),
      ];
      const result = resolveLoginMembership(memberships, {
        lastAuthOrganizationId: orgA,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.membership?.organizationId).toBe(orgA);
      }
    });

    it('returns null membership when no active memberships', () => {
      expect(resolveLoginMembership([])).toEqual({ ok: true, membership: null });
    });
  });

  describe('resolveRefreshBinding', () => {
    it('keeps org-bound refresh on the same membership', () => {
      const membership = membershipFixture();
      const result = resolveRefreshBinding(
        {
          scope: 'ORG_MEMBERSHIP_BOUND',
          organizationId: orgA,
          membershipId: membershipA,
          userId,
        },
        membership,
        [membership],
        { graceEnabled: false, orgBoundEnforced: true },
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.membership?.organizationId).toBe(orgA);
        expect(result.upgradedFromLegacy).toBe(false);
      }
    });

    it('rejects suspended membership', () => {
      const membership = membershipFixture({ status: MembershipStatus.SUSPENDED });
      const result = resolveRefreshBinding(
        {
          scope: 'ORG_MEMBERSHIP_BOUND',
          organizationId: orgA,
          membershipId: membershipA,
          userId,
        },
        membership,
        [],
        { graceEnabled: false, orgBoundEnforced: true },
      );
      expect(result).toMatchObject({
        ok: false,
        code: 'MEMBERSHIP_INACTIVE',
        auditEvent: 'REFRESH_MEMBERSHIP_SUSPENDED',
      });
    });

    it('rejects removed membership', () => {
      const membership = membershipFixture({ status: MembershipStatus.REMOVED });
      const result = resolveRefreshBinding(
        {
          scope: 'ORG_MEMBERSHIP_BOUND',
          organizationId: orgA,
          membershipId: membershipA,
          userId,
        },
        membership,
        [],
        { graceEnabled: false, orgBoundEnforced: true },
      );
      expect(result).toMatchObject({
        ok: false,
        code: 'MEMBERSHIP_REMOVED',
      });
    });

    it('rejects cross-tenant organization mismatch', () => {
      const membership = membershipFixture({ organizationId: orgB });
      const result = resolveRefreshBinding(
        {
          scope: 'ORG_MEMBERSHIP_BOUND',
          organizationId: orgA,
          membershipId: membershipA,
          userId,
        },
        membership,
        [membership],
        { graceEnabled: false, orgBoundEnforced: true },
      );
      expect(result).toMatchObject({
        ok: false,
        code: 'CROSS_TENANT_BINDING',
      });
    });

    it('rejects legacy unscoped sessions without grace', () => {
      const result = resolveRefreshBinding(
        {
          scope: 'LEGACY_UNSCOPED',
          organizationId: null,
          membershipId: null,
          userId,
        },
        null,
        [membershipFixture()],
        { graceEnabled: false, orgBoundEnforced: true },
      );
      expect(result).toMatchObject({
        ok: false,
        code: 'LEGACY_UNSCOPED_REJECTED',
      });
    });

    it('upgrades legacy session when single active membership and grace enabled', () => {
      const membership = membershipFixture();
      const result = resolveRefreshBinding(
        {
          scope: 'LEGACY_UNSCOPED',
          organizationId: null,
          membershipId: null,
          userId,
        },
        null,
        [membership],
        { graceEnabled: true, orgBoundEnforced: true },
      );
      expect(result).toMatchObject({
        ok: true,
        upgradedFromLegacy: true,
        scope: 'ORG_MEMBERSHIP_BOUND',
      });
    });
  });

  describe('validateVersionSnapshots', () => {
    it('detects membership version drift', () => {
      const membership = membershipFixture({ membershipVersion: 2 });
      const current = buildVersionSnapshot({ sessionVersion: 0, membership });
      const result = validateVersionSnapshots(
        {
          userId,
          sessionVersion: 0,
          membershipVersion: 1,
          permissionVersion: current.permissionVersion,
          roleVersion: current.roleVersion,
        },
        current,
      );
      expect(result).toMatchObject({
        ok: false,
        code: 'VERSION_MISMATCH',
        auditEvent: 'REFRESH_MEMBERSHIP_VERSION_MISMATCH',
      });
    });

    it('detects role version drift', () => {
      const membership = membershipFixture({
        role: MembershipRole.ORG_ADMIN,
        organizationRoleId: 'role-1',
      });
      const current = buildVersionSnapshot({ sessionVersion: 0, membership });
      const result = validateVersionSnapshots(
        {
          userId,
          sessionVersion: 0,
          membershipVersion: 0,
          permissionVersion: current.permissionVersion,
          roleVersion: computeRoleVersionSnapshot(
            MembershipRole.WORKER,
            'role-1',
          ),
        },
        current,
      );
      expect(result).toMatchObject({
        ok: false,
        code: 'VERSION_MISMATCH',
        auditEvent: 'REFRESH_ROLE_VERSION_MISMATCH',
      });
    });

    it('detects permission version drift', () => {
      const membership = membershipFixture({
        permissions: { bookings: { read: true, write: true } },
      });
      const current = buildVersionSnapshot({ sessionVersion: 0, membership });
      const result = validateVersionSnapshots(
        {
          userId,
          sessionVersion: 0,
          membershipVersion: 0,
          permissionVersion: computePermissionVersionSnapshot({
            bookings: { read: true, write: false },
          }),
          roleVersion: current.roleVersion,
        },
        current,
      );
      expect(result).toMatchObject({
        ok: false,
        code: 'VERSION_MISMATCH',
        auditEvent: 'REFRESH_PERMISSION_VERSION_MISMATCH',
      });
    });
  });
});
