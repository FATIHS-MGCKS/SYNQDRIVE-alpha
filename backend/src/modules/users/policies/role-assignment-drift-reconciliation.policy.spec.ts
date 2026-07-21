import {
  buildRoleAssignmentDriftEvidencePackage,
  classifyMembershipDrift,
  hashEvidencePackage,
  validateEvidencePackageAgainstInput,
} from './role-assignment-drift-reconciliation.policy';

const baseMembership = {
  id: 'mem-1',
  organizationId: 'org-1',
  userId: 'user-1',
  status: 'ACTIVE',
  role: 'WORKER',
  organizationRoleId: 'role-1',
  permissions: { fleet: { read: true, write: false, manage: false } },
  stationScope: 'ALL',
  stationIds: null,
  fieldAgentAccess: false,
  membershipVersion: 1,
};

const baseRole = {
  id: 'role-1',
  organizationId: 'org-1',
  name: 'Worker',
  isActive: true,
  membershipRole: 'WORKER',
  permissions: { fleet: { read: true, write: false, manage: false } },
  stationScopeDefault: 'ALL',
  defaultStationIds: null,
  fieldAgentAccessDefault: false,
};

const baseAssignment = {
  id: 'assign-1',
  organizationId: 'org-1',
  membershipId: 'mem-1',
  organizationRoleId: 'role-1',
  assignedRoleVersionId: 'ver-1',
  assignmentMode: 'MIGRATION_LEGACY_SNAPSHOT',
  isCurrent: true,
};

describe('role-assignment-drift-reconciliation.policy', () => {
  it('classifies exact role match', () => {
    const result = classifyMembershipDrift({
      membership: baseMembership,
      assignment: baseAssignment,
      role: baseRole,
      roleVersions: [
        {
          id: 'ver-1',
          version: 1,
          status: 'APPROVED',
          permissions: baseRole.permissions,
          defaultStationScope: 'ALL',
          defaultStationIds: null,
          fieldAgentAccess: false,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      latestApprovedVersion: {
        id: 'ver-1',
        version: 1,
        status: 'APPROVED',
        permissions: baseRole.permissions,
        defaultStationScope: 'ALL',
        defaultStationIds: null,
        fieldAgentAccess: false,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    expect(result.classification).toBe('EXACT_ROLE_MATCH');
    expect(result.applyEligible).toBe(true);
    expect(result.recommendedAssignmentMode).toBe('FOLLOW_LATEST_APPROVED_VERSION');
  });

  it('classifies intentional override when delta is derivable', () => {
    const membership = {
      ...baseMembership,
      permissions: { fleet: { read: true, write: true, manage: false } },
    };
    const result = classifyMembershipDrift({
      membership,
      assignment: baseAssignment,
      role: baseRole,
      roleVersions: [],
      latestApprovedVersion: null,
    });
    expect(result.classification).toBe('INTENTIONAL_OVERRIDE');
    expect(result.derivedOverrides).toEqual([
      { moduleKey: 'fleet', permissionLevel: 'write', effect: 'ALLOW' },
    ]);
    expect(result.applyEligible).toBe(true);
  });

  it('classifies stale role snapshot when membership matches older version', () => {
    const oldPermissions = { fleet: { read: true, write: false, manage: false } };
    const newPermissions = { fleet: { read: true, write: true, manage: false } };
    const membership = {
      ...baseMembership,
      permissions: oldPermissions,
    };
    const role = {
      ...baseRole,
      permissions: newPermissions,
    };
    const result = classifyMembershipDrift({
      membership,
      assignment: baseAssignment,
      role,
      roleVersions: [
        {
          id: 'ver-1',
          version: 1,
          status: 'SUPERSEDED',
          permissions: oldPermissions,
          defaultStationScope: 'ALL',
          defaultStationIds: null,
          fieldAgentAccess: false,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'ver-2',
          version: 2,
          status: 'APPROVED',
          permissions: newPermissions,
          defaultStationScope: 'ALL',
          defaultStationIds: null,
          fieldAgentAccess: false,
          createdAt: '2026-02-01T00:00:00.000Z',
        },
      ],
      latestApprovedVersion: {
        id: 'ver-2',
        version: 2,
        status: 'APPROVED',
        permissions: newPermissions,
        defaultStationScope: 'ALL',
        defaultStationIds: null,
        fieldAgentAccess: false,
        createdAt: '2026-02-01T00:00:00.000Z',
      },
    });
    expect(result.classification).toBe('STALE_ROLE_SNAPSHOT');
    expect(result.applyEligible).toBe(true);
  });

  it('classifies privileged drift', () => {
    const membership = {
      ...baseMembership,
      role: 'WORKER',
      permissions: { 'users-roles': { read: true, write: true, manage: true } },
    };
    const result = classifyMembershipDrift({
      membership,
      assignment: baseAssignment,
      role: baseRole,
      roleVersions: [],
      latestApprovedVersion: null,
    });
    expect(result.classification).toBe('PRIVILEGED_DRIFT');
    expect(result.applyEligible).toBe(false);
    expect(result.reviewRequired).toBe(true);
  });

  it('classifies unknown role source without linked role', () => {
    const result = classifyMembershipDrift({
      membership: {
        ...baseMembership,
        organizationRoleId: null,
        permissions: { fleet: { read: true, write: false, manage: false } },
      },
      assignment: {
        ...baseAssignment,
        organizationRoleId: null,
      },
      role: null,
      roleVersions: [],
      latestApprovedVersion: null,
    });
    expect(result.classification).toBe('UNKNOWN_ROLE_SOURCE');
    expect(result.applyEligible).toBe(false);
  });

  it('detects invalid permission keys', () => {
    const result = classifyMembershipDrift({
      membership: {
        ...baseMembership,
        permissions: { 'not-a-real-module': { read: true, write: false, manage: false } },
      },
      assignment: baseAssignment,
      role: baseRole,
      roleVersions: [],
      latestApprovedVersion: null,
    });
    expect(result.classification).toBe('INVALID_PERMISSION_KEY');
  });

  it('rejects stale evidence package hash', () => {
    const pkg = buildRoleAssignmentDriftEvidencePackage({
      organizationId: 'org-1',
      membership: baseMembership,
      assignment: baseAssignment,
      role: baseRole,
      roleVersions: [],
      latestApprovedVersion: null,
      existingOverrides: [],
      auditHistory: [],
      sessions: { activeSessionCount: 0, orgBoundSessionCount: 0 },
      membershipAlias: 'MEMBERSHIP_001',
      userAlias: 'USER_001',
    });
    const changed = buildRoleAssignmentDriftEvidencePackage({
      organizationId: 'org-1',
      membership: {
        ...baseMembership,
        membershipVersion: 2,
      },
      assignment: baseAssignment,
      role: baseRole,
      roleVersions: [],
      latestApprovedVersion: null,
      existingOverrides: [],
      auditHistory: [],
      sessions: { activeSessionCount: 0, orgBoundSessionCount: 0 },
      membershipAlias: 'MEMBERSHIP_001',
      userAlias: 'USER_001',
    });
    const validation = validateEvidencePackageAgainstInput(pkg, changed);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('stale_evidence_hash');
  });

  it('rejects cross-tenant evidence package', () => {
    const stored = buildRoleAssignmentDriftEvidencePackage({
      organizationId: 'org-1',
      membership: baseMembership,
      assignment: baseAssignment,
      role: baseRole,
      roleVersions: [],
      latestApprovedVersion: null,
      existingOverrides: [],
      auditHistory: [],
      sessions: { activeSessionCount: 0, orgBoundSessionCount: 0 },
      membershipAlias: 'MEMBERSHIP_001',
      userAlias: 'USER_001',
    });
    const current = buildRoleAssignmentDriftEvidencePackage({
      organizationId: 'org-2',
      membership: { ...baseMembership, organizationId: 'org-2' },
      assignment: { ...baseAssignment, organizationId: 'org-2' },
      role: { ...baseRole, organizationId: 'org-2' },
      roleVersions: [],
      latestApprovedVersion: null,
      existingOverrides: [],
      auditHistory: [],
      sessions: { activeSessionCount: 0, orgBoundSessionCount: 0 },
      membershipAlias: 'MEMBERSHIP_001',
      userAlias: 'USER_001',
    });
    const validation = validateEvidencePackageAgainstInput(stored, current);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('cross_tenant');
  });

  it('hashes evidence package deterministically', () => {
    const pkg = buildRoleAssignmentDriftEvidencePackage({
      organizationId: 'org-1',
      membership: baseMembership,
      assignment: baseAssignment,
      role: baseRole,
      roleVersions: [],
      latestApprovedVersion: null,
      existingOverrides: [],
      auditHistory: [],
      sessions: { activeSessionCount: 0, orgBoundSessionCount: 0 },
      membershipAlias: 'MEMBERSHIP_001',
      userAlias: 'USER_001',
    });
    expect(hashEvidencePackage(pkg)).toBe(pkg.evidenceHash);
  });

  it('classifies no role assignment when current assignment is missing', () => {
    const result = classifyMembershipDrift({
      membership: baseMembership,
      assignment: null,
      role: baseRole,
      roleVersions: [],
      latestApprovedVersion: null,
    });
    expect(result.classification).toBe('NO_ROLE_ASSIGNMENT');
    expect(result.applyEligible).toBe(false);
  });
});
