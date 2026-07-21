import {
  buildRoleChangePreviewHash,
  diffPermissionGrants,
  diffPrivilegedCapabilities,
  detectSegregationOfDutiesConflicts,
  hasStructuralRoleChanges,
  membershipHasEffectiveAdminPrivileges,
  resolveMembershipSessionTriggers,
  resolveStepUpRequirement,
} from './role-change-impact.policy';

describe('role-change-impact.policy', () => {
  it('detects permission gain and loss', () => {
    const { gained, lost } = diffPermissionGrants(
      { bookings: { read: true, write: false } },
      { bookings: { read: true, write: true }, fleet: { read: true, write: false } },
    );
    expect(gained).toContainEqual({ module: 'bookings', level: 'write' });
    expect(gained).toContainEqual({ module: 'fleet', level: 'read' });
    expect(lost).toHaveLength(0);
  });

  it('detects admin gain via users-roles.manage', () => {
    const { gained } = diffPrivilegedCapabilities(
      { dashboard: { read: true, write: false } },
      { 'users-roles': { read: true, write: true, manage: true } },
      'WORKER',
      'WORKER',
    );
    expect(gained).toContain('users-roles.manage');
  });

  it('uses effective admin not only ORG_ADMIN enum', () => {
    expect(
      membershipHasEffectiveAdminPrivileges({
        membershipRole: 'WORKER',
        permissions: { 'users-roles': { read: true, write: true, manage: true } },
      }),
    ).toBe(true);
    expect(
      membershipHasEffectiveAdminPrivileges({
        membershipRole: 'ORG_ADMIN',
        permissions: null,
      }),
    ).toBe(true);
  });

  it('flags segregation of duties conflict', () => {
    const conflicts = detectSegregationOfDutiesConflicts({
      'users-roles': { read: true, write: true, manage: true },
      billing: { read: true, write: true, manage: true },
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].code).toBe('SOD_USERS_ROLES_BILLING');
  });

  it('requires step-up for privileged gain', () => {
    const stepUp = resolveStepUpRequirement({
      gainedPrivilegedCapabilities: ['users-roles.manage'],
      lastAdminRisk: {
        atRisk: false,
        remainingEffectiveAdminsAfter: 2,
        affectedAdminMembershipIds: [],
      },
      segregationConflicts: [],
    });
    expect(stepUp.required).toBe(true);
    expect(stepUp.reasons).toContain('privileged-capability-gain');
  });

  it('resolves session triggers for permission loss', () => {
    const triggers = resolveMembershipSessionTriggers({
      membershipRoleBefore: 'WORKER',
      membershipRoleAfter: 'WORKER',
      permissionsBefore: { bookings: { read: true, write: true } },
      permissionsAfter: { bookings: { read: true, write: false } },
      stationReduced: false,
      willReceiveUpdate: true,
    });
    expect(triggers).toContain('PERMISSION_REVOKED');
  });

  it('does not trigger sessions for pinned memberships', () => {
    const triggers = resolveMembershipSessionTriggers({
      membershipRoleBefore: 'WORKER',
      membershipRoleAfter: 'WORKER',
      permissionsBefore: { bookings: { read: true, write: true } },
      permissionsAfter: { bookings: { read: false, write: false } },
      stationReduced: false,
      willReceiveUpdate: false,
    });
    expect(triggers).toHaveLength(0);
  });

  it('builds stable preview hash', () => {
    const hash1 = buildRoleChangePreviewHash({
      organizationRoleId: 'role-1',
      currentVersionNumber: 2,
      proposedChanges: { permissions: { bookings: { read: true } } },
    });
    const hash2 = buildRoleChangePreviewHash({
      organizationRoleId: 'role-1',
      currentVersionNumber: 2,
      proposedChanges: { permissions: { bookings: { read: true } } },
    });
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('identifies structural role changes', () => {
    expect(hasStructuralRoleChanges({ fieldAgentAccessDefault: true })).toBe(true);
    expect(hasStructuralRoleChanges({})).toBe(false);
  });
});
