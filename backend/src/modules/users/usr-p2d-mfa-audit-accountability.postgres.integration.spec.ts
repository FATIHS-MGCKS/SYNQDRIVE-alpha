/**
 * USR-P2D MFA login, audit accountability, and refresh assurance (disposable PostgreSQL).
 * USR_P2D_MFA_AUDIT_PG=1
 */
import { randomUUID } from 'node:crypto';
import { authenticator } from 'otplib';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import {
  MfaFactorType,
  PrismaClient,
  SessionAssuranceLevel,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { AuthMfaLoginService } from '@modules/auth/auth-mfa-login.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { IamMfaChallengeService } from '@modules/iam-mfa/iam-mfa-challenge.service';
import { IamMfaEnrollmentService } from '@modules/iam-mfa/iam-mfa-enrollment.service';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { encryptMfaSecret } from '@modules/iam-mfa/iam-mfa-crypto.util';
import { MFA_ERROR } from '@modules/iam-mfa/iam-mfa.policy';
import { UsersService } from '@modules/users/users.service';
import { createUsrP2PgIamStack } from '@modules/users/testing/usr-p2-pg-iam-stack.helper';
import { ASSURANCE_LEVEL_MFA } from '@shared/auth/auth-session-claims.types';
import { IamMfaResetService } from '@modules/iam-mfa/iam-mfa-reset.service';
import { IamAuditService } from '@modules/users/iam-audit.service';
import { IamMembershipLifecycleService } from '@modules/users/iam-membership-lifecycle.service';
import { PasswordResetService } from '@modules/auth/password-reset.service';

const OPT_IN = 'USR_P2D_MFA_AUDIT_PG';
const JWT_SECRET = 'usr-p2d-mfa-audit-secret';
const run = process.env[OPT_IN] === '1';

function assertDisposableDb(): void {
  if (process.env[OPT_IN] !== '1') throw new Error(`${OPT_IN}=1 required`);
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url) || !/usr/i.test(url)) {
    throw new Error('DATABASE_URL must target disposable localhost usr_* test DB');
  }
}

(run ? describe : describe.skip)('USR-P2D MFA and audit accountability (PostgreSQL)', () => {
  jest.setTimeout(300_000);
  let prisma: PrismaClient;
  let prismaB: PrismaClient;
  let challenge: IamMfaChallengeService;
  let authMfaLogin: AuthMfaLoginService;
  let refresh: RefreshTokenService;
  let stack: ReturnType<typeof createUsrP2PgIamStack>;
  let usersService: UsersService;
  let mfaReset: IamMfaResetService;

  beforeAll(() => {
    assertDisposableDb();
    process.env.JWT_SECRET = JWT_SECRET;
    prisma = new PrismaClient();
    prismaB = new PrismaClient();
    stack = createUsrP2PgIamStack(prisma, JWT_SECRET, {
      legacyUnscopedGrace: true,
      orgBoundRefreshSessions: false,
    });
    refresh = stack.refresh;
    const config = {
      get: (key: string, fallback?: unknown) => {
        if (key === 'app.jwtSecret') return JWT_SECRET;
        if (key === 'iam.masterAdminMfaEnabled') return true;
        return fallback;
      },
    } as ConfigService;
    const platformPermissions = new PlatformPermissionService(prisma as never);
    const stepUp = new IamMfaStepUpService(prisma as never);
    challenge = new IamMfaChallengeService(prisma as never, refresh, stepUp);
    const enrollment = new IamMfaEnrollmentService(prisma as never, platformPermissions);
    authMfaLogin = new AuthMfaLoginService(
      config,
      prisma as never,
      refresh,
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
    mfaReset = new IamMfaResetService(prisma as never, stack.sessionPolicy, iamAudit);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await prismaB?.$disconnect();
  });

  async function seedMasterAdminTotp(secret = authenticator.generateSecret()) {
    const userId = randomUUID();
    const email = `ma-${userId}@example.test`;
    await prisma.user.create({
      data: {
        id: userId,
        email,
        platformRole: UserPlatformRole.MASTER_ADMIN,
        status: UserStatus.ACTIVE,
        passwordHash: await bcrypt.hash('MaPass1!long-xy', 10),
        sessionVersion: 0,
        securityVersion: 0,
      },
    });
    await prisma.userMfaFactor.create({
      data: {
        userId,
        factorType: MfaFactorType.TOTP,
        encryptedSecret: encryptMfaSecret(secret),
        label: 'p2d',
        verifiedAt: new Date(),
        enabledAt: new Date(),
      },
    });
    return { userId, email, secret };
  }

  async function seedRecoveryCode(userId: string, plain: string) {
    const hash = await bcrypt.hash(plain.toUpperCase(), 10);
    await prisma.userMfaRecoveryCode.create({
      data: { userId, codeHash: hash },
    });
    return plain;
  }

  it('D01 valid MASTER_ADMIN TOTP login', async () => {
    const { userId, secret } = await seedMasterAdminTotp();
    const pending = authMfaLogin.signMfaPendingToken({
      userId,
      sessionVersion: 0,
      securityVersion: 0,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });
    const code = authenticator.generate(secret);
    const result = await authMfaLogin.completeLoginMfa({ mfaPendingToken: pending, code });
    expect(result.accessToken).toBeTruthy();
    const decoded = jwt.verify(result.accessToken, JWT_SECRET) as jwt.JwtPayload;
    expect(decoded.sub).toBe(userId);
    expect(Number(decoded.assuranceLevel)).toBe(ASSURANCE_LEVEL_MFA);
    expect(decoded.organizationId ?? null).toBeNull();
  });

  it('D02 valid recovery-code login', async () => {
    const { userId } = await seedMasterAdminTotp();
    const recovery = await seedRecoveryCode(userId, 'ABCD-EFGH-IJKL');
    const pending = authMfaLogin.signMfaPendingToken({
      userId,
      sessionVersion: 0,
      securityVersion: 0,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });
    const result = await authMfaLogin.completeLoginMfa({
      mfaPendingToken: pending,
      recoveryCode: recovery,
    });
    expect(result.accessToken).toBeTruthy();
  });

  it('D03 invalid TOTP denied', async () => {
    const { userId } = await seedMasterAdminTotp();
    const pending = authMfaLogin.signMfaPendingToken({
      userId,
      sessionVersion: 0,
      securityVersion: 0,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });
    await expect(
      authMfaLogin.completeLoginMfa({ mfaPendingToken: pending, code: '000000' }),
    ).rejects.toMatchObject({ response: { code: MFA_ERROR.INVALID_CODE } });
  });

  it('D04 invalid recovery code denied', async () => {
    const { userId } = await seedMasterAdminTotp();
    await seedRecoveryCode(userId, 'WXYZ-ABCD-EFGH');
    const pending = authMfaLogin.signMfaPendingToken({
      userId,
      sessionVersion: 0,
      securityVersion: 0,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });
    await expect(
      authMfaLogin.completeLoginMfa({ mfaPendingToken: pending, recoveryCode: 'NOPE-NOPE-NOPE' }),
    ).rejects.toMatchObject({ response: { code: MFA_ERROR.INVALID_CODE } });
  });

  it('D05 concurrent TOTP consumption allows exactly one winner', async () => {
    const { userId, secret } = await seedMasterAdminTotp();
    const code = authenticator.generate(secret);
    const challengeB = new IamMfaChallengeService(
      prismaB as never,
      refresh,
      new IamMfaStepUpService(prismaB as never),
    );
    const [a, b] = await Promise.allSettled([
      challenge.verifyLoginMfaTotp(userId, code),
      challengeB.verifyLoginMfaTotp(userId, code),
    ]);
    const wins = [a, b].filter((r) => r.status === 'fulfilled');
    const losses = [a, b].filter((r) => r.status === 'rejected');
    expect(wins.length).toBe(1);
    expect(losses.length).toBe(1);
  });

  it('D06 concurrent recovery code consumption allows exactly one winner', async () => {
    const { userId } = await seedMasterAdminTotp();
    const code = await seedRecoveryCode(userId, 'RACE-CODE-ABCD');
    const challengeB = new IamMfaChallengeService(
      prismaB as never,
      refresh,
      new IamMfaStepUpService(prismaB as never),
    );
    const [a, b] = await Promise.allSettled([
      challenge.verifyLoginMfaRecoveryCode(userId, code),
      challengeB.verifyLoginMfaRecoveryCode(userId, code),
    ]);
    expect([a, b].filter((r) => r.status === 'fulfilled').length).toBe(1);
  });

  it('D07 previously consumed TOTP step cannot be reused', async () => {
    const { userId, secret } = await seedMasterAdminTotp();
    const code = authenticator.generate(secret);
    await challenge.verifyLoginMfaTotp(userId, code);
    await expect(challenge.verifyLoginMfaTotp(userId, code)).rejects.toMatchObject({
      response: { code: MFA_ERROR.REPLAY },
    });
  });

  it('D08 successful login refresh token rotates within same family', async () => {
    const { userId, secret } = await seedMasterAdminTotp();
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
    const headBefore = await prisma.refreshToken.findFirst({
      where: { userId, revokedAt: null, replacedBy: null },
      orderBy: { createdAt: 'desc' },
    });
    const rotated = await refresh.rotate(login.refreshToken);
    const headAfter = await prisma.refreshToken.findFirst({
      where: { userId, revokedAt: null, replacedBy: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(headAfter?.family).toBe(headBefore?.family);
    expect(rotated.refreshToken).not.toBe(login.refreshToken);
  });

  it('D09 access authority accepts legitimately issued MFA login JWT', async () => {
    const { userId, secret } = await seedMasterAdminTotp();
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
    await stack.authority.validateAccessJwt(
      jwt.verify(login.accessToken, JWT_SECRET) as never,
    );
  });

  it('D10 platform-only admin login does not bind arbitrary membership', async () => {
    const { userId, secret } = await seedMasterAdminTotp();
    const orgId = randomUUID();
    await prisma.organization.create({
      data: {
        id: orgId,
        companyName: 'MA still platform',
        businessType: 'RENTAL',
        status: 'ACTIVE',
      },
    });
    await prisma.organizationMembership.create({
      data: {
        id: randomUUID(),
        userId,
        organizationId: orgId,
        role: 'ORG_ADMIN',
        status: 'ACTIVE',
      },
    });
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
    const decoded = jwt.verify(login.accessToken, JWT_SECRET) as jwt.JwtPayload;
    expect(decoded.membershipId ?? null).toBeNull();
    expect(decoded.organizationId ?? null).toBeNull();
    const row = await prisma.refreshToken.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.membershipId).toBeNull();
    expect(row?.organizationId).toBeNull();
  });

  it('MFA refresh assurance downgrades MFA claims after rotation', async () => {
    const { userId, secret } = await seedMasterAdminTotp();
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
    const head = await prisma.refreshToken.findFirst({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(head?.assuranceLevel).toBe(SessionAssuranceLevel.MFA);
    const rotated = await refresh.rotate(login.refreshToken);
    const decoded = jwt.verify(rotated.accessToken, JWT_SECRET) as jwt.JwtPayload;
    expect(Number(decoded.assuranceLevel)).toBeLessThan(ASSURANCE_LEVEL_MFA);
    expect(decoded.mfaAuthenticatedAt ?? null).toBeNull();
    const successor = await prisma.refreshToken.findFirst({
      where: { userId, revokedAt: null, replacedBy: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(successor?.assuranceLevel).toBe(SessionAssuranceLevel.PASSWORD);
  });

  it('STALE_PENDING denied after admin password change bumps sessionVersion', async () => {
    const operatorId = randomUUID();
    const { userId } = await seedMasterAdminTotp();
    await prisma.user.create({
      data: {
        id: operatorId,
        email: `op-${operatorId}@example.test`,
        platformRole: UserPlatformRole.MASTER_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    const pending = authMfaLogin.signMfaPendingToken({
      userId,
      sessionVersion: 0,
      securityVersion: 0,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });
    await usersService.changePasswordAdmin(userId, 'NewAdmin1!long-xy', operatorId);
    await expect(
      authMfaLogin.completeLoginMfa({ mfaPendingToken: pending, code: '000000' }),
    ).rejects.toThrow(/no longer valid/i);
  });

  it('STALE_PENDING denied after MFA reset', async () => {
    const { userId, secret } = await seedMasterAdminTotp();
    const pending = authMfaLogin.signMfaPendingToken({
      userId,
      sessionVersion: 0,
      securityVersion: 0,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });
    await mfaReset.resetMfaForUser({
      organizationId: 'platform',
      targetUserId: userId,
      actorUserId: userId,
      idempotencyKey: `p2d-reset:${randomUUID()}`,
    });
    await expect(
      authMfaLogin.completeLoginMfa({
        mfaPendingToken: pending,
        code: authenticator.generate(secret),
      }),
    ).rejects.toThrow();
  });

  it('MFA_ORG_ISOLATION challenge in org A does not elevate org B session', async () => {
    const userId = randomUUID();
    const secret = authenticator.generateSecret();
    const email = `org-iso-${userId}@example.test`;
    await prisma.user.create({
      data: {
        id: userId,
        email,
        platformRole: UserPlatformRole.USER,
        status: UserStatus.ACTIVE,
        passwordHash: await bcrypt.hash('OrgIso1!long-xy', 10),
        sessionVersion: 0,
        securityVersion: 0,
      },
    });
    await prisma.userMfaFactor.create({
      data: {
        userId,
        factorType: MfaFactorType.TOTP,
        encryptedSecret: encryptMfaSecret(secret),
        label: 'p2d-org',
        verifiedAt: new Date(),
        enabledAt: new Date(),
      },
    });
    const orgA = randomUUID();
    const orgB = randomUUID();
    const memA = randomUUID();
    const memB = randomUUID();
    await prisma.organization.createMany({
      data: [
        { id: orgA, companyName: 'A', businessType: 'RENTAL', status: 'ACTIVE' },
        { id: orgB, companyName: 'B', businessType: 'RENTAL', status: 'ACTIVE' },
      ],
    });
    await prisma.organizationMembership.createMany({
      data: [
        { id: memA, userId, organizationId: orgA, role: 'WORKER', status: 'ACTIVE' },
        { id: memB, userId, organizationId: orgB, role: 'WORKER', status: 'ACTIVE' },
      ],
    });
    const userCtx = {
      id: userId,
      email,
      platformRole: UserPlatformRole.USER,
      sessionVersion: 0,
      securityVersion: 0,
    };
    const sessionB = await stack.refresh.issueTokenPair(userCtx, {
      organizationId: orgB,
      membershipId: memB,
      role: 'WORKER',
      membershipVersion: 0,
    });
    const familyB = (
      await prisma.refreshToken.findFirstOrThrow({ where: { userId }, orderBy: { createdAt: 'desc' } })
    ).family;
    const sessionA = await stack.refresh.issueTokenPair(userCtx, {
      organizationId: orgA,
      membershipId: memA,
      role: 'WORKER',
      membershipVersion: 0,
    });
    const familyA = (
      await prisma.refreshToken.findFirstOrThrow({
        where: { userId, family: { not: familyB } },
        orderBy: { createdAt: 'desc' },
      })
    ).family;
    const challengeResult = await challenge.challengeWithTotp({
      userId,
      code: authenticator.generate(secret),
      sessionBinding: { tokenFamily: familyA, organizationId: orgA, membershipId: memA },
    });
    const elevated = jwt.verify(challengeResult.accessToken, JWT_SECRET) as jwt.JwtPayload;
    expect(elevated.organizationId).toBe(orgA);
    const decodedB = jwt.verify(sessionB.accessToken, JWT_SECRET) as jwt.JwtPayload;
    expect(Number(decodedB.assuranceLevel ?? 0)).toBeLessThan(ASSURANCE_LEVEL_MFA);
    const headB = await prisma.refreshToken.findUniqueOrThrow({
      where: { id: (await prisma.refreshToken.findFirstOrThrow({ where: { userId, family: familyB } })).id },
    });
    expect(headB.revokedAt).toBeNull();
    expect(Number(elevated.assuranceLevel)).toBe(ASSURANCE_LEVEL_MFA);
    const headBAfter = await prisma.refreshToken.findFirstOrThrow({ where: { userId, family: familyB } });
    expect(headBAfter.assuranceLevel).toBe(SessionAssuranceLevel.PASSWORD);
    void sessionA;
  });

  it('MFA_DEVICE_ISOLATION challenge for one family does not reissue another family', async () => {
    const { userId, secret } = await seedMasterAdminTotp();
    const recovery = await seedRecoveryCode(userId, 'ISOL-RC-ABCD');
    const pending = authMfaLogin.signMfaPendingToken({
      userId,
      sessionVersion: 0,
      securityVersion: 0,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });
    const deviceA = await authMfaLogin.completeLoginMfa({
      mfaPendingToken: pending,
      code: authenticator.generate(secret),
    });
    const headA = await prisma.refreshToken.findFirst({
      where: { userId, revokedAt: null, replacedBy: null },
      orderBy: { createdAt: 'desc' },
    });
    const deviceB = await refresh.issueTokenPair(
      {
        id: userId,
        email: `ma-${userId}@example.test`,
        platformRole: UserPlatformRole.MASTER_ADMIN,
        sessionVersion: 0,
        securityVersion: 0,
      },
      null,
    );
    const headB = await prisma.refreshToken.findFirst({
      where: { userId, revokedAt: null, family: { not: headA!.family } },
      orderBy: { createdAt: 'desc' },
    });
    await challenge.challengeWithRecoveryCode({
      userId,
      recoveryCode: recovery,
      sessionBinding: { tokenFamily: headA!.family, membershipId: null, organizationId: null },
      allowUnboundReissue: true,
    });
    const headBAfter = await prisma.refreshToken.findUnique({ where: { id: headB!.id } });
    expect(headBAfter?.revokedAt).toBeNull();
    expect(deviceB.refreshToken).toBeTruthy();
    expect(deviceA.refreshToken).not.toBe(deviceB.refreshToken);
  });

  it('ADMIN_PASSWORD_ACTOR attribution uses distinct operator not target', async () => {
    const operatorId = randomUUID();
    const target = await seedMasterAdminTotp();
    await prisma.user.create({
      data: {
        id: operatorId,
        email: `op-${operatorId}@example.test`,
        platformRole: UserPlatformRole.MASTER_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    await usersService.changePasswordAdmin(target.userId, 'AdminSet3!long-xy', operatorId);
    const intent = await prisma.iamSessionRevocationIntent.findFirst({
      where: { userId: target.userId, eventType: 'PASSWORD_CHANGED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(intent?.actorUserId).toBe(operatorId);
    expect(intent?.actorUserId).not.toBe(target.userId);
  });
});