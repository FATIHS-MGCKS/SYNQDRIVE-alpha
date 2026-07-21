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
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { USERS_ROLES_MODULE } from '@shared/auth/permission.constants';
import {
  assertMembershipPermission,
  normalizeMembershipPermissions,
  type PermissionActor,
} from '@shared/auth/permission.util';
import { OrganizationRoleService } from './organization-role.service';
import { UserAccessAuditAction } from './user-access-audit.service';
import { IamAuditService } from './iam-audit.service';
import { InviteEmailDeliveryService } from './invite-email-delivery.service';
import { InviteEmailOutboxRepository } from './invite-email-outbox.repository';
import { InviteRateLimitService } from './invite-rate-limit.service';
import {
  generateInviteToken,
  inviteTokenLookupKey,
} from './utils/invite-token.util';
import {
  maskRecipientEmail,
  toInviteAdminView,
  type OrganizationInviteAdminView,
} from './utils/invite-admin-response.util';
import { normalizeIdentityEmail } from './utils/identity-email.util';
import type { CreateOrganizationInviteDto } from './dto/organization-invite.dto';

@Injectable()
export class OrganizationInviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleService: OrganizationRoleService,
    private readonly iamAudit: IamAuditService,
    private readonly inviteRateLimit: InviteRateLimitService,
    private readonly inviteDelivery: InviteEmailDeliveryService,
    private readonly inviteOutbox: InviteEmailOutboxRepository,
  ) {}

  async createInvite(
    orgId: string,
    dto: CreateOrganizationInviteDto,
    invitedByUserId: string,
    actor: PermissionActor = {},
  ) {
    await this.roleService.ensureDefaultRoles(orgId, invitedByUserId);

    const email = normalizeIdentityEmail(dto.email);
    await this.inviteRateLimit.assertCreateAllowed(orgId, invitedByUserId, email);

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

    const outboxIds: string[] = [];
    const invite = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organizationUserInvite.create({
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

      const outbox = await this.iamAudit.enqueueInTransaction(tx, {
        organizationId: orgId,
        idempotencyKey: `invite-created:${created.id}`,
        eventType: UserAccessAuditAction.USER_INVITED,
        actorUserId: invitedByUserId,
        targetInviteId: created.id,
        description: `Einladung an ${maskRecipientEmail(email)} versendet`,
        after: this.toAdminViewFromInvite(created, null),
        metadata: {
          recipientMasked: maskRecipientEmail(email),
          membershipRole,
          organizationRoleId,
        },
      });
      outboxIds.push(outbox.id);
      return created;
    });

    const { outboxId } = await this.inviteDelivery.enqueueInviteDelivery({
      organizationId: orgId,
      inviteId: invite.id,
      plainToken: plain,
      sentByUserId: invitedByUserId,
      idempotencyKey: `invite:create:${invite.id}`,
    });
    await this.inviteDelivery.processOutboxIds([outboxId]);
    const deliveryRow = outboxId ? await this.inviteOutbox.findById(outboxId) : null;

    await this.iamAudit.processOutboxIds(outboxIds);

    return this.toAdminViewFromInvite(invite, deliveryRow?.status ?? null);
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
    const deliveryMap = await this.inviteOutbox.findLatestByInviteIds(invites.map((i) => i.id));
    return invites.map((invite) =>
      this.toAdminViewFromInvite(
        invite,
        deliveryMap.get(invite.id)?.status ?? null,
      ),
    );
  }

  async resendInvite(orgId: string, inviteId: string, actorUserId: string) {
    const invite = await this.findInviteOrThrow(orgId, inviteId);
    if (invite.status !== OrganizationInviteStatus.PENDING) {
      throw new BadRequestException('Only pending invites can be resent');
    }

    await this.inviteRateLimit.assertResendAllowed(orgId, actorUserId, invite.email);

    const { plain, hash } = generateInviteToken();
    const tokenLookup = inviteTokenLookupKey(plain);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.roleService.inviteExpiryDays);

    const outboxIds: string[] = [];
    const updated = await this.prisma.$transaction(async (tx) => {
      const inviteUpdated = await tx.organizationUserInvite.update({
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
          organizationRole: { select: { id: true, name: true } },
        },
      });

      const rotatedOutbox = await this.iamAudit.enqueueInTransaction(tx, {
        organizationId: orgId,
        idempotencyKey: `invite-rotated:${inviteId}:${tokenLookup}`,
        eventType: UserAccessAuditAction.USER_INVITE_ROTATED,
        actorUserId,
        targetInviteId: inviteId,
        description: `Einladungstoken für ${maskRecipientEmail(inviteUpdated.email)} rotiert`,
      });
      outboxIds.push(rotatedOutbox.id);

      const resentOutbox = await this.iamAudit.enqueueInTransaction(tx, {
        organizationId: orgId,
        idempotencyKey: `invite-resent:${inviteId}:${tokenLookup}`,
        eventType: UserAccessAuditAction.USER_INVITE_RESENT,
        actorUserId,
        targetInviteId: inviteId,
        description: `Einladung an ${maskRecipientEmail(inviteUpdated.email)} erneut versendet`,
      });
      outboxIds.push(resentOutbox.id);

      return inviteUpdated;
    });

    const { outboxId } = await this.inviteDelivery.enqueueInviteDelivery({
      organizationId: orgId,
      inviteId: updated.id,
      plainToken: plain,
      sentByUserId: actorUserId,
      idempotencyKey: `invite:resend:${updated.id}:${tokenLookup}`,
    });
    await this.inviteDelivery.processOutboxIds([outboxId]);
    const deliveryRow = outboxId ? await this.inviteOutbox.findById(outboxId) : null;

    await this.iamAudit.processOutboxIds(outboxIds);

    return this.toAdminViewFromInvite(updated, deliveryRow?.status ?? null);
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

    const outboxIds: string[] = [];
    const updated = await this.prisma.$transaction(async (tx) => {
      const inviteUpdated = await tx.organizationUserInvite.update({
        where: { id: inviteId },
        data: {
          status: OrganizationInviteStatus.REVOKED,
          revokedAt: new Date(),
        },
      });

      if (audit && actorUserId) {
        const outbox = await this.iamAudit.enqueueInTransaction(tx, {
          organizationId: orgId,
          idempotencyKey: `invite-revoked:${inviteId}`,
          eventType: UserAccessAuditAction.USER_INVITE_REVOKED,
          actorUserId,
          targetInviteId: inviteId,
          description: `Einladung an ${maskRecipientEmail(invite.email)} widerrufen`,
        });
        outboxIds.push(outbox.id);
      }

      return inviteUpdated;
    });

    await this.iamAudit.processOutboxIds(outboxIds);

    return this.toAdminViewFromInvite(updated, null);
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

  private async findInviteOrThrow(orgId: string, inviteId: string) {
    const invite = await this.prisma.organizationUserInvite.findFirst({
      where: { id: inviteId, organizationId: orgId },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    return invite;
  }

  private toAdminViewFromInvite(
    invite: {
      id: string;
      email: string;
      membershipRole: MembershipRole;
      status: OrganizationInviteStatus;
      expiresAt: Date;
      roleLabel: string | null;
      organizationRole?: { name: string } | null;
    },
    deliveryOutboxStatus:
      | import('@prisma/client').InviteEmailOutboxStatus
      | null
      | 'QUEUED',
  ): OrganizationInviteAdminView {
    return toInviteAdminView({
      id: invite.id,
      email: invite.email,
      status: invite.status,
      expiresAt: invite.expiresAt,
      membershipRole: invite.membershipRole,
      roleLabel: invite.roleLabel,
      organizationRoleName: invite.organizationRole?.name ?? null,
      deliveryOutboxStatus:
        deliveryOutboxStatus === 'QUEUED' ? null : deliveryOutboxStatus,
    });
  }
}
