import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipStatus,
  MembershipRole,
  OrganizationRoleAssignmentMode,
  OrganizationRoleVersionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { IamSessionPolicyService } from '@modules/auth/iam-session-policy.service';
import type { IamSessionInvalidationTrigger } from './policies/iam-session-invalidation.policy';
import { listEffectiveOrgAdmins } from './org-admin-protection.util';
import { OrganizationRoleVersionService } from './organization-role-version.service';
import {
  buildRoleChangeImpactPreview,
  computeStationScopeImpact,
  diffPermissionGrants,
  diffPrivilegedCapabilities,
  hasStructuralRoleChanges,
  membershipHasEffectiveAdminPrivileges,
  parseStationIds,
  resolveMembershipSessionTriggers,
  type RoleChangeImpactPreview,
} from './policies/role-change-impact.policy';
import { UserAccessAuditService, UserAccessAuditAction } from './user-access-audit.service';
import type { UpdateOrganizationRoleDto } from './dto/organization-role.dto';

export type ApplyRoleChangeInput = {
  previewHash: string;
  expectedRoleVersion: number;
  reason: string;
  idempotencyKey: string;
  stepUpConfirmed?: boolean;
  changes: UpdateOrganizationRoleDto;
};

export type ApplyRoleChangeResult = {
  roleId: string;
  newVersionId: string;
  newVersionNumber: number;
  previewHash: string;
  followLatestUpdatedCount: number;
  pinnedUnchangedCount: number;
  pinnedMemberships: Array<{
    membershipId: string;
    assignmentMode: string;
    pinnedVersionId: string | null;
    pinnedVersionNumber: number | null;
    remainsOnPinnedVersion: boolean;
  }>;
  sessionInvalidationIntentIds: string[];
};

@Injectable()
export class OrganizationRoleChangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleVersionService: OrganizationRoleVersionService,
    private readonly sessionPolicy: IamSessionPolicyService,
    private readonly userAudit: UserAccessAuditService,
  ) {}

  async previewRoleChange(
    orgId: string,
    roleId: string,
    changes: UpdateOrganizationRoleDto,
    _actorUserId?: string,
  ): Promise<RoleChangeImpactPreview> {
    if (!hasStructuralRoleChanges(changes)) {
      throw new BadRequestException(
        'No structural role changes to preview — use metadata-only update for name/description',
      );
    }

    const role = await this.findRoleOrThrow(orgId, roleId);
    this.roleVersionService.assertSystemRoleSafe(role, 'permissions');

    const currentVersion = await this.getCurrentApprovedVersion(orgId, roleId);
    const currentVersionNumber = currentVersion?.version ?? 0;

    const proposedRole = this.mergeProposedRole(role, changes);
    const proposedPermissions = normalizeMembershipPermissions(proposedRole.permissions);

    const assignments = await this.prisma.organizationRoleAssignment.findMany({
      where: {
        organizationId: orgId,
        organizationRoleId: roleId,
        isCurrent: true,
        membership: { status: MembershipStatus.ACTIVE },
      },
      include: {
        membership: {
          select: {
            id: true,
            userId: true,
            role: true,
            permissions: true,
            stationIds: true,
            stationScope: true,
          },
        },
        assignedRoleVersion: {
          select: { id: true, version: true },
        },
      },
    });

    const orgEffectiveAdminsBefore = await listEffectiveOrgAdmins(this.prisma, orgId);

    const membershipImpacts = assignments.map((assignment) => {
      const membership = assignment.membership;
      const followsLatest =
        assignment.assignmentMode ===
          OrganizationRoleAssignmentMode.FOLLOW_LATEST_APPROVED_VERSION ||
        assignment.assignmentMode ===
          OrganizationRoleAssignmentMode.MIGRATION_LEGACY_SNAPSHOT;
      const willReceiveUpdate = followsLatest;

      const permissionsBefore =
        normalizeMembershipPermissions(membership.permissions) ??
        normalizeMembershipPermissions(role.permissions);
      const permissionsAfter = willReceiveUpdate ? proposedPermissions : permissionsBefore;

      const { gained, lost } = diffPermissionGrants(permissionsBefore, permissionsAfter);
      const priv = diffPrivilegedCapabilities(
        permissionsBefore,
        permissionsAfter,
        membership.role,
        proposedRole.membershipRole,
      );

      const stationScopeImpact = willReceiveUpdate
        ? computeStationScopeImpact(
            membership.id,
            membership.stationIds ?? role.defaultStationIds,
            proposedRole.defaultStationIds,
          )
        : null;

      const sessionInvalidationTriggers = resolveMembershipSessionTriggers({
        membershipRoleBefore: membership.role,
        membershipRoleAfter: proposedRole.membershipRole,
        permissionsBefore,
        permissionsAfter,
        stationReduced: stationScopeImpact?.reduced ?? false,
        willReceiveUpdate,
      });

      return {
        membershipId: membership.id,
        userId: membership.userId,
        assignmentMode: assignment.assignmentMode,
        assignmentId: assignment.id,
        followsLatest,
        pinnedVersionId: assignment.assignedRoleVersionId,
        pinnedVersionNumber: assignment.assignedRoleVersion?.version ?? null,
        willReceiveUpdate,
        sessionInvalidationTriggers,
        gainedPermissions: gained,
        lostPermissions: lost,
        gainedPrivilegedCapabilities: priv.gained,
        lostPrivilegedCapabilities: priv.lost,
        stationScopeImpact,
        effectiveAdminBefore: membershipHasEffectiveAdminPrivileges({
          membershipRole: membership.role,
          permissions: permissionsBefore,
        }),
        effectiveAdminAfter: membershipHasEffectiveAdminPrivileges({
          membershipRole: proposedRole.membershipRole,
          permissions: permissionsAfter,
        }),
      };
    });

    const userIds = [...new Set(membershipImpacts.map((m) => m.userId))];
    const affectedSessionsCount =
      userIds.length === 0
        ? 0
        : await this.prisma.refreshToken.count({
            where: {
              organizationId: orgId,
              userId: { in: userIds },
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
          });

    const preview = buildRoleChangeImpactPreview({
      organizationRoleId: roleId,
      currentVersionNumber,
      proposedChanges: changes as Record<string, unknown>,
      memberships: membershipImpacts,
      orgEffectiveAdminsBefore,
      affectedSessionsCount,
      proposedPermissions: proposedPermissions,
    });

    void this.userAudit.record({
      organizationId: orgId,
      actorUserId: _actorUserId,
      auditAction: UserAccessAuditAction.ROLE_CHANGE_PREVIEWED,
      targetRoleId: roleId,
      description: `Role change preview for „${role.name}" v${preview.proposedVersionNumber}`,
      metadata: {
        previewHash: preview.previewHash,
        affectedMembershipCount: preview.affectedMembershipCount,
        stepUpRequired: preview.stepUp.required,
      },
    });

    return preview;
  }

  async applyRoleChange(
    orgId: string,
    roleId: string,
    input: ApplyRoleChangeInput,
    actorUserId?: string,
  ): Promise<ApplyRoleChangeResult> {
    const existing = await this.prisma.organizationRoleChangeApplication.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing?.result) {
      return existing.result as ApplyRoleChangeResult;
    }

    const preview = await this.previewRoleChange(orgId, roleId, input.changes, actorUserId);

    if (preview.previewHash !== input.previewHash) {
      throw new ConflictException('Preview hash mismatch — regenerate preview before applying');
    }
    if (preview.currentVersionNumber !== input.expectedRoleVersion) {
      throw new ConflictException(
        'Role version changed concurrently — regenerate preview before applying',
      );
    }
    if (preview.lastAdminRisk.atRisk) {
      throw new BadRequestException(
        'Cannot apply role change that would remove the last effective organization admin',
      );
    }
    if (preview.stepUp.required && !input.stepUpConfirmed) {
      throw new BadRequestException({
        message: 'Step-up confirmation required before applying this role change',
        stepUp: preview.stepUp,
      });
    }

    const role = await this.findRoleOrThrow(orgId, roleId);
    const proposedRole = this.mergeProposedRole(role, input.changes);
    const permissions = normalizeMembershipPermissions(proposedRole.permissions);

    const intentIds: string[] = [];
    const result = await this.prisma.$transaction(async (tx) => {
      const versions = await tx.organizationRoleVersion.findMany({
        where: { organizationRoleId: roleId },
        select: { version: true },
        orderBy: { version: 'desc' },
      });
      const latest = versions[0]?.version ?? 0;
      if (latest !== input.expectedRoleVersion) {
        throw new ConflictException('Concurrent role version change detected');
      }

      await tx.organizationRoleVersion.updateMany({
        where: {
          organizationRoleId: roleId,
          status: OrganizationRoleVersionStatus.APPROVED,
        },
        data: { status: OrganizationRoleVersionStatus.SUPERSEDED },
      });

      const newVersion = await tx.organizationRoleVersion.create({
        data: {
          organizationRoleId: roleId,
          organizationId: orgId,
          version: latest + 1,
          nameSnapshot: proposedRole.name,
          descriptionSnapshot: proposedRole.description,
          permissions: permissions
            ? (permissions as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          defaultStationScope: proposedRole.stationScopeDefault,
          defaultStationIds: proposedRole.defaultStationIds ?? Prisma.JsonNull,
          fieldAgentAccess: proposedRole.fieldAgentAccessDefault,
          riskClassification: role.isSystemTemplate ? 'PRIVILEGED' : 'STANDARD',
          createdByUserId: actorUserId ?? null,
          changeReason: input.reason,
          status: OrganizationRoleVersionStatus.APPROVED,
        },
      });

      await tx.organizationRole.update({
        where: { id: roleId },
        data: {
          name: proposedRole.name,
          description: proposedRole.description,
          membershipRole: proposedRole.membershipRole,
          permissions: permissions
            ? (permissions as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          stationScopeDefault: proposedRole.stationScopeDefault,
          defaultStationIds: proposedRole.defaultStationIds ?? Prisma.JsonNull,
          fieldAgentAccessDefault: proposedRole.fieldAgentAccessDefault,
        },
      });

      const followLatestMemberships = preview.memberships.filter((m) => m.willReceiveUpdate);
      for (const impact of followLatestMemberships) {
        const updated = await tx.organizationMembership.update({
          where: { id: impact.membershipId },
          data: {
            role: proposedRole.membershipRole,
            roleLabel: proposedRole.name,
            permissions: permissions
              ? (permissions as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            stationScope: proposedRole.stationScopeDefault,
            stationIds: proposedRole.defaultStationIds ?? Prisma.JsonNull,
            fieldAgentAccess: proposedRole.fieldAgentAccessDefault,
            membershipVersion: { increment: 1 },
          },
          select: { id: true, userId: true, membershipVersion: true },
        });

        for (const eventType of impact.sessionInvalidationTriggers) {
          const { intentIds: created } = await this.sessionPolicy.enqueueInTransaction(tx, {
            eventType: eventType as IamSessionInvalidationTrigger,
            userId: updated.userId,
            organizationId: orgId,
            membershipId: updated.id,
            actorUserId,
            mutationVersion: updated.membershipVersion,
            idempotencyKey: `${input.idempotencyKey}:${updated.id}:${eventType}`,
            metadata: {
              roleId,
              roleVersionId: newVersion.id,
              roleVersionNumber: newVersion.version,
              reason: input.reason,
            },
          });
          intentIds.push(...created);
        }
      }

      const applyResult = {
        roleId,
        newVersionId: newVersion.id,
        newVersionNumber: newVersion.version,
        previewHash: preview.previewHash,
        followLatestUpdatedCount: followLatestMemberships.length,
        pinnedUnchangedCount: preview.pinnedCount,
        pinnedMemberships: preview.memberships
          .filter((m) => !m.willReceiveUpdate)
          .map((m) => ({
            membershipId: m.membershipId,
            assignmentMode: m.assignmentMode,
            pinnedVersionId: m.pinnedVersionId,
            pinnedVersionNumber: m.pinnedVersionNumber,
            remainsOnPinnedVersion: true,
          })),
        sessionInvalidationIntentIds: intentIds,
      };

      await tx.organizationRoleChangeApplication.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          organizationId: orgId,
          organizationRoleId: roleId,
          previewHash: input.previewHash,
          expectedVersionNumber: input.expectedRoleVersion,
          actorUserId: actorUserId ?? null,
          reason: input.reason,
          createdRoleVersionId: newVersion.id,
          result: applyResult as unknown as Prisma.InputJsonValue,
        },
      });

      return applyResult;
    });

    if (intentIds.length > 0) {
      await this.sessionPolicy.processIntents(intentIds);
    }

    void this.userAudit.record({
      organizationId: orgId,
      actorUserId,
      auditAction: UserAccessAuditAction.ROLE_CHANGE_APPLIED,
      targetRoleId: roleId,
      description: `Role change applied — new version ${result.newVersionNumber}`,
      metadata: {
        previewHash: input.previewHash,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
        followLatestUpdatedCount: result.followLatestUpdatedCount,
        pinnedUnchangedCount: result.pinnedUnchangedCount,
      },
      level: 'WARN',
    });

    return result;
  }

  private mergeProposedRole(
    role: {
      name: string;
      description: string | null;
      membershipRole: MembershipRole;
      permissions: unknown;
      stationScopeDefault: string | null;
      defaultStationIds: unknown;
      fieldAgentAccessDefault: boolean;
    },
    changes: UpdateOrganizationRoleDto,
  ) {
    const permissions =
      changes.permissions !== undefined
        ? normalizeMembershipPermissions(changes.permissions)
        : normalizeMembershipPermissions(role.permissions);

    return {
      name: changes.name?.trim() ?? role.name,
      description:
        changes.description !== undefined
          ? changes.description?.trim() || null
          : role.description,
      membershipRole: (changes.membershipRole ?? role.membershipRole) as MembershipRole,
      permissions,
      stationScopeDefault:
        changes.stationScopeDefault !== undefined
          ? changes.stationScopeDefault?.trim() || null
          : role.stationScopeDefault,
      defaultStationIds:
        changes.defaultStationIds !== undefined
          ? changes.defaultStationIds
          : parseStationIds(role.defaultStationIds),
      fieldAgentAccessDefault:
        changes.fieldAgentAccessDefault ?? role.fieldAgentAccessDefault,
    };
  }

  private async getCurrentApprovedVersion(orgId: string, roleId: string) {
    return this.prisma.organizationRoleVersion.findFirst({
      where: {
        organizationRoleId: roleId,
        organizationId: orgId,
        status: OrganizationRoleVersionStatus.APPROVED,
      },
      orderBy: { version: 'desc' },
    });
  }

  private async findRoleOrThrow(orgId: string, roleId: string) {
    const role = await this.prisma.organizationRole.findFirst({
      where: { id: roleId, organizationId: orgId, isActive: true },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }
}
