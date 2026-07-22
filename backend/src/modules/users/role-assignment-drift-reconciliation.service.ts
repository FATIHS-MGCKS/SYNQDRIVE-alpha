import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipStatus,
  OrganizationRoleAssignmentMode,
  OrganizationRoleVersionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { IamSessionPolicyService } from '@modules/auth/iam-session-policy.service';
import { OrganizationRoleVersionService } from './organization-role-version.service';
import {
  buildDriftAuditReport,
  buildRoleAssignmentDriftEvidencePackage,
  isAutoApplicableClassification,
  type RoleAssignmentDriftAuditReport,
  type RoleAssignmentDriftEvidencePackage,
  validateEvidencePackageAgainstInput,
} from './policies/role-assignment-drift-reconciliation.policy';
import { UserAccessAuditService, UserAccessAuditAction } from './user-access-audit.service';

export type DriftReconciliationApplyInput = {
  organizationId: string;
  evidencePackages: RoleAssignmentDriftEvidencePackage[];
  evidenceHash: string;
  expectedGitCommit: string;
  operator: string;
  reason: string;
  batchLimit: number;
  backupConfirmed: boolean;
  apply: boolean;
  idempotencyKeyPrefix: string;
};

export type DriftReconciliationApplyItem = {
  membershipId: string;
  evidenceHash: string;
  classification: string;
  outcome: 'applied' | 'skipped' | 'failed' | 'rejected' | 'idempotent_replay';
  detail: string;
};

export type DriftReconciliationApplyReport = {
  mode: 'read-only' | 'apply';
  organizationId: string;
  operator: string;
  reason: string;
  expectedGitCommit: string;
  evidenceHash: string;
  batchLimit: number;
  summary: {
    scanned: number;
    applyEligible: number;
    applied: number;
    skipped: number;
    failed: number;
    rejected: number;
  };
  items: DriftReconciliationApplyItem[];
  generatedAt: string;
};

@Injectable()
export class RoleAssignmentDriftReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleVersionService: OrganizationRoleVersionService,
    private readonly sessionPolicy: IamSessionPolicyService,
    private readonly userAudit: UserAccessAuditService,
  ) {}

  async runReadOnlyAudit(input: {
    organizationId?: string;
    organizationAlias?: string;
    gitCommit?: string | null;
  }): Promise<RoleAssignmentDriftAuditReport> {
    const org = await this.resolveOrganization(input);
    const evidencePackages = await this.buildEvidencePackagesForOrg(org.id);
    return buildDriftAuditReport({
      organizationId: org.id,
      organizationAlias: org.alias,
      gitCommit: input.gitCommit ?? null,
      mode: 'read-only',
      writesPerformed: false,
      evidencePackages,
    });
  }

  async applyDriftReconciliation(
    input: DriftReconciliationApplyInput,
  ): Promise<DriftReconciliationApplyReport> {
    if (input.apply && !input.backupConfirmed) {
      throw new BadRequestException('backupConfirmed is required for --apply');
    }
    if (!input.operator?.trim()) {
      throw new BadRequestException('operator is required');
    }
    if (!input.reason?.trim()) {
      throw new BadRequestException('reason is required');
    }
    if (!input.expectedGitCommit?.trim()) {
      throw new BadRequestException('expectedGitCommit is required');
    }
    if (!input.evidenceHash?.trim()) {
      throw new BadRequestException('evidenceHash is required');
    }

    const currentReport = await this.runReadOnlyAudit({
      organizationId: input.organizationId,
      gitCommit: input.expectedGitCommit,
    });

    if (currentReport.reportHash !== input.evidenceHash) {
      throw new ConflictException(
        'Evidence package hash mismatch — regenerate read-only audit before applying',
      );
    }

    const scoped = currentReport.evidencePackages
      .filter((pkg) => pkg.organizationId === input.organizationId)
      .slice(0, input.batchLimit);

    const items: DriftReconciliationApplyItem[] = [];
    let applied = 0;
    let skipped = 0;
    let failed = 0;
    let rejected = 0;
    let applyEligible = 0;

    for (const pkg of scoped) {
      const base = {
        membershipId: pkg.membershipId,
        evidenceHash: pkg.evidenceHash,
        classification: pkg.classification,
      };

      if (!isAutoApplicableClassification(pkg.classification) || !pkg.applyEligible) {
        rejected += 1;
        items.push({
          ...base,
          outcome: 'rejected',
          detail: 'unsafe_or_review_required',
        });
        continue;
      }

      applyEligible += 1;

      if (!input.apply) {
        skipped += 1;
        items.push({
          ...base,
          outcome: 'skipped',
          detail: 'apply_not_requested',
        });
        continue;
      }

      const idempotencyKey = `${input.idempotencyKeyPrefix}:${pkg.membershipId}:${pkg.evidenceHash}`;
      const existing =
        await this.prisma.organizationRoleAssignmentDriftReconciliationApplication.findUnique({
          where: { idempotencyKey },
        });
      if (existing?.result) {
        skipped += 1;
        items.push({
          ...base,
          outcome: 'idempotent_replay',
          detail: 'already_applied',
        });
        continue;
      }

      const freshPackages = await this.buildEvidencePackagesForOrg(input.organizationId);
      const fresh = freshPackages.find((p) => p.membershipId === pkg.membershipId);
      if (!fresh) {
        rejected += 1;
        items.push({
          ...base,
          outcome: 'rejected',
          detail: 'membership_not_found',
        });
        continue;
      }

      const validation = validateEvidencePackageAgainstInput(pkg, fresh);
      if (!validation.valid) {
        rejected += 1;
        items.push({
          ...base,
          outcome: 'rejected',
          detail: validation.reason ?? 'stale_evidence',
        });
        continue;
      }

      try {
        const applyResult = await this.applySafeMembershipReconciliation({
          organizationId: input.organizationId,
          evidencePackage: fresh,
          operator: input.operator,
          reason: input.reason,
          expectedGitCommit: input.expectedGitCommit,
          idempotencyKey,
        });
        applied += 1;
        items.push({
          ...base,
          outcome: 'applied',
          detail: applyResult.detail,
        });
      } catch (err) {
        failed += 1;
        items.push({
          ...base,
          outcome: 'failed',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      mode: input.apply ? 'apply' : 'read-only',
      organizationId: input.organizationId,
      operator: input.operator,
      reason: input.reason,
      expectedGitCommit: input.expectedGitCommit,
      evidenceHash: input.evidenceHash,
      batchLimit: input.batchLimit,
      summary: {
        scanned: scoped.length,
        applyEligible,
        applied,
        skipped,
        failed,
        rejected,
      },
      items,
      generatedAt: new Date().toISOString(),
    };
  }

  private async applySafeMembershipReconciliation(input: {
    organizationId: string;
    evidencePackage: RoleAssignmentDriftEvidencePackage;
    operator: string;
    reason: string;
    expectedGitCommit: string;
    idempotencyKey: string;
  }): Promise<{ detail: string }> {
    const pkg = input.evidencePackage;
    const roleId = pkg.currentRole.id;
    if (!roleId) {
      throw new BadRequestException('Cannot reconcile membership without linked role');
    }

    const role = await this.prisma.organizationRole.findFirst({
      where: { id: roleId, organizationId: input.organizationId },
    });
    if (!role) throw new NotFoundException('Organization role not found');

    const membership = await this.prisma.organizationMembership.findFirst({
      where: { id: pkg.membershipId, organizationId: input.organizationId },
    });
    if (!membership) throw new NotFoundException('Membership not found');

    const latestVersion = await this.roleVersionService.getLatestApprovedVersion(
      input.organizationId,
      roleId,
    );
    if (!latestVersion) {
      throw new BadRequestException('No approved role version available for reconciliation');
    }

    const rolePermissions = normalizeMembershipPermissions(role.permissions);
    const intentIds: string[] = [];

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.organizationRoleAssignment.updateMany({
        where: { membershipId: pkg.membershipId, isCurrent: true },
        data: { isCurrent: false, endedAt: new Date() },
      });

      const assignment = await tx.organizationRoleAssignment.create({
        data: {
          organizationId: input.organizationId,
          membershipId: pkg.membershipId,
          organizationRoleId: roleId,
          assignedRoleVersionId: latestVersion.id,
          assignmentMode: OrganizationRoleAssignmentMode.FOLLOW_LATEST_APPROVED_VERSION,
          assignedByUserId: null,
          effectiveFrom: new Date(),
        },
      });

      if (pkg.derivedOverrides.length > 0) {
        for (const override of pkg.derivedOverrides) {
          await tx.membershipPermissionOverride.create({
            data: {
              organizationId: input.organizationId,
              membershipId: pkg.membershipId,
              moduleKey: override.moduleKey,
              permissionLevel: override.permissionLevel,
              effect: override.effect,
              actorUserId: null,
              reason: `${input.reason} (drift reconciliation by ${input.operator})`,
            },
          });
        }
      }

      const updatedMembership = await tx.organizationMembership.update({
        where: { id: pkg.membershipId },
        data: {
          organizationRoleId: roleId,
          role: role.membershipRole,
          roleLabel: role.name,
          permissions: rolePermissions
            ? (rolePermissions as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          stationScope: role.stationScopeDefault,
          stationIds: role.defaultStationIds ?? Prisma.JsonNull,
          fieldAgentAccess: role.fieldAgentAccessDefault,
          membershipVersion: { increment: 1 },
        },
      });

      const enqueue = await this.sessionPolicy.enqueueInTransaction(tx, {
        eventType: 'PERMISSION_REVOKED',
        userId: membership.userId,
        organizationId: input.organizationId,
        membershipId: pkg.membershipId,
        actorUserId: null,
        metadata: {
          source: 'role-assignment-drift-reconciliation',
          classification: pkg.classification,
          operator: input.operator,
        },
        mutationVersion: updatedMembership.membershipVersion,
        idempotencyKey: `${input.idempotencyKey}:session`,
      });
      intentIds.push(...enqueue.intentIds);

      await tx.organizationRoleAssignmentDriftReconciliationApplication.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          organizationId: input.organizationId,
          membershipId: pkg.membershipId,
          evidenceHash: pkg.evidenceHash,
          expectedGitCommit: input.expectedGitCommit,
          operator: input.operator,
          reason: input.reason,
          classification: pkg.classification,
          result: {
            assignmentId: assignment.id,
            membershipVersion: updatedMembership.membershipVersion,
            sessionInvalidationIntentIds: intentIds,
          },
        },
      });

      return {
        assignmentId: assignment.id,
        membershipVersion: updatedMembership.membershipVersion,
      };
    });

    await this.sessionPolicy.processIntents(intentIds);

    await this.userAudit.record({
      organizationId: input.organizationId,
      auditAction: UserAccessAuditAction.ROLE_ASSIGNMENT_DRIFT_RECONCILED,
      targetUserId: membership.userId,
      targetRoleId: roleId,
      description: `Reconciled role assignment drift (${pkg.classification}) for membership`,
      before: {
        classification: pkg.classification,
        assignmentMode: pkg.currentAssignment?.assignmentMode ?? null,
        membershipPermissions: pkg.currentMembershipPermissions,
      },
      after: {
        assignmentMode: OrganizationRoleAssignmentMode.FOLLOW_LATEST_APPROVED_VERSION,
        roleVersion: latestVersion.version,
        derivedOverrides: pkg.derivedOverrides,
        membershipVersion: result.membershipVersion,
      },
      metadata: {
        operator: input.operator,
        reason: input.reason,
        expectedGitCommit: input.expectedGitCommit,
        evidenceHash: pkg.evidenceHash,
      },
      level: 'WARN',
    });

    return { detail: `assignment=${result.assignmentId}` };
  }

  private async buildEvidencePackagesForOrg(
    organizationId: string,
  ): Promise<RoleAssignmentDriftEvidencePackage[]> {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const orgIndex = await this.prisma.organization.findMany({
      select: { id: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const orgOrdinal =
      orgIndex.findIndex((org) => org.id === organizationId) + 1;
    const organizationAlias = `ORG_${String(orgOrdinal).padStart(3, '0')}`;

    const packages: RoleAssignmentDriftEvidencePackage[] = [];
    for (let i = 0; i < memberships.length; i++) {
      const membership = memberships[i]!;
      const userAlias = `USER_${String(i + 1).padStart(3, '0')}`;
      const membershipAlias = `MEMBERSHIP_${String(i + 1).padStart(3, '0')}`;

      const assignment = await this.prisma.organizationRoleAssignment.findFirst({
        where: { membershipId: membership.id, isCurrent: true },
      });

      const roleId = membership.organizationRoleId ?? assignment?.organizationRoleId ?? null;
      const role = roleId
        ? await this.prisma.organizationRole.findFirst({
            where: { id: roleId, organizationId },
          })
        : null;

      const roleVersions = roleId
        ? (
            await this.prisma.organizationRoleVersion.findMany({
              where: { organizationRoleId: roleId, organizationId },
              orderBy: { version: 'desc' },
            })
          ).map((version) => ({
            id: version.id,
            version: version.version,
            status: version.status,
            permissions: version.permissions,
            defaultStationScope: version.defaultStationScope,
            defaultStationIds: version.defaultStationIds,
            fieldAgentAccess: version.fieldAgentAccess,
            createdAt: version.createdAt.toISOString(),
          }))
        : [];

      const latestApprovedVersion =
        roleVersions.find((v) => v.status === OrganizationRoleVersionStatus.APPROVED) ??
        null;

      const overrides = await this.prisma.membershipPermissionOverride.findMany({
        where: { membershipId: membership.id, organizationId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      const auditHistory = await this.prisma.activityLog.findMany({
        where: {
          organizationId,
          OR: [
            { entityId: membership.userId },
            { userId: membership.userId },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          action: true,
          description: true,
          createdAt: true,
          metaJson: true,
        },
      });

      const activeSessions = await this.prisma.refreshToken.count({
        where: {
          userId: membership.userId,
          organizationId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      const orgBoundSessions = await this.prisma.refreshToken.count({
        where: {
          userId: membership.userId,
          membershipId: membership.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

      packages.push(
        buildRoleAssignmentDriftEvidencePackage({
          organizationId,
          membership: {
            id: membership.id,
            organizationId: membership.organizationId,
            userId: membership.userId,
            status: membership.status,
            role: membership.role,
            organizationRoleId: membership.organizationRoleId,
            permissions: membership.permissions,
            stationScope: membership.stationScope,
            stationIds: membership.stationIds,
            fieldAgentAccess: membership.fieldAgentAccess,
            membershipVersion: membership.membershipVersion,
          },
          assignment: assignment
            ? {
                id: assignment.id,
                organizationId: assignment.organizationId,
                membershipId: assignment.membershipId,
                organizationRoleId: assignment.organizationRoleId,
                assignedRoleVersionId: assignment.assignedRoleVersionId,
                assignmentMode: assignment.assignmentMode,
                isCurrent: assignment.isCurrent,
                endedAt: assignment.endedAt?.toISOString() ?? null,
              }
            : null,
          role: role
            ? {
                id: role.id,
                organizationId: role.organizationId,
                name: role.name,
                isActive: role.isActive,
                membershipRole: role.membershipRole,
                permissions: role.permissions,
                stationScopeDefault: role.stationScopeDefault,
                defaultStationIds: role.defaultStationIds,
                fieldAgentAccessDefault: role.fieldAgentAccessDefault,
              }
            : null,
          roleVersions,
          latestApprovedVersion,
          existingOverrides: overrides.map((override) => ({
            id: override.id,
            moduleKey: override.moduleKey,
            permissionLevel: override.permissionLevel as 'read' | 'write' | 'manage',
            effect: override.effect,
            reason: override.reason,
            revokedAt: override.revokedAt?.toISOString() ?? null,
            expiresAt: override.expiresAt?.toISOString() ?? null,
          })),
          auditHistory: auditHistory.map((entry) => ({
            id: entry.id,
            action: entry.action,
            description: entry.description,
            createdAt: entry.createdAt.toISOString(),
            auditAction:
              entry.metaJson &&
              typeof entry.metaJson === 'object' &&
              !Array.isArray(entry.metaJson)
                ? ((entry.metaJson as Record<string, unknown>).auditAction as string | null)
                : null,
          })),
          sessions: {
            activeSessionCount: activeSessions,
            orgBoundSessionCount: orgBoundSessions,
          },
          membershipAlias,
          userAlias,
        }),
      );
    }

    return packages;
  }

  private async resolveOrganization(input: {
    organizationId?: string;
    organizationAlias?: string;
  }): Promise<{ id: string; alias: string }> {
    if (input.organizationId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: input.organizationId },
      });
      if (!org) throw new NotFoundException('Organization not found');
      const orgs = await this.prisma.organization.findMany({
        select: { id: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const ordinal = orgs.findIndex((o) => o.id === org.id) + 1;
      return { id: org.id, alias: `ORG_${String(ordinal).padStart(3, '0')}` };
    }

    if (input.organizationAlias) {
      const match = /^ORG_(\d+)$/.exec(input.organizationAlias);
      if (!match) {
        throw new BadRequestException('organizationAlias must look like ORG_001');
      }
      const ordinal = Number(match[1]);
      const orgs = await this.prisma.organization.findMany({
        select: { id: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      if (ordinal < 1 || ordinal > orgs.length) {
        throw new BadRequestException('organizationAlias out of range');
      }
      const org = orgs[ordinal - 1]!;
      return { id: org.id, alias: input.organizationAlias };
    }

    throw new BadRequestException('organizationId or organizationAlias is required');
  }
}
