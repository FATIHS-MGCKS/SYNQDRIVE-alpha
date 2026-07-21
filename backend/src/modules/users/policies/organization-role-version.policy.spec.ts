import {
  applyPermissionOverrides,
  assertSameOrganization,
  assertSystemRoleMutationAllowed,
  buildVersionSnapshotFromRole,
  inferRiskClassification,
  isOverrideActive,
  isRoleVersionUsable,
  mapAssignmentHistory,
  nextRoleVersionNumber,
  resolveEffectiveRoleVersion,
  shouldCreateNewVersionOnUpdate,
} from './organization-role-version.policy';

describe('organization-role-version.policy', () => {
  const role = {
    id: 'role-1',
    organizationId: 'org-a',
    name: 'Worker',
    description: 'Standard worker',
    isSystemTemplate: false,
    membershipRole: 'WORKER',
    permissions: { bookings: { read: true, write: false } },
    stationScopeDefault: null,
    defaultStationIds: [],
    fieldAgentAccessDefault: false,
  };

  it('creates next version number', () => {
    expect(nextRoleVersionNumber([])).toBe(1);
    expect(nextRoleVersionNumber([{ version: 1 }, { version: 3 }])).toBe(4);
  });

  it('builds version snapshot from role template', () => {
    const snapshot = buildVersionSnapshotFromRole(role, 2, {
      changeReason: 'Permission update',
    });
    expect(snapshot).toMatchObject({
      organizationRoleId: 'role-1',
      version: 2,
      nameSnapshot: 'Worker',
      permissions: role.permissions,
      changeReason: 'Permission update',
      status: 'APPROVED',
    });
  });

  it('infers risk classification for system and org admin roles', () => {
    expect(inferRiskClassification({ membershipRole: 'ORG_ADMIN', isSystemTemplate: false })).toBe(
      'CRITICAL',
    );
    expect(inferRiskClassification({ membershipRole: 'WORKER', isSystemTemplate: true })).toBe(
      'PRIVILEGED',
    );
    expect(inferRiskClassification({ membershipRole: 'WORKER', isSystemTemplate: false })).toBe(
      'STANDARD',
    );
  });

  it('resolves FOLLOW_LATEST to latest approved version', () => {
    const latest = {
      id: 'v2',
      organizationRoleId: 'role-1',
      organizationId: 'org-a',
      version: 2,
      nameSnapshot: 'Worker',
      fieldAgentAccess: false,
      riskClassification: 'STANDARD',
      status: 'APPROVED' as const,
      createdAt: new Date().toISOString(),
    };
    const result = resolveEffectiveRoleVersion({
      assignment: {
        id: 'a1',
        organizationId: 'org-a',
        membershipId: 'm1',
        organizationRoleId: 'role-1',
        assignmentMode: 'FOLLOW_LATEST_APPROVED_VERSION',
        assignedAt: new Date().toISOString(),
        effectiveFrom: new Date().toISOString(),
        isCurrent: true,
      },
      latestApprovedVersion: latest,
    });
    expect(result?.id).toBe('v2');
  });

  it('resolves PINNED to pinned version', () => {
    const pinned = {
      id: 'v1',
      organizationRoleId: 'role-1',
      organizationId: 'org-a',
      version: 1,
      nameSnapshot: 'Worker',
      fieldAgentAccess: false,
      riskClassification: 'STANDARD',
      status: 'APPROVED' as const,
      createdAt: new Date().toISOString(),
    };
    const result = resolveEffectiveRoleVersion({
      assignment: {
        id: 'a1',
        organizationId: 'org-a',
        membershipId: 'm1',
        organizationRoleId: 'role-1',
        assignedRoleVersionId: 'v1',
        assignmentMode: 'PINNED_VERSION',
        assignedAt: new Date().toISOString(),
        effectiveFrom: new Date().toISOString(),
        isCurrent: true,
      },
      latestApprovedVersion: {
        ...pinned,
        id: 'v2',
        version: 2,
      },
      pinnedVersion: pinned,
    });
    expect(result?.id).toBe('v1');
  });

  it('rejects retired version as unusable', () => {
    expect(
      isRoleVersionUsable({
        id: 'v1',
        organizationRoleId: 'role-1',
        organizationId: 'org-a',
        version: 1,
        nameSnapshot: 'Old',
        fieldAgentAccess: false,
        riskClassification: 'STANDARD',
        status: 'RETIRED',
        createdAt: new Date().toISOString(),
      }),
    ).toBe(false);
  });

  it('applies explicit ALLOW and DENY overrides', () => {
    const base = { bookings: { read: true, write: false, manage: false } };
    const result = applyPermissionOverrides(base, [
      {
        id: 'o1',
        organizationId: 'org-a',
        membershipId: 'm1',
        moduleKey: 'bookings',
        permissionLevel: 'write',
        effect: 'ALLOW',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'o2',
        organizationId: 'org-a',
        membershipId: 'm1',
        moduleKey: 'users-roles',
        permissionLevel: 'read',
        effect: 'DENY',
        createdAt: new Date().toISOString(),
      },
    ]);
    expect(result?.bookings.write).toBe(true);
    expect(result?.['users-roles']).toEqual({ read: false, write: false, manage: false });
  });

  it('ignores revoked and expired overrides', () => {
    const now = new Date('2026-07-21T12:00:00Z');
    expect(
      isOverrideActive(
        {
          id: 'o1',
          organizationId: 'org-a',
          membershipId: 'm1',
          moduleKey: 'bookings',
          permissionLevel: 'write',
          effect: 'ALLOW',
          revokedAt: '2026-07-20T00:00:00Z',
          createdAt: new Date().toISOString(),
        },
        now,
      ),
    ).toBe(false);
    expect(
      isOverrideActive(
        {
          id: 'o2',
          organizationId: 'org-a',
          membershipId: 'm1',
          moduleKey: 'bookings',
          permissionLevel: 'write',
          effect: 'ALLOW',
          expiresAt: '2026-07-21T11:00:00Z',
          createdAt: new Date().toISOString(),
        },
        now,
      ),
    ).toBe(false);
  });

  it('blocks system role destructive mutations', () => {
    expect(() =>
      assertSystemRoleMutationAllowed({ isSystemTemplate: true }, 'delete'),
    ).toThrow(/cannot be deleted/i);
    expect(() =>
      assertSystemRoleMutationAllowed({ isSystemTemplate: true }, 'permissions'),
    ).toThrow(/cannot change permissions/i);
  });

  it('requires new version when custom role permissions change', () => {
    expect(
      shouldCreateNewVersionOnUpdate(role, { permissions: { bookings: { read: true } } }),
    ).toBe(true);
    expect(shouldCreateNewVersionOnUpdate(role, { name: 'Renamed' } as never)).toBe(false);
  });

  it('rejects cross-tenant operations', () => {
    expect(() => assertSameOrganization('org-a', 'org-b', 'assignment')).toThrow(
      /Cross-tenant/,
    );
  });

  it('orders assignment history newest first', () => {
    const history = mapAssignmentHistory([
      {
        id: 'a1',
        organizationId: 'org-a',
        membershipId: 'm1',
        assignmentMode: 'MIGRATION_LEGACY_SNAPSHOT',
        assignedAt: '2026-01-01T00:00:00Z',
        effectiveFrom: '2026-01-01T00:00:00Z',
        isCurrent: false,
      },
      {
        id: 'a2',
        organizationId: 'org-a',
        membershipId: 'm1',
        assignmentMode: 'FOLLOW_LATEST_APPROVED_VERSION',
        assignedAt: '2026-06-01T00:00:00Z',
        effectiveFrom: '2026-06-01T00:00:00Z',
        isCurrent: true,
      },
    ]);
    expect(history[0].id).toBe('a2');
  });
});
