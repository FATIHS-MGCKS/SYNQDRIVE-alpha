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
import { createUsrP2PgIamStack } from '@modules/users/testing/usr-p2-pg-iam-stack.helper';
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
import { AccountService } from '@modules/account/account.service';
import { PasswordPolicyService } from '@shared/auth/password-policy.service';
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
    const { userId } = await seedUserWithTotp();
    const claims = mfaGrantClaims();
    const grant = await stepUp.createGrant({
      userId,
      actionScope: STEP_UP_ACTION.MASTER_ORGANIZATION,
      claims,
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
          headers: { 'x-step-up-token': grant.stepUpToken },
          user: {
            id: userId,
            platformRole: 'MASTER_ADMIN',
            sessionClaims: buildPasswordOnlyClaims(0),
          },
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as never;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('E2-G02 concurrent step-up consumption allows exactly one winner', async () => {
    const { userId } = await seedUserWithTotp();
    const grant = await stepUp.createGrant({
      userId,
      actionScope: STEP_UP_ACTION.MASTER_ORGANIZATION,
      claims: mfaGrantClaims(),
    });
    const stepUpB = new IamMfaStepUpService(prismaB as never);
    const [a, b] = await Promise.allSettled([
      stepUp.validateGrant(userId, grant.stepUpToken, STEP_UP_ACTION.MASTER_ORGANIZATION),
      stepUpB.validateGrant(userId, grant.stepUpToken, STEP_UP_ACTION.MASTER_ORGANIZATION),
    ]);
    expect([a, b].filter((r) => r.status === 'fulfilled' && r.value === true).length).toBe(1);
  });

  it('E2-G03 consumed grant denied on second validation', async () => {
    const { userId } = await seedUserWithTotp();
    const grant = await stepUp.createGrant({
      userId,
      actionScope: STEP_UP_ACTION.MASTER_ORGANIZATION,
      claims: mfaGrantClaims(),
    });
    expect(
      await stepUp.validateGrant(userId, grant.stepUpToken, STEP_UP_ACTION.MASTER_ORGANIZATION),
    ).toBe(true);
    expect(
      await stepUp.validateGrant(userId, grant.stepUpToken, STEP_UP_ACTION.MASTER_ORGANIZATION),
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
    expect(await stepUp.validateGrant(userId, raw, STEP_UP_ACTION.MASTER_ORGANIZATION)).toBe(false);
  });

  it('E2-G05 wrong action scope denied', async () => {
    const { userId } = await seedUserWithTotp();
    const grant = await stepUp.createGrant({
      userId,
      actionScope: STEP_UP_ACTION.MASTER_BILLING,
      claims: mfaGrantClaims(),
    });
    expect(
      await stepUp.validateGrant(userId, grant.stepUpToken, STEP_UP_ACTION.MASTER_ORGANIZATION),
    ).toBe(false);
  });

  it('E2-G06 wrong user denied', async () => {
    const { userId } = await seedUserWithTotp();
    const other = randomUUID();
    const grant = await stepUp.createGrant({
      userId,
      actionScope: STEP_UP_ACTION.MASTER_ORGANIZATION,
      claims: mfaGrantClaims(),
    });
    expect(
      await stepUp.validateGrant(other, grant.stepUpToken, STEP_UP_ACTION.MASTER_ORGANIZATION),
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
    await stack.refresh.revokeAllActiveForUser(userId);
    await stack.refresh.issueTokenPair(userCtx, membership);
    const liveFamily = (
      await prisma.refreshToken.findFirstOrThrow({
        where: { userId, revokedAt: null },
        orderBy: { createdAt: 'desc' },
      })
    ).family;
    await expect(
      challenge.challengeWithTotp({
        userId,
        code: authenticator.generate(secret),
        sessionBinding: { tokenFamily: familyB, organizationId: orgId, membershipId: memId },
      }),
    ).rejects.toThrow(/no longer valid|Session/i);
    const code2 = authenticator.generate(secret);
    const step2 = resolveAcceptedTotpStep(code2, secret);
    const consumed = await prisma.userMfaFactor.findFirstOrThrow({ where: { userId } });
    if (consumed.lastTotpStep !== null && consumed.lastTotpStep >= step2) {
      await prisma.userMfaFactor.update({
        where: { id: consumed.id },
        data: { lastTotpStep: step2 - 1n },
      });
    }
    await challenge.challengeWithTotp({
      userId,
      code: code2,
      sessionBinding: { tokenFamily: liveFamily, organizationId: orgId, membershipId: memId },
    });
  });

  it('E2-G08 wrong organization binding denied', async () => {
    const { userId, secret } = await seedUserWithTotp({ platformRole: UserPlatformRole.USER });
    const orgA = randomUUID();
    const orgB = randomUUID();
    const memA = randomUUID();
    await prisma.organization.createMany({
      data: [
        { id: orgA, companyName: 'A', businessType: BusinessType.RENTAL, status: 'ACTIVE' },
        { id: orgB, companyName: 'B', businessType: BusinessType.RENTAL, status: 'ACTIVE' },
      ],
    });
    await prisma.organizationMembership.create({
      data: { id: memA, userId, organizationId: orgA, role: 'WORKER', status: MembershipStatus.ACTIVE },
    });
    const issued = await stack.refresh.issueTokenPair(
      {
        id: userId,
        email: `e2-${userId}@example.test`,
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
      },
      { organizationId: orgA, membershipId: memA, role: 'WORKER', membershipVersion: 0 },
    );
    const family = (await prisma.refreshToken.findFirstOrThrow({ where: { userId }, orderBy: { createdAt: 'desc' } }))
      .family;
    await expect(
      challenge.challengeWithTotp({
        userId,
        code: authenticator.generate(secret),
        sessionBinding: { tokenFamily: family, organizationId: orgB, membershipId: memA },
      }),
    ).rejects.toThrow(/mismatch/i);
    void issued;
  });

  it('E2-G09 revoked initiating session invalidates step-up grant', async () => {
    const { userId } = await seedUserWithTotp();
    const grant = await stepUp.createGrant({
      userId,
      actionScope: STEP_UP_ACTION.MASTER_ORGANIZATION,
      claims: mfaGrantClaims(),
    });
    await stack.refresh.revokeAllActiveForUser(userId);
    expect(
      await stepUp.validateGrant(userId, grant.stepUpToken, STEP_UP_ACTION.MASTER_ORGANIZATION),
    ).toBe(false);
  });

  it('E2-G10 admin password change invalidates unconsumed grants', async () => {
    const { userId } = await seedUserWithTotp();
    const grant = await stepUp.createGrant({
      userId,
      actionScope: STEP_UP_ACTION.MASTER_ORGANIZATION,
      claims: mfaGrantClaims(),
    });
    await usersService.changePasswordAdmin(userId, 'AdminChg1!long-xy', userId);
    expect(
      await stepUp.validateGrant(userId, grant.stepUpToken, STEP_UP_ACTION.MASTER_ORGANIZATION),
    ).toBe(false);
  });

  it('E2-G11 idempotent createGrant replay does not return unusable token', async () => {
    const { userId } = await seedUserWithTotp();
    const idem = `e2-g11:${randomUUID()}`;
    const grant = await stepUp.createGrant({
      userId,
      actionScope: STEP_UP_ACTION.MASTER_ORGANIZATION,
      claims: mfaGrantClaims(),
      idempotencyKey: idem,
    });
    await expect(
      stepUp.createGrant({
        userId,
        actionScope: STEP_UP_ACTION.MASTER_ORGANIZATION,
        claims: mfaGrantClaims(),
        idempotencyKey: idem,
      }),
    ).rejects.toMatchObject({ response: { code: MFA_ERROR.STEP_UP_IDEMPOTENCY_REPLAY } });
    expect(
      await stepUp.validateGrant(userId, grant.stepUpToken, STEP_UP_ACTION.MASTER_ORGANIZATION),
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