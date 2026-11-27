/**
 * USR-P3A.1 — disposable PostgreSQL proofs (identity email uniqueness + audit idempotency).
 *
 * RUN: USR_P3A1_MASTER_IDENTITY_PG=1 DATABASE_URL=postgresql://...@127.0.0.1/...usr... npx jest usr-p3a1-master-identity.postgres.integration.spec --runInBand
 */
import { randomUUID } from 'node:crypto';
import {
  MasterAdminAuditScope,
  PrismaClient,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import {
  acquireIdentityEmailProvisionLock,
  acquireSecurityOperationAdmissionLock,
} from '@modules/auth/refresh-token-session-concurrency';
import { buildMasterIdentityAuditIdempotencyKey } from './policies/master-global-identity-operation.policy';
import { MasterAdminAuditOutboxRepository } from '@modules/activity-log/master-admin-audit-outbox.repository';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';

const OPT_IN = 'USR_P3A1_MASTER_IDENTITY_PG';
const run = process.env[OPT_IN] === '1';

function assertDisposableDb(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url) || !/usr/i.test(url)) {
    throw new Error('DATABASE_URL must target disposable localhost usr test DB');
  }
}

(run ? describe : describe.skip)('USR-P3A.1 master identity (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let prismaA: PrismaClient;
  let prismaB: PrismaClient;

  beforeAll(() => {
    assertDisposableDb();
    prismaA = new PrismaClient();
    prismaB = new PrismaClient();
  });

  afterAll(async () => {
    await prismaA?.$disconnect();
    await prismaB?.$disconnect();
  });

  it('concurrent user insert on same normalized email leaves exactly one row', async () => {
    const email = `p3a1-race-${randomUUID()}@example.test`;
    const results = await Promise.allSettled([
      prismaA.user.create({
        data: {
          email,
          platformRole: UserPlatformRole.USER,
          status: UserStatus.ACTIVE,
        },
      }),
      prismaB.user.create({
        data: {
          email,
          platformRole: UserPlatformRole.USER,
          status: UserStatus.ACTIVE,
        },
      }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBe(1);
    expect(await prismaA.user.count({ where: { email } })).toBe(1);
  });

  it('master admin audit outbox idempotency key admits one semantic row per operation id', async () => {
    const operationId = randomUUID();
    const idempotencyKey = buildMasterIdentityAuditIdempotencyKey(operationId);
    const repo = new MasterAdminAuditOutboxRepository(prismaA as never);
    const envelope = {
      auditAction: MasterAdminAuditAction.PLATFORM_USER_CREATED,
      actorUserId: randomUUID(),
      entityId: randomUUID(),
      description: 'test',
      correlationId: randomUUID(),
      permissionGranted: true,
      metadata: { targetUserId: randomUUID() },
    };
    await prismaA.$transaction(async (tx) => {
      await acquireSecurityOperationAdmissionLock(tx, operationId);
      await repo.enqueueInTransaction(tx, {
        idempotencyKey,
        envelope,
        occurredAt: new Date(),
        auditScope: MasterAdminAuditScope.PLATFORM,
        organizationContextId: null,
      });
      const again = await repo.enqueueInTransaction(tx, {
        idempotencyKey,
        envelope,
        occurredAt: new Date(),
        auditScope: MasterAdminAuditScope.PLATFORM,
        organizationContextId: null,
      });
      expect(again.id).toBeTruthy();
    });
    const count = await prismaA.masterAdminAuditOutbox.count({ where: { idempotencyKey } });
    expect(count).toBe(1);
  });

  it('identity email provision advisory lock serializes concurrent transactions', async () => {
    const email = `lock-${randomUUID()}@example.test`;
    let secondStarted = false;
    await prismaA.$transaction(async (tx) => {
      await acquireIdentityEmailProvisionLock(tx, email);
      const delayed = prismaB.$transaction(async (txB) => {
        await acquireIdentityEmailProvisionLock(txB, email);
        secondStarted = true;
      });
      await new Promise((r) => setTimeout(r, 50));
      await tx.user.create({
        data: { email, platformRole: UserPlatformRole.USER, status: UserStatus.ACTIVE },
      });
      await delayed;
    });
    expect(secondStarted).toBe(true);
    expect(await prismaA.user.count({ where: { email } })).toBe(1);
  });
});