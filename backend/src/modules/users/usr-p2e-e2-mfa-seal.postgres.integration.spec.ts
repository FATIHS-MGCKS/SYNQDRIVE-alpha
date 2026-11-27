/**
 * USR-P2E E2 — MFA final seal (disposable PostgreSQL).
 * USR_P2E_E2_MFA_PG=1
 */
import { randomUUID } from 'node:crypto';
import { authenticator } from 'otplib';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import {
  BusinessType,
  MembershipStatus,
  MfaFactorType,
  PrismaClient,
  SessionAssuranceLevel,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AuthMfaLoginService } from '@modules/auth/auth-mfa-login.service';
import { IamMfaChallengeService } from '@modules/iam-mfa/iam-mfa-challenge.service';
import { IamMfaEnrollmentService } from '@modules/iam-mfa/iam-mfa-enrollment.service';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { IamMfaResetService } from '@modules/iam-mfa/iam-mfa-reset.service';
import { MFA_ERROR, STEP_UP_ACTION, STEP_UP_TTL_MS } from '@modules/iam-mfa/iam-mfa.policy';
import { encryptMfaSecret } from '@modules/iam-mfa/iam-mfa-crypto.util';
import { resolveAcceptedTotpStep } from '@modules/iam-mfa/iam-mfa-totp-step.util';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import {
  createUsrP2Config,
  createUsrP2PgIamStack,
} from '@modules/users/testing/usr-p2-pg-iam-stack.helper';
import {
  ASSURANCE_LEVEL_MFA,
  buildMfaClaims,
  buildPasswordOnlyClaims,
} from '@shared/auth/auth-session-claims.types';
import { StepUpGuard } from '@shared/auth/step-up.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { STEP_UP_METADATA_KEY } from '@shared/decorators/require-step-up.decorator';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import { UsersService } from '@modules/users/users.service';
import { IamAuditService } from '@modules/users/iam-audit.service';
import { IamMembershipLifecycleService } from '@modules/users/iam-membership-lifecycle.service';
import { PasswordResetService } from '@modules/auth/password-reset.service';
import { PasswordResetRateLimitService } from '@modules/auth/password-reset-rate-limit.service';
import {
  generatePasswordResetToken,
  passwordResetTokenLookupKey,
} from '@modules/auth/utils/password-reset-token.util';
import { AccountService } from '@modules/account/account.service';
import { PasswordPolicyService } from '@shared/auth/password-policy.service';
import type { StepUpGrantBinding, StepUpGrantValidationContext } from '@modules/iam-mfa/iam-mfa-step-up-binding.types';
import { AuthGuard } from '@shared/auth/auth.guard';
import { UserAccessAuthorityService } from '@shared/auth/user-access-authority.service';
import { RequireStepUp } from '@shared/decorators/require-step-up.decorator';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { Controller, HttpCode, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import * as request from 'supertest';
import { AuditService } from '@modules/activity-log/audit.service';
import { acquireCanonicalSecurityMutationLocks } from '@modules/auth/iam-security-mutation-concurrency';

const OPT_IN = 'USR_P2E_E2_MFA_PG';
const JWT_SECRET = 'usr-p2e-e2-mfa-secret';
const run = process.env[OPT_IN] === '1';

function assertDisposableDb(): void {
  if (process.env[OPT_IN] !== '1') throw new Error(`${OPT_IN}=1 required`);
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url) || !/usr/i.test(url)) {
    throw new Error('DATABASE_URL must target disposable localhost usr_* test DB');
  }
}

(run ? describe : describe.skip)('USR-P2E E2 MFA seal (PostgreSQL)', () => {
  jest.setTimeout(360_000);
  let prisma: PrismaClient;
  let prismaB: PrismaClient;
  let stack: ReturnType<typeof createUsrP2PgIamStack>;
  let stepUp: IamMfaStepUpService;
  let challenge: IamMfaChallengeService;
  let authMfaLogin: AuthMfaLoginService;
  let mfaReset: IamMfaResetService;
  let usersService: UsersService;
  let account: AccountService;
  let passwordReset: PasswordResetService;
  let authority: UserAccessAuthorityService;

  beforeAll(() => {
    assertDisposableDb();
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.IAM_MFA_MASTER_ADMIN_ENABLED = 'true';
    process.env.IAM_MFA_STEP_UP_ENFORCED = 'true';
    prisma = new PrismaClient();
    prismaB = new PrismaClient();
    stack = createUsrP2PgIamStack(prisma, JWT_SECRET, {
      legacyUnscopedGrace: true,
      orgBoundRefreshSessions: false,
    });
    stepUp = new IamMfaStepUpService(prisma as never);
    challenge = new IamMfaChallengeService(prisma as never, stack.refresh, stepUp);
    const config = {
      get: (key: string, fallback?: unknown) => {
        if (key === 'app.jwtSecret') return JWT_SECRET;
        if (key === 'iam.masterAdminMfaEnabled') return true;
        return fallback;
      },
    } as ConfigService;
    const platformPermissions = new PlatformPermissionService(prisma as never);
    const enrollment = new IamMfaEnrollmentService(prisma as never, platformPermissions);
    authMfaLogin = new AuthMfaLoginService(
      config,
      prisma as never,
      stack.refresh,
      enrollment,
      challenge,
      platformPermissions,
    );
    const iamAudit = {
      enqueueInTransaction: jest.fn().mockImplementation(async (_tx, input) => ({
        id: randomUUID(),
        ...input,
      })),
      processOutboxIds: jest.fn().mockResolvedValue(undefined),
    } as unknown as IamAuditService;
    mfaReset = new IamMfaResetService(prisma as never, stack.sessionPolicy, iamAudit);
    const lifecycle = new IamMembershipLifecycleService(
      prisma as never,
      iamAudit,
      { notifyAfterCommit: jest.fn() } as never,
      stack.sessionPolicy,
    );
    usersService = new UsersService(
      prisma as never,
      iamAudit,
      lifecycle,
      { createReset: jest.fn() } as unknown as PasswordResetService,
      stack.sessionPolicy,
    );
    account = new AccountService(
      prisma as never,
      { record: jest.fn() } as unknown as AuditService,
      stack.refresh,
      stack.sessionPolicy,
      new PasswordPolicyService(),
    );
    authority = stack.authority;
    passwordReset = new PasswordResetService(
      prisma as never,
      new PasswordPolicyService(),
      { assertWithinLimit: jest.fn() } as unknown as PasswordResetRateLimitService,
      { sendPasswordReset: jest.fn(), sendPasswordResetCompleted: jest.fn() } as never,
      stack.sessionPolicy,
      { record: jest.fn() } as never,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await prismaB?.$disconnect();
  });

  async function seedUserWithTotp(opts?: { platformRole?: UserPlatformRole }) {
    const userId = randomUUID();
    const secret = authenticator.generateSecret();
    const email = `e2-${userId}@example.test`;
    await prisma.user.create({
      data: {
        id: userId,
        email,
        platformRole: opts?.platformRole ?? UserPlatformRole.MASTER_ADMIN,
        status: UserStatus.ACTIVE,
        passwordHash: await bcrypt.hash('E2Pass1!long-xy', 10),
        sessionVersion: 0,
        securityVersion: 0,
      },
    });
    await prisma.userMfaFactor.create({
      data: {
        userId,
        factorType: MfaFactorType.TOTP,
        encryptedSecret: encryptMfaSecret(secret),
        label: 'e2',
        verifiedAt: new Date(),
        enabledAt: new Date(),
      },
    });
    return { userId, email, secret };
  }

  function mfaGrantClaims() {
    return buildMfaClaims({ securityVersion: 0 });
  }

  async function issueMasterAdminSession(userId: string, email: string, sessionVersion = 0, securityVersion = 0) {
    await stack.refresh.issueTokenPair(
      {
        id: userId,
        email,
        platformRole: UserPlatformRole.MASTER_ADMIN,
        sessionVersion,
        securityVersion,
      },
      null,
    );
    const head = await prisma.refreshToken.findFirstOrThrow({
      where: { userId, revokedAt: null, replacedBy: null },
      orderBy: { createdAt: 'desc' },
    });
    const binding: StepUpGrantBinding = {
      tokenFamily: head.family,
      organizationId: null,
      membershipId: null,
      sessionVersion,
      securityVersion,
      membershipVersion: null,
    };
    return { binding, sessionId: head.id, family: head.family };
  }

  function grantValidationContext(binding: StepUpGrantBinding): StepUpGrantValidationContext {
    return {
      tokenFamily: binding.tokenFamily,
      organizationId: binding.organizationId,
      membershipId: binding.membershipId,
      sessionVersion: binding.sessionVersion,
      membershipVersion: binding.membershipVersion,
    };
  }

  it('P2-R22 persisted lastTotpStep matches accepted TOTP window step', async () => {
    const { userId, secret } = await seedUserWithTotp();
    const code = authenticator.generate(secret);
    const normalized = code.replace(/\s+/g, '').trim();
    const expectedStep = resolveAcceptedTotpStep(normalized, secret);
    await challenge.verifyLoginMfaTotp(userId, code);
    const factor = await prisma.userMfaFactor.findFirstOrThrow({ where: { userId } });
    expect(factor.lastTotpStep).toBe(expectedStep);
  });

  it('P2-R22 subsequent TOTP step accepted after prior step consumed', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    const { userId, secret } = await seedUserWithTotp();
    const base = Date.now();
    jest.setSystemTime(base);
    const code1 = authenticator.generate(secret);
    await challenge.verifyLoginMfaTotp(userId, code1);
    jest.setSystemTime(base + 31_000);
    const code2 = authenticator.generate(secret);
    await expect(challenge.verifyLoginMfaTotp(userId, code2)).resolves.toBeDefined();
    jest.useRealTimers();
  });

  it('P2-R22 older TOTP step cannot advance monotonic consumption', async () => {
    const { userId, secret } = await seedUserWithTotp();
    const futureStep = BigInt(Math.floor(Date.now() / 1000 / 30) + 2);
    await prisma.userMfaFactor.updateMany({
      where: { userId },
      data: { lastTotpStep: futureStep },
    });
    const code = authenticator.generate(secret);
    await expect(challenge.verifyLoginMfaTotp(userId, code)).rejects.toMatchObject({
      response: { code: MFA_ERROR.REPLAY },
    });
  });

  it('P2-R23 recovery login refresh assurance downgrades conservatively', async () => {
    const { userId } = await seedUserWithTotp();
    const recoveryPlain = 'RCVY-CODE-1234';
    await prisma.userMfaRecoveryCode.create({
      data: { userId, codeHash: await bcrypt.hash(recoveryPlain.toUpperCase(), 10) },
    });
    const pending = authMfaLogin.signMfaPendingToken({
      userId,
      sessionVersion: 0,
      securityVersion: 0,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });
    const login = await authMfaLogin.completeLoginMfa({
      mfaPendingToken: pending,
      recoveryCode: recoveryPlain,
    });
    const head = await prisma.refreshToken.findFirst({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(head?.assuranceLevel).toBe(SessionAssuranceLevel.MFA);
    const loginDecoded = jwt.verify(login.accessToken, JWT_SECRET) as jwt.JwtPayload;
    expect(loginDecoded.authMethods).toEqual(expect.arrayContaining(['pwd', 'recovery']));
    const rotated = await stack.refresh.rotate(login.refreshToken);
    const decoded = jwt.verify(rotated.accessToken, JWT_SECRET) as jwt.JwtPayload;
    expect(Number(decoded.assuranceLevel)).toBeLessThan(ASSURANCE_LEVEL_MFA);
    expect(decoded.mfaAuthenticatedAt ?? null).toBeNull();
    const successor = await prisma.refreshToken.findFirst({
      where: { userId, revokedAt: null, replacedBy: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(successor?.assuranceLevel).toBe(SessionAssuranceLevel.PASSWORD);
    expect(successor?.family).toBe(head?.family);
  });

  it('E2-G01 valid step-up grant accepted by StepUpGuard', async () => {
    const { userId, email } = await seedUserWithTotp();
    const { binding } = await issueMasterAdminSession(userId, email);
    const grant = await stepUp.createGrant({
      userId,
      actionScope: STEP_UP_ACTION.MASTER_ORGANIZATION,
      claims: mfaGrantClaims(),
      binding,
    });
    const ctxUser = {
      id: userId,
      platformRole: 'MASTER_ADMIN',
      sessionClaims: buildPasswordOnlyClaims(0),
      ...grantValidationContext(binding),
    };
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === STEP_UP_METADATA_KEY) return STEP_UP_ACTION.MASTER_ORGANIZATION;
        return undefined;
      }),
    } as unknown as Reflector;
    const guard = new StepUpGuard(reflector, stepUp);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'x-step-up-token': grant.stepUpToken },
          user: ctxUser,
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as never;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('E2-G02 concurrent step-up consumption allows exactly one winner', async () => {
    const { userId, email } = await seedUserWithTotp();
    const { binding } = await issueMasterAdminSession(userId, email);
    const ctx = grantValidationContext(binding);
    const grant = await stepUp.createGrant({
      userId,
      actionScope: STEP_UP_ACTION.MASTER_ORGANIZATION,
      claims: mfaGrantClaims(),
      binding,
    });
    const stepUpB = new IamMfaStepUpService(prismaB as never);
    const [a, b] = await Promise.allSettled([
      stepUp.validateGrant(userId, grant.stepUpToken, STEP_UP_ACTION.MASTER_ORGANIZATION, ctx),
      stepUpB.validateGrant(userId, grant.stepUpToken, STEP_UP_ACTION.MASTER_ORGANIZATION, ctx),
    ]);
    expect([a, b].filter((r) => r.status === 'fulfilled' && r.value === true).length).toBe(1);
  });

  it('E2-G03 consumed grant denied on second validation', async () => {
    const { userId, email } = await seedUserWithTotp();
    const { binding } = await issueMasterAdminSession(userId, email);
    const ctx = grantValidationContext(binding);
    const grant = await stepUp.createGrant({
      userId,
      actionScope: STEP_UP_ACTION.MASTER_ORGANIZATION,
      claims: mfaGrantClaims(),
      binding,
    });
    expect(
      await stepUp.validateGrant(userId, grant.stepUpToken, STEP_UP_ACTION.MASTER_ORGANIZATION, ctx),
    ).toBe(true);
    expect(
      await stepUp.validateGrant(userId, grant.stepUpToken, STEP_UP_ACTION.MASTER_ORGANIZATION, ctx),
    ).toBe(false);
  });

  it('E2-G04 expired grant denied', async () => {
    const { userId } = await seedUserWithTotp();
    const raw = 'a'.repeat(64);
    const { hashStepUpToken } = await import('@modules/iam-mfa/iam-mfa-crypto.util');
    await prisma.userMfaStepUpGrant.create({
      data: {
        userId,
        tokenHash: hashStepUpToken(raw),
        actionScope: STEP_UP_ACTION.MASTER_ORGANIZATION,
        assuranceLevel: ASSURANCE_LEVEL_MFA,
        authMethods: ['pwd', 'totp'],
        authenticatedAt: new Date(),
        mfaAuthenticatedAt: new Date(),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const { binding } = await issueMasterAdminSession(userId, `e2-${userId}@example.test`);
    expect(
      await stepUp.validateGrant(userId, raw, STEP_UP_ACTION.MASTER_ORGANIZATION, grantValidationContext(binding)),
    ).toBe(false);
  });

  it('E2-G05 wrong action scope denied', async () => {
    const { userId, email } = await seedUserWithTotp();
    const { binding } = await issueMasterAdminSession(userId, email);
    const grant = await stepUp.createGrant({
      userId,
      actionScope: STEP_UP_ACTION.MASTER_BILLING,
      claims: mfaGrantClaims(),
      binding,
    });
    expect(
      await stepUp.validateGrant(
        userId,
        grant.stepUpToken,
        STEP_UP_ACTION.MASTER_ORGANIZATION,
        grantValidationContext(binding),
      ),
    ).toBe(false);
  });

  it('E5B platform grant denied when validation context is org-scoped', async () => {
    const { userId, email } = await seedUserWithTotp();
    const { binding } = await issueMasterAdminSession(userId, email);
    const grant = await stepUp.createGrant({
      userId,
      actionScope: STEP_UP_ACTION.MASTER_ORGANIZATION,
      claims: mfaGrantClaims(),
      binding,
    });
    const orgScopedCtx: StepUpGrantValidationContext = {
      ...grantValidationContext(binding),
      organizationId: randomUUID(),
      membershipId: randomUUID(),
    };
    expect(
      await stepUp.validateGrant(
        userId,
        grant.stepUpToken,
        STEP_UP_ACTION.MASTER_ORGANIZATION,
        orgScopedCtx,
      ),
    ).toBe(false);
  });

  it('E5B org-null grant scope does not accept org-bound session context', async () => {
    const { userId, email } = await seedUserWithTotp();
    const orgId = randomUUID();
    const memId = randomUUID();
    await prisma.organization.create({
      data: { id: orgId, companyName: 'E5B', businessType: BusinessType.RENTAL, status: 'ACTIVE' },
    });
    await prisma.organizationMembership.create({
      data: {
        id: memId,
        userId,
        organizationId: orgId,
        role: 'WORKER',
        status: MembershipStatus.ACTIVE,
      },
    });
    const { binding } = await issueMasterAdminSession(userId, email);
    const raw = 'c'.repeat(64);
    const { hashStepUpToken } = await import('@modules/iam-mfa/iam-mfa-crypto.util');
    await prisma.userMfaStepUpGrant.create({
      data: {
        userId,
        tokenHash: hashStepUpToken(raw),
        actionScope: STEP_UP_ACTION.MASTER_ORGANIZATION,
        assuranceLevel: ASSURANCE_LEVEL_MFA,
        authMethods: ['pwd', 'totp'],
        authenticatedAt: new Date(),
        mfaAuthenticatedAt: new Date(),
        expiresAt: new Date(Date.now() + STEP_UP_TTL_MS),
        tokenFamily: binding.tokenFamily,
        organizationId: null,
        membershipId: null,
        sessionVersion: binding.sessionVersion,
        securityVersion: binding.securityVersion,
        membershipVersion: null,
      },
    });
    const orgCtx: StepUpGrantValidationContext = {
      tokenFamily: binding.tokenFamily,
      organizationId: orgId,
      membershipId: memId,
      sessionVersion: binding.sessionVersion,
      membershipVersion: 0,
    };
    expect(
      await stepUp.validateGrant(userId, raw, STEP_UP_ACTION.MASTER_ORGANIZATION, orgCtx),
    ).toBe(false);
  });

  it('E2-G06 wrong user denied', async () => {
    const { userId, email } = await seedUserWithTotp();
    const other = randomUUID();
    const { binding } = await issueMasterAdminSession(userId, email);
    const grant = await stepUp.createGrant({
      userId,
      actionScope: STEP_UP_ACTION.MASTER_ORGANIZATION,
      claims: mfaGrantClaims(),
      binding,
    });
    expect(
      await stepUp.validateGrant(
        other,
        grant.stepUpToken,
        STEP_UP_ACTION.MASTER_ORGANIZATION,
        grantValidationContext(binding),
      ),
    ).toBe(false);
  });

  it('LEGACY unbound persisted grant denied under binding enforcement', async () => {
    const { userId, email } = await seedUserWithTotp();
    const { binding } = await issueMasterAdminSession(userId, email);
    const raw = 'b'.repeat(64);
    const { hashStepUpToken } = await import('@modules/iam-mfa/iam-mfa-crypto.util');
    await prisma.userMfaStepUpGrant.create({
      data: {
        userId,
        tokenHash: hashStepUpToken(raw),
        actionScope: STEP_UP_ACTION.MASTER_ORGANIZATION,
        assuranceLevel: ASSURANCE_LEVEL_MFA,
        authMethods: ['pwd', 'totp'],
        authenticatedAt: new Date(),
        mfaAuthenticatedAt: new Date(),
        expiresAt: new Date(Date.now() + STEP_UP_TTL_MS),
      },
    });
    expect(
      await stepUp.validateGrant(userId, raw, STEP_UP_ACTION.MASTER_ORGANIZATION, grantValidationContext(binding)),
    ).toBe(false);
  });

  it('E2-G07 wrong session family denied for bound MFA challenge', async () => {
    const { userId, secret } = await seedUserWithTotp({ platformRole: UserPlatformRole.USER });
    const orgId = randomUUID();
    const memId = randomUUID();
    const email = `e2-${userId}@example.test`;
    await prisma.organization.create({
      data: { id: orgId, companyName: 'E2G7', businessType: BusinessType.RENTAL, status: 'ACTIVE' },
    });
    await prisma.organizationMembership.create({
      data: {
        id: memId,
        userId,
        organizationId: orgId,
        role: 'WORKER',
        status: MembershipStatus.ACTIVE,
      },
    });
    const userCtx = {
      id: userId,
      email,
      platformRole: UserPlatformRole.USER,
      sessionVersion: 0,
      securityVersion: 0,
    };
    const membership = {
      organizationId: orgId,
      membershipId: memId,
      role: 'WORKER',
      membershipVersion: 0,
    };
    await stack.refresh.issueTokenPair(userCtx, membership);
    const familyA = (
      await prisma.refreshToken.findFirstOrThrow({ where: { userId }, orderBy: { createdAt: 'asc' } })
    ).family;
    await stack.refresh.issueTokenPair(userCtx, membership);
    const familyB = (
      await prisma.refreshToken.findFirstOrThrow({ where: { userId }, orderBy: { createdAt: 'desc' } })
    ).family;
    expect(familyA).not.toBe(familyB);

  const challenged = await challenge.challengeWithTotp({
      userId,
      code: authenticator.generate(secret),
      sessionBinding: { tokenFamily: familyA, organizationId: orgId, membershipId: memId },
    });
    const ctxA: StepUpGrantValidationContext = {
      tokenFamily: familyA,
      organizationId: orgId,
      membershipId: memId,
      sessionVersion: 0,
      membershipVersion: 0,
    };
    const ctxB: StepUpGrantValidationContext = {
      tokenFamily: familyB,
      organizationId: orgId,
      membershipId: memId,
      sessionVersion: 0,
      membershipVersion: 0,
    };
    expect(challenged.stepUpToken.length).toBeGreaterThan(0);
    const storedGrant = await prisma.userMfaStepUpGrant.findFirstOrThrow({
      where: { userId, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const authoritativeCtxA: StepUpGrantValidationContext = {
      tokenFamily: storedGrant.tokenFamily!,
      organizationId: storedGrant.organizationId,
      membershipId: storedGrant.membershipId,
      sessionVersion: storedGrant.sessionVersion!,
      membershipVersion: storedGrant.membershipVersion,
    };
    expect(
      await stepUp.validateGrant(
        userId,
        challenged.stepUpToken,
        STEP_UP_ACTION.MASTER_ORGANIZATION,
        authoritativeCtxA,
      ),
    ).toBe(true);
    expect(
      await stepUp.validateGrant(
        userId,
        challenged.stepUpToken,
        STEP_UP_ACTION.MASTER_ORGANIZATION,
        ctxB,
      ),
    ).toBe(false);
    void ctxA;
  });

  it('E2-G08 wrong organization binding denied', async () => {
    const { userId, secret } = await seedUserWithTotp({ platformRole: UserPlatformRole.USER });
    const orgA = randomUUID();
    const orgB = randomUUID();
    const memA = randomUUID();
    const memB = randomUUID();
    await prisma.organization.createMany({
      data: [
        { id: orgA, companyName: 'A', businessType: BusinessType.RENTAL, status: 'ACTIVE' },
        { id: orgB, companyName: 'B', businessType: BusinessType.RENTAL, status: 'ACTIVE' },
      ],
    });
    await prisma.organizationMembership.createMany({
      data: [
        { id: memA, userId, organizationId: orgA, role: 'WORKER', status: MembershipStatus.ACTIVE },
        { id: memB, userId, organizationId: orgB, role: 'WORKER', status: MembershipStatus.ACTIVE },
      ],
    });
    await stack.refresh.issueTokenPair(
      {
        id: userId,
        email: `e2-${userId}@example.test`,
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
      },
      { organizationId: orgA, membershipId: memA, role: 'WORKER', membershipVersion: 0 },
    );
    await stack.refresh.issueTokenPair(
      {
        id: userId,
        email: `e2-${userId}@example.test`,
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
      },
      { organizationId: orgB, membershipId: memB, role: 'WORKER', membershipVersion: 0 },
    );
    const familyA = (
      await prisma.refreshToken.findFirstOrThrow({
        where: { userId, organizationId: orgA, revokedAt: null },
        orderBy: { createdAt: 'desc' },
      })
    ).family;
    const challenged = await challenge.challengeWithTotp({
      userId,
      code: authenticator.generate(secret),
      sessionBinding: { tokenFamily: familyA, organizationId: orgA, membershipId: memA },
    });
    const ctxWrongOrg: StepUpGrantValidationContext = {
      tokenFamily: familyA,
      organizationId: orgB,
      membershipId: memB,
      sessionVersion: 0,
      membershipVersion: 0,
    };
    expect(challenged.stepUpToken.length).toBeGreaterThan(0);
    expect(
      await stepUp.validateGrant(
        userId,
        challenged.stepUpToken,
        STEP_UP_ACTION.MASTER_ORGANIZATION,
        ctxWrongOrg,
      ),
    ).toBe(false);
  });

  it('E2-G09 revoked initiating session invalidates step-up grant', async () => {
    const { userId, email, secret } = await seedUserWithTotp();
    const { binding: masterBinding } = await issueMasterAdminSession(userId, email);
    await stack.refresh.issueTokenPair(
      {
        id: userId,
        email,
        platformRole: UserPlatformRole.MASTER_ADMIN,
        sessionVersion: 0,
        securityVersion: 0,
      },
      null,
    );
    const tokens = await prisma.refreshToken.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    const familyA = tokens[0]!.family;
    const familyB = tokens[1]!.family;
    expect(familyA).not.toBe(familyB);
    const challenged = await challenge.challengeWithTotp({
      userId,
      code: authenticator.generate(secret),
      sessionBinding: { tokenFamily: familyA },
    });
    const ctxA = grantValidationContext({
      tokenFamily: familyA,
      organizationId: null,
      membershipId: null,
      sessionVersion: 0,
      securityVersion: 0,
      membershipVersion: null,
    });
    const ctxB = grantValidationContext({
      tokenFamily: familyB,
      organizationId: null,
      membershipId: null,
      sessionVersion: 0,
      securityVersion: 0,
      membershipVersion: null,
    });
    const sessionIdA = stack.refresh.resolveActiveHeadSessionIdForFamily(tokens, familyA);
    expect(sessionIdA).toBeTruthy();
    await stack.refresh.revokeSessionById(userId, sessionIdA!);
    expect(
      await stepUp.validateGrant(
        userId,
        challenged.stepUpToken,
        STEP_UP_ACTION.MASTER_ORGANIZATION,
        ctxB,
      ),
    ).toBe(false);
    expect(
      await stepUp.validateGrant(
        userId,
        challenged.stepUpToken,
        STEP_UP_ACTION.MASTER_ORGANIZATION,
        ctxA,
      ),
    ).toBe(false);
    const familyBActive = await prisma.refreshToken.findFirst({
      where: { userId, family: familyB, revokedAt: null, replacedBy: null },
    });
    expect(familyBActive).toBeTruthy();
    void masterBinding;
  });

  it('E2-G09 atomic revoke-all clears unconsumed grants', async () => {
    const { userId, email } = await seedUserWithTotp();
    const { binding } = await issueMasterAdminSession(userId, email);
    const grant = await stepUp.createGrant({
      userId,
      actionScope: STEP_UP_ACTION.MASTER_ORGANIZATION,
      claims: mfaGrantClaims(),
      binding,
    });
    await prisma.$transaction(async (tx) => {
      await stack.refresh.revokeAllActiveForUserInTransaction(tx as never, userId);
    });
    expect(
      await stepUp.validateGrant(
        userId,
        grant.stepUpToken,
        STEP_UP_ACTION.MASTER_ORGANIZATION,
        grantValidationContext(binding),
      ),
    ).toBe(false);
  });

  it('E2-G10 admin password change invalidates unconsumed grants', async () => {
    const { userId, email } = await seedUserWithTotp();
    const { binding } = await issueMasterAdminSession(userId, email);
    const grant = await stepUp.createGrant({
      userId,
      actionScope: STEP_UP_ACTION.MASTER_ORGANIZATION,
      claims: mfaGrantClaims(),
      binding,
    });
    await usersService.changePasswordAdmin(userId, 'AdminChg1!long-xy', userId);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(
      await stepUp.validateGrant(
        userId,
        grant.stepUpToken,
        STEP_UP_ACTION.MASTER_ORGANIZATION,
        {
          ...grantValidationContext(binding),
          sessionVersion: user.sessionVersion,
        },
      ),
    ).toBe(false);
  });

  it('E2-G10 MFA reset invalidates unconsumed grants', async () => {
    const { userId, email } = await seedUserWithTotp();
    const { binding } = await issueMasterAdminSession(userId, email);
    const grant = await stepUp.createGrant({
      userId,
      actionScope: STEP_UP_ACTION.MASTER_ORGANIZATION,
      claims: mfaGrantClaims(),
      binding,
    });
    await mfaReset.resetMfaForUser({
      organizationId: 'platform',
      targetUserId: userId,
      actorUserId: userId,
      idempotencyKey: `e2-g10-mfa:${randomUUID()}`,
    });
    expect(
      await stepUp.validateGrant(
        userId,
        grant.stepUpToken,
        STEP_UP_ACTION.MASTER_ORGANIZATION,
        grantValidationContext(binding),
      ),
    ).toBe(false);
  });

  it('E2-G11 idempotent createGrant replay does not return unusable token', async () => {
    const { userId, email } = await seedUserWithTotp();
    const { binding } = await issueMasterAdminSession(userId, email);
    const idem = `e2-g11:${randomUUID()}`;
    const grant = await stepUp.createGrant({
      userId,
      actionScope: STEP_UP_ACTION.MASTER_ORGANIZATION,
      claims: mfaGrantClaims(),
      idempotencyKey: idem,
      binding,
    });
    await expect(
      stepUp.createGrant({
        userId,
        actionScope: STEP_UP_ACTION.MASTER_ORGANIZATION,
        claims: mfaGrantClaims(),
        idempotencyKey: idem,
        binding,
      }),
    ).rejects.toMatchObject({ response: { code: MFA_ERROR.STEP_UP_IDEMPOTENCY_REPLAY } });
    expect(
      await stepUp.validateGrant(
        userId,
        grant.stepUpToken,
        STEP_UP_ACTION.MASTER_ORGANIZATION,
        grantValidationContext(binding),
      ),
    ).toBe(true);
  });

  it('D09 MasterAdminMfaGuard accepts fresh MFA JWT for mutating route', async () => {
    const { userId, secret } = await seedUserWithTotp();
    const pending = authMfaLogin.signMfaPendingToken({
      userId,
      sessionVersion: 0,
      securityVersion: 0,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });
    const login = await authMfaLogin.completeLoginMfa({
      mfaPendingToken: pending,
      code: authenticator.generate(secret),
    });
    const claims = jwt.verify(login.accessToken, JWT_SECRET) as jwt.JwtPayload;
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === MASTER_ADMIN_MFA_ACTION_KEY) return STEP_UP_ACTION.MASTER_ORGANIZATION;
        return undefined;
      }),
    } as unknown as Reflector;
    const guard = new MasterAdminMfaGuard(
      reflector,
      prisma as never,
      stepUp,
    );
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          user: {
            id: userId,
            platformRole: 'MASTER_ADMIN',
            sessionClaims: {
              assuranceLevel: Number(claims.assuranceLevel),
              authMethods: claims.authMethods,
              authenticatedAt: claims.authenticatedAt,
              mfaAuthenticatedAt: claims.mfaAuthenticatedAt,
            },
          },
          headers: {},
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as never;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('COMBINED procedural guards reuse one bound grant across actions in one request', async () => {
    const { userId, email } = await seedUserWithTotp();
    const { binding } = await issueMasterAdminSession(userId, email);
    const grant = await stepUp.createGrant({
      userId,
      actionScope: 'GLOBAL',
      claims: mfaGrantClaims(),
      binding,
    });
    const requestObj: Record<string, unknown> = {
      method: 'POST',
      headers: { 'x-step-up-token': grant.stepUpToken },
      user: {
        id: userId,
        platformRole: 'MASTER_ADMIN',
        sessionClaims: buildPasswordOnlyClaims(0),
        ...grantValidationContext(binding),
      },
    };
    const reflectorMa = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === MASTER_ADMIN_MFA_ACTION_KEY) return STEP_UP_ACTION.MASTER_ORGANIZATION;
        return undefined;
      }),
    } as unknown as Reflector;
    const reflectorStep = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === STEP_UP_METADATA_KEY) return STEP_UP_ACTION.REVOKE_OTHER_USER_SESSIONS;
        return undefined;
      }),
    } as unknown as Reflector;
    const maGuard = new MasterAdminMfaGuard(reflectorMa, prisma as never, stepUp);
    const stepGuard = new StepUpGuard(reflectorStep, stepUp);
    const ctxBase = {
      switchToHttp: () => ({ getRequest: () => requestObj }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as never;
    await expect(maGuard.canActivate(ctxBase)).resolves.toBe(true);
    await expect(stepGuard.canActivate(ctxBase)).resolves.toBe(true);
    expect(
      await stepUp.validateGrant(
        userId,
        grant.stepUpToken,
        STEP_UP_ACTION.MASTER_ORGANIZATION,
        grantValidationContext(binding),
      ),
    ).toBe(false);
  });

  it('COMBINED StepUpGuard accepts fresh MFA without consuming grant header', async () => {
    const { userId } = await seedUserWithTotp();
    const freshClaims = buildMfaClaims({
      mfaAuthenticatedAt: new Date().toISOString(),
    });
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === STEP_UP_METADATA_KEY) return STEP_UP_ACTION.MASTER_ORGANIZATION;
        return undefined;
      }),
    } as unknown as Reflector;
    const guard = new StepUpGuard(reflector, stepUp);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {},
          user: { id: userId, platformRole: 'MASTER_ADMIN', sessionClaims: freshClaims },
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as never;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  @Controller('api/v1/usr-p2e-e2-probe')
  class E2ProbeController {
    @Post('combined-guards')
    @HttpCode(204)
    @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_ORGANIZATION)
    @RequireStepUp(STEP_UP_ACTION.REVOKE_OTHER_USER_SESSIONS)
    combinedGuards() {}

    @Post('mfa-guard-only')
    @HttpCode(204)
    @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_ORGANIZATION)
    mfaGuardOnly() {}
  }

  it('D09 HTTP AuthGuard + MasterAdminMfaGuard accepts fresh MFA JWT', async () => {
    const { userId, secret, email } = await seedUserWithTotp();
    const login = await authMfaLogin.completeLoginMfa({
      mfaPendingToken: authMfaLogin.signMfaPendingToken({
        userId,
        sessionVersion: 0,
        securityVersion: 0,
        platformRole: UserPlatformRole.MASTER_ADMIN,
      }),
      code: authenticator.generate(secret),
    });
    const reflector = new Reflector();
    const moduleRef = await Test.createTestingModule({
      controllers: [E2ProbeController],
      providers: [
        Reflector,
        { provide: PrismaService, useValue: prisma },
        { provide: IamMfaStepUpService, useValue: stepUp },
        { provide: UserAccessAuthorityService, useValue: authority },
        { provide: ConfigService, useValue: createUsrP2Config(JWT_SECRET) },
      ],
    }).compile();
    const app: INestApplication = moduleRef.createNestApplication();
    app.useGlobalGuards(
      new AuthGuard(reflector, authority),
      new MasterAdminMfaGuard(reflector, prisma as never, stepUp),
    );
    await app.init();
    await request(app.getHttpServer())
      .post('/api/v1/usr-p2e-e2-probe/mfa-guard-only')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(204);
    await app.close();
    void email;
  });

  it('COMBINED HTTP guards consume bound grant once across StepUp + MasterAdmin', async () => {
    const { userId, secret, email } = await seedUserWithTotp();
    const login = await authMfaLogin.completeLoginMfa({
      mfaPendingToken: authMfaLogin.signMfaPendingToken({
        userId,
        sessionVersion: 0,
        securityVersion: 0,
        platformRole: UserPlatformRole.MASTER_ADMIN,
      }),
      code: authenticator.generate(secret),
    });
    const rotated = await stack.refresh.rotate(login.refreshToken);
    const loginDecoded = jwt.verify(rotated.accessToken, JWT_SECRET) as jwt.JwtPayload;
    const family = String(loginDecoded.tokenFamily);
    const code2 = authenticator.generate(secret);
    const step2 = resolveAcceptedTotpStep(code2, secret);
    const factor = await prisma.userMfaFactor.findFirstOrThrow({ where: { userId } });
    if (factor.lastTotpStep !== null && factor.lastTotpStep >= step2) {
      await prisma.userMfaFactor.update({
        where: { id: factor.id },
        data: { lastTotpStep: step2 - 1n },
      });
    }
    const challenged = await challenge.challengeWithTotp({
      userId,
      code: code2,
      sessionBinding: { tokenFamily: family },
    });
    const reflector = new Reflector();
    const moduleRef = await Test.createTestingModule({
      controllers: [E2ProbeController],
      providers: [
        Reflector,
        { provide: PrismaService, useValue: prisma },
        { provide: IamMfaStepUpService, useValue: stepUp },
        { provide: UserAccessAuthorityService, useValue: authority },
        { provide: ConfigService, useValue: createUsrP2Config(JWT_SECRET) },
      ],
    }).compile();
    const app: INestApplication = moduleRef.createNestApplication();
    app.useGlobalGuards(
      new AuthGuard(reflector, authority),
      new MasterAdminMfaGuard(reflector, prisma as never, stepUp),
      new StepUpGuard(reflector, stepUp),
    );
    await app.init();
    await request(app.getHttpServer())
      .post('/api/v1/usr-p2e-e2-probe/combined-guards')
      .set('Authorization', `Bearer ${rotated.accessToken}`)
      .set('x-step-up-token', challenged.stepUpToken)
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/v1/usr-p2e-e2-probe/combined-guards')
      .set('Authorization', `Bearer ${rotated.accessToken}`)
      .set('x-step-up-token', challenged.stepUpToken)
      .expect(403);
    await app.close();
    void email;
  });

  it('COMBINED HTTP password-only JWT denied without step-up grant', async () => {
    const { userId, secret, email } = await seedUserWithTotp();
    const login = await authMfaLogin.completeLoginMfa({
      mfaPendingToken: authMfaLogin.signMfaPendingToken({
        userId,
        sessionVersion: 0,
        securityVersion: 0,
        platformRole: UserPlatformRole.MASTER_ADMIN,
      }),
      code: authenticator.generate(secret),
    });
    const rotated = await stack.refresh.rotate(login.refreshToken);
    const reflector = new Reflector();
    const moduleRef = await Test.createTestingModule({
      controllers: [E2ProbeController],
      providers: [
        Reflector,
        { provide: PrismaService, useValue: prisma },
        { provide: IamMfaStepUpService, useValue: stepUp },
        { provide: UserAccessAuthorityService, useValue: authority },
        { provide: ConfigService, useValue: createUsrP2Config(JWT_SECRET) },
      ],
    }).compile();
    const app: INestApplication = moduleRef.createNestApplication();
    app.useGlobalGuards(
      new AuthGuard(reflector, authority),
      new MasterAdminMfaGuard(reflector, prisma as never, stepUp),
      new StepUpGuard(reflector, stepUp),
    );
    await app.init();
    await request(app.getHttpServer())
      .post('/api/v1/usr-p2e-e2-probe/combined-guards')
      .set('Authorization', `Bearer ${rotated.accessToken}`)
      .expect(403);
    await app.close();
    void secret;
    void email;
  });

  it('STALE_PENDING denied after PasswordResetService confirmReset', async () => {
    const { userId, secret, email } = await seedUserWithTotp();
    const pending = authMfaLogin.signMfaPendingToken({
      userId,
      sessionVersion: 0,
      securityVersion: 0,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });
    const { plain, hash } = generatePasswordResetToken();
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hash,
        tokenLookup: passwordResetTokenLookupKey(plain),
        purpose: 'SELF_SERVICE',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await passwordReset.confirmReset({
      token: plain,
      newPassword: 'E2Pass3!long-xy',
      confirmPassword: 'E2Pass3!long-xy',
    });
    await expect(
      authMfaLogin.completeLoginMfa({ mfaPendingToken: pending, code: authenticator.generate(secret) }),
    ).rejects.toThrow();
    void email;
  });

  it('FRESH_LOGIN_AFTER_PASSWORD_RESET completes MFA and issues bound session tokens', async () => {
    const { userId, secret, email } = await seedUserWithTotp();
    const { plain, hash } = generatePasswordResetToken();
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hash,
        tokenLookup: passwordResetTokenLookupKey(plain),
        purpose: 'SELF_SERVICE',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await passwordReset.confirmReset({
      token: plain,
      newPassword: 'E2Pass4!long-xy',
      confirmPassword: 'E2Pass4!long-xy',
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const login = await authMfaLogin.completeLoginMfa({
      mfaPendingToken: authMfaLogin.signMfaPendingToken({
        userId,
        sessionVersion: user.sessionVersion,
        securityVersion: user.securityVersion,
        platformRole: UserPlatformRole.MASTER_ADMIN,
      }),
      code: authenticator.generate(secret),
    });
    const decoded = jwt.verify(login.accessToken, JWT_SECRET) as jwt.JwtPayload;
    expect(decoded.tokenFamily).toBeTruthy();
    await expect(authority.validateAccessJwt(decoded as never)).resolves.toMatchObject({
      id: userId,
      tokenFamily: decoded.tokenFamily,
    });
    expect(login.refreshToken.length).toBeGreaterThan(10);
    void email;
  });

  it('CONCURRENT_RESET_FIRST MFA completion denied after committed password reset', async () => {
    const { userId, secret } = await seedUserWithTotp();
    const pending = authMfaLogin.signMfaPendingToken({
      userId,
      sessionVersion: 0,
      securityVersion: 0,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });
    const { plain, hash } = generatePasswordResetToken();
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hash,
        tokenLookup: passwordResetTokenLookupKey(plain),
        purpose: 'SELF_SERVICE',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await passwordReset.confirmReset({
      token: plain,
      newPassword: 'E2Pass5!long-xy',
      confirmPassword: 'E2Pass5!long-xy',
    });
    await expect(
      authMfaLogin.completeLoginMfa({ mfaPendingToken: pending, code: authenticator.generate(secret) }),
    ).rejects.toThrow();
  });

  it('CONCURRENT_MFA_FIRST password reset invalidates issued login credentials', async () => {
    const { userId, secret } = await seedUserWithTotp();
    let resetRelease: () => void = () => undefined;
    const resetBarrier = new Promise<void>((resolve) => {
      resetRelease = resolve;
    });
    const { plain, hash } = generatePasswordResetToken();
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hash,
        tokenLookup: passwordResetTokenLookupKey(plain),
        purpose: 'SELF_SERVICE',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const pending = authMfaLogin.signMfaPendingToken({
      userId,
      sessionVersion: 0,
      securityVersion: 0,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });
    const loginP = authMfaLogin.completeLoginMfa({
      mfaPendingToken: pending,
      code: authenticator.generate(secret),
    });
    const resetP = (async () => {
      await resetBarrier;
      return passwordReset.confirmReset({
        token: plain,
        newPassword: 'E2Pass6!long-xy',
        confirmPassword: 'E2Pass6!long-xy',
      });
    })();
    const login = await loginP;
    resetRelease();
    await resetP;
    const decoded = jwt.verify(login.accessToken, JWT_SECRET) as jwt.JwtPayload;
    await expect(authority.validateAccessJwt(decoded as never)).rejects.toThrow();
    await expect(stack.refresh.rotate(login.refreshToken)).rejects.toThrow();
  });

  it('STALE_PENDING denied after self-service password change', async () => {
    const { userId, secret } = await seedUserWithTotp();
    const orgId = randomUUID();
    await prisma.organization.create({
      data: { id: orgId, companyName: 'SelfPwd', businessType: BusinessType.RENTAL, status: 'ACTIVE' },
    });
    await prisma.organizationMembership.create({
      data: {
        id: randomUUID(),
        userId,
        organizationId: orgId,
        role: 'ORG_ADMIN',
        status: MembershipStatus.ACTIVE,
      },
    });
    const pending = authMfaLogin.signMfaPendingToken({
      userId,
      sessionVersion: 0,
      securityVersion: 0,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });
    await account.changePassword(
      userId,
      null,
      {
        currentPassword: 'E2Pass1!long-xy',
        newPassword: 'E2Pass2!long-xy',
        confirmPassword: 'E2Pass2!long-xy',
        revokeOtherSessions: true,
      },
      {},
    );
    await expect(
      authMfaLogin.completeLoginMfa({ mfaPendingToken: pending, code: authenticator.generate(secret) }),
    ).rejects.toThrow();
  });

  it('STALE_PENDING denied after platform role downgrade authority transition', async () => {
    const { userId, secret } = await seedUserWithTotp();
    const pending = authMfaLogin.signMfaPendingToken({
      userId,
      sessionVersion: 0,
      securityVersion: 0,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });
    await prisma.$transaction(async (tx) => {
      await acquireCanonicalSecurityMutationLocks(tx, { userIds: [userId] });
      await tx.user.update({
        where: { id: userId },
        data: { platformRole: UserPlatformRole.USER, sessionVersion: 1 },
      });
    });
    await expect(
      authMfaLogin.completeLoginMfa({ mfaPendingToken: pending, code: authenticator.generate(secret) }),
    ).rejects.toThrow();
  });

  it('STALE_PENDING denied when account is suspended', async () => {
    const { userId, secret } = await seedUserWithTotp();
    const pending = authMfaLogin.signMfaPendingToken({
      userId,
      sessionVersion: 0,
      securityVersion: 0,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });
    await prisma.user.update({ where: { id: userId }, data: { status: UserStatus.SUSPENDED } });
    await expect(
      authMfaLogin.completeLoginMfa({ mfaPendingToken: pending, code: authenticator.generate(secret) }),
    ).rejects.toThrow(/inactive|no longer valid/i);
  });

  it('FRESH_LOGIN_AFTER_RESET requires re-enrollment after MFA reset', async () => {
    const { userId, secret } = await seedUserWithTotp();
    await mfaReset.resetMfaForUser({
      organizationId: 'platform',
      targetUserId: userId,
      actorUserId: userId,
      idempotencyKey: `e2-fresh:${randomUUID()}`,
    });
    const pending = authMfaLogin.signMfaPendingToken({
      userId,
      sessionVersion: (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).sessionVersion,
      securityVersion: (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).securityVersion,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });
    await expect(
      authMfaLogin.completeLoginMfa({ mfaPendingToken: pending, code: authenticator.generate(secret) }),
    ).rejects.toMatchObject({ response: { code: MFA_ERROR.ENROLLMENT_REQUIRED } });
  });

  it('CONCURRENT_RESET_MFA reset after MFA login blocks stale completion', async () => {
    const { userId, secret } = await seedUserWithTotp();
    const pending = authMfaLogin.signMfaPendingToken({
      userId,
      sessionVersion: 0,
      securityVersion: 0,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });
    const resetP = mfaReset.resetMfaForUser({
      organizationId: 'platform',
      targetUserId: userId,
      actorUserId: userId,
      idempotencyKey: `e2-race:${randomUUID()}`,
    });
    const loginP = authMfaLogin.completeLoginMfa({
      mfaPendingToken: pending,
      code: authenticator.generate(secret),
    });
    const [resetOutcome, loginOutcome] = await Promise.allSettled([resetP, loginP]);
    expect(resetOutcome.status).toBe('fulfilled');
    expect(loginOutcome.status).toBe('rejected');
  });
});