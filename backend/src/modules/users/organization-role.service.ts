import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipRole,
  MembershipStatus,
  OrganizationRole,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { assertNotLastActiveOrgAdmin } from './org-admin-protection.util';
import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from './defaults/organization-role.defaults';
import { UserAccessAuditAction } from './user-access-audit.service';
import { IamAuditService } from './iam-audit.service';
import type { CreateOrganizationRoleDto, UpdateOrganizationRoleDto } from './dto/organization-role.dto';

const INVITE_EXPIRY_DAYS = 7;

@Injectable()
export class OrganizationRoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly iamAudit: IamAuditService,
  ) {}

  async ensureDefaultRoles(orgId: string, createdByUserId?: string): Promise<void> {
    const count = await this.prisma.organizationRole.count({
      where: { organizationId: orgId, isSystemTemplate: true },
    });
    if (count >= DEFAULT_ORGANIZATION_ROLE_TEMPLATES.length) return;

    for (const template of DEFAULT_ORGANIZATION_ROLE_TEMPLATES) {
      await this.prisma.organizationRole.upsert({
        where: {
          organizationId_systemKey: {
            organizationId: orgId,
            systemKey: template.systemKey,
          },
        },
        create: {
          organizationId: orgId,
          name: template.name,
          description: template.description,
          systemKey: template.systemKey,
          isSystemTemplate: true,
          isDefault: template.isDefault ?? false,
          isActive: true,
          membershipRole: template.membershipRole,
          permissions: template.permissions as unknown as Prisma.InputJsonValue,
          fieldAgentAccessDefault: template.fieldAgentAccessDefault ?? false,
          createdByUserId: createdByUserId ?? null,
        },
        update: {},
      });
    }
  }

  async listRoles(orgId: string) {
    await this.ensureDefaultRoles(orgId);
    const roles = await this.prisma.organizationRole.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: [{ isSystemTemplate: 'desc' }, { name: 'asc' }],
    });
    return roles.map((r) => this.mapRole(r));
  }

  async getRole(orgId: string, roleId: string) {
    const role = await this.findRoleOrThrow(orgId, roleId);
    return this.mapRole(role);
  }

  async createRole(
    orgId: string,
    dto: CreateOrganizationRoleDto,
    actorUserId?: string,
  ) {
    const permissions = normalizeMembershipPermissions(dto.permissions);
    const outboxIds: string[] = [];
    const role = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organizationRole.create({
        data: {
          organizationId: orgId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          systemKey: null,
          isSystemTemplate: false,
          isDefault: false,
          isActive: true,
          membershipRole: dto.membershipRole as MembershipRole,
          permissions: permissions
            ? (permissions as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          stationScopeDefault: dto.stationScopeDefault?.trim() || null,
          defaultStationIds: dto.defaultStationIds?.length
            ? dto.defaultStationIds
            : Prisma.JsonNull,
          fieldAgentAccessDefault: dto.fieldAgentAccessDefault ?? false,
          createdByUserId: actorUserId ?? null,
        },
      });

      const outbox = await this.iamAudit.enqueueInTransaction(tx, {
        organizationId: orgId,
        idempotencyKey: `role-created:${orgId}:${created.id}`,
        eventType: UserAccessAuditAction.ROLE_CREATED,
        actorUserId,
        targetRoleId: created.id,
        description: `Rolle „${created.name}" erstellt`,
        after: this.mapRole(created),
      });
      outboxIds.push(outbox.id);
      return created;
    });

    await this.iamAudit.processOutboxIds(outboxIds);
    return this.mapRole(role);
  }

  async updateRole(
    orgId: string,
    roleId: string,
    dto: UpdateOrganizationRoleDto,
    actorUserId?: string,
  ) {
    const before = await this.findRoleOrThrow(orgId, roleId);
    if (before.isSystemTemplate && dto.name && dto.name !== before.name) {
      throw new BadRequestException('System role templates cannot be renamed');
    }
    if (
      before.isSystemTemplate &&
      (dto.permissions !== undefined ||
        dto.membershipRole !== undefined ||
        dto.fieldAgentAccessDefault !== undefined ||
        dto.stationScopeDefault !== undefined ||
        dto.defaultStationIds !== undefined)
    ) {
      throw new BadRequestException(
        'Systemvorlagen können nur in Name und Beschreibung bearbeitet werden',
      );
    }

    const permissions =
      dto.permissions !== undefined
        ? normalizeMembershipPermissions(dto.permissions)
        : undefined;

    const outboxIds: string[] = [];
    const role = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.organizationRole.update({
        where: { id: roleId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
          ...(dto.membershipRole !== undefined
            ? { membershipRole: dto.membershipRole as MembershipRole }
            : {}),
          ...(permissions !== undefined
            ? {
                permissions: permissions
                  ? (permissions as unknown as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
              }
            : {}),
          ...(dto.stationScopeDefault !== undefined
            ? { stationScopeDefault: dto.stationScopeDefault?.trim() || null }
            : {}),
          ...(dto.defaultStationIds !== undefined
            ? {
                defaultStationIds: dto.defaultStationIds?.length
                  ? dto.defaultStationIds
                  : Prisma.JsonNull,
              }
            : {}),
          ...(dto.fieldAgentAccessDefault !== undefined
            ? { fieldAgentAccessDefault: dto.fieldAgentAccessDefault }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      const outbox = await this.iamAudit.enqueueInTransaction(tx, {
        organizationId: orgId,
        idempotencyKey: `role-updated:${orgId}:${roleId}:${updated.updatedAt.toISOString()}`,
        eventType: UserAccessAuditAction.ROLE_UPDATED,
        actorUserId,
        targetRoleId: updated.id,
        description: `Rolle „${updated.name}" aktualisiert`,
        before: this.mapRole(before),
        after: this.mapRole(updated),
      });
      outboxIds.push(outbox.id);
      return updated;
    });

    await this.iamAudit.processOutboxIds(outboxIds);
    return this.mapRole(role);
  }

  async duplicateRole(orgId: string, roleId: string, actorUserId?: string) {
    const source = await this.findRoleOrThrow(orgId, roleId);
    return this.createRole(
      orgId,
      {
        name: `${source.name} (Kopie)`,
        description: source.description ?? undefined,
        membershipRole: source.membershipRole,
        permissions: source.permissions as Record<string, { read: boolean; write: boolean; manage?: boolean }> | undefined,
        stationScopeDefault: source.stationScopeDefault ?? undefined,
        defaultStationIds: Array.isArray(source.defaultStationIds)
          ? (source.defaultStationIds as string[])
          : undefined,
        fieldAgentAccessDefault: source.fieldAgentAccessDefault,
      },
      actorUserId,
    );
  }

  async deleteRole(orgId: string, roleId: string, actorUserId?: string) {
    const role = await this.findRoleOrThrow(orgId, roleId);
    if (role.isSystemTemplate) {
      throw new BadRequestException('System role templates cannot be deleted');
    }

    const inUse = await this.prisma.organizationMembership.count({
      where: { organizationId: orgId, organizationRoleId: roleId },
    });
    if (inUse > 0) {
      throw new BadRequestException(
        'Role is assigned to users and cannot be deleted',
      );
    }

    const outboxIds: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      await tx.organizationRole.update({
        where: { id: roleId },
        data: { isActive: false },
      });

      const outbox = await this.iamAudit.enqueueInTransaction(tx, {
        organizationId: orgId,
        idempotencyKey: `role-deleted:${orgId}:${roleId}`,
        eventType: UserAccessAuditAction.ROLE_DELETED,
        actorUserId,
        targetRoleId: roleId,
        description: `Rolle „${role.name}" deaktiviert`,
        before: this.mapRole(role),
      });
      outboxIds.push(outbox.id);
    });

    await this.iamAudit.processOutboxIds(outboxIds);
    return { deleted: true };
  }

  async permissionPreview(orgId: string, roleId: string) {
    const role = await this.findRoleOrThrow(orgId, roleId);
    return {
      roleId: role.id,
      name: role.name,
      membershipRole: role.membershipRole,
      permissions: normalizeMembershipPermissions(role.permissions),
      fieldAgentAccessDefault: role.fieldAgentAccessDefault,
      stationScopeDefault: role.stationScopeDefault,
      defaultStationIds: Array.isArray(role.defaultStationIds)
        ? role.defaultStationIds
        : [],
    };
  }

  async assignRoleToUser(
    orgId: string,
    userId: string,
    roleId: string,
    actorUserId?: string,
  ) {
    const role = await this.findRoleOrThrow(orgId, roleId);
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId: orgId, userId },
    });
    if (!membership) {
      throw new NotFoundException('User not found in organization');
    }

    if (
      membership.role === MembershipRole.ORG_ADMIN &&
      role.membershipRole !== MembershipRole.ORG_ADMIN &&
      membership.status === MembershipStatus.ACTIVE
    ) {
      await assertNotLastActiveOrgAdmin(this.prisma, orgId, userId);
    }

    const permissions = normalizeMembershipPermissions(role.permissions);
    const outboxIds: string[] = [];
    const updated = await this.prisma.$transaction(async (tx) => {
      const membershipUpdated = await tx.organizationMembership.update({
        where: { id: membership.id },
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
        },
      });

      const outbox = await this.iamAudit.enqueueInTransaction(tx, {
        organizationId: orgId,
        idempotencyKey: `role-assigned:${orgId}:${userId}:${role.id}`,
        eventType: UserAccessAuditAction.ROLE_ASSIGNED,
        actorUserId,
        subjectUserId: userId,
        membershipId: membership.id,
        targetRoleId: role.id,
        description: `Rolle „${role.name}" zugewiesen`,
        before: { organizationRoleId: membership.organizationRoleId },
        after: { organizationRoleId: membershipUpdated.organizationRoleId },
      });
      outboxIds.push(outbox.id);
      return membershipUpdated;
    });

    await this.iamAudit.processOutboxIds(outboxIds);
    return updated;
  }

  async resolveRoleForInvite(
    orgId: string,
    organizationRoleId?: string,
  ): Promise<OrganizationRole | null> {
    if (!organizationRoleId) return null;
    return this.findRoleOrThrow(orgId, organizationRoleId);
  }

  get inviteExpiryDays(): number {
    return INVITE_EXPIRY_DAYS;
  }

  private async findRoleOrThrow(orgId: string, roleId: string) {
    const role = await this.prisma.organizationRole.findFirst({
      where: { id: roleId, organizationId: orgId, isActive: true },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  private mapRole(role: OrganizationRole) {
    return {
      id: role.id,
      organizationId: role.organizationId,
      name: role.name,
      description: role.description,
      systemKey: role.systemKey,
      isSystemTemplate: role.isSystemTemplate,
      isDefault: role.isDefault,
      isActive: role.isActive,
      membershipRole: role.membershipRole,
      permissions: normalizeMembershipPermissions(role.permissions),
      stationScopeDefault: role.stationScopeDefault,
      defaultStationIds: Array.isArray(role.defaultStationIds)
        ? role.defaultStationIds
        : [],
      fieldAgentAccessDefault: role.fieldAgentAccessDefault,
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
    };
  }
}
