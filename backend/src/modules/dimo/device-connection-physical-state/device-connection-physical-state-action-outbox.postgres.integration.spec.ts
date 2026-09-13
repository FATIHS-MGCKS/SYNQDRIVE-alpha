import {
  DeviceConnectionPhysicalStateActionOutboxStatus,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import deviceConnectionPhysicalStateActionOutboxConfig from '@config/device-connection-physical-state-action-outbox.config';
import { DeviceConnectionPhysicalStateActionOutboxProcessorService } from './device-connection-physical-state-action-outbox-processor.service';
import { DeviceConnectionPhysicalStateActionOutboxRepository } from './device-connection-physical-state-action-outbox.repository';
import {
  cleanupPhysicalStatePostgresFixture,
  createPhysicalStatePostgresFixture,
  type PhysicalStatePostgresFixture,
} from './testing/physical-state-postgres.integration.harness';

const LIVE =
  process.env.PHYSICAL_STATE_POSTGRES_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);
const REQUIRED = process.env.PHYSICAL_STATE_POSTGRES_REQUIRED === '1';
const describePg = LIVE ? describe : describe.skip;

if (REQUIRED && !LIVE) {
  throw new Error(
    'PHYSICAL_STATE_POSTGRES_REQUIRED=1 but DATABASE_URL / PHYSICAL_STATE_POSTGRES_INTEGRATION not configured',
  );
}

describePg('DeviceConnectionPhysicalStateActionOutbox (postgres)', () => {
  let prisma: PrismaClient;
  let repository: DeviceConnectionPhysicalStateActionOutboxRepository;
  let processor: DeviceConnectionPhysicalStateActionOutboxProcessorService;
  let fixture: PhysicalStatePostgresFixture;
  const config = deviceConnectionPhysicalStateActionOutboxConfig();

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$executeRawUnsafe('SELECT 1');
    repository = new DeviceConnectionPhysicalStateActionOutboxRepository(
      prisma as unknown as PrismaService,
    );
    processor = new DeviceConnectionPhysicalStateActionOutboxProcessorService(
      config,
      repository,
    );
  });

  beforeEach(async () => {
    fixture = await createPhysicalStatePostgresFixture(prisma);
  });

  afterEach(async () => {
    await cleanupPhysicalStatePostgresFixture(prisma, fixture);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function enqueueInput(overrides: Partial<Parameters<typeof repository.enqueueInTransaction>[1]> = {}) {
    return {
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      provider: 'DIMO',
      bindingKey: 'DIMO:device:test-hash',
      transitionId: 'transition-1',
      stateVersion: 1,
      evidenceReferenceId: 'evidence-1',
      episodeAction: 'open_unplug' as const,
      alertAction: 'emit_unplug' as const,
      ...overrides,
    };
  }

  async function claimOne(outboxId: string) {
    const now = new Date();
    return repository.claimForProcessing(
      outboxId,
      now,
      new Date(now.getTime() + config.processingLeaseMs),
    );
  }

  it('A. idempotent insert — concurrent same idempotencyKey yields one row', async () => {
    const input = enqueueInput();
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        prisma.$transaction((tx) => repository.enqueueInTransaction(tx, input)),
      ),
    );
    const created = results.filter((r) => !r.duplicate);
    expect(created.length).toBe(1);

    const count = await prisma.deviceConnectionPhysicalStateActionOutbox.count({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(count).toBe(1);
  });

  it('B. multi-worker claim — disjoint claimed sets', async () => {
    for (let i = 0; i < 6; i += 1) {
      await prisma.$transaction((tx) =>
        repository.enqueueInTransaction(
          tx,
          enqueueInput({
            bindingKey: `DIMO:device:hash-${i}`,
            transitionId: `transition-${i}`,
            stateVersion: i + 1,
          }),
        ),
      );
    }

    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + config.processingLeaseMs);
    const [batchA, batchB] = await Promise.all([
      repository.claimBatchWithSkipLocked(10, now, leaseExpiresAt),
      repository.claimBatchWithSkipLocked(10, now, leaseExpiresAt),
    ]);

    const idsA = new Set(batchA.map((r) => r.id));
    const idsB = new Set(batchB.map((r) => r.id));
    const overlap = [...idsA].filter((id) => idsB.has(id));
    expect(overlap).toHaveLength(0);
    expect(idsA.size + idsB.size).toBe(6);
  });

  it('C. lease expiry — row becomes reclaimable', async () => {
    const { outboxId } = await prisma.$transaction((tx) =>
      repository.enqueueInTransaction(tx, enqueueInput()),
    );
    const firstClaim = await claimOne(outboxId!);
    expect(firstClaim?.processingClaimToken).toBeTruthy();

    const now = new Date();
    const expiredLease = new Date(now.getTime() - 1_000);
    await prisma.deviceConnectionPhysicalStateActionOutbox.update({
      where: { id: outboxId! },
      data: {
        processingLeaseExpiresAt: expiredLease,
      },
    });

    const reclaimed = await repository.claimForProcessing(
      outboxId!,
      now,
      new Date(now.getTime() + config.processingLeaseMs),
    );
    expect(reclaimed?.id).toBe(outboxId);
    expect(reclaimed?.processingClaimToken).not.toBe(firstClaim?.processingClaimToken);
  });

  it('D. completed row is never reclaimable', async () => {
    const { outboxId } = await prisma.$transaction((tx) =>
      repository.enqueueInTransaction(tx, enqueueInput()),
    );
    const claimed = await claimOne(outboxId!);
    await repository.markCompleted(outboxId!, claimed!.processingClaimToken);

    const now = new Date();
    const nextClaim = await repository.claimForProcessing(
      outboxId!,
      now,
      new Date(now.getTime() + config.processingLeaseMs),
    );
    expect(nextClaim).toBeNull();
  });

  it('E. retry increments attempts and respects nextRetryAt', async () => {
    const { outboxId } = await prisma.$transaction((tx) =>
      repository.enqueueInTransaction(tx, enqueueInput()),
    );
    const claimed = await claimOne(outboxId!);
    expect(claimed?.processingAttempts).toBe(1);

    const futureRetry = new Date(Date.now() + 60_000);
    await repository.markRetryableFailed(outboxId!, claimed!.processingClaimToken, {
      errorCode: 'test_error',
      errorMessage: 'retry later',
      nextRetryAt: futureRetry,
    });

    const tooEarly = await repository.claimForProcessing(
      outboxId!,
      new Date(),
      new Date(Date.now() + config.processingLeaseMs),
    );
    expect(tooEarly).toBeNull();

    const afterRetry = await repository.claimForProcessing(
      outboxId!,
      new Date(futureRetry.getTime() + 1),
      new Date(futureRetry.getTime() + config.processingLeaseMs),
    );
    expect(afterRetry?.processingAttempts).toBe(2);
  });

  it('F. exhausted retries reach DEAD_LETTER and are not claimable', async () => {
    const { outboxId } = await prisma.$transaction((tx) =>
      repository.enqueueInTransaction(tx, enqueueInput()),
    );

    await prisma.deviceConnectionPhysicalStateActionOutbox.update({
      where: { id: outboxId! },
      data: {
        status: DeviceConnectionPhysicalStateActionOutboxStatus.DEAD_LETTER,
        processingAttempts: config.maxAttempts,
        deadLetteredAt: new Date(),
        processingClaimToken: null,
      },
    });

    const claimed = await repository.claimForProcessing(
      outboxId!,
      new Date(),
      new Date(Date.now() + config.processingLeaseMs),
    );
    expect(claimed).toBeNull();
  });

  it('G. processor skeleton completes row without side effects', async () => {
    const { outboxId } = await prisma.$transaction((tx) =>
      repository.enqueueInTransaction(tx, enqueueInput()),
    );
    const outcome = await processor.processOutboxId(outboxId!);
    expect(outcome).toBe('completed');

    const row = await repository.findById(outboxId!);
    expect(row?.status).toBe(DeviceConnectionPhysicalStateActionOutboxStatus.COMPLETED);
    expect(row?.completedAt).not.toBeNull();
    expect(row?.processingClaimToken).toBeNull();
  });

  it('H. STALE_WORKER_COMPLETE_FENCING', async () => {
    const { outboxId } = await prisma.$transaction((tx) =>
      repository.enqueueInTransaction(tx, enqueueInput()),
    );
    const claimA = await claimOne(outboxId!);
    const tokenA = claimA!.processingClaimToken;

    const now = new Date();
    await prisma.deviceConnectionPhysicalStateActionOutbox.update({
      where: { id: outboxId! },
      data: { processingLeaseExpiresAt: new Date(now.getTime() - 1_000) },
    });

    const claimB = await repository.claimForProcessing(
      outboxId!,
      now,
      new Date(now.getTime() + config.processingLeaseMs),
    );
    const tokenB = claimB!.processingClaimToken;
    expect(tokenA).not.toBe(tokenB);

    const staleAck = await repository.markCompleted(outboxId!, tokenA);
    expect(staleAck.updated).toBe(false);

    const rowMid = await repository.findById(outboxId!);
    expect(rowMid?.status).toBe(DeviceConnectionPhysicalStateActionOutboxStatus.PROCESSING);
    expect(rowMid?.processingClaimToken).toBe(tokenB);

    const freshAck = await repository.markCompleted(outboxId!, tokenB);
    expect(freshAck.updated).toBe(true);
  });

  it('I. STALE_WORKER_FAILURE_FENCING', async () => {
    const { outboxId } = await prisma.$transaction((tx) =>
      repository.enqueueInTransaction(tx, enqueueInput()),
    );
    const claimA = await claimOne(outboxId!);
    const tokenA = claimA!.processingClaimToken;

    const now = new Date();
    await prisma.deviceConnectionPhysicalStateActionOutbox.update({
      where: { id: outboxId! },
      data: { processingLeaseExpiresAt: new Date(now.getTime() - 1_000) },
    });

    const claimB = await claimOne(outboxId!);
    const tokenB = claimB!.processingClaimToken;

    const staleRetry = await repository.markRetryableFailed(outboxId!, tokenA, {
      errorCode: 'stale',
      errorMessage: 'stale worker',
      nextRetryAt: new Date(Date.now() + 60_000),
    });
    expect(staleRetry.updated).toBe(false);

    const staleDlq = await repository.markDeadLetter(outboxId!, tokenA, {
      errorCode: 'stale',
      errorMessage: 'stale worker',
    });
    expect(staleDlq.updated).toBe(false);

    const row = await repository.findById(outboxId!);
    expect(row?.processingClaimToken).toBe(tokenB);
    expect(row?.status).toBe(DeviceConnectionPhysicalStateActionOutboxStatus.PROCESSING);
  });

  it('J. REAPER_VS_RECLAIM_RACE', async () => {
    const { outboxId } = await prisma.$transaction((tx) =>
      repository.enqueueInTransaction(tx, enqueueInput()),
    );
    const claimA = await claimOne(outboxId!);
    const tokenA = claimA!.processingClaimToken;
    const staleBefore = new Date();

    await prisma.deviceConnectionPhysicalStateActionOutbox.update({
      where: { id: outboxId! },
      data: { processingLeaseExpiresAt: new Date(staleBefore.getTime() - 1_000) },
    });

    const staleRows = await repository.findStaleProcessingBatch(staleBefore, 10);
    expect(staleRows.some((r) => r.id === outboxId && r.processingClaimToken === tokenA)).toBe(true);

    const claimB = await claimOne(outboxId!);
    const tokenB = claimB!.processingClaimToken;
    expect(tokenB).not.toBe(tokenA);

    const observed = staleRows.find((r) => r.id === outboxId)!;
    const recovery = await repository.releaseExpiredLease(
      outboxId!,
      observed.processingClaimToken!,
      staleBefore,
      new Date(),
    );
    expect(recovery.updated).toBe(false);

    const row = await repository.findById(outboxId!);
    expect(row?.status).toBe(DeviceConnectionPhysicalStateActionOutboxStatus.PROCESSING);
    expect(row?.processingClaimToken).toBe(tokenB);
  });

  it('K. CURRENT_LEASE_RECOVERY', async () => {
    const { outboxId } = await prisma.$transaction((tx) =>
      repository.enqueueInTransaction(tx, enqueueInput()),
    );
    const claimA = await claimOne(outboxId!);
    const tokenA = claimA!.processingClaimToken;
    const staleBefore = new Date();

    await prisma.deviceConnectionPhysicalStateActionOutbox.update({
      where: { id: outboxId! },
      data: { processingLeaseExpiresAt: new Date(staleBefore.getTime() - 1_000) },
    });

    const recovery = await repository.releaseExpiredLease(
      outboxId!,
      tokenA,
      staleBefore,
      new Date(),
    );
    expect(recovery.updated).toBe(true);

    const row = await repository.findById(outboxId!);
    expect(row?.status).toBe(DeviceConnectionPhysicalStateActionOutboxStatus.RETRYABLE_FAILED);
    expect(row?.processingClaimToken).toBeNull();
  });

  it('L. CLAIM_TOKEN_ROTATION', async () => {
    const { outboxId } = await prisma.$transaction((tx) =>
      repository.enqueueInTransaction(tx, enqueueInput()),
    );
    const claimA = await claimOne(outboxId!);
    const tokenA = claimA!.processingClaimToken;

    const now = new Date();
    await prisma.deviceConnectionPhysicalStateActionOutbox.update({
      where: { id: outboxId! },
      data: { processingLeaseExpiresAt: new Date(now.getTime() - 1_000) },
    });

    const claimB = await claimOne(outboxId!);
    expect(claimB?.processingClaimToken).not.toBe(tokenA);
  });

  it('M. ACK_IDEMPOTENCY', async () => {
    const { outboxId } = await prisma.$transaction((tx) =>
      repository.enqueueInTransaction(tx, enqueueInput()),
    );
    const claimed = await claimOne(outboxId!);
    const token = claimed!.processingClaimToken;

    const first = await repository.markCompleted(outboxId!, token);
    expect(first.updated).toBe(true);

    const second = await repository.markCompleted(outboxId!, token);
    expect(second.updated).toBe(false);
  });

  it('N. MULTI_WORKER_STRESS — disjoint rows and unique claim tokens', async () => {
    for (let i = 0; i < 8; i += 1) {
      await prisma.$transaction((tx) =>
        repository.enqueueInTransaction(
          tx,
          enqueueInput({
            bindingKey: `DIMO:device:stress-${i}`,
            transitionId: `transition-stress-${i}`,
            stateVersion: i + 1,
          }),
        ),
      );
    }

    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + config.processingLeaseMs);
    const [batchA, batchB] = await Promise.all([
      repository.claimBatchWithSkipLocked(10, now, leaseExpiresAt),
      repository.claimBatchWithSkipLocked(10, now, leaseExpiresAt),
    ]);

    const allClaims = [...batchA, ...batchB];
    expect(allClaims).toHaveLength(8);
    const tokens = allClaims.map((r) => r.processingClaimToken);
    expect(new Set(tokens).size).toBe(8);
    for (const row of allClaims) {
      expect(row.processingClaimToken).toBeTruthy();
      expect(row.status).toBe(DeviceConnectionPhysicalStateActionOutboxStatus.PROCESSING);
    }
  });

  it('O. RETRY_TO_DLQ_REAL_PATH', async () => {
    const retryConfig = {
      ...config,
      maxAttempts: 2,
      baseBackoffMs: 1,
    };
    const failingProcessor = new DeviceConnectionPhysicalStateActionOutboxProcessorService(
      retryConfig,
      repository,
    );

    const { outboxId } = await prisma.$transaction((tx) =>
      repository.enqueueInTransaction(tx, enqueueInput()),
    );

    const first = await failingProcessor.processOutboxId(outboxId!, { throwOnAck: true });
    expect(first).toBe('retry_scheduled');

    let row = await repository.findById(outboxId!);
    expect(row?.status).toBe(DeviceConnectionPhysicalStateActionOutboxStatus.RETRYABLE_FAILED);
    expect(row?.processingClaimToken).toBeNull();

    await prisma.deviceConnectionPhysicalStateActionOutbox.update({
      where: { id: outboxId! },
      data: { nextRetryAt: new Date(Date.now() - 1) },
    });

    const second = await failingProcessor.processOutboxId(outboxId!, { throwOnAck: true });
    expect(second).toBe('dead_letter');

    row = await repository.findById(outboxId!);
    expect(row?.status).toBe(DeviceConnectionPhysicalStateActionOutboxStatus.DEAD_LETTER);
    expect(row?.processingClaimToken).toBeNull();

    const reclaim = await repository.claimForProcessing(
      outboxId!,
      new Date(),
      new Date(Date.now() + config.processingLeaseMs),
    );
    expect(reclaim).toBeNull();
  });
});
