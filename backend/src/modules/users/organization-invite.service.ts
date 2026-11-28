import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InviteEmailOutboxStatus,
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
  mapOutboxToDeliveryStatus,
  maskRecipientEmail,
  toInviteAdminView,
  type OrganizationInviteAdminView,
} from './utils/invite-admin-response.util';
import { normalizeIdentityEmail } from './utils/identity-email.util';
import { acquireInviteDeliveryContinuityLock } from '@modules/auth/refresh-token-session-concurrency';
import type { CreateOrganizationInviteDto } from './dto/organization-invite.dto';
import type { Prisma as PrismaNamespace } from '@prisma/client';

type ResolvedInviteCreateFields = {
  email: string;
  membershipRole: MembershipRole;
  permissions: ReturnType<typeof normalizeMembershipPermissions> | null;
  stationScope: string | null;
  stationIds: string[] | null;
  fieldAgentAccess: boolean;
  roleLabel: string | null;
  organizationRoleId: string | null;
  department: string | null;
  position: string | null;
};

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

    const fields = await this.resolveInviteCreateFields(orgId, dto, actor);
    const email = fields.email;
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

    const { plain, hash } = generateInviteToken();
    const tokenLookup = inviteTokenLookupKey(plain);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.roleService.inviteExpiryDays);

    const outboxIds: string[] = [];
    let inviteEmailOutboxId: string | null = null;
    const invite = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organizationUserInvite.create({
        data: {
          organizationId: orgId,
          email,
          membershipRole: fields.membershipRole,
          organizationRoleId: fields.organizationRoleId,
          permissions: fields.permissions
            ? (fields.permissions as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          stationScope: fields.stationScope,
          stationIds: fields.stationIds ? fields.stationIds : Prisma.JsonNull,
          fieldAgentAccess: fields.fieldAgentAccess,
          department: fields.department,
          position: fields.position,
          roleLabel: fields.roleLabel,
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
          membershipRole: fields.membershipRole,
          organizationRoleId: fields.organizationRoleId,
        },
      });
      outboxIds.push(outbox.id);
      const delivery = await this.inviteDelivery.enqueueInviteDeliveryInTransaction(tx, {
        organizationId: orgId,
        inviteId: created.id,
        plainToken: plain,
        sentByUserId: invitedByUserId,
        idempotencyKey: `invite:create:${created.id}`,
      });
      inviteEmailOutboxId = delivery.outboxId;
      return created;
    });

    await this.inviteDelivery.processOutboxIds([inviteEmailOutboxId]);
    const deliveryRow = inviteEmailOutboxId
      ? await this.inviteOutbox.findById(inviteEmailOutboxId)
      : null;

    await this.iamAudit.processOutboxIds(outboxIds);

    return this.toAdminViewFromInvite(invite, deliveryRow?.status ?? null);
  }

  /**
   * Persist invite row (+ IAM audit intent) inside an existing transaction — delivery is post-commit.
   */
  async persistNewInviteInTransaction(
    tx: Prisma.TransactionClient,
    orgId: string,
    dto: CreateOrganizationInviteDto,
    invitedByUserId: string,
    actor: PermissionActor = {},
    options?: {
      skipManagePermissionCheck?: boolean;
      provisionedUserId?: string;
      provisionedMembershipId?: string;
    },
  ): Promise<{
    inviteId: string;
    plainToken: string;
    iamAuditOutboxId?: string;
    inviteEmailOutboxId?: string | null;
  }> {
    await this.roleService.ensureDefaultRoles(orgId, invitedByUserId, tx as never);
    const fields = await this.resolveInviteCreateFields(orgId, dto, actor, {
      skipManagePermissionCheck: options?.skipManagePermissionCheck,
      db: tx,
    });
    const email = fields.email;
    const existingPending = await tx.organizationUserInvite.findFirst({
      where: {
        organizationId: orgId,
        email,
        status: OrganizationInviteStatus.PENDING,
      },
    });
    if (existingPending) {
      await tx.organizationUserInvite.update({
        where: { id: existingPending.id },
        data: { status: OrganizationInviteStatus.REVOKED, revokedAt: new Date() },
      });
    }

    const { plain, hash } = generateInviteToken();
    const tokenLookup = inviteTokenLookupKey(plain);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.roleService.inviteExpiryDays);

    const created = await tx.organizationUserInvite.create({
      data: {
        organizationId: orgId,
        email,
        membershipRole: fields.membershipRole,
        organizationRoleId: fields.organizationRoleId,
        permissions: fields.permissions
          ? (fields.permissions as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        stationScope: fields.stationScope,
        stationIds: fields.stationIds ? fields.stationIds : Prisma.JsonNull,
        fieldAgentAccess: fields.fieldAgentAccess,
        department: fields.department,
        position: fields.position,
        roleLabel: fields.roleLabel,
        status: OrganizationInviteStatus.PENDING,
        tokenHash: hash,
        tokenLookup,
        expiresAt,
        invitedByUserId,
        provisionedUserId: options?.provisionedUserId ?? null,
        provisionedMembershipId: options?.provisionedMembershipId ?? null,
      },
    });

    const outbox = await this.iamAudit.enqueueInTransaction(tx, {
      organizationId: orgId,
      idempotencyKey: `invite-created:${created.id}`,
      eventType: UserAccessAuditAction.USER_INVITED,
      actorUserId: invitedByUserId,
      targetInviteId: created.id,
      description: `Einladung an ${maskRecipientEmail(email)} angelegt`,
      metadata: {
        recipientMasked: maskRecipientEmail(email),
        membershipRole: fields.membershipRole,
        organizationRoleId: fields.organizationRoleId,
      },
    });

    const delivery = await this.inviteDelivery.enqueueInviteDeliveryInTransaction(tx, {
      organizationId: orgId,
      inviteId: created.id,
      plainToken: plain,
      sentByUserId: invitedByUserId,
      idempotencyKey: `invite:create:${created.id}`,
    });

    return {
      inviteId: created.id,
      plainToken: plain,
      iamAuditOutboxId: outbox.id,
      inviteEmailOutboxId: delivery.outboxId,
    };
  }

  /**
   * Recover or continue invite email delivery after commit (never logs plaintext tokens).
   */
  async ensureInviteDeliveryContinuity(
    orgId: string,
    inviteId: string,
    sentByUserId: string,
  ): Promise<{
    deliveryRequested: boolean;
    deliveryConfirmed: boolean;
    invitePending: boolean;
  }> {
    const admission = await this.prisma.$transaction(async (tx) => {
      await acquireInviteDeliveryContinuityLock(tx, inviteId);
      const invite = await tx.organizationUserInvite.findFirst({
        where: { id: inviteId, organizationId: orgId },
        select: { id: true, status: true },
      });
      if (!invite) {
        throw new NotFoundException('Invitation not found');
      }
      if (invite.status !== OrganizationInviteStatus.PENDING) {
        return { kind: 'not_pending' as const };
      }
      const existing = await tx.inviteEmailOutbox.findFirst({
        where: { inviteId },
        orderBy: { createdAt: 'desc' },
      });
      if (existing && existing.status !== InviteEmailOutboxStatus.DEAD_LETTER) {
        return { kind: 'replay_outbox' as const, outboxId: existing.id };
      }
      return { kind: 'recover' as const };
    });

    if (admission.kind === 'not_pending') {
      return { deliveryRequested: false, deliveryConfirmed: false, invitePending: false };
    }
    if (admission.kind === 'replay_outbox') {
      await this.inviteDelivery.processOutboxIds([admission.outboxId]);
      const refreshed = await this.inviteOutbox.findById(admission.outboxId);
      const status = mapOutboxToDeliveryStatus(refreshed?.status ?? null);
      return {
        deliveryRequested: true,
        deliveryConfirmed: status === 'SENT',
        invitePending: true,
      };
    }
    return this.enqueueDeliveryAfterInviteTokenRotation(orgId, inviteId, sentByUserId);
  }

  private async enqueueDeliveryAfterInviteTokenRotation(
    orgId: string,
    inviteId: string,
    sentByUserId: string,
  ): Promise<{
    deliveryRequested: boolean;
    deliveryConfirmed: boolean;
    invitePending: boolean;
  }> {
    await this.findInviteOrThrow(orgId, inviteId);
    const { plain, hash } = generateInviteToken();
    const tokenLookup = inviteTokenLookupKey(plain);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.roleService.inviteExpiryDays);

    let recoveryOutboxId: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      await acquireInviteDeliveryContinuityLock(tx, inviteId);
      const current = await tx.organizationUserInvite.findUnique({
        where: { id: inviteId },
        select: { id: true, status: true, email: true },
      });
      if (!current || current.status !== OrganizationInviteStatus.PENDING) {
        return;
      }
      const liveOutbox = await tx.inviteEmailOutbox.findFirst({
        where: {
          inviteId,
          status: { not: InviteEmailOutboxStatus.DEAD_LETTER },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (liveOutbox) {
        recoveryOutboxId = liveOutbox.id;
        return;
      }
      await tx.organizationUserInvite.update({
        where: { id: inviteId },
        data: {
          tokenHash: hash,
          tokenLookup,
          expiresAt,
          revokedAt: null,
        },
      });
      await this.iamAudit.enqueueInTransaction(tx, {
        organizationId: orgId,
        idempotencyKey: `invite-rotated:${inviteId}:${tokenLookup}`,
        eventType: UserAccessAuditAction.USER_INVITE_ROTATED,
        actorUserId: sentByUserId,
        targetInviteId: inviteId,
        description: `Einladungstoken für ${maskRecipientEmail(current.email)} rotiert (Kontinuität)`,
      });
      const delivery = await this.inviteDelivery.enqueueInviteDeliveryInTransaction(tx, {
        organizationId: orgId,
        inviteId,
        plainToken: plain,
        sentByUserId,
        idempotencyKey: `invite:recovery:${inviteId}:${tokenLookup}`,
      });
      recoveryOutboxId = delivery.outboxId;
    });

    if (!recoveryOutboxId) {
      return { deliveryRequested: false, deliveryConfirmed: false, invitePending: false };
    }

    await this.inviteDelivery.processOutboxIds([recoveryOutboxId]);
    const deliveryRow = await this.inviteOutbox.findById(recoveryOutboxId);
    const status = mapOutboxToDeliveryStatus(deliveryRow?.status ?? null);
    return {
      deliveryRequested: status === 'QUEUED' || status === 'SENDING' || status === 'SENT',
      deliveryConfirmed: status === 'SENT',
      invitePending: true,
    };
  }

  async finalizePersistedInviteDelivery(outboxId: string | null | undefined): Promise<{
    deliveryRequested: boolean;
    deliveryConfirmed: boolean;
  }> {
    if (!outboxId) {
      return { deliveryRequested: false, deliveryConfirmed: false };
    }
    await this.inviteDelivery.processOutboxIds([outboxId]);
    const deliveryRow = await this.inviteOutbox.findById(outboxId);
    const status = mapOutboxToDeliveryStatus(deliveryRow?.status ?? null);
    return {
      deliveryRequested: status === 'QUEUED' || status === 'SENDING' || status === 'SENT',
      deliveryConfirmed: status === 'SENT',
    };
  }

  async enqueueDeliveryForPersistedInvite(input: {
    organizationId: string;
    inviteId: string;
    plainToken: string;
    sentByUserId: string;
  }): Promise<{ deliveryRequested: boolean; deliveryConfirmed: boolean }> {
    const { outboxId } = await this.inviteDelivery.enqueueInviteDelivery({
      organizationId: input.organizationId,
      inviteId: input.inviteId,
      plainToken: input.plainToken,
      sentByUserId: input.sentByUserId,
      idempotencyKey: `invite:create:${input.inviteId}`,
    });
    await this.inviteDelivery.processOutboxIds([outboxId]);
    const deliveryRow = outboxId ? await this.inviteOutbox.findById(outboxId) : null;
    const status = mapOutboxToDeliveryStatus(deliveryRow?.status ?? null);
    return {
      deliveryRequested: status === 'QUEUED' || status === 'SENDING' || status === 'SENT',
      deliveryConfirmed: status === 'SENT',
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
      await acquireInviteDeliveryContinuityLock(tx, inviteId);
      const current = await tx.organizationUserInvite.findFirst({
        where: { id: inviteId, organizationId: orgId },
        select: { status: true },
      });
      if (!current || current.status !== OrganizationInviteStatus.PENDING) {
        throw new BadRequestException('Only pending invites can be resent');
      }
      const rotated = await tx.organizationUserInvite.updateMany({
        where: { id: inviteId, organizationId: orgId, status: OrganizationInviteStatus.PENDING },
        data: {
          tokenHash: hash,
          tokenLookup,
          expiresAt,
          revokedAt: null,
        },
      });
      if (rotated.count !== 1) {
        throw new BadRequestException('Only pending invites can be resent');
      }
      const inviteUpdated = await tx.organizationUserInvite.findUniqueOrThrow({
        where: { id: inviteId },
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

      const delivery = await this.inviteDelivery.enqueueInviteDeliveryInTransaction(tx, {
        organizationId: orgId,
        inviteId: inviteUpdated.id,
        plainToken: plain,
        sentByUserId: actorUserId,
        idempotencyKey: `invite:resend:${inviteUpdated.id}:${tokenLookup}`,
      });
      return { invite: inviteUpdated, deliveryOutboxId: delivery.outboxId };
    });

    await this.inviteDelivery.processOutboxIds([updated.deliveryOutboxId]);
    const deliveryRow = updated.deliveryOutboxId
      ? await this.inviteOutbox.findById(updated.deliveryOutboxId)
      : null;
    const inviteView = updated.invite;

    await this.iamAudit.processOutboxIds(outboxIds);

    return this.toAdminViewFromInvite(inviteView, deliveryRow?.status ?? null);
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
      await acquireInviteDeliveryContinuityLock(tx, inviteId);
      const admitted = await tx.organizationUserInvite.updateMany({
        where: { id: inviteId, organizationId: orgId, status: OrganizationInviteStatus.PENDING },
        data: {
          status: OrganizationInviteStatus.REVOKED,
          revokedAt: new Date(),
        },
      });
      if (admitted.count !== 1) {
        throw new BadRequestException('Only pending invites can be revoked');
      }
      const inviteUpdated = await tx.organizationUserInvite.findUniqueOrThrow({
        where: { id: inviteId },
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

  private async resolveInviteCreateFields(
    orgId: string,
    dto: CreateOrganizationInviteDto,
    actor: PermissionActor,
    opts?: {
      skipManagePermissionCheck?: boolean;
      db?: PrismaNamespace.TransactionClient | PrismaService;
    },
  ): Promise<ResolvedInviteCreateFields> {
    const db = opts?.db ?? this.prisma;
    const email = normalizeIdentityEmail(dto.email);

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
      !opts?.skipManagePermissionCheck &&
      (membershipRole === MembershipRole.ORG_ADMIN || dto.permissions !== undefined)
    ) {
      await assertMembershipPermission(
        db as PrismaService,
        actor,
        orgId,
        USERS_ROLES_MODULE,
        'manage',
      );
    }

    return {
      email,
      membershipRole,
      permissions: permissions ? permissions : null,
      stationScope,
      stationIds,
      fieldAgentAccess,
      roleLabel,
      organizationRoleId,
      department: dto.department?.trim() || null,
      position: dto.position?.trim() || null,
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
