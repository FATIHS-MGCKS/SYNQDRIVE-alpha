import { randomUUID } from 'node:crypto';
import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BusinessType,
  MfaFactorType,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import * as jwt from 'jsonwebtoken';
import { AuthMfaLoginService } from '@modules/auth/auth-mfa-login.service';
import { IamMfaChallengeService } from '@modules/iam-mfa/iam-mfa-challenge.service';
import { IamMfaEnrollmentService } from '@modules/iam-mfa/iam-mfa-enrollment.service';
import { IamMfaResetService } from '@modules/iam-mfa/iam-mfa-reset.service';
import { IamMfaService } from '@modules/iam-mfa/iam-mfa.service';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { encryptMfaSecret } from '@modules/iam-mfa/iam-mfa-crypto.util';
import { resolveAcceptedTotpStep } from '@modules/iam-mfa/iam-mfa-totp-step.util';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { AuthGuard } from '@shared/auth/auth.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { StepUpGuard } from '@shared/auth/step-up.guard';
import { MasterGlobalIdentityService } from '@modules/users/master-global-identity.service';
import { UsersService } from '@modules/users/users.service';
import { UserAccessAuthorityService } from '@shared/auth/user-access-authority.service';
import { PrismaService } from '@shared/database/prisma.service';
import { createUsrP2Config, createUsrP2PgIamStack } from '@modules/users/testing/usr-p2-pg-iam-stack.helper';
import { createUsrP3a3IdentityPgStack } from '@modules/users/testing/usr-p3a3-identity-pg-stack.helper';
import { HealthController } from '@modules/health/health.controller';
import { HealthService } from '@modules/health/health.service';
import { SecurityGovernanceController } from '../security-governance.controller';
import { SecurityGovernanceService } from '../security-governance.service';
import { SecurityGovernanceSessionAuditService } from '../security-governance-session-audit.service';
import { SecurityGovernancePlatformPermissionAuditService } from '../security-governance-platform-permission-audit.service';
import { UsersController } from '@modules/users/users.controller';
import { OrganizationRoleService } from '@modules/users/organization-role.service';
import { OrganizationRoleVersionService } from '@modules/users/organization-role-version.service';
import { OrganizationInviteService } from '@modules/users/organization-invite.service';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import type { StepUpGrantBinding } from '@modules/iam-mfa/iam-mfa-step-up-binding.types';
import { PLATFORM_PERMISSION_JWT_VALUES } from '@modules/users/platform-permissions/platform-permission.constants';
import { buildValidationFailedResponse } from '@shared/validation/validation-error.util';
import { BadRequestException } from '@nestjs/common';

export const USR_P3A3_HTTP_JWT_SECRET = 'usr-p3a3-http-pg-secret';

export const USR_P3A3_HTTP_MFA_ENV: Record<string, string> = {
  IAM_MFA_MASTER_ADMIN_ENABLED: 'true',
  IAM_MFA_STEP_UP_ENFORCED: 'true',
  IAM_MFA_ENROLLMENT_ENABLED: 'true',
  IAM_MFA_PRIVILEGED_ENROLLMENT_REQUIRED: 'true',
};

export type UsrP3a3HttpPgContext = {
  app: INestApplication;
  prisma: PrismaClient;
  p2: ReturnType<typeof createUsrP2PgIamStack>;
  p3: ReturnType<typeof createUsrP3a3IdentityPgStack>;
  authMfaLogin: AuthMfaLoginService;
  challenge: IamMfaChallengeService;
  stepUp: IamMfaStepUpService;
  platformPermissions: PlatformPermissionService;
  refresh: RefreshTokenService;
};

export function assertUsrP3a3HttpDisposableDb(envKey: string): void {
  if (process.env[envKey] !== '1') throw new Error(`${envKey}=1 required`);
  const raw = process.env.DATABASE_URL ?? '';
  let host = '';
  try {
    host = new URL(raw.replace(/^postgres:/, 'postgresql:')).hostname;
  } catch {
    throw new Error('DATABASE_URL must be a valid postgres URL');
  }
  const dbName = raw.split('/').pop()?.split('?')[0] ?? '';
  if (!['127.0.0.1', 'localhost'].includes(host) || !/^usr_p2_[a-z0-9_]+$/.test(dbName)) {
    throw new Error('DATABASE_URL must target disposable loopback usr_p2_* test DB');
  }
}

export async function createUsrP3a3IdentityHttpApp(prisma: PrismaClient): Promise<UsrP3a3HttpPgContext> {
  const p2 = createUsrP2PgIamStack(prisma, USR_P3A3_HTTP_JWT_SECRET, {
    legacyUnscopedGrace: true,
    orgBoundRefreshSessions: false,
  });
  const p3 = createUsrP3a3IdentityPgStack(prisma, USR_P3A3_HTTP_JWT_SECRET);
  const stepUp = new IamMfaStepUpService(prisma as never);
  const platformPermissions = new PlatformPermissionService(prisma as never);
  const challenge = new IamMfaChallengeService(prisma as never, p2.refresh, stepUp);
  const config = createUsrP2Config(USR_P3A3_HTTP_JWT_SECRET);
  const enrollment = new IamMfaEnrollmentService(prisma as never, platformPermissions);
  const authMfaLogin = new AuthMfaLoginService(
    config as ConfigService,
    prisma as never,
    p2.refresh,
    enrollment,
    challenge,
    platformPermissions,
  );
  const mfaReset = new IamMfaResetService(prisma as never, p2.sessionPolicy, p3.iamAudit);
  const iamMfa = new IamMfaService(
    prisma as never,
    p2.refresh,
    enrollment,
    challenge,
    mfaReset,
    platformPermissions,
  );
  const sessionAudit = new SecurityGovernanceSessionAuditService(
    prisma as never,
    p3.auditDelivery,
    p2.refresh,
  );
  const roleService = new OrganizationRoleService(
    prisma as never,
    p3.userAudit,
    new OrganizationRoleVersionService(prisma as never),
  );

  const healthService = {
    checkReadiness: async () => ({
      status: 'ok' as const,
      checks: { postgres: { status: 'ok' as const } },
    }),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [SecurityGovernanceController, UsersController, HealthController],
    providers: [
      Reflector,
      RolesGuard,
      MasterAdminMfaGuard,
      StepUpGuard,
      { provide: APP_GUARD, useClass: AuthGuard },
      { provide: PrismaService, useValue: prisma },
      { provide: ConfigService, useValue: config },
      { provide: RefreshTokenService, useValue: p2.refresh },
      { provide: UserAccessAuthorityService, useValue: p2.authority },
      { provide: PlatformPermissionService, useValue: platformPermissions },
      { provide: IamMfaStepUpService, useValue: stepUp },
      { provide: IamMfaService, useValue: iamMfa },
      { provide: MasterGlobalIdentityService, useValue: p3.globalIdentity },
      { provide: UsersService, useValue: p3.usersService },
      { provide: OrganizationInviteService, useValue: p3.inviteService },
      { provide: OrganizationRoleService, useValue: roleService },
      { provide: SecurityGovernanceSessionAuditService, useValue: sessionAudit },
      { provide: HealthService, useValue: healthService },
      SecurityGovernanceService,
      SecurityGovernancePlatformPermissionAuditService,
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new BadRequestException(buildValidationFailedResponse(errors)),
    }),
  );
  app.setGlobalPrefix('api/v1');
  await app.init();

  return {
    app,
    prisma,
    p2,
    p3,
    authMfaLogin,
    challenge,
    stepUp,
    platformPermissions,
    refresh: p2.refresh,
  };
}

export async function seedMasterAdminWithTotp(
  prisma: PrismaClient,
): Promise<{ userId: string; email: string; secret: string }> {
  const userId = randomUUID();
  const secret = authenticator.generateSecret();
  const email = `p3a3-http-ma-${userId}@example.test`;
  await prisma.user.create({
    data: {
      id: userId,
      email,
      platformRole: UserPlatformRole.MASTER_ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash: await bcrypt.hash('P3a3Http!long-xy', 10),
      sessionVersion: 0,
      securityVersion: 0,
    },
  });
  await prisma.userMfaFactor.create({
    data: {
      userId,
      factorType: MfaFactorType.TOTP,
      encryptedSecret: encryptMfaSecret(secret),
      label: 'p3a3-http',
      verifiedAt: new Date(),
      enabledAt: new Date(),
    },
  });
  return { userId, email, secret };
}

export async function issueMasterPrivilegedHttpSession(
  ctx: Pick<
    UsrP3a3HttpPgContext,
  'authMfaLogin' | 'challenge' | 'refresh' | 'prisma'
  >,
  input: { userId: string; email: string; secret: string },
): Promise<{
  accessToken: string;
  stepUpToken: string;
  family: string;
  binding: StepUpGrantBinding;
}> {
  const live = await ctx.prisma.user.findUniqueOrThrow({
    where: { id: input.userId },
    select: { sessionVersion: true, securityVersion: true },
  });
  await ctx.prisma.userMfaFactor.updateMany({
    where: { userId: input.userId, factorType: MfaFactorType.TOTP },
    data: { lastTotpStep: null },
  });
  const login = await ctx.authMfaLogin.completeLoginMfa({
    mfaPendingToken: ctx.authMfaLogin.signMfaPendingToken({
      userId: input.userId,
      sessionVersion: live.sessionVersion,
      securityVersion: live.securityVersion,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    }),
    code: authenticator.generate(input.secret),
  });
  const rotated = await ctx.refresh.rotate(login.refreshToken);
  const decoded = jwt.verify(rotated.accessToken, USR_P3A3_HTTP_JWT_SECRET) as jwt.JwtPayload;
  const family = String(decoded.tokenFamily);
  const code2 = authenticator.generate(input.secret);
  const step2 = resolveAcceptedTotpStep(code2, input.secret);
  const factor = await ctx.prisma.userMfaFactor.findFirstOrThrow({ where: { userId: input.userId } });
  if (factor.lastTotpStep !== null && factor.lastTotpStep >= step2) {
    await ctx.prisma.userMfaFactor.update({
      where: { id: factor.id },
      data: { lastTotpStep: step2 - 1n },
    });
  }
  const challenged = await ctx.challenge.challengeWithTotp({
    userId: input.userId,
    code: code2,
    sessionBinding: { tokenFamily: family },
  });
  const binding: StepUpGrantBinding = {
    tokenFamily: family,
    organizationId: null,
    membershipId: null,
    sessionVersion: Number(decoded.sessionVersion ?? 0),
    securityVersion: Number(decoded.securityVersion ?? 0),
    membershipVersion: null,
  };
  return {
    accessToken: rotated.accessToken,
    stepUpToken: challenged.stepUpToken,
    family,
    binding,
  };
}

export async function seedOrgAdminSession(
  prisma: PrismaClient,
  refresh: RefreshTokenService,
): Promise<{ accessToken: string; userId: string; orgId: string }> {
  const orgId = randomUUID();
  const userId = randomUUID();
  const memId = randomUUID();
  await prisma.organization.create({
    data: {
      id: orgId,
      companyName: 'Org admin HTTP',
      businessType: BusinessType.RENTAL,
      status: OrganizationStatus.ACTIVE,
    },
  });
  await prisma.user.create({
    data: {
      id: userId,
      email: `p3a3-orgadmin-${userId}@example.test`,
      platformRole: UserPlatformRole.USER,
      status: UserStatus.ACTIVE,
    },
  });
  await prisma.organizationMembership.create({
    data: {
      id: memId,
      userId,
      organizationId: orgId,
      role: MembershipRole.ORG_ADMIN,
      status: MembershipStatus.ACTIVE,
    },
  });
  const pair = await refresh.issueTokenPair(
    {
      id: userId,
      email: `p3a3-orgadmin-${userId}@example.test`,
      platformRole: UserPlatformRole.USER,
      sessionVersion: 0,
      securityVersion: 0,
    },
    {
      organizationId: orgId,
      membershipId: memId,
      role: 'ORG_ADMIN',
      membershipVersion: 0,
    },
  );
  return { accessToken: pair.accessToken, userId, orgId };
}

export async function seedBillingOnlySession(
  prisma: PrismaClient,
  refresh: RefreshTokenService,
  platformPermissions: PlatformPermissionService,
): Promise<{ accessToken: string; delegateId: string; masterId: string }> {
  const masterId = randomUUID();
  const delegateId = randomUUID();
  await prisma.user.createMany({
    data: [
      {
        id: masterId,
        email: `p3a3-bill-ma-${masterId}@example.test`,
        platformRole: UserPlatformRole.MASTER_ADMIN,
        status: UserStatus.ACTIVE,
      },
      {
        id: delegateId,
        email: `p3a3-bill-delegate-${delegateId}@example.test`,
        platformRole: UserPlatformRole.USER,
        status: UserStatus.ACTIVE,
      },
    ],
  });
  await platformPermissions.grantMasterBilling(delegateId, masterId);
  const pair = await refresh.issueTokenPair(
    {
      id: delegateId,
      email: `p3a3-bill-delegate-${delegateId}@example.test`,
      platformRole: UserPlatformRole.USER,
      sessionVersion: 0,
      securityVersion: 0,
    },
    null,
  );
  const decoded = jwt.verify(pair.accessToken, USR_P3A3_HTTP_JWT_SECRET) as jwt.JwtPayload;
  expect(decoded.platformPermissions).toContain(PLATFORM_PERMISSION_JWT_VALUES.MASTER_BILLING);
  return { accessToken: pair.accessToken, delegateId, masterId };
}

export function canonicalCreatePath() {
  return '/api/v1/admin/security/users';
}

export function canonicalPatchPath(userId: string) {
  return `/api/v1/admin/security/users/${userId}`;
}

export function legacyCreatePath() {
  return '/api/v1/admin/users';
}

export function legacyPatchPath(userId: string) {
  return `/api/v1/admin/users/${userId}`;
}

export const PRIVILEGED_STEP_UP_ACTION = STEP_UP_ACTION.MASTER_USER_MANAGEMENT;