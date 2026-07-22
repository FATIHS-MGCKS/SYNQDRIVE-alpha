import {
  Injectable,
  NotFoundException,
  BadRequestException,
  GoneException,
} from '@nestjs/common';
import {
  MembershipStatus,
  MembershipRole,
  OrganizationInviteStatus,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  MIN_USER_PASSWORD_LENGTH,
  USERS_ROLES_MODULE,
} from '@shared/auth/permission.constants';
import {
  assertMembershipPermission,
  normalizeMembershipPermissions,
  type PermissionActor,
} from '@shared/auth/permission.util';
import * as bcrypt from 'bcrypt';
import type {
  CreateOrgUserDto,
  UpdateOrgUserDto,
} from './dto';
import { UserAccessAuditAction } from './user-access-audit.service';
import { IamAuditService } from './iam-audit.service';
import { IamMembershipLifecycleService } from './iam-membership-lifecycle.service';
import { assertNotLastActiveOrgAdmin } from './org-admin-protection.util';
import { ORG_ADMIN_DIRECT_PASSWORD_WRITE_MESSAGE } from './policies/org-membership-admin.policy';
import { PasswordResetService } from '@modules/auth/password-reset.service';

const ROLE_DISPLAY: Record<string, string> = {
  ORG_ADMIN: 'Org Admin',
  SUB_ADMIN: 'Sub Admin',
  WORKER: 'Worker',
  DRIVER: 'Driver',
};

const USER_STATUS_MAP: Record<string, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Inactive',
};

function getInitials(name: string | null | undefined): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function buildDisplayName(
  firstName?: string | null,
  lastName?: string | null,
  name?: string | null,
): string {
  const fromParts = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (fromParts) return fromParts;
  return (name ?? '').trim();
}

function parseStationIds(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((id): id is string => typeof id === 'string' && !!id.trim());
  }
  return [];
}

function stationIdsToJson(ids: string[] | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!ids || ids.length === 0) return Prisma.JsonNull;
  return ids.map((id) => id.trim()).filter(Boolean);
}

function hasSensitiveMembershipChanges(dto: UpdateOrgUserDto): boolean {
  return (
    dto.role !== undefined ||
    dto.permissions !== undefined ||
    dto.fieldAgentAccess !== undefined ||
    dto.status !== undefined
  );
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly iamAudit: IamAuditService,
    private readonly lifecycle: IamMembershipLifecycleService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  private assertPasswordStrength(password: string): void {
    if (!password || password.length < MIN_USER_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Password must be at least ${MIN_USER_PASSWORD_LENGTH} characters`,
      );
    }
  }

  private async assertNotLastActiveOrgAdmin(
    orgId: string,
    targetUserId: string,
  ): Promise<void> {
    return assertNotLastActiveOrgAdmin(this.prisma, orgId, targetUserId);
  }

  private requiresManageForUserProvisioning(
    dto: Pick<CreateOrgUserDto, 'permissions' | 'password'>,
    role: MembershipRole,
  ): boolean {
    if (role === MembershipRole.ORG_ADMIN) return true;
    if (dto.permissions !== undefined) return true;
    if (dto.password) return true;
    return false;
  }

  private async validateStationIds(
    orgId: string,
    stationIds: string[] | undefined,
  ): Promise<void> {
    if (!stationIds?.length) return;
    const found = await this.prisma.station.count({
      where: { organizationId: orgId, id: { in: stationIds } },
    });
    if (found !== stationIds.length) {
      throw new BadRequestException('One or more station ids are invalid for this organization');
    }
  }

  private resolveStationFields(
    dto: { stationScope?: string; stationIds?: string[] },
    existing?: { stationScope?: string | null; stationIds?: unknown },
  ): {
    stationScope: string | null;
    stationIds: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  } {
    if (dto.stationIds !== undefined) {
      const ids = dto.stationIds ?? [];
      return {
        stationIds: stationIdsToJson(ids),
        stationScope:
          ids.length === 1
            ? ids[0]
            : ids.length === 0
              ? dto.stationScope?.trim() || null
              : dto.stationScope?.trim() || null,
      };
    }
    if (dto.stationScope !== undefined) {
      const scope = dto.stationScope?.trim() || null;
      return {
        stationScope: scope,
        stationIds: scope ? [scope] : Prisma.JsonNull,
      };
    }
    return {
      stationScope: existing?.stationScope ?? null,
      stationIds:
        existing?.stationIds != null
          ? (existing.stationIds as Prisma.InputJsonValue)
          : Prisma.JsonNull,
    };
  }

  private async resolveMembershipRoleFields(
    orgId: string,
    dto: Pick<
      CreateOrgUserDto,
      | 'role'
      | 'organizationRoleId'
      | 'permissions'
      | 'stationScope'
      | 'stationIds'
      | 'fieldAgentAccess'
      | 'roleLabel'
    >,
  ): Promise<{
    role: MembershipRole;
    organizationRoleId: string | null;
    permissions: ReturnType<typeof normalizeMembershipPermissions>;
    roleLabel: string | null;
    fieldAgentAccess: boolean;
    stationScope?: string;
    stationIds?: string[];
  }> {
    let role = dto.role as MembershipRole;
    let organizationRoleId: string | null = dto.organizationRoleId ?? null;
    let permissions = normalizeMembershipPermissions(dto.permissions);
    let roleLabel = dto.roleLabel?.trim() || null;
    let fieldAgentAccess = dto.fieldAgentAccess;
    let stationScope = dto.stationScope;
    let stationIds = dto.stationIds;

    if (dto.organizationRoleId) {
      const template = await this.prisma.organizationRole.findFirst({
        where: {
          id: dto.organizationRoleId,
          organizationId: orgId,
          isActive: true,
        },
      });
      if (!template) {
        throw new BadRequestException('Invalid organization role');
      }
      role = template.membershipRole;
      organizationRoleId = template.id;
      if (dto.permissions === undefined) {
        permissions = normalizeMembershipPermissions(template.permissions);
      }
      if (!dto.roleLabel) {
        roleLabel = template.name;
      }
      if (dto.fieldAgentAccess === undefined) {
        fieldAgentAccess = template.fieldAgentAccessDefault;
      }
      if (dto.stationScope === undefined && !dto.stationIds?.length) {
        stationScope = template.stationScopeDefault ?? undefined;
        stationIds = Array.isArray(template.defaultStationIds)
          ? (template.defaultStationIds as string[])
          : undefined;
      }
    }

    return {
      role,
      organizationRoleId,
      permissions,
      roleLabel,
      fieldAgentAccess:
        role === MembershipRole.ORG_ADMIN ? true : !!fieldAgentAccess,
      stationScope,
      stationIds,
    };
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        memberships: {
          include: {
            organization: { select: { id: true, companyName: true } },
          },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
    return users.map((user) => this.mapUser(user, user.memberships[0]));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        memberships: {
          include: {
            organization: { select: { id: true, companyName: true } },
          },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.mapUser(user, user.memberships[0]);
  }

  async create(data: { email: string; name?: string }) {
    const user = await this.prisma.user.create({
      data: { email: data.email.toLowerCase().trim(), name: data.name },
    });
    return this.mapUser(user, undefined);
  }

  async update(id: string, data: { email?: string; name?: string }) {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(data.email !== undefined
          ? { email: data.email.toLowerCase().trim() }
          : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
      },
    });
    return this.mapUser(user, undefined);
  }

  async changePasswordAdmin(userId: string, password: string) {
    this.assertPasswordStrength(password);
    const hash = await bcrypt.hash(password, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash, mustChangePassword: true },
    });
    return { message: 'Password updated successfully' };
  }

  async delete(id: string) {
    await this.prisma.user.delete({ where: { id } });
    return { deleted: true };
  }

  async findByOrganization(orgId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId: orgId,
        status: { not: MembershipStatus.REMOVED },
      },
      include: {
        user: true,
        organization: { select: { id: true, companyName: true } },
        organizationRole: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const pendingInvites = await this.prisma.organizationUserInvite.findMany({
      where: {
        organizationId: orgId,
        status: OrganizationInviteStatus.PENDING,
      },
      select: { id: true, email: true },
    });
    const inviteIdByEmail = new Map(
      pendingInvites.map((invite) => [invite.email.toLowerCase(), invite.id]),
    );
    return memberships.map((m) => ({
      ...this.mapOrgUser(m),
      pendingInviteId: inviteIdByEmail.get(m.user.email?.toLowerCase() ?? '') ?? null,
    }));
  }

  async findOrgUserDetail(orgId: string, userId: string) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId: orgId, userId },
      include: {
        user: true,
        organization: { select: { id: true, companyName: true } },
        organizationRole: { select: { id: true, name: true } },
      },
    });
    if (!membership) throw new NotFoundException('User not found in organization');
    return this.mapOrgUserFull(membership);
  }

  async createOrgUser(orgId: string, dto: CreateOrgUserDto, actor: PermissionActor = {}) {
    const roleFields = await this.resolveMembershipRoleFields(orgId, dto);
    if (this.requiresManageForUserProvisioning(dto, roleFields.role)) {
      await assertMembershipPermission(
        this.prisma,
        actor,
        orgId,
        USERS_ROLES_MODULE,
        'manage',
      );
    }
    await this.validateStationIds(orgId, roleFields.stationIds);

    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      const existingMembership =
        await this.prisma.organizationMembership.findUnique({
          where: {
            userId_organizationId: {
              userId: existing.id,
              organizationId: orgId,
            },
          },
        });

      if (existingMembership) {
        if (existingMembership.status === MembershipStatus.REMOVED) {
          return this.reactivateOrgUser(orgId, existing.id, dto, existingMembership.id);
        }
        throw new BadRequestException(
          'User already exists in this organization',
        );
      }
    }

    const fullName = buildDisplayName(dto.firstName, dto.lastName);
    let passwordHash: string | undefined;
    if (dto.password) {
      this.assertPasswordStrength(dto.password);
      passwordHash = await bcrypt.hash(dto.password, 10);
    }

    const stationFields = this.resolveStationFields({
      stationScope: roleFields.stationScope,
      stationIds: roleFields.stationIds,
    });
    const normalizedPermissions = roleFields.permissions;

    const outboxIds: string[] = [];
    const result = await this.prisma.$transaction(async (tx) => {
      let user = existing;
      if (!user) {
        user = await tx.user.create({
          data: {
            email,
            name: fullName || null,
            firstName: dto.firstName || null,
            lastName: dto.lastName || null,
            passwordHash: passwordHash ?? null,
            phone: dto.phone || null,
            mobile: dto.mobile || null,
            address: dto.address || null,
            language: dto.language || 'de',
            timezone: dto.timezone || 'Europe/Berlin',
            dateFormat: dto.dateFormat || 'DD.MM.YYYY',
            mustChangePassword: !!dto.password,
            status: UserStatus.ACTIVE,
          },
        });
      } else if (passwordHash) {
        await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            mustChangePassword: true,
            firstName: dto.firstName || user.firstName,
            lastName: dto.lastName || user.lastName,
            name: fullName || user.name,
            phone: dto.phone || user.phone,
            mobile: dto.mobile || user.mobile,
            address: dto.address || user.address,
          },
        });
      }

      const membership = await tx.organizationMembership.create({
        data: {
          userId: user.id,
          organizationId: orgId,
          role: roleFields.role,
          organizationRoleId: roleFields.organizationRoleId,
          roleLabel: roleFields.roleLabel,
          stationScope: stationFields.stationScope,
          stationIds: stationFields.stationIds,
          department: dto.department || null,
          position: dto.position || null,
          permissions: normalizedPermissions
            ? (normalizedPermissions as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          fieldAgentAccess: roleFields.fieldAgentAccess,
          status: dto.inviteByEmail
            ? MembershipStatus.INVITED
            : MembershipStatus.ACTIVE,
        },
        include: {
          user: true,
          organization: { select: { id: true, companyName: true } },
        },
      });

      const outbox = await this.iamAudit.enqueueInTransaction(tx, {
        organizationId: orgId,
        idempotencyKey: `user-created:${orgId}:${membership.id}`,
        eventType: UserAccessAuditAction.USER_CREATED,
        actorUserId: actor.id,
        subjectUserId: membership.user.id,
        membershipId: membership.id,
        description: `Benutzer ${membership.user.email} erstellt`,
        after: {
          membershipId: membership.id,
          role: membership.role,
          status: membership.status,
        },
      });
      outboxIds.push(outbox.id);

      return membership;
    });

    await this.iamAudit.processOutboxIds(outboxIds);

    const mapped = this.mapOrgUserFull(result);
    return mapped;
  }

  private   async reactivateOrgUser(
    orgId: string,
    userId: string,
    dto: CreateOrgUserDto,
    membershipId: string,
    actor?: PermissionActor,
  ) {
    const roleFields = await this.resolveMembershipRoleFields(orgId, dto);
    await this.validateStationIds(orgId, roleFields.stationIds);

    const fullName = buildDisplayName(dto.firstName, dto.lastName);
    let passwordHash: string | undefined;
    if (dto.password) {
      this.assertPasswordStrength(dto.password);
      passwordHash = await bcrypt.hash(dto.password, 10);
    }

    const stationFields = this.resolveStationFields({
      stationScope: roleFields.stationScope,
      stationIds: roleFields.stationIds,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        name: fullName || undefined,
        email: dto.email.toLowerCase().trim(),
        phone: dto.phone || undefined,
        mobile: dto.mobile || undefined,
        address: dto.address || undefined,
        language: dto.language || undefined,
        timezone: dto.timezone || undefined,
        dateFormat: dto.dateFormat || undefined,
        status: UserStatus.ACTIVE,
        ...(passwordHash ? { passwordHash, mustChangePassword: true } : {}),
      },
    });

    await this.lifecycle.reactivate({
      organizationId: orgId,
      userId,
      idempotencyKey: `membership-reactivate:${orgId}:${membershipId}`,
      actor: { userId: actor?.id },
      role: roleFields.role,
      organizationRoleId: roleFields.organizationRoleId,
      roleLabel: roleFields.roleLabel,
      stationScope: stationFields.stationScope as string | null,
      stationIds: Array.isArray(stationFields.stationIds)
        ? (stationFields.stationIds as string[])
        : null,
      permissions: roleFields.permissions,
      fieldAgentAccess: roleFields.fieldAgentAccess,
      reason: 'Explicit admin reactivation',
    });

    return this.findOrgUserDetail(orgId, userId);
  }

  async updateOrgUser(
    orgId: string,
    userId: string,
    dto: UpdateOrgUserDto,
    actor: PermissionActor,
  ) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId: orgId, userId },
    });
    if (!membership) throw new NotFoundException('User not found in organization');
    if (membership.status === MembershipStatus.REMOVED) {
      throw new BadRequestException('Cannot update a removed membership');
    }

    if (hasSensitiveMembershipChanges(dto)) {
      await assertMembershipPermission(
        this.prisma,
        actor,
        orgId,
        USERS_ROLES_MODULE,
        'manage',
      );
    }

    if (dto.role !== undefined && dto.role !== membership.role) {
      if (membership.role === MembershipRole.ORG_ADMIN) {
        await this.assertNotLastActiveOrgAdmin(orgId, userId);
      }
      if (dto.role !== MembershipRole.ORG_ADMIN) {
        // demoting to non-admin — already checked last admin above
      }
    }

    if (dto.status === 'SUSPENDED') {
      await this.assertNotLastActiveOrgAdmin(orgId, userId);
    }

    if (dto.stationIds !== undefined) {
      await this.validateStationIds(orgId, dto.stationIds);
    }

    const fullName =
      dto.firstName !== undefined || dto.lastName !== undefined
        ? buildDisplayName(
            dto.firstName ?? undefined,
            dto.lastName ?? undefined,
          )
        : undefined;

    const stationFields = this.resolveStationFields(dto, membership);
    const normalizedPermissions =
      dto.permissions !== undefined
        ? normalizeMembershipPermissions(dto.permissions)
        : undefined;

    const actorUserId = actor.id;
    const outboxIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      const userUpdate: Prisma.UserUpdateInput = {};
      if (dto.firstName !== undefined) userUpdate.firstName = dto.firstName;
      if (dto.lastName !== undefined) userUpdate.lastName = dto.lastName;
      if (fullName) userUpdate.name = fullName;
      if (dto.email !== undefined) userUpdate.email = dto.email.toLowerCase().trim();
      if (dto.phone !== undefined) userUpdate.phone = dto.phone;
      if (dto.mobile !== undefined) userUpdate.mobile = dto.mobile;
      if (dto.address !== undefined) userUpdate.address = dto.address;
      if (dto.language !== undefined) userUpdate.language = dto.language;
      if (dto.timezone !== undefined) userUpdate.timezone = dto.timezone;
      if (dto.dateFormat !== undefined) userUpdate.dateFormat = dto.dateFormat;
      if (dto.status !== undefined) {
        userUpdate.status =
          dto.status === 'SUSPENDED' ? UserStatus.SUSPENDED : UserStatus.ACTIVE;
      }

      if (Object.keys(userUpdate).length > 0) {
        await tx.user.update({ where: { id: userId }, data: userUpdate });
      }

      const membershipUpdate: Prisma.OrganizationMembershipUpdateInput = {};
      if (dto.department !== undefined) membershipUpdate.department = dto.department;
      if (dto.position !== undefined) membershipUpdate.position = dto.position;

      if (Object.keys(membershipUpdate).length > 0) {
        await tx.organizationMembership.update({
          where: { id: membership.id },
          data: membershipUpdate,
        });
      }

      if (
        dto.firstName !== undefined ||
        dto.lastName !== undefined ||
        dto.email !== undefined ||
        dto.phone !== undefined
      ) {
        const outbox = await this.iamAudit.enqueueInTransaction(tx, {
          organizationId: orgId,
          idempotencyKey: `user-profile-updated:${orgId}:${membership.id}:${Date.now()}`,
          eventType: UserAccessAuditAction.USER_UPDATED,
          actorUserId,
          subjectUserId: userId,
          membershipId: membership.id,
          description: `Benutzerprofil ${userId} aktualisiert`,
        });
        outboxIds.push(outbox.id);
      }
    });

    if (dto.status === 'SUSPENDED') {
      await this.lifecycle.suspend({
        organizationId: orgId,
        userId,
        idempotencyKey: `membership-suspend:${orgId}:${membership.id}`,
        actor: { userId: actorUserId },
        reason: 'Admin suspended membership',
      });
      await this.iamAudit.processOutboxIds(outboxIds);
      return this.findOrgUserDetail(orgId, userId);
    }

    const hasMove =
      dto.role !== undefined ||
      dto.permissions !== undefined ||
      dto.stationScope !== undefined ||
      dto.stationIds !== undefined ||
      dto.fieldAgentAccess !== undefined ||
      dto.roleLabel !== undefined;

    if (hasMove) {
      await this.lifecycle.move({
        organizationId: orgId,
        userId,
        idempotencyKey: `membership-move:${orgId}:${membership.id}:${Date.now()}`,
        actor: { userId: actorUserId },
        role: dto.role as MembershipRole | undefined,
        roleLabel: dto.roleLabel,
        stationScope: stationFields.stationScope as string | null,
        stationIds: Array.isArray(stationFields.stationIds)
          ? (stationFields.stationIds as string[])
          : undefined,
        permissions: normalizedPermissions ?? undefined,
        fieldAgentAccess: dto.fieldAgentAccess,
        reason: 'Admin updated membership access',
      });
    }

    await this.iamAudit.processOutboxIds(outboxIds);

    return this.findOrgUserDetail(orgId, userId);
  }

  async changeOrgUserPassword(
    orgId: string,
    userId: string,
    _password: string,
    _requesterId: string,
    _actor: PermissionActor,
  ) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId: orgId, userId },
    });
    if (!membership) throw new NotFoundException('User not found in organization');

    throw new GoneException({
      statusCode: 410,
      code: 'ORG_ADMIN_DIRECT_PASSWORD_WRITE_DEPRECATED',
      message: ORG_ADMIN_DIRECT_PASSWORD_WRITE_MESSAGE,
      resetRequestRoute: `POST /organizations/${orgId}/users/${userId}/request-password-reset`,
    });
  }

  async requestOrgUserPasswordReset(
    orgId: string,
    userId: string,
    actor: PermissionActor,
    options?: { reason?: string; ipAddress?: string; userAgent?: string },
  ) {
    await assertMembershipPermission(
      this.prisma,
      actor,
      orgId,
      USERS_ROLES_MODULE,
      'manage',
    );

    return this.passwordReset.requestAdminReset({
      organizationId: orgId,
      userId,
      actorUserId: actor.id,
      reason: options?.reason,
      context: {
        ipAddress: options?.ipAddress,
        userAgent: options?.userAgent,
      },
    });
  }

  async removeOrgUser(orgId: string, userId: string, actor?: PermissionActor) {
    await this.lifecycle.remove({
      organizationId: orgId,
      userId,
      idempotencyKey: `membership-remove:${orgId}:${userId}`,
      actor: { userId: actor?.id },
      reason: 'Admin removed user from organization',
    });
    return { removed: true };
  }

  async createMembership(userId: string, orgId: string, role: MembershipRole) {
    const existing = await this.prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: { userId, organizationId: orgId },
      },
    });

    if (existing) {
      if (existing.status === MembershipStatus.REMOVED) {
        return this.lifecycle.reactivate({
          organizationId: orgId,
          userId,
          idempotencyKey: `membership-reactivate:${orgId}:${existing.id}`,
          role,
          reason: 'Membership recreate after removal',
        });
      }
      throw new BadRequestException('Membership already exists');
    }

    return this.lifecycle.join({
      organizationId: orgId,
      userId,
      idempotencyKey: `membership-join:${orgId}:${userId}`,
      role,
      source: 'provisioning',
    });
  }

  async removeMembership(userId: string, orgId: string) {
    await this.lifecycle.remove({
      organizationId: orgId,
      userId,
      idempotencyKey: `membership-remove:${orgId}:${userId}`,
      reason: 'Membership removed',
      force: true,
    });
    return { removed: true };
  }

  async updateLastLogin(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  private mapOrgUser(membership: {
    user: {
      id: string;
      email: string;
      name: string | null;
      firstName: string | null;
      lastName: string | null;
      status: UserStatus;
      phone: string | null;
      mobile: string | null;
      language: string | null;
      timezone: string | null;
      dateFormat: string | null;
      lastLoginAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    };
    organization?: { id: string; companyName: string } | null;
    organizationId?: string;
    id: string;
    role: MembershipRole;
    roleLabel: string | null;
    stationScope: string | null;
    stationIds: unknown;
    department: string | null;
    position: string | null;
    permissions: unknown;
    fieldAgentAccess: boolean;
    status: MembershipStatus;
    createdAt: Date;
    updatedAt: Date;
    organizationRoleId?: string | null;
    organizationRole?: { id: string; name: string } | null;
  }) {
    const u = membership.user;
    const displayName = buildDisplayName(u.firstName, u.lastName, u.name);
    const role = ROLE_DISPLAY[membership.role] || membership.role;
    const membershipStatus = membership.status;
    const stationIds = parseStationIds(membership.stationIds);
    const permissions = normalizeMembershipPermissions(membership.permissions);

    return {
      id: u.id,
      membershipId: membership.id,
      name: displayName,
      displayName,
      fullName: displayName,
      firstName: u.firstName || '',
      lastName: u.lastName || '',
      email: u.email || '',
      role,
      roleKey: membership.role,
      membershipRole: membership.role,
      roleLabel: membership.roleLabel || '',
      organizationRoleId: membership.organizationRoleId ?? membership.organizationRole?.id ?? null,
      organizationRoleName: membership.organizationRole?.name ?? '',
      organizationId: membership.organizationId ?? membership.organization?.id ?? '',
      organizationName: membership.organization?.companyName || '',
      department: membership.department || '',
      position: membership.position || '',
      stationScope: membership.stationScope || '',
      stationIds,
      fieldAgentAccess: !!membership.fieldAgentAccess,
      permissions,
      status:
        membershipStatus === MembershipStatus.INVITED
          ? 'Invited'
          : membershipStatus === MembershipStatus.REMOVED
            ? 'Removed'
            : USER_STATUS_MAP[u.status] || 'Active',
      membershipStatus,
      lastActive: u.lastLoginAt?.toISOString() || u.updatedAt?.toISOString() || '',
      lastLoginAt: u.lastLoginAt?.toISOString() || '',
      createdAt: u.createdAt?.toISOString() || '',
      updatedAt: u.updatedAt?.toISOString() || '',
      invitedAt:
        membershipStatus === MembershipStatus.INVITED
          ? membership.createdAt?.toISOString() || ''
          : '',
      avatar: getInitials(displayName),
      phone: u.phone || '',
      mobile: u.mobile || '',
      language: u.language || 'de',
      timezone: u.timezone || 'Europe/Berlin',
      dateFormat: u.dateFormat || 'DD.MM.YYYY',
    };
  }

  private mapOrgUserFull(membership: Parameters<UsersService['mapOrgUser']>[0] & {
    user: Parameters<UsersService['mapOrgUser']>[0]['user'] & {
      address?: string | null;
      mustChangePassword?: boolean;
      lastLoginIp?: string | null;
      lastLoginDevice?: string | null;
    };
  }) {
    const base = this.mapOrgUser(membership);
    const u = membership.user;
    return {
      ...base,
      address: u.address || '',
      mustChangePassword: !!u.mustChangePassword,
      lastLoginIp: u.lastLoginIp || '',
      lastLoginDevice: u.lastLoginDevice || '',
    };
  }

  private mapUser(
    user: {
      id: string;
      email: string;
      name: string | null;
      platformRole: string;
      status: UserStatus;
      lastLoginAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    },
    membership?: {
      role: MembershipRole;
      status: MembershipStatus;
      organizationId: string;
      organization?: { id: string; companyName: string };
    },
  ) {
    const isMasterAdmin = user.platformRole === 'MASTER_ADMIN';

    let role: string;
    let organizationId = '';
    let organizationName = '';
    let status: string;

    if (isMasterAdmin) {
      role = 'Master Admin';
      status = USER_STATUS_MAP[user.status] || 'Active';
      if (membership) {
        organizationId = membership.organizationId || membership.organization?.id || '';
        organizationName = membership.organization?.companyName || '';
      }
    } else if (membership) {
      role = ROLE_DISPLAY[membership.role] || membership.role;
      organizationId = membership.organizationId || membership.organization?.id || '';
      organizationName = membership.organization?.companyName || '';
      status =
        membership.status === MembershipStatus.INVITED
          ? 'Invited'
          : USER_STATUS_MAP[user.status] || 'Active';
    } else {
      role = 'Worker';
      status = USER_STATUS_MAP[user.status] || 'Active';
    }

    return {
      id: user.id,
      name: user.name || '',
      email: user.email,
      role,
      organizationId,
      organizationName,
      status,
      lastActive: user.lastLoginAt?.toISOString() || user.updatedAt?.toISOString() || '',
      created_at: user.createdAt?.toISOString() || '',
      avatar: getInitials(user.name),
      last_login: user.lastLoginAt?.toISOString() || '',
    };
  }
}
