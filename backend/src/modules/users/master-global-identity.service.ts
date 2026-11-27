import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MasterAdminAuditScope,
  MembershipStatus,
  Prisma,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import { MasterAdminAuditDeliveryService } from '@modules/activity-log/master-admin-audit-delivery.service';
import {
  generateMasterAdminSecurityOperationId,
} from '@modules/activity-log/master-admin-audit-delivery.contract';
import {
  buildPrivilegedRouteLabel,
  resolveCorrelationId,
  resolveMfaAuditFields,
} from '@modules/activity-log/master-admin-audit.util';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import type { PermissionActor } from '@shared/auth/permission.util';
import { PasswordResetService } from '@modules/auth/password-reset.service';
import type {
  AdminCreateUserDto,
  AdminUpdateUserDto,
  CreateOrgUserDto,
  GovernanceCreateGlobalUserDto,
  GovernanceUpdateGlobalProfileDto,
} from './dto';
import { UsersService } from './users.service';
import { OrganizationInviteService } from './organization-invite.service';
import { normalizeIdentityEmail } from './utils/identity-email.util';
import { MASTER_GLOBAL_PROFILE_ALLOWLIST } from './policies/master-global-profile.policy';

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

function buildMasterIdentityAuditIdempotencyKey(operationId: string): string {
  return `ma-identity-audit:op:${operationId}`;
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

    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, platformRole: true, status: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'IDENTITY_ALREADY_EXISTS',
        message: 'An identity with this email already exists.',
        existingUserId: existing.id,
      });
    }

    const actorUserId = actor.id;
    if (!actorUserId) {
      throw new BadRequestException('Authenticated actor required');
    }

    if (dto.initialMembership) {
      return this.provisionWithInitialMembership(dto, actor, req, email);
    }

    const operationId = dto.idempotencyKey ?? generateMasterAdminSecurityOperationId();
    const auditIdempotencyKey = buildMasterIdentityAuditIdempotencyKey(operationId);
    const displayName = buildDisplayName(dto.firstName, dto.lastName, dto.name);

    let createdUserId = '';
    let outboxId = '';
    try {
      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            name: displayName || null,
            firstName: dto.firstName?.trim() || null,
            lastName: dto.lastName?.trim() || null,
            phone: dto.phone?.trim() || null,
            mobile: dto.mobile?.trim() || null,
            address: dto.address?.trim() || null,
            language: dto.language?.trim() || 'de',
            timezone: dto.timezone?.trim() || 'Europe/Berlin',
            dateFormat: dto.dateFormat?.trim() || 'DD.MM.YYYY',
            status: UserStatus.ACTIVE,
            platformRole: UserPlatformRole.USER,
          },
        });
        createdUserId = user.id;

        const envelope = this.buildProvisionAuditEnvelope({
          req,
          actorUserId,
          targetUserId: user.id,
          targetOrganizationId: null,
          email,
          idempotent: false,
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

    const onboarding: GlobalIdentityOnboardingDto = {
      identityCreated: true,
      invitationPersisted: false,
      deliveryRequested: false,
      deliveryConfirmed: false,
      accountReadyForAuthentication: accountReadyForAuthentication({
        status: user.status,
        passwordHash: user.passwordHash,
      }),
    };

    if (outboxId) {
      await this.auditDelivery.attemptImmediateDelivery(outboxId);
    }

    return {
      user: toSafeUserDto(user),
      onboarding,
    };
  }

  private async provisionWithInitialMembership(
    dto: GovernanceCreateGlobalUserDto,
    actor: PermissionActor,
    req: MasterIdentityAuditRequest,
    email: string,
  ): Promise<MasterGlobalIdentityProvisionResult> {
    const mem = dto.initialMembership!;
    const org = await this.prisma.organization.findUnique({
      where: { id: mem.organizationId },
      select: { id: true },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const firstName =
      dto.firstName?.trim() ||
      (dto.name?.trim().split(/\s+/)[0] ?? 'User');
    const lastName =
      dto.lastName?.trim() ||
      (dto.name?.trim().split(/\s+/).slice(1).join(' ') || '.');

    const orgDto: CreateOrgUserDto = {
      email,
      firstName,
      lastName,
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
    const mapped = await this.usersService.createOrgUser(mem.organizationId, orgDto, {
      ...actor,
      platformRole: 'MASTER_ADMIN',
    });

    let invitationPersisted = false;
    let deliveryRequested = false;
    let deliveryConfirmed = false;

    if (inviteByEmail) {
      const inviteResult = await this.inviteService.createInvite(
        mem.organizationId,
        {
          email,
          membershipRole: mem.role,
          organizationRoleId: mem.organizationRoleId,
        },
        actor.id!,
        { ...actor, platformRole: 'MASTER_ADMIN' },
      );
      invitationPersisted = true;
      deliveryRequested = inviteResult.deliveryStatus === 'QUEUED' || inviteResult.deliveryStatus === 'SENT';
      deliveryConfirmed = inviteResult.deliveryStatus === 'SENT';
    }

    const operationId = dto.idempotencyKey ?? generateMasterAdminSecurityOperationId();
    const auditIdempotencyKey = buildMasterIdentityAuditIdempotencyKey(operationId);
    const envelope = this.buildProvisionAuditEnvelope({
      req,
      actorUserId: actor.id!,
      targetUserId: mapped.id,
      targetOrganizationId: mem.organizationId,
      email,
      idempotent: false,
      metadata: {
        membershipId: mapped.membershipId,
        inviteByEmail,
      },
    });
    await this.auditDelivery.commitAuditIntent(envelope, {
      idempotencyKey: auditIdempotencyKey,
      organizationContextId: mem.organizationId,
    });

    if (
      dto.sendCredentialSetup &&
      !inviteByEmail &&
      mapped.membershipStatus === MembershipStatus.ACTIVE
    ) {
      await this.passwordReset.requestAdminReset({
        organizationId: mem.organizationId,
        userId: mapped.id,
        actorUserId: actor.id,
      });
      deliveryRequested = true;
    }

    const userRow = await this.prisma.user.findUniqueOrThrow({
      where: { id: mapped.id },
    });

    const onboarding: GlobalIdentityOnboardingDto = {
      identityCreated: true,
      invitationPersisted,
      deliveryRequested,
      deliveryConfirmed,
      accountReadyForAuthentication: accountReadyForAuthentication({
        status: userRow.status,
        passwordHash: userRow.passwordHash,
        membershipStatus: mapped.membershipStatus,
        inviteByEmail,
      }),
    };

    return {
      user: toSafeUserDto(userRow),
      onboarding,
      membership: {
        organizationId: mem.organizationId,
        status: String(mapped.membershipStatus),
        membershipId: mapped.membershipId,
      },
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

    const operationId = dto.idempotencyKey ?? generateMasterAdminSecurityOperationId();
    const auditIdempotencyKey = buildMasterIdentityAuditIdempotencyKey(operationId);
    let outboxId = '';

    const before = await this.prisma.user.findUnique({
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
        passwordHash: true,
      },
    });
    if (!before) {
      throw new NotFoundException('User not found');
    }

    const fullName =
      dto.firstName !== undefined || dto.lastName !== undefined || dto.name !== undefined
        ? buildDisplayName(
            dto.firstName ?? before.firstName,
            dto.lastName ?? before.lastName,
            dto.name ?? before.name,
          )
        : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() || null } : {}),
          ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() || null } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() || null } : {}),
          ...(fullName !== undefined ? { name: fullName || null } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
          ...(dto.mobile !== undefined ? { mobile: dto.mobile.trim() || null } : {}),
          ...(dto.address !== undefined ? { address: dto.address.trim() || null } : {}),
          ...(dto.language !== undefined ? { language: dto.language.trim() || null } : {}),
          ...(dto.timezone !== undefined ? { timezone: dto.timezone.trim() || null } : {}),
          ...(dto.dateFormat !== undefined ? { dateFormat: dto.dateFormat.trim() || null } : {}),
        },
      });

      const envelope = this.buildProfileUpdateAuditEnvelope({
        req,
        actorUserId,
        targetUserId: userId,
        before: {
          fields: Object.fromEntries(
            provided.map((k) => [k, (before as Record<string, unknown>)[k]]),
          ),
        },
        after: {
          fields: Object.fromEntries(
            provided.map((k) => [k, (dto as Record<string, unknown>)[k]]),
          ),
        },
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

    if (outboxId) {
      await this.auditDelivery.attemptImmediateDelivery(outboxId);
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return toSafeUserDto(user);
  }

  /** Legacy POST /admin/users — canonical forwarder. */
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
    };
  }

  /** Legacy PATCH /admin/users/:id — email rejected; name-only forward. */
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

  private buildProvisionAuditEnvelope(input: {
    req: MasterIdentityAuditRequest;
    actorUserId: string;
    targetUserId: string;
    targetOrganizationId: string | null;
    email: string;
    idempotent: boolean;
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
      description: `Platform identity provisioned for ${input.email}`,
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
      after: { userId: input.targetUserId, email: input.email },
      metadata: {
        domain: 'global_identity_provisioning',
        idempotent: input.idempotent,
        ...input.metadata,
      },
    };
  }

  private buildProfileUpdateAuditEnvelope(input: {
    req: MasterIdentityAuditRequest;
    actorUserId: string;
    targetUserId: string;
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
      description: `Global profile updated for user ${input.targetUserId}`,
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
      metadata: { domain: 'global_identity_profile' },
    };
  }
}