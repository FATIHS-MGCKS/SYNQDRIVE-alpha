import { ConflictException } from '@nestjs/common';
import { MembershipRole, OrganizationRoleAssignmentMode } from '@prisma/client';
import { RoleAssignmentDriftReconciliationService } from './role-assignment-drift-reconciliation.service';
import {
  buildDriftAuditReport,
  buildRoleAssignmentDriftEvidencePackage,
} from './policies/role-assignment-drift-reconciliation.policy';
import { UserAccessAuditService } from './user-access-audit.service';
import { OrganizationRoleVersionService } from './organization-role-version.service';
import { IamSessionPolicyService } from '@modules/auth/iam-session-policy.service';

function buildExactMatchEvidence(membershipId = 'mem-1') {
  const permissions = { fleet: { read: true, write: false, manage: false } };
  return buildRoleAssignmentDriftEvidencePackage({
    organizationId: 'org-1',
    membership: {
      id: membershipId,
      organizationId: 'org-1',
      userId: membershipId === 'mem-1' ? 'user-1' : 'user-2',
      status: 'ACTIVE',
      role: MembershipRole.WORKER,
      organizationRoleId: 'role-1',
      permissions,
      stationScope: 'ALL',
      stationIds: null,
      fieldAgentAccess: false,
      membershipVersion: 1,
    },
    assignment: {
      id: `assign-${membershipId}`,
      organizationId: 'org-1',
      membershipId,
      organizationRoleId: 'role-1',
      assignedRoleVersionId: 'ver-1',
      assignmentMode: OrganizationRoleAssignmentMode.MIGRATION_LEGACY_SNAPSHOT,
      isCurrent: true,
    },
    role: {
      id: 'role-1',
      organizationId: 'org-1',
      name: 'Worker',
      isActive: true,
      membershipRole: MembershipRole.WORKER,
      permissions,
      stationScopeDefault: 'ALL',
      defaultStationIds: null,
      fieldAgentAccessDefault: false,
    },
    roleVersions: [],
    latestApprovedVersion: null,
    existingOverrides: [],
    auditHistory: [],
    sessions: { activeSessionCount: 0, orgBoundSessionCount: 0 },
    membershipAlias: 'MEMBERSHIP_001',
    userAlias: 'USER_001',
  });
}

describe('RoleAssignmentDriftReconciliationService', () => {
  let prisma: Record<string, any>;
  let roleVersionService: jest.Mocked<Pick<OrganizationRoleVersionService, 'getLatestApprovedVersion'>>;
  let sessionPolicy: jest.Mocked<Pick<IamSessionPolicyService, 'enqueueInTransaction' | 'processIntents'>>;
  let userAudit: jest.Mocked<Pick<UserAccessAuditService, 'record'>>;
  let service: RoleAssignmentDriftReconciliationService;

  beforeEach(() => {
    prisma = {
      organization: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]),
      },
      organizationMembership: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      organizationRole: { findFirst: jest.fn() },
      organizationRoleAssignment: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      organizationRoleVersion: { findMany: jest.fn() },
      membershipPermissionOverride: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      activityLog: { findMany: jest.fn().mockResolvedValue([]) },
      refreshToken: { count: jest.fn().mockResolvedValue(0) },
      organizationRoleAssignmentDriftReconciliationApplication: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) =>
        fn({
          organizationRoleAssignment: prisma.organizationRoleAssignment,
          membershipPermissionOverride: prisma.membershipPermissionOverride,
          organizationMembership: prisma.organizationMembership,
          organizationRoleAssignmentDriftReconciliationApplication:
            prisma.organizationRoleAssignmentDriftReconciliationApplication,
        }),
      ),
    };

    roleVersionService = {
      getLatestApprovedVersion: jest.fn(),
    };
    sessionPolicy = {
      enqueueInTransaction: jest.fn().mockResolvedValue({ intentIds: ['intent-1'], scopes: [] }),
      processIntents: jest.fn().mockResolvedValue(undefined),
    };
    userAudit = { record: jest.fn().mockResolvedValue(undefined) };

    service = new RoleAssignmentDriftReconciliationService(
      prisma as never,
      roleVersionService as never,
      sessionPolicy as never,
      userAudit as never,
    );
  });

  it('rejects stale report hash on apply', async () => {
    jest.spyOn(service, 'runReadOnlyAudit').mockResolvedValue(
      buildDriftAuditReport({
        organizationId: 'org-1',
        organizationAlias: 'ORG_001',
        gitCommit: 'abc123',
        mode: 'read-only',
        writesPerformed: false,
        evidencePackages: [],
      }),
    );

    await expect(
      service.applyDriftReconciliation({
        organizationId: 'org-1',
        evidencePackages: [],
        evidenceHash: 'stale-hash',
        expectedGitCommit: 'abc123',
        operator: 'ops',
        reason: 'reconcile',
        batchLimit: 10,
        backupConfirmed: true,
        apply: true,
        idempotencyKeyPrefix: 'test',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('replays duplicate apply idempotently', async () => {
    const pkg = buildExactMatchEvidence();
    const report = buildDriftAuditReport({
      organizationId: 'org-1',
      organizationAlias: 'ORG_001',
      gitCommit: 'abc123',
      mode: 'read-only',
      writesPerformed: false,
      evidencePackages: [pkg],
    });
    jest.spyOn(service, 'runReadOnlyAudit').mockResolvedValue(report);
    jest.spyOn(service as any, 'buildEvidencePackagesForOrg').mockResolvedValue([pkg]);
    prisma.organizationRoleAssignmentDriftReconciliationApplication.findUnique.mockResolvedValue({
      result: { assignmentId: 'assign-2' },
    });

    const applyReport = await service.applyDriftReconciliation({
      organizationId: 'org-1',
      evidencePackages: [pkg],
      evidenceHash: report.reportHash,
      expectedGitCommit: 'abc123',
      operator: 'ops',
      reason: 'reconcile',
      batchLimit: 10,
      backupConfirmed: true,
      apply: true,
      idempotencyKeyPrefix: 'test',
    });

    expect(applyReport.summary.applied).toBe(0);
    expect(applyReport.summary.skipped).toBe(1);
    expect(applyReport.items[0]?.outcome).toBe('idempotent_replay');
  });

  it('rejects cross-tenant packages during apply', async () => {
    const pkg = buildExactMatchEvidence();
    const fresh = buildExactMatchEvidence();
    (fresh as { organizationId: string }).organizationId = 'org-2';
    const report = buildDriftAuditReport({
      organizationId: 'org-1',
      organizationAlias: 'ORG_001',
      gitCommit: 'abc123',
      mode: 'read-only',
      writesPerformed: false,
      evidencePackages: [pkg],
    });
    jest.spyOn(service, 'runReadOnlyAudit').mockResolvedValue(report);
    jest.spyOn(service as any, 'buildEvidencePackagesForOrg').mockResolvedValue([fresh]);

    const applyReport = await service.applyDriftReconciliation({
      organizationId: 'org-1',
      evidencePackages: [pkg],
      evidenceHash: report.reportHash,
      expectedGitCommit: 'abc123',
      operator: 'ops',
      reason: 'reconcile',
      batchLimit: 10,
      backupConfirmed: true,
      apply: true,
      idempotencyKeyPrefix: 'test',
    });

    expect(applyReport.summary.rejected).toBe(1);
    expect(applyReport.items[0]?.detail).toBe('cross_tenant');
  });

  it('applies safe exact match reconciliation with audit and session policy', async () => {
    const pkg = buildExactMatchEvidence();
    const report = buildDriftAuditReport({
      organizationId: 'org-1',
      organizationAlias: 'ORG_001',
      gitCommit: 'abc123',
      mode: 'read-only',
      writesPerformed: false,
      evidencePackages: [pkg],
    });
    jest.spyOn(service, 'runReadOnlyAudit').mockResolvedValue(report);
    jest.spyOn(service as any, 'buildEvidencePackagesForOrg').mockResolvedValue([pkg]);
    prisma.organizationRoleAssignmentDriftReconciliationApplication.findUnique.mockResolvedValue(null);
    prisma.organizationRole.findFirst.mockResolvedValue({
      id: 'role-1',
      organizationId: 'org-1',
      name: 'Worker',
      membershipRole: MembershipRole.WORKER,
      permissions: { fleet: { read: true, write: false, manage: false } },
      stationScopeDefault: 'ALL',
      defaultStationIds: null,
      fieldAgentAccessDefault: false,
    });
    prisma.organizationMembership.findFirst.mockResolvedValue({
      id: 'mem-1',
      userId: 'user-1',
      organizationId: 'org-1',
    });
    roleVersionService.getLatestApprovedVersion.mockResolvedValue({
      id: 'ver-1',
      version: 1,
    } as never);
    prisma.organizationRoleAssignment.updateMany.mockResolvedValue({ count: 1 });
    prisma.organizationRoleAssignment.create.mockResolvedValue({ id: 'assign-2' });
    prisma.organizationMembership.update.mockResolvedValue({ membershipVersion: 2 });

    const applyReport = await service.applyDriftReconciliation({
      organizationId: 'org-1',
      evidencePackages: [pkg],
      evidenceHash: report.reportHash,
      expectedGitCommit: 'abc123',
      operator: 'ops',
      reason: 'reconcile',
      batchLimit: 10,
      backupConfirmed: true,
      apply: true,
      idempotencyKeyPrefix: 'test',
    });

    expect(applyReport.summary.applied).toBe(1);
    expect(sessionPolicy.enqueueInTransaction).toHaveBeenCalled();
    expect(sessionPolicy.processIntents).toHaveBeenCalledWith(['intent-1']);
    expect(userAudit.record).toHaveBeenCalled();
  });

  it('records partial failures without aborting the whole batch', async () => {
    const pkg1 = buildExactMatchEvidence('mem-1');
    const pkg2 = buildExactMatchEvidence('mem-2');
    const report = buildDriftAuditReport({
      organizationId: 'org-1',
      organizationAlias: 'ORG_001',
      gitCommit: 'abc123',
      mode: 'read-only',
      writesPerformed: false,
      evidencePackages: [pkg1, pkg2],
    });
    jest.spyOn(service, 'runReadOnlyAudit').mockResolvedValue(report);
    jest
      .spyOn(service as any, 'buildEvidencePackagesForOrg')
      .mockResolvedValue([pkg1, pkg2]);
    prisma.organizationRoleAssignmentDriftReconciliationApplication.findUnique.mockResolvedValue(null);

    jest
      .spyOn(service as any, 'applySafeMembershipReconciliation')
      .mockResolvedValueOnce({ detail: 'assignment=assign-2' })
      .mockRejectedValueOnce(new Error('db write failed'));

    const applyReport = await service.applyDriftReconciliation({
      organizationId: 'org-1',
      evidencePackages: [pkg1, pkg2],
      evidenceHash: report.reportHash,
      expectedGitCommit: 'abc123',
      operator: 'ops',
      reason: 'reconcile',
      batchLimit: 10,
      backupConfirmed: true,
      apply: true,
      idempotencyKeyPrefix: 'test',
    });

    expect(applyReport.summary.applied).toBe(1);
    expect(applyReport.summary.failed).toBe(1);
  });
});
