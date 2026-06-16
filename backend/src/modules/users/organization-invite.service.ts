import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipRole,
  MembershipStatus,
  OrganizationInviteStatus,
  ActivityEntity,
  Prisma,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@shared/database/prisma.service';
import {
  MIN_USER_PASSWORD_LENGTH,
  LAST_ORG_ADMIN_MESSAGE,
} from '@shared/auth/permission.constants';
import {
  assertMembershipPermission,
  normalizeMembershipPermissions,
  type PermissionActor,
} from '@shared/auth/permission.util';
import { USERS_ROLES_MODULE } from '@shared/auth/permission.constants';
import { OrganizationRoleService } from './organization-role.service';
import { TransactionalMailService } from './transactional-mail.service';
import { UserAccessAuditService, UserAccessAuditAction } from './user-access-audit.service';
import {
  generateInviteToken,
  inviteTokenLookupKey,
  verifyInviteToken,
} from './utils/invite-token.util';
import type { AcceptInviteDto, CreateOrganizationInviteDto } from './dto/organization-invite.dto';

@Injectable()
export class OrganizationInviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleService: OrganizationRoleService,
    private readonly mail: TransactionalMailService,
    private readonly userAudit: UserAccessAuditService,
  ) {}

  async createInvite(
    orgId: string,
    dto: CreateOrganizationInviteDto,
    invitedByUserId: string,
    actor: PermissionActor = {},
  ) {
    await this.roleService.ensureDefaultRoles(orgId, invitedByUserId);

    const email = dto.email.toLowerCase().trim();
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { companyName: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingUser) {
      const activeMembership = await this.prisma.organizationMembership.findFirst({
        where: {
          userId: existingUser.id,
          organizationId: orgId,
          status: MembershipStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (activeMembership) {
        throw new BadRequestException(
          'Diese E-Mail gehört bereits zu einem aktiven Benutzer in dieser Organisation',
        );
      }
    }

    const existingPending = await this.prisma.organizationUserInvite.findFirst({
      where: {
        organizationId: orgId,
        email,
        status: OrganizationInviteStatus.PENDING,
      },
    });
    if (existingPending) {
      await this.revokeInvite(orgId, existingPending.id, invitedByUserId, false);
    }

    let membershipRole = dto.membershipRole ?? MembershipRole.WORKER;
    let permissions = normalizeMembershipPermissions(dto.permissions);
    let stationScope = dto.stationScope?.trim() || null;
    let stationIds = dto.stationIds?.length ? dto.stationIds : null;
    let fieldAgentAccess = dto.fieldAgentAccess ?? false;
    let roleLabel = dto.roleLabel?.trim() || null;
    let organizationRoleId: string | null = dto.organizationRoleId ?? null;

    if (dto.organizationRoleId) {
      const template = await this.roleService.resolveRoleForInvite(
        orgId,
        dto.organizationRoleId,
      );
      if (template) {
        membershipRole = template.membershipRole;
        permissions = normalizeMembershipPermissions(template.permissions);
        stationScope = template.stationScopeDefault;
        stationIds = Array.isArray(template.defaultStationIds)
          ? (template.defaultStationIds as string[])
          : null;
        fieldAgentAccess = template.fieldAgentAccessDefault;
        roleLabel = template.name;
        organizationRoleId = template.id;
      }
    }

    if (
      membershipRole === MembershipRole.ORG_ADMIN ||
      dto.permissions !== undefined
    ) {
      await assertMembershipPermission(
        this.prisma,
        actor,
        orgId,
        USERS_ROLES_MODULE,
        'manage',
      );
    }

    const { plain, hash } = generateInviteToken();
    const tokenLookup = inviteTokenLookupKey(plain);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.roleService.inviteExpiryDays);

    const invite = await this.prisma.organizationUserInvite.create({
      data: {
        organizationId: orgId,
        email,
        membershipRole,
        organizationRoleId,
        permissions: permissions
          ? (permissions as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        stationScope,
        stationIds: stationIds ? stationIds : Prisma.JsonNull,
        fieldAgentAccess,
        department: dto.department?.trim() || null,
        position: dto.position?.trim() || null,
        roleLabel,
        tokenHash: hash,
        tokenLookup,
        status: OrganizationInviteStatus.PENDING,
        expiresAt,
        invitedByUserId,
      },
      include: {
        organization: { select: { companyName: true } },
        invitedBy: { select: { id: true, name: true, email: true } },
      },
    });

    const inviteUrl = this.buildInviteUrl(plain);
    await this.mail.sendOrganizationInvite({
      to: email,
      organizationName: org.companyName,
      inviteUrl,
      expiresAt,
      invitedByName: invite.invitedBy?.name ?? invite.invitedBy?.email ?? undefined,
    });

    void this.userAudit.record({
      organizationId: orgId,
      actorUserId: invitedByUserId,
      auditAction: UserAccessAuditAction.USER_INVITED,
      targetInviteId: invite.id,
      description: `Einladung an ${email} versendet`,
      after: this.mapInvite(invite, { includeToken: false }),
      metadata: { email, membershipRole, organizationRoleId },
    });

    return {
      ...this.mapInvite(invite, { includeToken: false }),
      /** Plain token returned once for admin copy — never stored or logged. */
      inviteToken: plain,
      inviteUrl,
    };
  }

  async listInvites(orgId: string, status?: OrganizationInviteStatus) {
    const invites = await this.prisma.organizationUserInvite.findMany({
      where: {
        organizationId: orgId,
        ...(status ? { status } : { status: OrganizationInviteStatus.PENDING }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        invitedBy: { select: { id: true, name: true, email: true } },
        organizationRole: { select: { id: true, name: true } },
      },
    });
    return invites.map((i) => this.mapInvite(i, { includeToken: false }));
  }

  async resendInvite(orgId: string, inviteId: string, actorUserId: string) {
    const invite = await this.findInviteOrThrow(orgId, inviteId);
    if (invite.status !== OrganizationInviteStatus.PENDING) {
      throw new BadRequestException('Only pending invites can be resent');
    }

    const { plain, hash } = generateInviteToken();
    const tokenLookup = inviteTokenLookupKey(plain);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.roleService.inviteExpiryDays);

    const updated = await this.prisma.organizationUserInvite.update({
      where: { id: inviteId },
      data: {
        tokenHash: hash,
        tokenLookup,
        expiresAt,
        revokedAt: null,
      },
      include: {
        organization: { select: { companyName: true } },
        invitedBy: { select: { id: true, name: true, email: true } },
      },
    });

    const inviteUrl = this.buildInviteUrl(plain);
    await this.mail.sendOrganizationInvite({
      to: updated.email,
      organizationName: updated.organization.companyName,
      inviteUrl,
      expiresAt,
    });

    void this.userAudit.record({
      organizationId: orgId,
      actorUserId,
      auditAction: UserAccessAuditAction.USER_INVITE_RESENT,
      targetInviteId: inviteId,
      description: `Einladung an ${updated.email} erneut versendet`,
    });

    return {
      ...this.mapInvite(updated, { includeToken: false }),
      inviteToken: plain,
      inviteUrl,
    };
  }

  async revokeInvite(
    orgId: string,
    inviteId: string,
    actorUserId?: string,
    audit = true,
  ) {
    const invite = await this.findInviteOrThrow(orgId, inviteId);
    if (invite.status !== OrganizationInviteStatus.PENDING) {
      throw new BadRequestException('Only pending invites can be revoked');
    }

    const updated = await this.prisma.organizationUserInvite.update({
      where: { id: inviteId },
      data: {
        status: OrganizationInviteStatus.REVOKED,
        revokedAt: new Date(),
      },
    });

    if (audit && actorUserId) {
      void this.userAudit.record({
        organizationId: orgId,
        actorUserId,
        auditAction: UserAccessAuditAction.USER_INVITE_REVOKED,
        targetInviteId: inviteId,
        description: `Einladung an ${invite.email} widerrufen`,
      });
    }

    return this.mapInvite(updated, { includeToken: false });
  }

  async validateInviteToken(token: string) {
    const invite = await this.loadInviteByToken(token);
    if (!invite) {
      return { valid: false, reason: 'INVALID' as const };
    }
    if (invite.status !== OrganizationInviteStatus.PENDING) {
      return { valid: false, reason: invite.status, invite: this.mapPublicInvite(invite) };
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      await this.markExpired(invite.id);
      return { valid: false, reason: 'EXPIRED' as const };
    }
    const userExists = !!(await this.prisma.user.findUnique({
      where: { email: invite.email },
      select: { id: true },
    }));
    return {
      valid: true,
      requiresPassword: !userExists,
      invite: this.mapPublicInvite(invite),
    };
  }

  async acceptInvite(dto: AcceptInviteDto) {
    const invite = await this.loadInviteByToken(dto.token);
    if (!invite) throw new BadRequestException('Invalid invite token');
    if (invite.status !== OrganizationInviteStatus.PENDING) {
      throw new BadRequestException(`Invite is ${invite.status.toLowerCase()}`);
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      await this.markExpired(invite.id);
      throw new BadRequestException('Invite has expired');
    }

    const valid = await verifyInviteToken(dto.token, invite.tokenHash);
    if (!valid) throw new BadRequestException('Invalid invite token');

    let user = await this.prisma.user.findUnique({
      where: { email: invite.email },
    });
    const wasNewUser = !user;
    let previousMembershipStatus: MembershipStatus | null = null;

    if (!user) {
      if (!dto.password || dto.password.length < MIN_USER_PASSWORD_LENGTH) {
        throw new BadRequestException(
          `Password is required (min ${MIN_USER_PASSWORD_LENGTH} characters)`,
        );
      }
      const passwordHash = await bcrypt.hash(dto.password, 10);
      const fullName = [dto.firstName, dto.lastName].filter(Boolean).join(' ');
      user = await this.prisma.user.create({
        data: {
          email: invite.email,
          firstName: dto.firstName?.trim() || null,
          lastName: dto.lastName?.trim() || null,
          name: fullName || null,
          passwordHash,
          mustChangePassword: false,
          status: UserStatus.ACTIVE,
        },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const existingMembership = await tx.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: user!.id,
            organizationId: invite.organizationId,
          },
        },
      });
      previousMembershipStatus = existingMembership?.status ?? null;

      const membershipData = {
        role: invite.membershipRole,
        organizationRoleId: invite.organizationRoleId,
        roleLabel: invite.roleLabel,
        stationScope: invite.stationScope,
        stationIds: invite.stationIds ?? Prisma.JsonNull,
        department: invite.department,
        position: invite.position,
        permissions: invite.permissions ?? Prisma.JsonNull,
        fieldAgentAccess: invite.fieldAgentAccess,
        status: MembershipStatus.ACTIVE,
      };

      if (existingMembership) {
        if (
          existingMembership.role === MembershipRole.ORG_ADMIN &&
          invite.membershipRole !== MembershipRole.ORG_ADMIN
        ) {
          const others = await tx.organizationMembership.count({
            where: {
              organizationId: invite.organizationId,
              role: MembershipRole.ORG_ADMIN,
              status: MembershipStatus.ACTIVE,
              userId: { not: user!.id },
            },
          });
          if (others === 0) {
            throw new BadRequestException(LAST_ORG_ADMIN_MESSAGE);
          }
        }
        await tx.organizationMembership.update({
          where: { id: existingMembership.id },
          data: membershipData,
        });
      } else {
        await tx.organizationMembership.create({
          data: {
            userId: user!.id,
            organizationId: invite.organizationId,
            ...membershipData,
          },
        });
      }

      await tx.organizationUserInvite.update({
        where: { id: invite.id },
        data: {
          status: OrganizationInviteStatus.ACCEPTED,
          acceptedAt: new Date(),
          acceptedByUserId: user!.id,
        },
      });
    });

    void this.userAudit.record({
      organizationId: invite.organizationId,
      actorUserId: user.id,
      auditAction: UserAccessAuditAction.USER_INVITE_ACCEPTED,
      targetInviteId: invite.id,
      targetUserId: user.id,
      description: `Einladung angenommen von ${invite.email}`,
    });

    if (wasNewUser) {
      void this.userAudit.record({
        organizationId: invite.organizationId,
        actorUserId: user.id,
        auditAction: UserAccessAuditAction.USER_CREATED,
        targetUserId: user.id,
        description: `Benutzer ${invite.email} erstellt`,
      });
    } else if (previousMembershipStatus === MembershipStatus.REMOVED) {
      void this.userAudit.record({
        organizationId: invite.organizationId,
        actorUserId: user.id,
        auditAction: UserAccessAuditAction.USER_REACTIVATED,
        targetUserId: user.id,
        description: `Benutzer ${invite.email} der Organisation beigetreten`,
      });
    }

    return {
      accepted: true,
      userId: user.id,
      organizationId: invite.organizationId,
      email: user.email,
    };
  }

  async getUserSecurityActivity(orgId: string, userId: string) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId: orgId, userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            lastLoginAt: true,
            mustChangePassword: true,
          },
        },
        organizationRole: { select: { id: true, name: true } },
      },
    });
    if (!membership) throw new NotFoundException('User not found in organization');

    const pendingInvite = await this.prisma.organizationUserInvite.findFirst({
      where: {
        organizationId: orgId,
        email: membership.user.email,
        status: OrganizationInviteStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });

    const auditTimeline = await this.prisma.activityLog.findMany({
      where: {
        organizationId: orgId,
        OR: [{ entityId: userId }, { userId }],
        entity: {
          in: [
            ActivityEntity.USER,
            ActivityEntity.ORGANIZATION_INVITE,
            ActivityEntity.ORGANIZATION_ROLE,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    return {
      userId,
      email: membership.user.email,
      lastLoginAt: membership.user.lastLoginAt?.toISOString() ?? null,
      mustChangePassword: membership.user.mustChangePassword,
      membershipStatus: membership.status,
      organizationRole: membership.organizationRole
        ? { id: membership.organizationRole.id, name: membership.organizationRole.name }
        : null,
      inviteStatus: pendingInvite?.status ?? null,
      invitedAt: pendingInvite?.createdAt.toISOString() ?? null,
      twoFactorEnabled: null,
      activeSessionCount: null,
      auditTimeline: auditTimeline.map((row) => ({
        id: row.id,
        action: row.action,
        entity: row.entity,
        description: row.description,
        auditAction:
          (row.metaJson as Record<string, unknown> | null)?.auditAction ?? null,
        createdAt: row.createdAt.toISOString(),
        level: row.level,
      })),
    };
  }

  private async loadInviteByToken(token: string) {
    const lookup = inviteTokenLookupKey(token);
    const invite = await this.prisma.organizationUserInvite.findUnique({
      where: { tokenLookup: lookup },
      include: {
        organization: { select: { id: true, companyName: true } },
        organizationRole: { select: { id: true, name: true } },
      },
    });
    if (!invite) return null;
    return invite;
  }

  private async markExpired(inviteId: string) {
    await this.prisma.organizationUserInvite.update({
      where: { id: inviteId },
      data: { status: OrganizationInviteStatus.EXPIRED },
    });
  }

  private async findInviteOrThrow(orgId: string, inviteId: string) {
    const invite = await this.prisma.organizationUserInvite.findFirst({
      where: { id: inviteId, organizationId: orgId },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    return invite;
  }

  private buildInviteUrl(plainToken: string): string {
    const base =
      process.env.APP_PUBLIC_URL?.trim() ||
      process.env.FRONTEND_URL?.trim() ||
      'http://localhost:5173';
    return `${base.replace(/\/$/, '')}/accept-invite?token=${encodeURIComponent(plainToken)}`;
  }

  private mapPublicInvite(invite: {
    id: string;
    email: string;
    membershipRole: MembershipRole;
    status: OrganizationInviteStatus;
    expiresAt: Date;
    organization: { companyName: string };
    organizationRole?: { name: string } | null;
    roleLabel: string | null;
  }) {
    return {
      id: invite.id,
      email: invite.email,
      organizationName: invite.organization.companyName,
      membershipRole: invite.membershipRole,
      roleLabel: invite.roleLabel ?? invite.organizationRole?.name ?? null,
      status: invite.status,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  private mapInvite(
    invite: {
      id: string;
      organizationId: string;
      email: string;
      membershipRole: MembershipRole;
      status: OrganizationInviteStatus;
      expiresAt: Date;
      createdAt: Date;
      updatedAt: Date;
      acceptedAt: Date | null;
      revokedAt: Date | null;
      roleLabel: string | null;
      department: string | null;
      position: string | null;
      stationScope: string | null;
      stationIds: unknown;
      organizationRoleId: string | null;
      invitedBy?: { id: string; name: string | null; email: string } | null;
      organizationRole?: { id: string; name: string } | null;
    },
    _opts: { includeToken: boolean },
  ) {
    const stationIds = Array.isArray(invite.stationIds)
      ? invite.stationIds.filter((id): id is string => typeof id === 'string' && !!id.trim())
      : [];
    return {
      id: invite.id,
      organizationId: invite.organizationId,
      email: invite.email,
      membershipRole: invite.membershipRole,
      organizationRoleId: invite.organizationRoleId,
      organizationRoleName: invite.organizationRole?.name ?? null,
      roleLabel: invite.roleLabel,
      department: invite.department,
      position: invite.position,
      stationScope: invite.stationScope,
      stationIds,
      status: invite.status,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
      updatedAt: invite.updatedAt.toISOString(),
      acceptedAt: invite.acceptedAt?.toISOString() ?? null,
      revokedAt: invite.revokedAt?.toISOString() ?? null,
      invitedBy: invite.invitedBy
        ? {
            id: invite.invitedBy.id,
            name: invite.invitedBy.name,
            email: invite.invitedBy.email,
          }
        : null,
    };
  }
}
