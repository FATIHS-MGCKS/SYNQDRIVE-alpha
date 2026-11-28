import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MasterAdminAuditScope,
  MembershipStatus,
  OrganizationInviteStatus,
  OrganizationStatus,
  PasswordResetPurpose,
  Prisma,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import { MasterAdminAuditDeliveryService } from '@modules/activity-log/master-admin-audit-delivery.service';
import {
  buildPrivilegedRouteLabel,
  resolveCorrelationId,
  resolveMfaAuditFields,
} from '@modules/activity-log/master-admin-audit.util';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import type { PermissionActor } from '@shared/auth/permission.util';
import { PasswordResetService } from '@modules/auth/password-reset.service';
import {
  acquireCanonicalSecurityMutationLocks,
} from '@modules/auth/iam-security-mutation-concurrency';
import {
  acquireIdentityEmailProvisionLock,
  acquireSecurityOperationAdmissionLock,
} from '@modules/auth/refresh-token-session-concurrency';
import type {
  AdminCreateUserDto,
  AdminUpdateUserDto,
  CreateOrgUserDto,
  GovernanceCreateGlobalUserDto,
  GovernanceUpdateGlobalProfileDto,
} from './dto';
import { UsersService } from './users.service';
import { OrganizationInviteService } from './organization-invite.service';
import { IamAuditService } from './iam-audit.service';
import { normalizeIdentityEmail } from './utils/identity-email.util';
import { MASTER_GLOBAL_PROFILE_ALLOWLIST } from './policies/master-global-profile.policy';
import {
  assertOptionalStringField,
  validateGlobalProfilePatchValues,
} from './policies/master-global-profile.validation';
import {
  MASTER_IDENTITY_OPERATION_DOMAIN,
  buildMasterIdentityAuditIdempotencyKey,
  buildProfilePayloadFingerprint,
  buildProvisionPayloadFingerprint,
  outboxMatchesIdentityOperation,
  readProvisionedUserIdFromOutbox,
  readProvisionOperationMetadataFromOutbox,
  resolveSecurityOperationId,
  type MasterIdentityOperationBinding,
} from './policies/master-global-identity-operation.policy';

export type MasterIdentityAuditRequest = {
  user?: {
    id?: string;
    platformRole?: string;
    platformPermissions?: string[];
    sessionClaims?: { assuranceLevel?: number; mfaAuthenticatedAt?: string | null };
  };
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  connection?: { remoteAddress?: string };
  requestId?: string;
  originalUrl?: string;
  url?: string;
  method?: string;
};

export type GlobalIdentityOnboardingDto = {
  identityCreated: boolean;
  invitationPersisted: boolean;
  deliveryRequested: boolean;
  deliveryConfirmed: boolean;
  accountReadyForAuthentication: boolean;
};

export type MasterGlobalIdentityUserDto = {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  language: string | null;
  timezone: string | null;
  dateFormat: string | null;
  status: string;
  platformRole: string;
};

export type MasterGlobalIdentityProvisionResult = {
  user: MasterGlobalIdentityUserDto;
  onboarding: GlobalIdentityOnboardingDto;
  membership?: { organizationId: string; status: string; membershipId: string };
  idempotentReplay?: boolean;
  securityOperationId?: string;
};

function buildDisplayName(
  firstName?: string | null,
  lastName?: string | null,
  name?: string | null,
): string {
  const fromParts = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (fromParts) return fromParts;
  return (name ?? '').trim();
}

function toSafeUserDto(user: {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  language: string | null;
  timezone: string | null;
  dateFormat: string | null;
  status: UserStatus;
  platformRole: UserPlatformRole;
  passwordHash: string | null;
}): MasterGlobalIdentityUserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    mobile: user.mobile,
    address: user.address,
    language: user.language,
    timezone: user.timezone,
    dateFormat: user.dateFormat,
    status: user.status,
    platformRole: user.platformRole,
  };
}

function accountReadyForAuthentication(input: {
  status: UserStatus;
  passwordHash: string | null;
  membershipStatus?: MembershipStatus;
  inviteByEmail?: boolean;
}): boolean {
  if (input.status !== UserStatus.ACTIVE) return false;
  if (input.passwordHash) return true;
  if (input.inviteByEmail && input.membershipStatus === MembershipStatus.INVITED) {
    return false;
  }
  return false;
}

@Injectable()
export class MasterGlobalIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly inviteService: OrganizationInviteService,
    private readonly iamAudit: IamAuditService,
    private readonly auditDelivery: MasterAdminAuditDeliveryService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  async provisionGlobalUser(
    dto: GovernanceCreateGlobalUserDto,
    actor: PermissionActor,
    req: MasterIdentityAuditRequest,
  ): Promise<MasterGlobalIdentityProvisionResult> {
    const email = normalizeIdentityEmail(dto.email);
    if (!dto.firstName && !dto.lastName && !dto.name?.trim()) {
      throw new BadRequestException({
        code: 'IDENTITY_DISPLAY_NAME_REQUIRED',
        message: 'Provide firstName and lastName, or name, for the new identity.',
      });
    }
    if (dto.sendCredentialSetup && !dto.initialMembership) {
      throw new BadRequestException({
        code: 'CREDENTIAL_SETUP_REQUIRES_ORG',
        message: 'Credential setup requires an initial organization membership context.',
      });
    }

    const actorUserId = actor.id;
    if (!actorUserId) {
      throw new BadRequestException('Authenticated actor required');
    }

    if (dto.initialMembership) {
      return this.provisionWithInitialMembership(dto, actor, req, email);
    }

    const securityOperationId = resolveSecurityOperationId(dto.idempotencyKey);
    const auditIdempotencyKey = buildMasterIdentityAuditIdempotencyKey(securityOperationId);
    const payloadFingerprint = buildProvisionPayloadFingerprint(email, dto, false);
    const binding: MasterIdentityOperationBinding = {
      domain: MASTER_IDENTITY_OPERATION_DOMAIN,
      action: 'PROVISION_IDENTITY',
      actorUserId,
      organizationId: null,
      normalizedEmail: email,
      payloadFingerprint,
      securityOperationId,
    };

    const displayName = buildDisplayName(dto.firstName, dto.lastName, dto.name);
    validateGlobalProfilePatchValues({
      language: dto.language,
      timezone: dto.timezone,
      dateFormat: dto.dateFormat,
    });
    let createdUserId = '';
    let outboxId = '';
    let idempotentReplay = false;

    try {
      await this.prisma.$transaction(async (tx) => {
        await acquireSecurityOperationAdmissionLock(tx, securityOperationId);
        await acquireIdentityEmailProvisionLock(tx, email);

        const priorOutbox = await tx.masterAdminAuditOutbox.findUnique({
          where: { idempotencyKey: auditIdempotencyKey },
        });
        if (priorOutbox) {
          if (!outboxMatchesIdentityOperation(priorOutbox, binding)) {
            throw new ConflictException({
              code: 'OPERATION_IDEMPOTENCY_CONFLICT',
              message: 'Idempotency key is bound to a different privileged operation.',
            });
          }
          const replayUserId = readProvisionedUserIdFromOutbox(priorOutbox);
          if (!replayUserId) {
            throw new ConflictException({
              code: 'OPERATION_REPLAY_INCOMPLETE',
              message: 'Prior audit exists without a resolvable target user.',
            });
          }
          createdUserId = replayUserId;
          outboxId = priorOutbox.id;
          idempotentReplay = true;
          return;
        }

        const existing = await tx.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (existing) {
          throw new ConflictException({
            code: 'IDENTITY_ALREADY_EXISTS',
            message: 'An identity with this email already exists.',
            existingUserId: existing.id,
          });
        }

        const user = await tx.user.create({
          data: {
            email,
            name: displayName || null,
            firstName: assertOptionalStringField('firstName', dto.firstName) || null,
            lastName: assertOptionalStringField('lastName', dto.lastName) || null,
            phone: assertOptionalStringField('phone', dto.phone) || null,
            mobile: assertOptionalStringField('mobile', dto.mobile) || null,
            address: assertOptionalStringField('address', dto.address) || null,
            language: assertOptionalStringField('language', dto.language) || 'de',
            timezone: assertOptionalStringField('timezone', dto.timezone) || 'Europe/Berlin',
            dateFormat: assertOptionalStringField('dateFormat', dto.dateFormat) || 'DD.MM.YYYY',
            status: UserStatus.ACTIVE,
            platformRole: UserPlatformRole.USER,
          },
        });
        createdUserId = user.id;
        binding.targetUserId = user.id;

        const envelope = this.buildProvisionAuditEnvelope({
          req,
          actorUserId,
          targetUserId: user.id,
          targetOrganizationId: null,
          idempotent: false,
          binding,
        });
        outboxId = await this.auditDelivery.persistAuthoritativeAuditIntent(
          envelope,
          {
            idempotencyKey: auditIdempotencyKey,
            occurredAt: new Date(),
            auditScope: MasterAdminAuditScope.PLATFORM,
            organizationContextId: null,
          },
          tx,
        );
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.user.findUnique({ where: { email } });
        if (raced) {
          throw new ConflictException({
            code: 'IDENTITY_ALREADY_EXISTS',
            message: 'An identity with this email already exists.',
            existingUserId: raced.id,
          });
        }
      }
      throw error;
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: createdUserId },
    });

    if (outboxId && !idempotentReplay) {
      await this.auditDelivery.attemptImmediateDelivery(outboxId);
    }

    return {
      user: toSafeUserDto(user),
      onboarding: {
        identityCreated: true,
        invitationPersisted: false,
        deliveryRequested: false,
        deliveryConfirmed: false,
        accountReadyForAuthentication: accountReadyForAuthentication({
          status: user.status,
          passwordHash: user.passwordHash,
        }),
      },
      idempotentReplay,
      securityOperationId,
    };
  }

  private async provisionWithInitialMembership(
    dto: GovernanceCreateGlobalUserDto,
    actor: PermissionActor,
    req: MasterIdentityAuditRequest,
    email: string,
  ): Promise<MasterGlobalIdentityProvisionResult> {
    const mem = dto.initialMembership!;
    const actorUserId = actor.id!;
    const securityOperationId = resolveSecurityOperationId(dto.idempotencyKey);
    const auditIdempotencyKey = buildMasterIdentityAuditIdempotencyKey(securityOperationId);
    const payloadFingerprint = buildProvisionPayloadFingerprint(email, dto, true);
    const binding: MasterIdentityOperationBinding = {
      domain: MASTER_IDENTITY_OPERATION_DOMAIN,
      action: 'PROVISION_IDENTITY_ORG',
      actorUserId,
      organizationId: mem.organizationId,
      normalizedEmail: email,
      payloadFingerprint,
      securityOperationId,
    };

    const trimmedFirst = assertOptionalStringField('firstName', dto.firstName);
    const trimmedLast = assertOptionalStringField('lastName', dto.lastName);
    const trimmedName = assertOptionalStringField('name', dto.name);
    let orgFirst = trimmedFirst;
    let orgLast = trimmedLast;
    if (!orgFirst && !orgLast) {
      if (!trimmedName) {
        throw new BadRequestException({
          code: 'IDENTITY_DISPLAY_NAME_REQUIRED',
          message: 'Provide firstName and lastName, or name, for the new identity.',
        });
      }
      const parts = trimmedName.split(/\s+/).filter(Boolean);
      orgFirst = parts[0];
      orgLast = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
    }

    const orgDto: CreateOrgUserDto = {
      email,
      firstName: orgFirst!,
      lastName: orgLast!,
      role: mem.role,
      organizationRoleId: mem.organizationRoleId,
      inviteByEmail: mem.inviteByEmail ?? true,
      phone: dto.phone,
      mobile: dto.mobile,
      address: dto.address,
      language: dto.language,
      timezone: dto.timezone,
      dateFormat: dto.dateFormat,
    };

    const inviteByEmail = mem.inviteByEmail ?? true;
    let createdUserId = '';
    let membershipId = '';
    let membershipStatus: MembershipStatus = inviteByEmail
      ? MembershipStatus.INVITED
      : MembershipStatus.ACTIVE;
    let outboxId = '';
    let idempotentReplay = false;
    let inviteId = '';
    let invitePlain = '';
    let inviteEmailOutboxId: string | null = null;
    const iamAuditOutboxIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      await acquireSecurityOperationAdmissionLock(tx, securityOperationId);
      await acquireIdentityEmailProvisionLock(tx, email);
      await acquireCanonicalSecurityMutationLocks(tx, {
        organizationIds: [mem.organizationId],
        userIds: [],
      });

      const orgRow = await tx.organization.findUnique({
        where: { id: mem.organizationId },
        select: { id: true, status: true },
      });
      if (!orgRow) {
        throw new NotFoundException('Organization not found');
      }
      if (orgRow.status !== OrganizationStatus.ACTIVE) {
        throw new BadRequestException({
          code: 'ORGANIZATION_NOT_ACTIVE',
          message: 'Organization is not active for provisioning.',
        });
      }

      const priorOutbox = await tx.masterAdminAuditOutbox.findUnique({
        where: { idempotencyKey: auditIdempotencyKey },
      });
      if (priorOutbox) {
        if (!outboxMatchesIdentityOperation(priorOutbox, binding)) {
          throw new ConflictException({
            code: 'OPERATION_IDEMPOTENCY_CONFLICT',
            message: 'Idempotency key is bound to a different privileged operation.',
          });
        }
        const replayUserId = readProvisionedUserIdFromOutbox(priorOutbox);
        if (!replayUserId) {
          throw new ConflictException({
            code: 'OPERATION_REPLAY_INCOMPLETE',
            message: 'Prior audit exists without a resolvable target user.',
          });
        }
        createdUserId = replayUserId;
        outboxId = priorOutbox.id;
        idempotentReplay = true;
        const membership = await tx.organizationMembership.findFirst({
          where: { userId: replayUserId, organizationId: mem.organizationId },
        });
        if (membership) {
          membershipId = membership.id;
          membershipStatus = membership.status;
        }
        return;
      }

      const mapped = await this.usersService.createOrgUser(mem.organizationId, orgDto, {
        ...actor,
        platformRole: 'MASTER_ADMIN',
      }, {
        transactionClient: tx,
        requireNewGlobalIdentity: true,
      });

      createdUserId = mapped.id;
      membershipId = mapped.membershipId;
      membershipStatus = mapped.membershipStatus;

      if (inviteByEmail) {
        const persisted = await this.inviteService.persistNewInviteInTransaction(
          tx,
          mem.organizationId,
          {
            email,
            membershipRole: mem.role,
            organizationRoleId: mem.organizationRoleId,
          },
          actorUserId,
          actor,
          {
            skipManagePermissionCheck: true,
            provisionedUserId: createdUserId,
            provisionedMembershipId: membershipId,
          },
        );
        inviteId = persisted.inviteId;
        invitePlain = persisted.plainToken;
        inviteEmailOutboxId = persisted.inviteEmailOutboxId ?? null;
        if (persisted.iamAuditOutboxId) {
          iamAuditOutboxIds.push(persisted.iamAuditOutboxId);
        }
      }

      binding.targetUserId = createdUserId;
      const envelope = this.buildProvisionAuditEnvelope({
        req,
        actorUserId,
        targetUserId: createdUserId,
        targetOrganizationId: mem.organizationId,
        idempotent: false,
        binding,
        metadata: { membershipId, inviteByEmail, inviteId: inviteId || null },
      });
      outboxId = await this.auditDelivery.persistAuthoritativeAuditIntent(
        envelope,
        {
          idempotencyKey: auditIdempotencyKey,
          occurredAt: new Date(),
          auditScope: MasterAdminAuditScope.ORGANIZATION_CONTEXT,
          organizationContextId: mem.organizationId,
        },
        tx,
      );
    });

    if (iamAuditOutboxIds.length > 0) {
      await this.iamAudit.processOutboxIds(iamAuditOutboxIds);
    }
    if (outboxId && !idempotentReplay) {
      await this.auditDelivery.attemptImmediateDelivery(outboxId);
    }

    let invitationPersisted = inviteByEmail && Boolean(inviteId);
    let deliveryRequested = false;
    let deliveryConfirmed = false;

    if (idempotentReplay && inviteByEmail) {
      const priorOutbox = await this.prisma.masterAdminAuditOutbox.findUnique({
        where: { idempotencyKey: auditIdempotencyKey },
      });
      const opMeta = priorOutbox ? readProvisionOperationMetadataFromOutbox(priorOutbox) : null;
      const boundInviteId = opMeta?.inviteId;
      if (typeof boundInviteId === 'string' && boundInviteId.length > 0) {
        inviteId = boundInviteId;
        const inviteRow = await this.prisma.organizationUserInvite.findUnique({
          where: { id: boundInviteId },
          select: { id: true, status: true, organizationId: true },
        });
        if (inviteRow?.organizationId === mem.organizationId) {
          invitationPersisted = true;
          if (inviteRow.status === OrganizationInviteStatus.PENDING) {
            const continuity = await this.inviteService.ensureInviteDeliveryContinuity(
              mem.organizationId,
              boundInviteId,
              actorUserId,
            );
            deliveryRequested = continuity.deliveryRequested;
            deliveryConfirmed = continuity.deliveryConfirmed;
          }
        }
      }
    } else if (inviteId) {
      if (inviteEmailOutboxId) {
        const delivery = await this.inviteService.finalizePersistedInviteDelivery(
          inviteEmailOutboxId,
        );
        deliveryRequested = delivery.deliveryRequested;
        deliveryConfirmed = delivery.deliveryConfirmed;
      } else if (invitePlain) {
        try {
          const delivery = await this.inviteService.enqueueDeliveryForPersistedInvite({
            organizationId: mem.organizationId,
            inviteId,
            plainToken: invitePlain,
            sentByUserId: actorUserId,
          });
          deliveryRequested = delivery.deliveryRequested;
          deliveryConfirmed = delivery.deliveryConfirmed;
        } catch {
          const continuity = await this.inviteService.ensureInviteDeliveryContinuity(
            mem.organizationId,
            inviteId,
            actorUserId,
          );
          deliveryRequested = continuity.deliveryRequested;
          deliveryConfirmed = continuity.deliveryConfirmed;
          invitationPersisted = continuity.invitePending;
        }
      }
    }

    let credentialSetupRequested = false;
    if (
      dto.sendCredentialSetup &&
      !inviteByEmail &&
      membershipStatus === MembershipStatus.ACTIVE
    ) {
      const priorOutboxForCred = idempotentReplay
        ? await this.prisma.masterAdminAuditOutbox.findUnique({
            where: { idempotencyKey: auditIdempotencyKey },
          })
        : null;
      const priorCredMeta = priorOutboxForCred
        ? readProvisionOperationMetadataFromOutbox(priorOutboxForCred)
        : null;
      credentialSetupRequested = priorCredMeta?.credentialSetupRequested === true;
      if (!credentialSetupRequested && idempotentReplay) {
        credentialSetupRequested = await this.hasActiveAdminCredentialSetupIntent(
          createdUserId,
          mem.organizationId,
        );
      }
      if (!credentialSetupRequested) {
        try {
          await this.passwordReset.requestAdminReset({
            organizationId: mem.organizationId,
            userId: createdUserId,
            actorUserId: actor.id,
          });
          deliveryRequested = true;
          credentialSetupRequested = true;
          await this.markProvisionCredentialSetupRequested(auditIdempotencyKey);
        } catch {
          deliveryRequested = false;
        }
      } else {
        deliveryRequested = true;
      }
    }

    const userRow = await this.prisma.user.findUniqueOrThrow({
      where: { id: createdUserId },
    });

    return {
      user: toSafeUserDto(userRow),
      onboarding: {
        identityCreated: true,
        invitationPersisted,
        deliveryRequested,
        deliveryConfirmed,
        accountReadyForAuthentication: accountReadyForAuthentication({
          status: userRow.status,
          passwordHash: userRow.passwordHash,
          membershipStatus,
          inviteByEmail,
        }),
      },
      membership: {
        organizationId: mem.organizationId,
        status: String(membershipStatus),
        membershipId,
      },
      idempotentReplay,
      securityOperationId,
    };
  }

  async updateGlobalProfile(
    userId: string,
    dto: GovernanceUpdateGlobalProfileDto,
    actor: PermissionActor,
    req: MasterIdentityAuditRequest,
  ): Promise<MasterGlobalIdentityUserDto> {
    const provided = MASTER_GLOBAL_PROFILE_ALLOWLIST.filter(
      (key) => (dto as Record<string, unknown>)[key] !== undefined,
    );
    if (provided.length === 0) {
      throw new BadRequestException({
        code: 'PROFILE_PATCH_EMPTY',
        message: 'No supported profile fields provided.',
      });
    }

    const actorUserId = actor.id;
    if (!actorUserId) {
      throw new BadRequestException('Authenticated actor required');
    }

    const patch: Record<string, string | null> = {};
    for (const key of provided) {
      const raw = (dto as Record<string, unknown>)[key];
      patch[key] = assertOptionalStringField(key, raw, {
        allowClearToNull: key === 'phone' || key === 'mobile' || key === 'address',
      }) ?? null;
    }
    validateGlobalProfilePatchValues({
      language: patch.language ?? undefined,
      timezone: patch.timezone ?? undefined,
      dateFormat: patch.dateFormat ?? undefined,
    });

    const securityOperationId = resolveSecurityOperationId(dto.idempotencyKey);
    const auditIdempotencyKey = buildMasterIdentityAuditIdempotencyKey(securityOperationId);
    const payloadFingerprint = buildProfilePayloadFingerprint(userId, dto);
    const binding: MasterIdentityOperationBinding = {
      domain: MASTER_IDENTITY_OPERATION_DOMAIN,
      action: 'UPDATE_GLOBAL_PROFILE',
      actorUserId,
      targetUserId: userId,
      organizationId: null,
      normalizedEmail: null,
      payloadFingerprint,
      securityOperationId,
    };

    let outboxId = '';
    let idempotentReplay = false;

    await this.prisma.$transaction(async (tx) => {
      await acquireSecurityOperationAdmissionLock(tx, securityOperationId);
      await acquireCanonicalSecurityMutationLocks(tx, { userIds: [userId] });

      const priorOutbox = await tx.masterAdminAuditOutbox.findUnique({
        where: { idempotencyKey: auditIdempotencyKey },
      });
      if (priorOutbox) {
        if (!outboxMatchesIdentityOperation(priorOutbox, binding)) {
          throw new ConflictException({
            code: 'OPERATION_IDEMPOTENCY_CONFLICT',
            message: 'Idempotency key is bound to a different privileged operation.',
          });
        }
        outboxId = priorOutbox.id;
        idempotentReplay = true;
        return;
      }

      const before = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          firstName: true,
          lastName: true,
          phone: true,
          mobile: true,
          address: true,
          language: true,
          timezone: true,
          dateFormat: true,
          status: true,
          platformRole: true,
        },
      });
      if (!before) {
        throw new NotFoundException('User not found');
      }

      const nextFirst = patch.firstName !== undefined ? patch.firstName : before.firstName;
      const nextLast = patch.lastName !== undefined ? patch.lastName : before.lastName;
      const nextNameExplicit = patch.name !== undefined ? patch.name : before.name;
      const derivedName =
        patch.firstName !== undefined || patch.lastName !== undefined || patch.name !== undefined
          ? buildDisplayName(nextFirst, nextLast, nextNameExplicit)
          : undefined;

      const data: Prisma.UserUpdateInput = {};
      if (patch.name !== undefined) data.name = patch.name || null;
      if (patch.firstName !== undefined) data.firstName = patch.firstName;
      if (patch.lastName !== undefined) data.lastName = patch.lastName;
      if (derivedName !== undefined) data.name = derivedName || null;
      if (patch.phone !== undefined) data.phone = patch.phone;
      if (patch.mobile !== undefined) data.mobile = patch.mobile;
      if (patch.address !== undefined) data.address = patch.address;
      if (patch.language !== undefined) data.language = patch.language;
      if (patch.timezone !== undefined) data.timezone = patch.timezone;
      if (patch.dateFormat !== undefined) data.dateFormat = patch.dateFormat;

      const afterRow = await tx.user.update({
        where: { id: userId },
        data,
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          phone: true,
          mobile: true,
          address: true,
          language: true,
          timezone: true,
          dateFormat: true,
        },
      });

      const envelope = this.buildProfileUpdateAuditEnvelope({
        req,
        actorUserId,
        targetUserId: userId,
        binding,
        before: Object.fromEntries(
          provided.map((k) => [k, (before as Record<string, unknown>)[k]]),
        ),
        after: Object.fromEntries(
          provided.map((k) => [k, (afterRow as Record<string, unknown>)[k]]),
        ),
      });
      outboxId = await this.auditDelivery.persistAuthoritativeAuditIntent(
        envelope,
        {
          idempotencyKey: auditIdempotencyKey,
          occurredAt: new Date(),
          auditScope: MasterAdminAuditScope.PLATFORM,
          organizationContextId: null,
        },
        tx,
      );
    });

    if (outboxId && !idempotentReplay) {
      await this.auditDelivery.attemptImmediateDelivery(outboxId);
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return toSafeUserDto({
      ...user,
      passwordHash: user.passwordHash,
    });
  }

  async legacyAdminCreate(
    body: AdminCreateUserDto,
    actor: PermissionActor,
    req: MasterIdentityAuditRequest,
  ) {
    const result = await this.provisionGlobalUser(
      { email: body.email, name: body.name },
      actor,
      req,
    );
    return {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      onboarding: result.onboarding,
      idempotentReplay: result.idempotentReplay,
    };
  }

  async legacyAdminUpdate(
    userId: string,
    body: AdminUpdateUserDto,
    actor: PermissionActor,
    req: MasterIdentityAuditRequest,
  ) {
    if (body.email !== undefined) {
      throw new BadRequestException({
        code: 'EMAIL_CHANGE_NOT_SUPPORTED',
        message:
          'Legacy admin user update cannot change email without verified identity semantics.',
      });
    }
    const user = await this.updateGlobalProfile(
      userId,
      { name: body.name },
      actor,
      req,
    );
    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  }

  private async hasActiveAdminCredentialSetupIntent(
    userId: string,
    organizationId: string,
  ): Promise<boolean> {
    const pending = await this.prisma.passwordResetToken.count({
      where: {
        userId,
        organizationId,
        purpose: PasswordResetPurpose.ADMIN_INITIATED,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    return pending > 0;
  }

  private async markProvisionCredentialSetupRequested(auditIdempotencyKey: string): Promise<void> {
    const row = await this.prisma.masterAdminAuditOutbox.findUnique({
      where: { idempotencyKey: auditIdempotencyKey },
    });
    if (!row?.payload || typeof row.payload !== 'object') return;
    const root = row.payload as {
      masterAdminAuditEnvelope?: { metadata?: Record<string, unknown> };
    };
    const envelope = root.masterAdminAuditEnvelope;
    if (!envelope?.metadata || typeof envelope.metadata !== 'object') return;
    envelope.metadata.credentialSetupRequested = true;
    await this.prisma.masterAdminAuditOutbox.update({
      where: { id: row.id },
      data: { payload: root as Prisma.InputJsonValue },
    });
  }

  private buildProvisionAuditEnvelope(input: {
    req: MasterIdentityAuditRequest;
    actorUserId: string;
    targetUserId: string;
    targetOrganizationId: string | null;
    idempotent: boolean;
    binding: MasterIdentityOperationBinding;
    metadata?: Record<string, unknown>;
  }) {
    const mfa = resolveMfaAuditFields(input.req as never);
    return {
      auditAction: MasterAdminAuditAction.PLATFORM_USER_CREATED,
      actorUserId: input.actorUserId,
      actorPlatformRole: input.req.user?.platformRole ?? 'MASTER_ADMIN',
      actorPermissions: input.req.user?.platformPermissions ?? [],
      targetOrganizationId: input.targetOrganizationId,
      entityId: input.targetUserId,
      description: `Platform identity provisioned (user ${input.targetUserId})`,
      correlationId: resolveCorrelationId(input.req as never),
      route: buildPrivilegedRouteLabel(input.req as never),
      httpMethod: input.req.method ?? 'POST',
      httpStatus: 201,
      ipAddress: input.req.ip ?? input.req.connection?.remoteAddress,
      userAgent: input.req.headers?.['user-agent'] as string | undefined,
      mfaStepUpAction: mfa.mfaStepUpAction ?? STEP_UP_ACTION.MASTER_USER_MANAGEMENT,
      mfaAssuranceLevel: mfa.mfaAssuranceLevel,
      mfaStepUpUsed: mfa.mfaStepUpUsed,
      permissionGranted: true,
      after: { userId: input.targetUserId },
      metadata: {
        domain: 'global_identity_provisioning',
        idempotent: input.idempotent,
        operationBinding: input.binding,
        targetUserId: input.targetUserId,
        ...input.metadata,
      },
    };
  }

  private buildProfileUpdateAuditEnvelope(input: {
    req: MasterIdentityAuditRequest;
    actorUserId: string;
    targetUserId: string;
    binding: MasterIdentityOperationBinding;
    before: unknown;
    after: unknown;
  }) {
    const mfa = resolveMfaAuditFields(input.req as never);
    return {
      auditAction: MasterAdminAuditAction.PLATFORM_USER_UPDATED,
      actorUserId: input.actorUserId,
      actorPlatformRole: input.req.user?.platformRole ?? 'MASTER_ADMIN',
      actorPermissions: input.req.user?.platformPermissions ?? [],
      targetOrganizationId: null,
      entityId: input.targetUserId,
      description: `Global profile updated (user ${input.targetUserId})`,
      correlationId: resolveCorrelationId(input.req as never),
      route: buildPrivilegedRouteLabel(input.req as never),
      httpMethod: input.req.method ?? 'PATCH',
      httpStatus: 200,
      ipAddress: input.req.ip ?? input.req.connection?.remoteAddress,
      userAgent: input.req.headers?.['user-agent'] as string | undefined,
      mfaStepUpAction: mfa.mfaStepUpAction ?? STEP_UP_ACTION.MASTER_USER_MANAGEMENT,
      mfaAssuranceLevel: mfa.mfaAssuranceLevel,
      mfaStepUpUsed: mfa.mfaStepUpUsed,
      permissionGranted: true,
      before: input.before,
      after: input.after,
      metadata: {
        domain: 'global_identity_profile',
        operationBinding: input.binding,
        targetUserId: input.targetUserId,
      },
    };
  }
}