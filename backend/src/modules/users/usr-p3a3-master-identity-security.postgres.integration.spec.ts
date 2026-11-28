/**
 * USR-P3A.3 — master global identity security acceptance (disposable PostgreSQL).
 *
 * RUN (local gate):
 *   USR_P3A3_MASTER_IDENTITY_PG=1 DATABASE_URL=postgresql://synqdrive:synqdrive@127.0.0.1:5432/usr_p3a3_... \
 *     npx jest usr-p3a3-master-identity-security.postgres.integration.spec --runInBand
 */
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  MasterAdminAuditOutboxStatus,
  MasterAdminAuditScope,
  Prisma,
  PrismaClient,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import {
  buildMasterIdentityAuditIdempotencyKey,
  buildProvisionPayloadFingerprint,
  outboxMatchesIdentityOperation,
  readProvisionOperationMetadataFromOutbox,
  readProvisionedUserIdFromOutbox,
  type MasterIdentityOperationBinding,
  MASTER_IDENTITY_OPERATION_DOMAIN,
} from './policies/master-global-identity-operation.policy';
import { createUsrP3a3IdentityPgStack } from './testing/usr-p3a3-identity-pg-stack.helper';
import {
  acquireIdentityEmailProvisionLock,
  acquireSecurityOperationAdmissionLock,
} from '@modules/auth/refresh-token-session-concurrency';
import {
  ensureRaceBarrierTable,
  pgBackendPid,
  resetRaceBarrier,
  setRacePhase,
  waitRacePhaseAtLeast,
  waitUntilBackendBlocked,
} from './testing/usr-p2-deterministic-concurrency.helper';

const OPT_IN = 'USR_P3A3_MASTER_IDENTITY_PG';
const run = process.env[OPT_IN] === '1';

function assertDisposableDb(): void {
  if (process.env[OPT_IN] !== '1') throw new Error(`${OPT_IN}=1 required`);
  const raw = process.env.DATABASE_URL ?? '';
  let host = '';
  try {
    host = new URL(raw.replace(/^postgres:/, 'postgresql:')).hostname;
  } catch {
    throw new Error('DATABASE_URL must be a valid postgres URL');
  }
  const dbName = raw.split('/').pop()?.split('?')[0] ?? '';
  if (!['127.0.0.1', 'localhost'].includes(host) || !/usr/i.test(dbName)) {
    throw new Error('DATABASE_URL must target disposable loopback usr* test DB');
  }
}

(run ? describe : describe.skip)('USR-P3A.3 master identity security (PostgreSQL)', () => {
  jest.setTimeout(180_000);
  let prisma: PrismaClient;
  let prismaB: PrismaClient;
  let stack: ReturnType<typeof createUsrP3a3IdentityPgStack>;
  let masterActorId: string;

  beforeAll(async () => {
    assertDisposableDb();
    prisma = new PrismaClient();
    prismaB = new PrismaClient();
    stack = createUsrP3a3IdentityPgStack(prisma);
    masterActorId = randomUUID();
    await prisma.user.create({
      data: {
        id: masterActorId,
        email: `p3a3-master-${masterActorId}@example.test`,
        platformRole: UserPlatformRole.MASTER_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await prismaB?.$disconnect();
  });

  const actor = () => ({ id: masterActorId, platformRole: 'MASTER_ADMIN' as const });
  const auditReq = () => ({ method: 'POST', headers: {} as Record<string, string> });

  function outboxShell(
    extra: Omit<Prisma.MasterAdminAuditOutboxUncheckedCreateInput, 'auditAction' | 'occurredAt' | 'payloadVersion' | 'actorUserId' | 'status' | 'nextRetryAt'>,
  ): Prisma.MasterAdminAuditOutboxUncheckedCreateInput {
    return {
      auditAction: MasterAdminAuditAction.PLATFORM_USER_CREATED,
      occurredAt: new Date(),
      payloadVersion: 1,
      actorUserId: masterActorId,
      status: MasterAdminAuditOutboxStatus.PENDING,
      nextRetryAt: new Date(),
      ...extra,
    };
  }

  it('R01 — conflicting payload fingerprint rejects replay before mutation', async () => {
    const opId = randomUUID();
    const email = `fp-conflict-${randomUUID()}@example.test`;
    const fpA = buildProvisionPayloadFingerprint(email, { email, firstName: 'A' } as never, false);
    const fpB = buildProvisionPayloadFingerprint(email, { email, firstName: 'B' } as never, false);
    expect(fpA).not.toBe(fpB);

    const bindingA: MasterIdentityOperationBinding = {
      domain: MASTER_IDENTITY_OPERATION_DOMAIN,
      action: 'PROVISION_IDENTITY',
      actorUserId: masterActorId,
      organizationId: null,
      normalizedEmail: email,
      payloadFingerprint: fpA,
      securityOperationId: opId,
      targetUserId: randomUUID(),
    };
    const bindingB = { ...bindingA, payloadFingerprint: fpB };

    await prisma.masterAdminAuditOutbox.create({
      data: outboxShell({
        idempotencyKey: buildMasterIdentityAuditIdempotencyKey(opId),
        subjectUserId: bindingA.targetUserId!,
        auditScope: MasterAdminAuditScope.PLATFORM,
        payload: {
          masterAdminAuditEnvelope: {
            entityId: bindingA.targetUserId,
            metadata: { operationBinding: bindingA },
          },
        },
      }),
    });

    const row = await prisma.masterAdminAuditOutbox.findUniqueOrThrow({
      where: { idempotencyKey: buildMasterIdentityAuditIdempotencyKey(opId) },
    });
    expect(outboxMatchesIdentityOperation(row, bindingA)).toBe(true);
    expect(outboxMatchesIdentityOperation(row, bindingB)).toBe(false);
  });

  it('R02 — identity-only provision and same-key replay returns one user', async () => {
    const opId = `op-${randomUUID()}`;
    const email = `idempotent-${randomUUID()}@example.test`;
    const dto = { email, firstName: 'Replay', lastName: 'User', idempotencyKey: opId };
    const first = await stack.globalIdentity.provisionGlobalUser(dto, actor(), auditReq());
    expect(first.idempotentReplay).toBeFalsy();
    expect(first.user.email).toBe(email);

    const second = await stack.globalIdentity.provisionGlobalUser(dto, actor(), auditReq());
    expect(second.idempotentReplay).toBe(true);
    expect(second.user.id).toBe(first.user.id);

    const outbox = await prisma.masterAdminAuditOutbox.findUnique({
      where: { idempotencyKey: buildMasterIdentityAuditIdempotencyKey(opId) },
    });
    expect(outbox).toBeTruthy();
    expect(readProvisionedUserIdFromOutbox(outbox!)).toBe(first.user.id);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it('R02 — cross-actor replay binding fails closed', async () => {
    const opId = randomUUID();
    const email = `cross-actor-${randomUUID()}@example.test`;
    const stored: MasterIdentityOperationBinding = {
      domain: MASTER_IDENTITY_OPERATION_DOMAIN,
      action: 'PROVISION_IDENTITY',
      actorUserId: masterActorId,
      organizationId: null,
      normalizedEmail: email,
      payloadFingerprint: buildProvisionPayloadFingerprint(email, { email, firstName: 'X' } as never, false),
      securityOperationId: opId,
      targetUserId: randomUUID(),
    };
    const otherActor: MasterIdentityOperationBinding = { ...stored, actorUserId: randomUUID() };
    const row = await prisma.masterAdminAuditOutbox.create({
      data: outboxShell({
        idempotencyKey: buildMasterIdentityAuditIdempotencyKey(opId),
        subjectUserId: stored.targetUserId!,
        auditScope: MasterAdminAuditScope.PLATFORM,
        payload: {
          masterAdminAuditEnvelope: {
            metadata: { operationBinding: stored },
            entityId: stored.targetUserId,
          },
        },
      }),
    });
    expect(outboxMatchesIdentityOperation(row, otherActor)).toBe(false);
  });

  it('A08 / R06 — duplicate normalized email conflicts on second operation', async () => {
    const email = `dup-${randomUUID()}@example.test`;
    await stack.globalIdentity.provisionGlobalUser(
      { email, firstName: 'One', lastName: 'User' },
      actor(),
      auditReq(),
    );
    await expect(
      stack.globalIdentity.provisionGlobalUser(
        { email, firstName: 'Two', lastName: 'User' },
        actor(),
        auditReq(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('R06 — invalid timezone rejected on profile patch', async () => {
    const email = `tz-${randomUUID()}@example.test`;
    const created = await stack.globalIdentity.provisionGlobalUser(
      { email, firstName: 'Tz', lastName: 'User' },
      actor(),
      auditReq(),
    );
    await expect(
      stack.globalIdentity.updateGlobalProfile(
        created.user.id,
        { timezone: 'Not/A/Timezone', idempotencyKey: randomUUID() },
        actor(),
        auditReq(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('R02 — profile replay is safe no-op without second mutation', async () => {
    const email = `prof-replay-${randomUUID()}@example.test`;
    const created = await stack.globalIdentity.provisionGlobalUser(
      { email, firstName: 'Prof', lastName: 'Replay' },
      actor(),
      auditReq(),
    );
    const opId = `prof-${randomUUID()}`;
    const patch = { language: 'en', idempotencyKey: opId };
    const updated = await stack.globalIdentity.updateGlobalProfile(
      created.user.id,
      patch,
      actor(),
      auditReq(),
    );
    expect(updated.language).toBe('en');

    const replay = await stack.globalIdentity.updateGlobalProfile(
      created.user.id,
      patch,
      actor(),
      auditReq(),
    );
    expect(replay.language).toBe('en');
    const outboxCount = await prisma.masterAdminAuditOutbox.count({
      where: { idempotencyKey: buildMasterIdentityAuditIdempotencyKey(opId) },
    });
    expect(outboxCount).toBe(1);
  });

  it('R03 metadata — provision outbox stores inviteId for authoritative replay', async () => {
    const inviteId = randomUUID();
    const targetUserId = randomUUID();
    const opId = randomUUID();
    const binding: MasterIdentityOperationBinding = {
      domain: MASTER_IDENTITY_OPERATION_DOMAIN,
      action: 'PROVISION_IDENTITY_ORG',
      actorUserId: masterActorId,
      organizationId: randomUUID(),
      normalizedEmail: `meta-${randomUUID()}@example.test`,
      payloadFingerprint: 'fp',
      securityOperationId: opId,
      targetUserId,
    };
    const row = await prisma.masterAdminAuditOutbox.create({
      data: outboxShell({
        idempotencyKey: buildMasterIdentityAuditIdempotencyKey(opId),
        subjectUserId: targetUserId,
        auditScope: MasterAdminAuditScope.ORGANIZATION_CONTEXT,
        organizationContextId: binding.organizationId!,
        payload: {
          masterAdminAuditEnvelope: {
            entityId: targetUserId,
            metadata: {
              operationBinding: binding,
              inviteId,
              membershipId: randomUUID(),
              inviteByEmail: true,
            },
          },
        },
      }),
    });
    const meta = readProvisionOperationMetadataFromOutbox(row);
    expect(meta?.inviteId).toBe(inviteId);
    expect(meta?.inviteByEmail).toBe(true);
  });

  it.skip('R05 — identity email provision lock wait uses participating backend pid (PG load-sensitive; covered in USR-P2C)', async () => {
    const email = `lock-p3a3-${randomUUID()}@example.test`;
    const raceId = randomUUID();
    await ensureRaceBarrierTable(prisma);
    await resetRaceBarrier(prisma, raceId);

    let blockedBackendPid = 0;
    const connectionBPromise = (async () => {
      await waitRacePhaseAtLeast(prismaB, raceId, 'a_lock_acquired');
      return prismaB.$transaction(async (txB) => {
        blockedBackendPid = await pgBackendPid(prismaB);
        await setRacePhase(prisma, raceId, 'b_waiting', { pid: blockedBackendPid });
        await acquireIdentityEmailProvisionLock(txB, email);
        await setRacePhase(prisma, raceId, 'done');
      });
    })();

    await prisma.$transaction(async (txA) => {
      await acquireIdentityEmailProvisionLock(txA, email);
      await setRacePhase(prisma, raceId, 'a_lock_acquired');
      await waitRacePhaseAtLeast(prisma, raceId, 'b_waiting');
      const blockingPids = await waitUntilBackendBlocked(prisma, blockedBackendPid, {
        timeoutMs: 20_000,
      });
      expect(blockingPids.length).toBeGreaterThan(0);
    });

    await connectionBPromise;
  });

  it('R01 — operation admission lock serializes concurrent audit dedup', async () => {
    const operationId = randomUUID();
    const key = buildMasterIdentityAuditIdempotencyKey(operationId);
    await prisma.$transaction(async (tx) => {
      await acquireSecurityOperationAdmissionLock(tx, operationId);
      await tx.masterAdminAuditOutbox.create({
        data: outboxShell({
          idempotencyKey: key,
          subjectUserId: randomUUID(),
          auditScope: MasterAdminAuditScope.PLATFORM,
          payload: { masterAdminAuditEnvelope: { entityId: randomUUID() } },
        }),
      });
    });
    const count = await prisma.masterAdminAuditOutbox.count({ where: { idempotencyKey: key } });
    expect(count).toBe(1);
  });
});