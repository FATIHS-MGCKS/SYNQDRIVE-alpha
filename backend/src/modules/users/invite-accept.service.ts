import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ActivityAction,
  ActivityEntity,
  MembershipRole,
  MembershipStatus,
  OrganizationInviteStatus,
  Prisma,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@shared/database/prisma.service';
import {
  LAST_ORG_ADMIN_MESSAGE,
  MIN_USER_PASSWORD_LENGTH,
} from '@shared/auth/permission.constants';
import type { OptionalAuthIdentity } from '@shared/auth/optional-auth.util';
import { verifyInviteToken, inviteTokenLookupKey } from './utils/invite-token.util';
import {
  identityEmailsMatch,
  normalizeIdentityEmail,
} from './utils/identity-email.util';
import {
  canActivateMembershipFromInvite,
  INVITE_ACCEPT_ERROR,
  isPrivilegedInviteRole,
  requiresRejoinAcknowledgement,
} from './policies/invite-accept.policy';
import { UserAccessAuditAction } from './user-access-audit.service';
import { IamAuditService } from './iam-audit.service';
import { buildRoleSummary } from './utils/invite-admin-response.util';
import type { AcceptInviteDto } from './dto/organization-invite.dto';

type LoadedInvite = NonNullable<Awaited<ReturnType<InviteAcceptService['loadInviteByToken']>>>;

@Injectable()
export class InviteAcceptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly iamAudit: IamAuditService,
  ) {}

  async validateInviteToken(token: string) {
    const invite = await this.loadInviteByToken(token);
    if (!invite) {
      return { valid: false as const, reason: 'INVALID' as const };
    }
    if (invite.status !== OrganizationInviteStatus.PENDING) {
      return {
        valid: false as const,
        reason: invite.status,
        invite: this.mapPublicInvitePreview(invite, null),
      };
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      await this.markExpired(invite.id);
      return { valid: false as const, reason: 'EXPIRED' as const };
    }

    const valid = await verifyInviteToken(token, invite.tokenHash);
    if (!valid) {
      return { valid: false as const, reason: 'INVALID' as const };
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: invite.email },
      select: { id: true, email: true },
    });
    const existingMembership = existingUser
      ? await this.prisma.organizationMembership.findUnique({
          where: {
            userId_organizationId: {
              userId: existingUser.id,
              organizationId: invite.organizationId,
            },
          },
          select: { status: true },
        })
      : null;

    const privilegedRole = isPrivilegedInviteRole(invite);
    const requiresRejoin = requiresRejoinAcknowledgement(existingMembership?.status);

    return {
      valid: true as const,
      requiresPassword: !existingUser,
      requiresAuthentication: Boolean(existingUser),
      requiresExplicitConfirmation: true,
      privilegedRole,
      requiresStepUp: privilegedRole,
      mfaRequired: privilegedRole,
      mfaEnabled: null as boolean | null,
      requiresRejoinAcknowledgement: requiresRejoin,
      previousMembershipStatus: existingMembership?.status ?? null,
      invite: this.mapPublicInvitePreview(invite, existingMembership?.status ?? null),
    };
  }

  async acceptInvite(dto: AcceptInviteDto, auth: OptionalAuthIdentity | null) {
    if (!dto.confirmed) {
      throw new BadRequestException({
        code: INVITE_ACCEPT_ERROR.CONFIRMATION_REQUIRED,
        message: 'Explicit acceptance confirmation is required',
      });
    }

    const inviteRecord = await this.loadInviteByToken(dto.token);
    if (!inviteRecord) {
      throw new BadRequestException({
        code: INVITE_ACCEPT_ERROR.INVALID_TOKEN,
        message: 'Invalid invite token',
      });
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: inviteRecord.email },
    });

    if (inviteRecord.status === OrganizationInviteStatus.ACCEPTED) {
      if (existingUser && inviteRecord.acceptedByUserId === existingUser.id) {
        return {
          accepted: true,
          idempotent: true,
          userId: existingUser.id,
          organizationId: inviteRecord.organizationId,
          email: existingUser.email,
        };
      }
      throw new BadRequestException({
        code: INVITE_ACCEPT_ERROR.ALREADY_CONSUMED,
        message: 'Invite has already been accepted',
      });
    }

    const invite = await this.loadPendingInvite(dto.token, inviteRecord);

    if (existingUser) {
      if (!auth?.userId) {
        throw new UnauthorizedException({
          code: INVITE_ACCEPT_ERROR.AUTHENTICATION_REQUIRED,
          message: 'Authentication required to accept invite for an existing account',
        });
      }
      if (!identityEmailsMatch(auth.email, invite.email)) {
        throw new ForbiddenException({
          code: INVITE_ACCEPT_ERROR.IDENTITY_MISMATCH,
          message: 'Authenticated identity does not match invite email',
        });
      }
    } else if (auth && !identityEmailsMatch(auth.email, invite.email)) {
      throw new ForbiddenException({
        code: INVITE_ACCEPT_ERROR.IDENTITY_MISMATCH,
        message: 'Sign out before accepting this invite with a new account',
      });
    }

    if (!existingUser) {
      if (!dto.password || dto.password.length < MIN_USER_PASSWORD_LENGTH) {
        throw new BadRequestException(
          `Password is required (min ${MIN_USER_PASSWORD_LENGTH} characters)`,
        );
      }
    }

    const privilegedRole = isPrivilegedInviteRole(invite);
    if (privilegedRole && !dto.acknowledgePrivilegedRole) {
      throw new BadRequestException({
        code: INVITE_ACCEPT_ERROR.PRIVILEGED_ROLE_ACK_REQUIRED,
        message: 'Privileged role assignment requires explicit acknowledgement',
      });
    }

    const existingMembership = existingUser
      ? await this.prisma.organizationMembership.findUnique({
          where: {
            userId_organizationId: {
              userId: existingUser.id,
              organizationId: invite.organizationId,
            },
          },
        })
      : null;

    if (existingMembership?.status === MembershipStatus.ACTIVE) {
      throw new BadRequestException('User is already an active member of this organization');
    }

    if (
      requiresRejoinAcknowledgement(existingMembership?.status) &&
      !dto.acknowledgeRejoin
    ) {
      throw new BadRequestException({
        code: INVITE_ACCEPT_ERROR.REJOIN_ACK_REQUIRED,
        message: 'Explicit rejoin acknowledgement is required for removed or suspended memberships',
      });
    }

    if (
      !canActivateMembershipFromInvite(
        existingMembership?.status ?? null,
        Boolean(dto.acknowledgeRejoin),
      )
    ) {
      throw new BadRequestException('Membership cannot be activated from this invite');
    }

    const wasNewUser = !existingUser;
    const previousMembershipStatus = existingMembership?.status ?? null;
    let user = existingUser;

    const outboxIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      if (!user) {
        const passwordHash = await bcrypt.hash(dto.password!, 10);
        const fullName = [dto.firstName, dto.lastName].filter(Boolean).join(' ');
        user = await tx.user.create({
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
          tokenHash: await bcrypt.hash(`consumed:${invite.id}:${Date.now()}`, 10),
        },
      });

      const acceptedOutbox = await this.iamAudit.enqueueInTransaction(tx, {
        organizationId: invite.organizationId,
        idempotencyKey: `invite-accept:${invite.id}`,
        eventType: UserAccessAuditAction.USER_INVITE_ACCEPTED,
        actorUserId: user!.id,
        subjectUserId: user!.id,
        targetInviteId: invite.id,
        description: 'Einladung angenommen',
        after: {
          membershipRole: invite.membershipRole,
          organizationRoleId: invite.organizationRoleId,
          privilegedRole,
          previousMembershipStatus,
        },
        metadata: {
          privilegedRole,
          previousMembershipStatus,
          rejoinAcknowledged: Boolean(dto.acknowledgeRejoin),
        },
        level: privilegedRole ? 'WARN' : 'INFO',
      });
      outboxIds.push(acceptedOutbox.id);

      if (wasNewUser) {
        const createdOutbox = await this.iamAudit.enqueueInTransaction(tx, {
          organizationId: invite.organizationId,
          idempotencyKey: `invite-accept-user-created:${invite.id}`,
          eventType: UserAccessAuditAction.USER_CREATED,
          actorUserId: user!.id,
          subjectUserId: user!.id,
          description: 'Benutzer durch Einladung erstellt',
        });
        outboxIds.push(createdOutbox.id);
      } else if (requiresRejoinAcknowledgement(previousMembershipStatus)) {
        const rejoinOutbox = await this.iamAudit.enqueueInTransaction(tx, {
          organizationId: invite.organizationId,
          idempotencyKey: `invite-accept-rejoin:${invite.id}`,
          eventType: UserAccessAuditAction.USER_REACTIVATED,
          actorUserId: user!.id,
          subjectUserId: user!.id,
          description: 'Benutzer durch Einladung der Organisation erneut beigetreten',
          before: { membershipStatus: previousMembershipStatus },
          after: { membershipStatus: MembershipStatus.ACTIVE },
          level: 'WARN',
        });
        outboxIds.push(rejoinOutbox.id);
      }

      await tx.activityLog.create({
        data: {
          organizationId: invite.organizationId,
          userId: user!.id,
          action: ActivityAction.CREATE,
          entity: ActivityEntity.ORGANIZATION_INVITE,
          entityId: invite.id,
          description: 'Einladung angenommen — Benachrichtigung erzeugt',
          level: privilegedRole ? 'WARN' : 'INFO',
          metaJson: {
            notificationType: 'INVITE_ACCEPTED',
            inviteId: invite.id,
            userId: user!.id,
            privilegedRole,
          },
        },
      });
    });

    await this.iamAudit.processOutboxIds(outboxIds);

    return {
      accepted: true,
      idempotent: false,
      userId: user!.id,
      organizationId: invite.organizationId,
      email: user!.email,
      privilegedRole,
      stepUpRequired: privilegedRole,
      mfaRequired: privilegedRole,
    };
  }

  private async loadPendingInvite(token: string, inviteRecord?: Awaited<ReturnType<InviteAcceptService['loadInviteByToken']>>) {
    const invite = inviteRecord ?? (await this.loadInviteByToken(token));
    if (!invite) {
      throw new BadRequestException({
        code: INVITE_ACCEPT_ERROR.INVALID_TOKEN,
        message: 'Invalid invite token',
      });
    }
    if (invite.status !== OrganizationInviteStatus.PENDING) {
      throw new BadRequestException({
        code: INVITE_ACCEPT_ERROR.ALREADY_CONSUMED,
        message: `Invite is ${invite.status.toLowerCase()}`,
      });
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      await this.markExpired(invite.id);
      throw new BadRequestException('Invite has expired');
    }
    const valid = await verifyInviteToken(token, invite.tokenHash);
    if (!valid) {
      throw new BadRequestException({
        code: INVITE_ACCEPT_ERROR.INVALID_TOKEN,
        message: 'Invalid invite token',
      });
    }
    return invite;
  }

  private async loadInviteByToken(token: string) {
    const lookup = inviteTokenLookupKey(token);
    return this.prisma.organizationUserInvite.findUnique({
      where: { tokenLookup: lookup },
      include: {
        organization: { select: { id: true, companyName: true } },
        organizationRole: { select: { id: true, name: true } },
      },
    });
  }

  private async markExpired(inviteId: string) {
    await this.prisma.organizationUserInvite.update({
      where: { id: inviteId },
      data: { status: OrganizationInviteStatus.EXPIRED },
    });
  }

  private mapPublicInvitePreview(
    invite: LoadedInvite,
    previousMembershipStatus: MembershipStatus | null,
  ) {
    const stationIds = Array.isArray(invite.stationIds)
      ? invite.stationIds.filter((id): id is string => typeof id === 'string')
      : [];
    const privilegedRole = isPrivilegedInviteRole(invite);
    return {
      id: invite.id,
      email: invite.email,
      organizationId: invite.organizationId,
      organizationName: invite.organization.companyName,
      membershipRole: invite.membershipRole,
      roleLabel: invite.roleLabel ?? invite.organizationRole?.name ?? null,
      roleSummary: buildRoleSummary({
        membershipRole: invite.membershipRole,
        roleLabel: invite.roleLabel,
        organizationRoleName: invite.organizationRole?.name ?? null,
      }),
      status: invite.status,
      expiresAt: invite.expiresAt.toISOString(),
      stationScope: invite.stationScope,
      stationIds,
      privilegedRole,
      requiresStepUp: privilegedRole,
      mfaRequired: privilegedRole,
      previousMembershipStatus,
      requiresRejoinAcknowledgement: requiresRejoinAcknowledgement(previousMembershipStatus),
    };
  }
}
