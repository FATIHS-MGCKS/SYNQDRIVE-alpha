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
  OrganizationStatus,
  Prisma,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { acquireCanonicalSecurityMutationLocks } from '@modules/auth/iam-security-mutation-concurrency';
import { acquireInviteDeliveryContinuityLock } from '@modules/auth/refresh-token-session-concurrency';
import { UserAccessAuthorityService } from '@shared/auth/user-access-authority.service';
import type { AccessJwtPayload } from '@shared/auth/user-access-authority.types';
import * as jwt from 'jsonwebtoken';
import { acquireInviteAcceptMutationLocks } from './iam-identity-mutation-lock-order';
import { PrismaService } from '@shared/database/prisma.service';
import { LAST_ORG_ADMIN_MESSAGE } from '@shared/auth/permission.constants';
import { PasswordPolicyService } from '@shared/auth/password-policy.service';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import type { OptionalAuthIdentity } from '@shared/auth/optional-auth.util';
import { verifyInviteToken, inviteTokenLookupKey } from './utils/invite-token.util';
import { identityEmailsMatch, normalizeIdentityEmail } from './utils/identity-email.util';
import {
  canActivateMembershipFromInvite,
  evaluateInitialCredentialEligibility,
  INVITE_ACCEPT_ERROR,
  isPrivilegedInviteRole,
  requiresRejoinAcknowledgement,
  type InitialCredentialSecuritySnapshot,
} from './policies/invite-accept.policy';
import { UserAccessAuditAction } from './user-access-audit.service';
import { IamAuditService } from './iam-audit.service';
import { IamMembershipLifecycleService } from './iam-membership-lifecycle.service';
import { buildRoleSummary } from './utils/invite-admin-response.util';
import type { AcceptInviteDto } from './dto/organization-invite.dto';

type LoadedInvite = NonNullable<Awaited<ReturnType<InviteAcceptService['loadInviteByToken']>>>;

type InviteAcceptUserRow = {
  id: string;
  email: string;
  passwordHash: string | null;
  status: UserStatus;
  platformRole: UserPlatformRole;
};

@Injectable()
export class InviteAcceptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: IamMembershipLifecycleService,
    private readonly iamAudit: IamAuditService,
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly accessAuthority: UserAccessAuthorityService,
  ) {}

  async resolveOptionalAuthIdentity(authorizationHeader?: string | null) {
    const secret = process.env.JWT_SECRET?.trim();
    if (!secret) return null;

    const [type, token] = authorizationHeader?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) return null;

    try {
      const decoded = jwt.verify(token, secret) as AccessJwtPayload;
      const validated = await this.accessAuthority.validateAccessJwt(decoded);
      const normalizedEmail = normalizeIdentityEmail(validated.email ?? '');
      if (!normalizedEmail) return null;
      return {
        userId: validated.id,
        email: normalizedEmail,
      } satisfies OptionalAuthIdentity;
    } catch {
      return null;
    }
  }

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
      select: {
        id: true,
        email: true,
        passwordHash: true,
        status: true,
        platformRole: true,
      },
    });
    const existingMembership = existingUser
      ? await this.prisma.organizationMembership.findUnique({
          where: {
            userId_organizationId: {
              userId: existingUser.id,
              organizationId: invite.organizationId,
            },
          },
          select: { id: true, organizationId: true, userId: true, status: true },
        })
      : null;

    const security = existingUser
      ? await this.loadInitialCredentialSecuritySnapshot(this.prisma, existingUser.id)
      : {
          verifiedMfaFactorCount: 0,
          activeRefreshSessionCount: 0,
          activePlatformPermissionGrantCount: 0,
        };

    const initialCredential =
      existingUser &&
      evaluateInitialCredentialEligibility({
        invite: {
          id: invite.id,
          organizationId: invite.organizationId,
          email: invite.email,
          status: invite.status,
          provisionedUserId: invite.provisionedUserId,
          provisionedMembershipId: invite.provisionedMembershipId,
        },
        user: existingUser,
        membership: existingMembership,
        security,
      }).eligible === true;

    const privilegedRole = isPrivilegedInviteRole(invite);
    const requiresRejoin = requiresRejoinAcknowledgement(existingMembership?.status);

    return {
      valid: true as const,
      requiresPassword: !existingUser || Boolean(initialCredential),
      requiresAuthentication: Boolean(existingUser && !initialCredential),
      requiresExplicitConfirmation: true,
      privilegedRole,
      requiresStepUp: privilegedRole,
      mfaRequired: privilegedRole,
      mfaEnabled: null as boolean | null,
      requiresRejoinAcknowledgement: requiresRejoin,
      previousMembershipStatus: existingMembership?.status ?? null,
      initialCredentialEligible: initialCredential,
      invite: this.mapPublicInvitePreview(invite, existingMembership?.status ?? null),
    };
  }

  async acceptInvite(dto: AcceptInviteDto, authorizationHeader?: string | null) {
    const auth = await this.resolveOptionalAuthIdentity(authorizationHeader);
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

    const existingMembershipPrecheck = existingUser
      ? await this.prisma.organizationMembership.findUnique({
          where: {
            userId_organizationId: {
              userId: existingUser.id,
              organizationId: invite.organizationId,
            },
          },
          select: {
            id: true,
            organizationId: true,
            userId: true,
            status: true,
            role: true,
          },
        })
      : null;

    const securityPrecheck = existingUser
      ? await this.loadInitialCredentialSecuritySnapshot(this.prisma, existingUser.id)
      : null;

    const initialCredentialPrecheck =
      existingUser &&
      securityPrecheck &&
      evaluateInitialCredentialEligibility({
        invite: {
          id: invite.id,
          organizationId: invite.organizationId,
          email: invite.email,
          status: invite.status,
          provisionedUserId: invite.provisionedUserId,
          provisionedMembershipId: invite.provisionedMembershipId,
        },
        user: existingUser,
        membership: existingMembershipPrecheck
          ? {
              id: existingMembershipPrecheck.id,
              organizationId: existingMembershipPrecheck.organizationId,
              userId: existingMembershipPrecheck.userId,
              status: existingMembershipPrecheck.status,
            }
          : null,
        security: securityPrecheck,
      }).eligible === true;

    if (
      existingUser &&
      !existingUser.passwordHash &&
      dto.password &&
      !invite.provisionedUserId &&
      !invite.provisionedMembershipId
    ) {
      throw new BadRequestException({
        code: INVITE_ACCEPT_ERROR.PROVISIONING_BINDING_INVALID,
        message: 'Invite is not bound to an authorized provisioning operation',
      });
    }

    if (existingUser && !initialCredentialPrecheck) {
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
    } else if (!existingUser && auth && !identityEmailsMatch(auth.email, invite.email)) {
      throw new ForbiddenException({
        code: INVITE_ACCEPT_ERROR.IDENTITY_MISMATCH,
        message: 'Sign out before accepting this invite with a new account',
      });
    }

    if (!existingUser || initialCredentialPrecheck) {
      try {
        this.passwordPolicy.assertAcceptablePassword(dto.password ?? '');
      } catch (err) {
        throw err;
      }
    }

    const privilegedRole = isPrivilegedInviteRole(invite);
    if (privilegedRole && !dto.acknowledgePrivilegedRole) {
      throw new BadRequestException({
        code: INVITE_ACCEPT_ERROR.PRIVILEGED_ROLE_ACK_REQUIRED,
        message: 'Privileged role assignment requires explicit acknowledgement',
      });
    }

    const existingMembership = existingMembershipPrecheck;

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
    let user: InviteAcceptUserRow | null = existingUser
      ? {
          id: existingUser.id,
          email: existingUser.email,
          passwordHash: existingUser.passwordHash,
          status: existingUser.status,
          platformRole: existingUser.platformRole,
        }
      : null;
    let credentiallessFirstLogin = false;

    const outboxIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      await acquireInviteAcceptMutationLocks(tx, {
        inviteId: invite.id,
        organizationId: invite.organizationId,
        userId: user?.id,
        normalizedEmail: user ? null : invite.email,
      });

      const authoritativeInvite = await tx.organizationUserInvite.findUnique({
        where: { id: invite.id },
        include: {
          organization: { select: { id: true, companyName: true, status: true } },
          organizationRole: { select: { id: true, name: true } },
        },
      });
      if (!authoritativeInvite || authoritativeInvite.status !== OrganizationInviteStatus.PENDING) {
        throw new BadRequestException({
          code: INVITE_ACCEPT_ERROR.ALREADY_CONSUMED,
          message: 'Invite is no longer pending',
        });
      }
      if (authoritativeInvite.expiresAt.getTime() < Date.now()) {
        await tx.organizationUserInvite.updateMany({
          where: { id: invite.id, status: OrganizationInviteStatus.PENDING },
          data: { status: OrganizationInviteStatus.EXPIRED },
        });
        throw new BadRequestException('Invite has expired');
      }
      if (authoritativeInvite.organization.status !== OrganizationStatus.ACTIVE) {
        throw new BadRequestException({
          code: INVITE_ACCEPT_ERROR.ORGANIZATION_NOT_ACTIVE,
          message: 'Organization is not active',
        });
      }
      const tokenValid = await verifyInviteToken(dto.token, authoritativeInvite.tokenHash);
      if (!tokenValid) {
        throw new BadRequestException({
          code: INVITE_ACCEPT_ERROR.INVALID_TOKEN,
          message: 'Invite token does not match current generation',
        });
      }
      const inviteTx = authoritativeInvite;

      if (!user) {
        const passwordHash = await bcrypt.hash(dto.password!, 10);
        const fullName = [dto.firstName, dto.lastName].filter(Boolean).join(' ');
        const created = await tx.user.create({
          data: {
            email: inviteTx.email,
            firstName: dto.firstName?.trim() || null,
            lastName: dto.lastName?.trim() || null,
            name: fullName || null,
            passwordHash,
            mustChangePassword: false,
            status: UserStatus.ACTIVE,
          },
        });
        user = {
          id: created.id,
          email: created.email,
          passwordHash: created.passwordHash,
          status: created.status,
          platformRole: created.platformRole,
        };
        await acquireCanonicalSecurityMutationLocks(tx, {
          organizationIds: [inviteTx.organizationId],
          userIds: [user.id],
        });
      } else {
        const authoritativeUser = await tx.user.findUniqueOrThrow({
          where: { id: user!.id },
          select: {
            id: true,
            email: true,
            passwordHash: true,
            status: true,
            platformRole: true,
          },
        });
        user = authoritativeUser;
        const liveUser = authoritativeUser;
        const membershipRow = await tx.organizationMembership.findUnique({
          where: {
            userId_organizationId: {
              userId: liveUser.id,
              organizationId: inviteTx.organizationId,
            },
          },
        });
        const security = await this.loadInitialCredentialSecuritySnapshot(tx, liveUser.id);
        if (liveUser.passwordHash) {
          const authLive = await this.resolveOptionalAuthIdentity(authorizationHeader);
          if (!authLive?.userId) {
            throw new UnauthorizedException({
              code: INVITE_ACCEPT_ERROR.AUTHENTICATION_REQUIRED,
              message: 'Authentication required to accept invite for an existing account',
            });
          }
          if (authLive.userId !== liveUser.id) {
            throw new ForbiddenException({
              code: INVITE_ACCEPT_ERROR.IDENTITY_MISMATCH,
              message: 'Authenticated identity does not match invite target',
            });
          }
          if (!identityEmailsMatch(authLive.email, inviteTx.email)) {
            throw new ForbiddenException({
              code: INVITE_ACCEPT_ERROR.IDENTITY_MISMATCH,
              message: 'Authenticated identity does not match invite email',
            });
          }
          if (liveUser.status !== UserStatus.ACTIVE) {
            throw new BadRequestException({
              code: INVITE_ACCEPT_ERROR.INITIAL_CREDENTIAL_INELIGIBLE,
              message: 'User account is not active',
            });
          }
          if (membershipRow?.status === MembershipStatus.ACTIVE) {
            throw new BadRequestException('User is already an active member of this organization');
          }
          if (
            requiresRejoinAcknowledgement(membershipRow?.status ?? null) &&
            !dto.acknowledgeRejoin
          ) {
            throw new BadRequestException({
              code: INVITE_ACCEPT_ERROR.REJOIN_ACK_REQUIRED,
              message: 'Explicit rejoin acknowledgement is required for removed or suspended memberships',
            });
          }
          if (
            !canActivateMembershipFromInvite(
              membershipRow?.status ?? null,
              Boolean(dto.acknowledgeRejoin),
            )
          ) {
            throw new BadRequestException('Membership cannot be activated from this invite');
          }
        } else {
          const eligibility = evaluateInitialCredentialEligibility({
            invite: {
              id: inviteTx.id,
              organizationId: inviteTx.organizationId,
              email: inviteTx.email,
              status: inviteTx.status,
              provisionedUserId: inviteTx.provisionedUserId,
              provisionedMembershipId: inviteTx.provisionedMembershipId,
            },
            user: liveUser,
            membership: membershipRow
              ? {
                  id: membershipRow.id,
                  organizationId: membershipRow.organizationId,
                  userId: membershipRow.userId,
                  status: membershipRow.status,
                }
              : null,
            security,
          });
          if (!eligibility.eligible) {
            throw new BadRequestException({
              code: eligibility.code,
              message: 'Initial credential establishment is not permitted for this invite',
            });
          }
          credentiallessFirstLogin = true;
          const passwordHash = await bcrypt.hash(dto.password!, 10);
          const admitted = await tx.user.updateMany({
            where: {
              id: liveUser.id,
              passwordHash: null,
              status: UserStatus.ACTIVE,
              platformRole: UserPlatformRole.USER,
            },
            data: {
              passwordHash,
              mustChangePassword: false,
            },
          });
          if (admitted.count !== 1) {
            throw new BadRequestException({
              code: INVITE_ACCEPT_ERROR.INITIAL_CREDENTIAL_INELIGIBLE,
              message: 'Initial credential could not be admitted atomically',
            });
          }
          const reloaded = await tx.user.findUniqueOrThrow({
            where: { id: liveUser.id },
            select: {
              id: true,
              email: true,
              passwordHash: true,
              status: true,
              platformRole: true,
            },
          });
          user = reloaded;
        }
      }

      const membershipForJoin = await tx.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: user!.id,
            organizationId: inviteTx.organizationId,
          },
        },
      });

      if (membershipForJoin) {
        if (
          membershipForJoin.role === MembershipRole.ORG_ADMIN &&
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
      }

      const joinApplied = await this.lifecycle.applyJoinInTransaction(
        tx,
        {
          organizationId: inviteTx.organizationId,
          userId: user!.id,
          idempotencyKey: `membership-join:invite:${inviteTx.id}`,
          actor: { userId: user!.id },
          role: inviteTx.membershipRole,
          organizationRoleId: inviteTx.organizationRoleId,
          roleLabel: inviteTx.roleLabel,
          stationScope: inviteTx.stationScope,
          stationIds: Array.isArray(inviteTx.stationIds)
            ? (inviteTx.stationIds as string[])
            : null,
          department: inviteTx.department,
          position: inviteTx.position,
          permissions: normalizeMembershipPermissions(inviteTx.permissions),
          fieldAgentAccess: inviteTx.fieldAgentAccess,
          mfaRequired: privilegedRole,
          source: 'invite',
          inviteId: inviteTx.id,
        },
        membershipForJoin,
      );
      outboxIds.push(joinApplied.outboxId);

      const inviteConsumed = await tx.organizationUserInvite.updateMany({
        where: { id: inviteTx.id, status: OrganizationInviteStatus.PENDING },
        data: {
          status: OrganizationInviteStatus.ACCEPTED,
          acceptedAt: new Date(),
          acceptedByUserId: user!.id,
          tokenHash: await bcrypt.hash(`consumed:${inviteTx.id}:${Date.now()}`, 10),
        },
      });
      if (inviteConsumed.count !== 1) {
        throw new BadRequestException({
          code: INVITE_ACCEPT_ERROR.ALREADY_CONSUMED,
          message: 'Invite is no longer pending',
        });
      }

      const acceptedOutbox = await this.iamAudit.enqueueInTransaction(tx, {
        organizationId: inviteTx.organizationId,
        idempotencyKey: `invite-accept:${inviteTx.id}`,
        eventType: UserAccessAuditAction.USER_INVITE_ACCEPTED,
        actorUserId: user!.id,
        subjectUserId: user!.id,
        targetInviteId: inviteTx.id,
        description: 'Einladung angenommen',
        after: {
          membershipRole: inviteTx.membershipRole,
          organizationRoleId: inviteTx.organizationRoleId,
          privilegedRole,
          previousMembershipStatus,
        },
        metadata: {
          privilegedRole,
          previousMembershipStatus,
          rejoinAcknowledged: Boolean(dto.acknowledgeRejoin),
          credentiallessFirstLogin: Boolean(credentiallessFirstLogin),
        },
        level: privilegedRole ? 'WARN' : 'INFO',
      });
      outboxIds.push(acceptedOutbox.id);

      if (wasNewUser) {
        const createdOutbox = await this.iamAudit.enqueueInTransaction(tx, {
          organizationId: inviteTx.organizationId,
          idempotencyKey: `invite-accept-user-created:${inviteTx.id}`,
          eventType: UserAccessAuditAction.USER_CREATED,
          actorUserId: user!.id,
          subjectUserId: user!.id,
          description: 'Benutzer durch Einladung erstellt',
        });
        outboxIds.push(createdOutbox.id);
      }

      await tx.activityLog.create({
        data: {
          organizationId: inviteTx.organizationId,
          userId: user!.id,
          action: ActivityAction.CREATE,
          entity: ActivityEntity.ORGANIZATION_INVITE,
          entityId: inviteTx.id,
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

  private async loadInitialCredentialSecuritySnapshot(
    client: PrismaService | Prisma.TransactionClient,
    userId: string,
  ): Promise<InitialCredentialSecuritySnapshot> {
    const [verifiedMfaFactorCount, activeRefreshSessionCount, activePlatformPermissionGrantCount] =
      await Promise.all([
        client.userMfaFactor.count({
          where: { userId, verifiedAt: { not: null } },
        }),
        client.refreshToken.count({
          where: {
            userId,
            revokedAt: null,
            expiresAt: { gt: new Date() },
            replacedBy: null,
          },
        }),
        client.userPlatformPermissionGrant.count({
          where: { userId, revokedAt: null },
        }),
      ]);
    return {
      verifiedMfaFactorCount,
      activeRefreshSessionCount,
      activePlatformPermissionGrantCount,
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
    await this.prisma.$transaction(async (tx) => {
      await acquireInviteDeliveryContinuityLock(tx, inviteId);
      await tx.organizationUserInvite.updateMany({
        where: { id: inviteId, status: OrganizationInviteStatus.PENDING },
        data: { status: OrganizationInviteStatus.EXPIRED },
      });
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