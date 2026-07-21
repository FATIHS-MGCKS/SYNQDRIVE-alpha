import {
  Injectable,
  NotFoundException,
  BadRequestException,
  GoneException,
} from '@nestjs/common';
import {
  MembershipStatus,
  MembershipRole,
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
import { UserAccessAuditService, UserAccessAuditAction } from './user-access-audit.service';
import { assertNotLastActiveOrgAdmin } from './org-admin-protection.util';
import {
  assertOrgAdminUpdateDoesNotTouchGlobalIdentity,
  ORG_ADMIN_DIRECT_PASSWORD_WRITE_MESSAGE,
  ORG_ADMIN_EXISTING_USER_PASSWORD_MESSAGE,
} from './policies/org-membership-admin.policy';
import {
  isRoleDowngrade,
  isRoleUpgrade,
  permissionsWereReduced,
  stationScopeWasReduced,
  type IamSessionInvalidationTrigger,
} from './policies/iam-session-invalidation.policy';
import {
  IamSessionPolicyService,
  type IamSessionRevocationIntentInput,
} from '@modules/auth/iam-session-policy.service';
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

const MEMBERSHIP_STATUS_DISPLAY: Record<MembershipStatus, string> = {
  [MembershipStatus.ACTIVE]: 'Active',
  [MembershipStatus.INVITED]: 'Invited',
  [MembershipStatus.REMOVED]: 'Removed',
  [MembershipStatus.SUSPENDED]: 'Inactive',
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
    private readonly userAudit: UserAccessAuditService,
    private readonly sessionPolicy: IamSessionPolicyService,
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
    return memberships.map((m) => this.mapOrgUser(m));
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
      if (dto.password) {
        throw new BadRequestException(ORG_ADMIN_EXISTING_USER_PASSWORD_MESSAGE);
      }

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
      } else {
        // Existing global user: add org membership only — do not mutate global identity.
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

      return membership;
    });

    const mapped = this.mapOrgUserFull(result);
    void this.userAudit.record({
      organizationId: orgId,
      auditAction: UserAccessAuditAction.USER_CREATED,
      targetUserId: result.user.id,
      description: `Benutzer ${result.user.email} erstellt`,
    });
    return mapped;
  }

  private async reactivateOrgUser(
    orgId: string,
    userId: string,
    dto: CreateOrgUserDto,
    membershipId: string,
  ) {
    if (dto.password) {
      throw new BadRequestException(ORG_ADMIN_EXISTING_USER_PASSWORD_MESSAGE);
    }

    const roleFields = await this.resolveMembershipRoleFields(orgId, dto);
    await this.validateStationIds(orgId, roleFields.stationIds);

    const stationFields = this.resolveStationFields({
      stationScope: roleFields.stationScope,
      stationIds: roleFields.stationIds,
    });
    const normalizedPermissions = roleFields.permissions;

    const membership = await this.prisma.$transaction(async (tx) =>
      tx.organizationMembership.update({
        where: { id: membershipId },
        data: {
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
      }),
    );

    const mapped = this.mapOrgUserFull(membership);
    void this.userAudit.record({
      organizationId: orgId,
      auditAction: UserAccessAuditAction.USER_REACTIVATED,
      targetUserId: userId,
      description: `Benutzer ${dto.email} reaktiviert`,
    });
    return mapped;
  }

  async updateOrgUser(
    orgId: string,
    userId: string,
    dto: UpdateOrgUserDto,
    actor: PermissionActor,
  ) {
    assertOrgAdminUpdateDoesNotTouchGlobalIdentity(dto);

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

    const stationFields = this.resolveStationFields(dto, membership);
    const normalizedPermissions =
      dto.permissions !== undefined
        ? normalizeMembershipPermissions(dto.permissions)
        : undefined;

    const auditBefore = {
      role: membership.role,
      roleLabel: membership.roleLabel,
      permissions: membership.permissions,
      stationScope: membership.stationScope,
      stationIds: membership.stationIds,
      fieldAgentAccess: membership.fieldAgentAccess,
      status: membership.status,
      membershipVersion: membership.membershipVersion,
    };

    const sessionEvents = this.buildSessionInvalidationEvents(
      orgId,
      userId,
      membership.id,
      auditBefore,
      dto,
      stationFields,
      normalizedPermissions,
      actor.id,
    );
    const intentIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      const membershipUpdate: Prisma.OrganizationMembershipUpdateInput = {};
      if (dto.role !== undefined) membershipUpdate.role = dto.role as MembershipRole;
      if (dto.roleLabel !== undefined) membershipUpdate.roleLabel = dto.roleLabel;
      if (dto.stationScope !== undefined || dto.stationIds !== undefined) {
        membershipUpdate.stationScope = stationFields.stationScope;
        membershipUpdate.stationIds = stationFields.stationIds;
      }
      if (dto.department !== undefined) membershipUpdate.department = dto.department;
      if (dto.position !== undefined) membershipUpdate.position = dto.position;
      if (normalizedPermissions !== undefined) {
        membershipUpdate.permissions = normalizedPermissions
          ? (normalizedPermissions as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull;
      }
      if (dto.fieldAgentAccess !== undefined) {
        membershipUpdate.fieldAgentAccess = dto.fieldAgentAccess;
      }
      if (dto.status !== undefined) {
        membershipUpdate.status =
          dto.status === 'SUSPENDED'
            ? MembershipStatus.SUSPENDED
            : MembershipStatus.ACTIVE;
      }

      if (Object.keys(membershipUpdate).length > 0) {
        await tx.organizationMembership.update({
          where: { id: membership.id },
          data: membershipUpdate,
        });
      }

      for (const event of sessionEvents) {
        const enqueued = await this.sessionPolicy.enqueueInTransaction(tx, event);
        intentIds.push(...enqueued.intentIds);
      }
    });

    if (intentIds.length > 0) {
      await this.sessionPolicy.processIntents(intentIds);
    }

    const actorUserId = actor.id;
    if (dto.role !== undefined && dto.role !== auditBefore.role) {
      void this.userAudit.record({
        organizationId: orgId,
        actorUserId,
        auditAction: UserAccessAuditAction.USER_ROLE_CHANGED,
        targetUserId: userId,
        description: `Rolle geändert für Benutzer ${userId}`,
        before: { role: auditBefore.role },
        after: { role: dto.role },
      });
    }
    if (dto.permissions !== undefined) {
      void this.userAudit.record({
        organizationId: orgId,
        actorUserId,
        auditAction: UserAccessAuditAction.USER_PERMISSIONS_CHANGED,
        targetUserId: userId,
        description: `Berechtigungen geändert für Benutzer ${userId}`,
        before: { permissions: auditBefore.permissions },
        after: { permissions: normalizedPermissions },
      });
    }
    if (dto.stationScope !== undefined || dto.stationIds !== undefined) {
      void this.userAudit.record({
        organizationId: orgId,
        actorUserId,
        auditAction: UserAccessAuditAction.USER_STATION_SCOPE_CHANGED,
        targetUserId: userId,
        description: `Stations-Scope geändert für Benutzer ${userId}`,
        before: {
          stationScope: auditBefore.stationScope,
          stationIds: auditBefore.stationIds,
        },
        after: {
          stationScope: stationFields.stationScope,
          stationIds: stationFields.stationIds,
        },
      });
    }
    if (dto.status === 'SUSPENDED') {
      void this.userAudit.record({
        organizationId: orgId,
        actorUserId,
        auditAction: UserAccessAuditAction.USER_DEACTIVATED,
        targetUserId: userId,
        description: `Benutzer ${userId} deaktiviert`,
      });
    } else if (dto.status === 'ACTIVE') {
      void this.userAudit.record({
        organizationId: orgId,
        actorUserId,
        auditAction: UserAccessAuditAction.USER_UPDATED,
        targetUserId: userId,
        description: `Benutzer ${userId} aktualisiert`,
      });
    } else if (
      dto.department !== undefined ||
      dto.position !== undefined ||
      dto.roleLabel !== undefined
    ) {
      void this.userAudit.record({
        organizationId: orgId,
        actorUserId,
        auditAction: UserAccessAuditAction.USER_UPDATED,
        targetUserId: userId,
        description: `Organisations-Mitgliedschaft ${userId} aktualisiert`,
      });
    }

    return this.findOrgUserDetail(orgId, userId);
  }

  /**
   * @deprecated Org admins must not set plaintext passwords. Use requestOrgUserPasswordReset.
   */
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
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId: orgId, userId },
    });
    if (!membership) throw new NotFoundException('User not found in organization');

    await this.assertNotLastActiveOrgAdmin(orgId, userId);

    let intentIds: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      await tx.organizationMembership.update({
        where: { id: membership.id },
        data: { status: MembershipStatus.REMOVED },
      });
      const enqueued = await this.sessionPolicy.enqueueInTransaction(tx, {
        eventType: 'MEMBERSHIP_REMOVED',
        userId,
        organizationId: orgId,
        membershipId: membership.id,
        actorUserId: actor?.id,
        mutationVersion: membership.membershipVersion + 1,
      });
      intentIds = enqueued.intentIds;
    });

    if (intentIds.length > 0) {
      await this.sessionPolicy.processIntents(intentIds);
    }

    void this.userAudit.record({
      organizationId: orgId,
      actorUserId: actor?.id,
      auditAction: UserAccessAuditAction.USER_REMOVED_FROM_ORG,
      targetUserId: userId,
      description: `Benutzer ${userId} aus Organisation entfernt`,
      before: { status: membership.status, role: membership.role },
      after: { status: MembershipStatus.REMOVED },
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
        return this.prisma.organizationMembership.update({
          where: { id: existing.id },
          data: {
            role,
            status: MembershipStatus.ACTIVE,
          },
        });
      }
      throw new BadRequestException('Membership already exists');
    }

    return this.prisma.organizationMembership.create({
      data: {
        userId,
        organizationId: orgId,
        role,
        status: MembershipStatus.ACTIVE,
      },
    });
  }

  async removeMembership(userId: string, orgId: string) {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: { userId, organizationId: orgId },
      },
    });
    if (!membership) return { removed: true };

    await this.assertNotLastActiveOrgAdmin(orgId, userId);

    await this.prisma.organizationMembership.update({
      where: { id: membership.id },
      data: { status: MembershipStatus.REMOVED },
    });
    return { removed: true };
  }

  async updateLastLogin(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  private buildSessionInvalidationEvents(
    orgId: string,
    userId: string,
    membershipId: string,
    before: {
      role: MembershipRole;
      permissions: unknown;
      stationIds: unknown;
      status: MembershipStatus;
      membershipVersion: number;
    },
    dto: UpdateOrgUserDto,
    stationFields: { stationIds: Prisma.InputJsonValue | typeof Prisma.JsonNull },
    normalizedPermissions: ReturnType<typeof normalizeMembershipPermissions> | undefined,
    actorUserId?: string,
  ): IamSessionRevocationIntentInput[] {
    const events: IamSessionRevocationIntentInput[] = [];
    const base = {
      userId,
      organizationId: orgId,
      membershipId,
      actorUserId,
      mutationVersion: before.membershipVersion + 1,
    };

    if (dto.status === 'SUSPENDED') {
      events.push({ ...base, eventType: 'MEMBERSHIP_SUSPENDED' });
    }

    if (dto.role !== undefined && dto.role !== before.role) {
      const eventType: IamSessionInvalidationTrigger = isRoleDowngrade(
        before.role as 'ORG_ADMIN' | 'SUB_ADMIN' | 'WORKER' | 'DRIVER',
        dto.role as 'ORG_ADMIN' | 'SUB_ADMIN' | 'WORKER' | 'DRIVER',
      )
        ? 'ROLE_DOWNGRADED'
        : isRoleUpgrade(
              before.role as 'ORG_ADMIN' | 'SUB_ADMIN' | 'WORKER' | 'DRIVER',
              dto.role as 'ORG_ADMIN' | 'SUB_ADMIN' | 'WORKER' | 'DRIVER',
            )
          ? 'ROLE_UPGRADED'
          : 'ROLE_DOWNGRADED';
      events.push({ ...base, eventType });
    }

    if (
      normalizedPermissions !== undefined &&
      permissionsWereReduced(
        (before.permissions as Record<string, { read?: boolean; write?: boolean; manage?: boolean }>) ??
          null,
        normalizedPermissions as Record<string, { read?: boolean; write?: boolean; manage?: boolean }>,
      )
    ) {
      events.push({ ...base, eventType: 'PERMISSION_REVOKED' });
    }

    if (
      (dto.stationIds !== undefined || dto.stationScope !== undefined) &&
      stationScopeWasReduced(
        parseStationIds(before.stationIds),
        parseStationIds(
          stationFields.stationIds === Prisma.JsonNull
            ? null
            : stationFields.stationIds,
        ),
      )
    ) {
      events.push({ ...base, eventType: 'STATION_SCOPE_REDUCED' });
    }

    return events;
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
      status: MEMBERSHIP_STATUS_DISPLAY[membershipStatus] ?? 'Active',
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
