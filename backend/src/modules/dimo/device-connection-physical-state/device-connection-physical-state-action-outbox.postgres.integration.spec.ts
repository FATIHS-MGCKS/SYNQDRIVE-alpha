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
            episodeAction: 'open_unplug',
            alertAction: 'emit_unplug',
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
    expect(outboxId).toBeTruthy();

    const now = new Date();
    const expiredLease = new Date(now.getTime() - 1_000);
    await prisma.deviceConnectionPhysicalStateActionOutbox.update({
      where: { id: outboxId! },
      data: {
        status: DeviceConnectionPhysicalStateActionOutboxStatus.PROCESSING,
        processingAttempts: 1,
        processingLeaseExpiresAt: expiredLease,
      },
    });

    const reclaimed = await repository.claimForProcessing(
      outboxId!,
      now,
      new Date(now.getTime() + config.processingLeaseMs),
    );
    expect(reclaimed?.id).toBe(outboxId);
  });

  it('D. completed row is never reclaimable', async () => {
    const { outboxId } = await prisma.$transaction((tx) =>
      repository.enqueueInTransaction(tx, enqueueInput()),
    );
    await repository.markCompleted(outboxId!);

    const now = new Date();
    const claimed = await repository.claimForProcessing(
      outboxId!,
      now,
      new Date(now.getTime() + config.processingLeaseMs),
    );
    expect(claimed).toBeNull();
  });

  it('E. retry increments attempts and respects nextRetryAt', async () => {
    const { outboxId } = await prisma.$transaction((tx) =>
      repository.enqueueInTransaction(tx, enqueueInput()),
    );
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + config.processingLeaseMs);
    const claimed = await repository.claimForProcessing(outboxId!, now, leaseExpiresAt);
    expect(claimed?.processingAttempts).toBe(1);

    const futureRetry = new Date(Date.now() + 60_000);
    await repository.markRetryableFailed(outboxId!, {
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
  });
});
