import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipRole,
  OrganizationRoleAssignmentMode,
  OrganizationRoleVersionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';
import {
  assertSameOrganization,
  assertSystemRoleMutationAllowed,
  buildVersionSnapshotFromRole,
  inferRiskClassification,
  nextRoleVersionNumber,
  resolveEffectiveRoleVersion,
  shouldCreateNewVersionOnUpdate,
  type RoleAssignmentRecord,
  type RoleVersionSnapshot,
} from './policies/organization-role-version.policy';

export type CreateRoleVersionInput = {
  changeReason?: string;
  status?: OrganizationRoleVersionStatus;
};

export type AssignRoleVersionInput = {
  assignmentMode?: OrganizationRoleAssignmentMode;
  pinnedRoleVersionId?: string;
  effectiveFrom?: Date;
};

export type CreatePermissionOverrideInput = {
  moduleKey: string;
  permissionLevel: PermissionLevel;
  effect: 'ALLOW' | 'DENY';
  reason?: string;
  expiresAt?: Date;
};

@Injectable()
export class OrganizationRoleVersionService {
  constructor(private readonly prisma: PrismaService) {}

  async createInitialVersionForRole(
    role: {
      id: string;
      organizationId: string;
      name: string;
      description: string | null;
      isSystemTemplate: boolean;
      membershipRole: MembershipRole;
      permissions: unknown;
      stationScopeDefault: string | null;
      defaultStationIds: unknown;
      fieldAgentAccessDefault: boolean;
      createdByUserId: string | null;
    },
    actorUserId?: string,
    changeReason = 'Initial approved version',
  ) {
    return this.prisma.organizationRoleVersion.create({
      data: {
        organizationRoleId: role.id,
        organizationId: role.organizationId,
        version: 1,
        nameSnapshot: role.name,
        descriptionSnapshot: role.description,
        permissions: role.permissions ?? Prisma.JsonNull,
        defaultStationScope: role.stationScopeDefault,
        defaultStationIds: role.defaultStationIds ?? Prisma.JsonNull,
        fieldAgentAccess: role.fieldAgentAccessDefault,
        riskClassification: inferRiskClassification(role) as never,
        createdByUserId: actorUserId ?? role.createdByUserId,
        changeReason,
        status: OrganizationRoleVersionStatus.APPROVED,
      },
    });
  }

  async createApprovedVersion(
    orgId: string,
    roleId: string,
    actorUserId?: string,
    input: CreateRoleVersionInput = {},
  ) {
    const role = await this.findRoleOrThrow(orgId, roleId);
    const existing = await this.prisma.organizationRoleVersion.findMany({
      where: { organizationRoleId: roleId },
      select: { version: true, status: true },
      orderBy: { version: 'desc' },
    });

    const versionNumber = nextRoleVersionNumber(existing);
    const snapshot = buildVersionSnapshotFromRole(role, versionNumber, {
      changeReason: input.changeReason,
      status: input.status ?? 'APPROVED',
    });

    return this.prisma.$transaction(async (tx) => {
      if (versionNumber > 1) {
        await tx.organizationRoleVersion.updateMany({
          where: {
            organizationRoleId: roleId,
            status: OrganizationRoleVersionStatus.APPROVED,
          },
          data: { status: OrganizationRoleVersionStatus.SUPERSEDED },
        });
      }

      return tx.organizationRoleVersion.create({
        data: {
          organizationRoleId: role.id,
          organizationId: role.organizationId,
          version: snapshot.version,
          nameSnapshot: snapshot.nameSnapshot,
          descriptionSnapshot: snapshot.descriptionSnapshot,
          permissions: snapshot.permissions
            ? (snapshot.permissions as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          defaultStationScope: snapshot.defaultStationScope,
          defaultStationIds: snapshot.defaultStationIds
            ? (snapshot.defaultStationIds as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          fieldAgentAccess: snapshot.fieldAgentAccess,
          riskClassification: snapshot.riskClassification as never,
          createdByUserId: actorUserId ?? null,
          changeReason: snapshot.changeReason,
          status: input.status ?? OrganizationRoleVersionStatus.APPROVED,
        },
      });
    });
  }

  async listVersions(orgId: string, roleId: string) {
    await this.findRoleOrThrow(orgId, roleId);
    const versions = await this.prisma.organizationRoleVersion.findMany({
      where: { organizationRoleId: roleId, organizationId: orgId },
      orderBy: { version: 'desc' },
    });
    return versions.map((v) => this.mapVersion(v));
  }

  async getLatestApprovedVersion(
    orgId: string,
    roleId: string,
  ): Promise<RoleVersionSnapshot | null> {
    const version = await this.prisma.organizationRoleVersion.findFirst({
      where: {
        organizationRoleId: roleId,
        organizationId: orgId,
        status: OrganizationRoleVersionStatus.APPROVED,
      },
      orderBy: { version: 'desc' },
    });
    return version ? this.mapVersion(version) : null;
  }

  async assignRoleToMembership(
    orgId: string,
    membershipId: string,
    roleId: string,
    actorUserId?: string,
    input: AssignRoleVersionInput = {},
  ) {
    const role = await this.findRoleOrThrow(orgId, roleId);
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { id: membershipId, organizationId: orgId },
    });
    if (!membership) throw new NotFoundException('Membership not found');
    assertSameOrganization(orgId, membership.organizationId, 'role assignment');

    const assignmentMode =
      input.assignmentMode ?? OrganizationRoleAssignmentMode.FOLLOW_LATEST_APPROVED_VERSION;

    let assignedRoleVersionId: string | null = input.pinnedRoleVersionId ?? null;

    if (assignmentMode === OrganizationRoleAssignmentMode.PINNED_VERSION) {
      if (!assignedRoleVersionId) {
        throw new BadRequestException('pinnedRoleVersionId is required for PINNED_VERSION');
      }
      const pinned = await this.prisma.organizationRoleVersion.findFirst({
        where: {
          id: assignedRoleVersionId,
          organizationRoleId: roleId,
          organizationId: orgId,
        },
      });
      if (!pinned) throw new NotFoundException('Pinned role version not found');
      if (pinned.status === OrganizationRoleVersionStatus.RETIRED) {
        throw new BadRequestException('Cannot assign a retired role version');
      }
    } else if (assignmentMode === OrganizationRoleAssignmentMode.FOLLOW_LATEST_APPROVED_VERSION) {
      const latest = await this.getLatestApprovedVersion(orgId, roleId);
      assignedRoleVersionId = latest?.id ?? null;
    }

    const permissions = normalizeMembershipPermissions(role.permissions);

    return this.prisma.$transaction(async (tx) => {
      await tx.organizationRoleAssignment.updateMany({
        where: { membershipId, isCurrent: true },
        data: { isCurrent: false, endedAt: new Date() },
      });

      const assignment = await tx.organizationRoleAssignment.create({
        data: {
          organizationId: orgId,
          membershipId,
          organizationRoleId: roleId,
          assignedRoleVersionId,
          assignmentMode,
          assignedByUserId: actorUserId ?? null,
          effectiveFrom: input.effectiveFrom ?? new Date(),
        },
      });

      const updatedMembership = await tx.organizationMembership.update({
        where: { id: membershipId },
        data: {
          organizationRoleId: role.id,
          role: role.membershipRole,
          roleLabel: role.name,
          permissions: permissions
            ? (permissions as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          fieldAgentAccess: role.fieldAgentAccessDefault,
          stationScope: role.stationScopeDefault,
          stationIds: role.defaultStationIds ?? Prisma.JsonNull,
          membershipVersion: { increment: 1 },
        },
      });

      return { assignment, membership: updatedMembership };
    });
  }

  async createPermissionOverride(
    orgId: string,
    membershipId: string,
    actorUserId: string | undefined,
    input: CreatePermissionOverrideInput,
  ) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { id: membershipId, organizationId: orgId },
    });
    if (!membership) throw new NotFoundException('Membership not found');

    return this.prisma.membershipPermissionOverride.create({
      data: {
        organizationId: orgId,
        membershipId,
        moduleKey: input.moduleKey,
        permissionLevel: input.permissionLevel,
        effect: input.effect,
        actorUserId: actorUserId ?? null,
        reason: input.reason?.trim() || null,
        expiresAt: input.expiresAt ?? null,
      },
    });
  }

  async listAssignmentHistory(orgId: string, membershipId: string) {
    const assignments = await this.prisma.organizationRoleAssignment.findMany({
      where: { organizationId: orgId, membershipId },
      orderBy: { assignedAt: 'desc' },
    });
    return assignments.map((a) => this.mapAssignment(a));
  }

  async resolveMembershipEffectiveVersion(
    orgId: string,
    membershipId: string,
  ): Promise<RoleVersionSnapshot | null> {
    const assignment = await this.prisma.organizationRoleAssignment.findFirst({
      where: { organizationId: orgId, membershipId, isCurrent: true },
    });
    if (!assignment) return null;

    const assignmentRecord = this.mapAssignment(assignment);
    let latestApproved: RoleVersionSnapshot | null = null;
    let pinned: RoleVersionSnapshot | null = null;

    if (assignment.organizationRoleId) {
      latestApproved = await this.getLatestApprovedVersion(
        orgId,
        assignment.organizationRoleId,
      );
    }

    if (assignment.assignedRoleVersionId) {
      const version = await this.prisma.organizationRoleVersion.findFirst({
        where: {
          id: assignment.assignedRoleVersionId,
          organizationId: orgId,
        },
      });
      pinned = version ? this.mapVersion(version) : null;
    }

    return resolveEffectiveRoleVersion({
      assignment: assignmentRecord,
      latestApprovedVersion: latestApproved,
      pinnedVersion: pinned,
    });
  }

  async maybeCreateVersionOnRoleUpdate(
    orgId: string,
    roleId: string,
    role: {
      id: string;
      organizationId: string;
      name: string;
      description: string | null;
      isSystemTemplate: boolean;
      membershipRole: MembershipRole;
      permissions: unknown;
      stationScopeDefault: string | null;
      defaultStationIds: unknown;
      fieldAgentAccessDefault: boolean;
    },
    changes: {
      permissions?: unknown;
      membershipRole?: MembershipRole;
      stationScopeDefault?: string | null;
      defaultStationIds?: unknown;
      fieldAgentAccessDefault?: boolean;
    },
    actorUserId?: string,
  ) {
    if (!shouldCreateNewVersionOnUpdate(role, changes)) return null;
    return this.createApprovedVersion(orgId, roleId, actorUserId, {
      changeReason: 'Role template updated — new approved version',
    });
  }

  assertSystemRoleSafe(
    role: { isSystemTemplate: boolean },
    action: 'delete' | 'permissions' | 'rename' | 'membershipRole',
  ): void {
    try {
      assertSystemRoleMutationAllowed(role, action);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  assertTenantScope(orgId: string, entityOrgId: string, context: string): void {
    try {
      assertSameOrganization(orgId, entityOrgId, context);
    } catch {
      throw new ForbiddenException('Cross-tenant role operation denied');
    }
  }

  private async findRoleOrThrow(orgId: string, roleId: string) {
    const role = await this.prisma.organizationRole.findFirst({
      where: { id: roleId, organizationId: orgId, isActive: true },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  private mapVersion(version: {
    id: string;
    organizationRoleId: string;
    organizationId: string;
    version: number;
    nameSnapshot: string;
    descriptionSnapshot: string | null;
    permissions: unknown;
    defaultStationScope: string | null;
    defaultStationIds: unknown;
    fieldAgentAccess: boolean;
    riskClassification: string;
    status: string;
    changeReason: string | null;
    createdAt: Date;
  }): RoleVersionSnapshot {
    return {
      id: version.id,
      organizationRoleId: version.organizationRoleId,
      organizationId: version.organizationId,
      version: version.version,
      nameSnapshot: version.nameSnapshot,
      descriptionSnapshot: version.descriptionSnapshot,
      permissions: version.permissions,
      defaultStationScope: version.defaultStationScope,
      defaultStationIds: version.defaultStationIds,
      fieldAgentAccess: version.fieldAgentAccess,
      riskClassification: version.riskClassification,
      status: version.status as RoleVersionSnapshot['status'],
      changeReason: version.changeReason,
      createdAt: version.createdAt.toISOString(),
    };
  }

  private mapAssignment(assignment: {
    id: string;
    organizationId: string;
    membershipId: string;
    organizationRoleId: string | null;
    assignedRoleVersionId: string | null;
    assignmentMode: OrganizationRoleAssignmentMode;
    assignedByUserId: string | null;
    assignedAt: Date;
    effectiveFrom: Date;
    endedAt: Date | null;
    isCurrent: boolean;
  }): RoleAssignmentRecord {
    return {
      id: assignment.id,
      organizationId: assignment.organizationId,
      membershipId: assignment.membershipId,
      organizationRoleId: assignment.organizationRoleId,
      assignedRoleVersionId: assignment.assignedRoleVersionId,
      assignmentMode: assignment.assignmentMode,
      assignedByUserId: assignment.assignedByUserId,
      assignedAt: assignment.assignedAt.toISOString(),
      effectiveFrom: assignment.effectiveFrom.toISOString(),
      endedAt: assignment.endedAt?.toISOString() ?? null,
      isCurrent: assignment.isCurrent,
    };
  }
}
