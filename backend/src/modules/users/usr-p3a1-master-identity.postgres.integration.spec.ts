/**
 * USR-P3A.1 — disposable PostgreSQL proofs (policy + locks + optional service replay).
 *
 * RUN: USR_P3A1_MASTER_IDENTITY_PG=1 DATABASE_URL=postgresql://...@127.0.0.1/...usr... \
 *   npx jest usr-p3a1-master-identity.postgres.integration.spec --runInBand
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
import {
  buildMasterIdentityAuditIdempotencyKey,
  buildProvisionPayloadFingerprint,
  outboxMatchesIdentityOperation,
  type MasterIdentityOperationBinding,
  MASTER_IDENTITY_OPERATION_DOMAIN,
} from './policies/master-global-identity-operation.policy';
import { MasterAdminAuditOutboxRepository } from '@modules/activity-log/master-admin-audit-outbox.repository';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import {
  ensureRaceBarrierTable,
  pgBackendPid,
  resetRaceBarrier,
  setRacePhase,
  waitRacePhaseAtLeast,
  waitUntilBackendBlocked,
} from './testing/usr-p2-deterministic-concurrency.helper';

const OPT_IN = 'USR_P3A1_MASTER_IDENTITY_PG';
const run = process.env[OPT_IN] === '1';

function assertDisposableDb(): void {
  const url = process.env.DATABASE_URL ?? '';
  let host = '';
  try {
    host = new URL(url.replace(/^postgres:/, 'postgresql:')).hostname;
  } catch {
    throw new Error('DATABASE_URL must be a valid postgres URL');
  }
  const dbName = url.split('/').pop()?.split('?')[0] ?? '';
  if (!['127.0.0.1', 'localhost'].includes(host) || !/usr/i.test(dbName)) {
    throw new Error('DATABASE_URL must target disposable loopback usr test DB');
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

  it('provision replay binding accepts stored targetUserId when client binding omits it', async () => {
    const securityOperationId = randomUUID();
    const email = `replay-${randomUUID()}@example.test`;
    const dto = { email, firstName: 'A', lastName: 'B' };
    const fingerprint = buildProvisionPayloadFingerprint(email, dto as never, false);
    const storedUserId = randomUUID();
    const storedBinding: MasterIdentityOperationBinding = {
      domain: MASTER_IDENTITY_OPERATION_DOMAIN,
      action: 'PROVISION_IDENTITY',
      actorUserId: randomUUID(),
      normalizedEmail: email,
      organizationId: null,
      payloadFingerprint: fingerprint,
      securityOperationId,
      targetUserId: storedUserId,
    };
    const expectedBinding: MasterIdentityOperationBinding = {
      ...storedBinding,
      targetUserId: undefined,
    };
    const row = {
      id: randomUUID(),
      subjectUserId: storedUserId,
      idempotencyKey: buildMasterIdentityAuditIdempotencyKey(securityOperationId),
      payload: {
        masterAdminAuditEnvelope: {
          entityId: storedUserId,
          metadata: { operationBinding: storedBinding },
        },
      },
    };
    expect(outboxMatchesIdentityOperation(row as never, expectedBinding)).toBe(true);
  });

  it('identity email provision lock shows pg lock wait on independent connections', async () => {
    const email = `lock-${randomUUID()}@example.test`;
    const raceId = randomUUID();
    await ensureRaceBarrierTable(prismaA);
    await resetRaceBarrier(prismaA, raceId);

    let blockedBackendPid = 0;
    const connectionBPromise = (async () => {
      await waitRacePhaseAtLeast(prismaB, raceId, 'a_lock_acquired');
      blockedBackendPid = await pgBackendPid(prismaB);
      await prismaB.$transaction(async (txB) => {
        await setRacePhase(prismaA, raceId, 'b_waiting', { pid: blockedBackendPid });
        await acquireIdentityEmailProvisionLock(txB, email);
        await setRacePhase(prismaA, raceId, 'done');
      });
    })();

    await prismaA.$transaction(async (txA) => {
      await acquireIdentityEmailProvisionLock(txA, email);
      await setRacePhase(prismaA, raceId, 'a_lock_acquired');
      await waitRacePhaseAtLeast(prismaA, raceId, 'b_waiting');
      const blockingPids = await waitUntilBackendBlocked(prismaA, blockedBackendPid, {
        timeoutMs: 45_000,
        pollMs: 15,
      });
      expect(blockingPids.length).toBeGreaterThan(0);
    });

    await connectionBPromise;
    expect(await prismaA.user.count({ where: { email } })).toBe(0);
  });
});