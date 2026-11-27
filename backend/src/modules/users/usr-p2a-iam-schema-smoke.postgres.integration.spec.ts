/**
 * USR-P2A — IAM schema/runtime smoke (real Prisma + services, disposable DB).
 */
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import {
  BusinessType,
  IamSessionRevocationScope,
  IamSessionRevocationStatus,
  MasterAdminAuditScope,
  MasterAdminAuditOutboxStatus,
  MfaFactorType,
  PasswordResetPurpose,
  PrismaClient,
  UserPlatformRole,
  UserStatus,
  MembershipRole,
  MembershipStatus,
} from '@prisma/client';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import { ConfigService } from '@nestjs/config';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { MasterAdminAuditOutboxRepository } from '@modules/activity-log/master-admin-audit-outbox.repository';

const OPT_IN = 'USR_P2A_IAM_SCHEMA_SMOKE_PG';
const run = process.env[OPT_IN] === '1';

(run ? describe : describe.skip)('USR-P2A IAM schema smoke (PostgreSQL)', () => {
  jest.setTimeout(180_000);
  let prisma: PrismaClient;
  let refreshTokens: RefreshTokenService;

  beforeAll(() => {
    if (process.env[OPT_IN] !== '1') throw new Error(`${OPT_IN}=1 required`);
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'usr-p2a-smoke-secret';
    prisma = new PrismaClient();
    const config = {
      get: (key: string, fallback?: unknown) => {
        if (key === 'app.jwtSecret') return process.env.JWT_SECRET;
        if (key === 'app.jwtExpiresIn') return '15m';
        if (key === 'iam.enableOrgBoundRefreshSessions') return true;
        return fallback;
      },
    } as ConfigService;
    refreshTokens = new RefreshTokenService(
      prisma as never,
      config,
      { recordAndExecute: jest.fn() } as never,
      new PlatformPermissionService(prisma as never),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('User create/load with passwordHash and names', async () => {
    const email = `smoke-${randomUUID()}@example.test`;
    const hash = await bcrypt.hash('smokepass1', 10);
    const user = await prisma.user.create({
      data: {
        email,
        firstName: 'Smoke',
        lastName: 'Test',
        passwordHash: hash,
        mustChangePassword: false,
        platformRole: UserPlatformRole.USER,
        status: UserStatus.ACTIVE,
      },
    });
    const loaded = await prisma.user.findUnique({ where: { id: user.id } });
    expect(loaded?.passwordHash).toBe(hash);
    expect(loaded?.firstName).toBe('Smoke');
    const ok = await bcrypt.compare('smokepass1', loaded!.passwordHash!);
    expect(ok).toBe(true);
  });

  it('Organization membership with roleLabel loads', async () => {
    const user = await prisma.user.create({
      data: {
        email: `mem-${randomUUID()}@example.test`,
        platformRole: UserPlatformRole.USER,
      },
    });
    const org = await prisma.organization.create({
      data: {
        companyName: 'Smoke Org',
        businessType: BusinessType.RENTAL,
      },
    });
    const membership = await prisma.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        role: MembershipRole.WORKER,
        roleLabel: 'Worker label',
        status: MembershipStatus.ACTIVE,
      },
    });
    const loaded = await prisma.organizationMembership.findUnique({
      where: { id: membership.id },
    });
    expect(loaded?.roleLabel).toBe('Worker label');
  });

  it('Refresh issuance with bound membership', async () => {
    const user = await prisma.user.create({
      data: { email: `rt-${randomUUID()}@example.test`, platformRole: UserPlatformRole.USER },
    });
    const org = await prisma.organization.create({
      data: { companyName: 'RT Org', businessType: BusinessType.RENTAL },
    });
    const membership = await prisma.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        role: MembershipRole.WORKER,
        roleLabel: 'RT',
      },
    });
    const pair = await refreshTokens.issueTokenPair(
      {
        id: user.id,
        email: user.email,
        platformRole: UserPlatformRole.USER,
        sessionVersion: user.sessionVersion,
        securityVersion: user.securityVersion,
      },
      {
        organizationId: org.id,
        membershipId: membership.id,
        role: 'WORKER',
        membershipVersion: membership.membershipVersion,
      },
    );
    expect(pair.accessToken).toBeTruthy();
    expect(pair.refreshToken).toBeTruthy();
  });

  it('MFA factor and recovery code persistence', async () => {
    const user = await prisma.user.create({
      data: { email: `mfa-${randomUUID()}@example.test`, platformRole: UserPlatformRole.USER },
    });
    await prisma.userMfaFactor.create({
      data: {
        userId: user.id,
        factorType: MfaFactorType.TOTP,
        label: 'authenticator',
        encryptedSecret: 'enc',
        verifiedAt: new Date(),
      },
    });
    await prisma.userMfaRecoveryCode.create({
      data: {
        userId: user.id,
        codeHash: 'hash',
      },
    });
    const factors = await prisma.userMfaFactor.count({ where: { userId: user.id } });
    const codes = await prisma.userMfaRecoveryCode.count({ where: { userId: user.id } });
    expect(factors).toBe(1);
    expect(codes).toBe(1);
  });

  it('Password reset token and session revocation intent persistence', async () => {
    const user = await prisma.user.create({
      data: { email: `rst-${randomUUID()}@example.test`, platformRole: UserPlatformRole.USER },
    });
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: 'hash',
        tokenLookup: `lk-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 3_600_000),
        purpose: PasswordResetPurpose.SELF_SERVICE,
      },
    });
    await prisma.iamSessionRevocationIntent.create({
      data: {
        idempotencyKey: `smoke:${randomUUID()}`,
        eventType: 'PASSWORD_CHANGED',
        scope: IamSessionRevocationScope.USER_ALL_SESSIONS,
        userId: user.id,
        status: IamSessionRevocationStatus.PENDING,
      },
    });
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);
    expect(await prisma.iamSessionRevocationIntent.count({ where: { userId: user.id } })).toBe(1);
  });

  it('Master Admin audit outbox intent persistence', async () => {
    const repo = new MasterAdminAuditOutboxRepository(prisma as never);
    const idempotencyKey = `smoke-audit:${randomUUID()}`;
    const row = await prisma.$transaction((tx) =>
      repo.enqueueInTransaction(tx, {
        idempotencyKey,
        envelope: {
          auditAction: MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED,
          actorUserId: randomUUID(),
          correlationId: randomUUID(),
          description: 'USR-P2A smoke audit intent',
        },
        occurredAt: new Date(),
        auditScope: MasterAdminAuditScope.PLATFORM,
      }),
    );
    const loaded = await prisma.masterAdminAuditOutbox.findUnique({ where: { id: row.id } });
    expect(loaded?.status).toBe(MasterAdminAuditOutboxStatus.PENDING);
    expect(loaded?.idempotencyKey).toBe(idempotencyKey);
  });
});