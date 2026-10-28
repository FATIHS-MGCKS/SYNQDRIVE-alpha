import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { DS4_POSTGRES_LIVE } from './ds4-assessment-postgres-harness';
import { DS4_TRIP_ASSESSMENT_VERSION_V1 } from '../ds4-trip-assessment-v1.contract';
import { Ds4AssessmentOutboxRepositoryV1 } from '../ds4-assessment-outbox.repository.v1';
import { DI_V0_DS4_ASSESSMENT_TUNING } from '../ds4-assessment.config';

const describePg =
  process.env.DI_V0_DS4_ASSESSMENT_POSTGRES_INTEGRATION === '1' && DS4_POSTGRES_LIVE ? describe : describe.skip;

describePg('ds4-assessment outbox postgres integration', () => {
  let db: PrismaClient;
  let outbox: Ds4AssessmentOutboxRepositoryV1;

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client');
    db = new PrismaClient();
    outbox = new Ds4AssessmentOutboxRepositoryV1(db);
  });

  beforeEach(async () => {
    await db.$executeRaw`DELETE FROM di_v0_ds4_assessment_outbox_v1 WHERE organization_id = 'org-test'`;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function seedOutboxRow(input: {
    sourceMotionRunId: string;
    status: string;
    nextAttemptAt: Date;
    attemptCount?: number;
    claimExpiresAt?: Date | null;
  }): Promise<string> {
    const outboxId = randomUUID();
    await db.diV0Ds4AssessmentOutboxV1.create({
      data: {
        outboxId,
        sourceMotionRunId: input.sourceMotionRunId,
        organizationId: 'org-test',
        tripId: 'trip-test',
        vehicleId: 'veh-test',
        assessmentVersion: DS4_TRIP_ASSESSMENT_VERSION_V1,
        inputFingerprint: `fp-${input.sourceMotionRunId}`,
        status: input.status,
        attemptCount: input.attemptCount ?? 0,
        nextAttemptAt: input.nextAttemptAt,
        claimExpiresAt: input.claimExpiresAt ?? null,
      },
    });
    return outboxId;
  }

  it('claims FAILED_RETRYABLE rows after next_attempt_at with bounded attempts', async () => {
    const runId = randomUUID();
    const now = new Date('2026-10-28T12:00:00.000Z');
    await seedOutboxRow({
      sourceMotionRunId: runId,
      status: 'FAILED_RETRYABLE',
      nextAttemptAt: new Date(now.getTime() - 1000),
      attemptCount: 1,
    });

    const claimed = await outbox.claimBatch({
      limit: 5,
      now,
      leaseMs: 60_000,
      maxProcessingAttempts: DI_V0_DS4_ASSESSMENT_TUNING.maxProcessingAttempts,
    });
    expect(claimed.some((c) => c.sourceMotionRunId === runId)).toBe(true);
  });

  it('does not claim FAILED_RETRYABLE rows at maxProcessingAttempts', async () => {
    const runId = randomUUID();
    const now = new Date('2026-10-28T12:05:00.000Z');
    await seedOutboxRow({
      sourceMotionRunId: runId,
      status: 'FAILED_RETRYABLE',
      nextAttemptAt: new Date(now.getTime() - 1000),
      attemptCount: DI_V0_DS4_ASSESSMENT_TUNING.maxProcessingAttempts,
    });

    const claimed = await outbox.claimBatch({
      limit: 5,
      now,
      leaseMs: 60_000,
      maxProcessingAttempts: DI_V0_DS4_ASSESSMENT_TUNING.maxProcessingAttempts,
    });
    expect(claimed.some((c) => c.sourceMotionRunId === runId)).toBe(false);
  });

  it('recovers expired PROCESSING leases and eventually marks FAILED_TERMINAL', async () => {
    const runId = randomUUID();
    const now = new Date('2026-10-28T12:10:00.000Z');
    const outboxId = await seedOutboxRow({
      sourceMotionRunId: runId,
      status: 'PROCESSING',
      nextAttemptAt: now,
      attemptCount: DI_V0_DS4_ASSESSMENT_TUNING.maxProcessingAttempts - 1,
      claimExpiresAt: new Date(now.getTime() - 1000),
    });
    await db.diV0Ds4AssessmentOutboxV1.update({
      where: { outboxId },
      data: { claimToken: randomUUID() },
    });

    await outbox.releaseExpiredProcessingLeases({
      now,
      maxProcessingAttempts: DI_V0_DS4_ASSESSMENT_TUNING.maxProcessingAttempts,
      retryDelayMs: 1000,
    });

    const row = await db.diV0Ds4AssessmentOutboxV1.findUnique({ where: { outboxId } });
    expect(row?.status).toBe('FAILED_TERMINAL');
  });

  it('allows only one concurrent claim for the same pending row', async () => {
    const runId = randomUUID();
    const now = new Date('2026-10-28T12:15:00.000Z');
    await seedOutboxRow({
      sourceMotionRunId: runId,
      status: 'PENDING',
      nextAttemptAt: now,
    });

    const db2 = new (await import('@prisma/client')).PrismaClient();
    const outbox2 = new Ds4AssessmentOutboxRepositoryV1(db2);
    try {
      const [first, second] = await Promise.all([
        outbox.claimBatch({
          limit: 1,
          now,
          leaseMs: 60_000,
          maxProcessingAttempts: DI_V0_DS4_ASSESSMENT_TUNING.maxProcessingAttempts,
        }),
        outbox2.claimBatch({
          limit: 1,
          now,
          leaseMs: 60_000,
          maxProcessingAttempts: DI_V0_DS4_ASSESSMENT_TUNING.maxProcessingAttempts,
        }),
      ]);
      const claimsForRun = [...first, ...second].filter((c) => c.sourceMotionRunId === runId);
      expect(claimsForRun).toHaveLength(1);
    } finally {
      await db2.$disconnect();
    }
  });

  it('markFailedRetryable enforces terminal status at max attempts', async () => {
    const runId = randomUUID();
    const now = new Date('2026-10-28T12:20:00.000Z');
    const outboxId = await seedOutboxRow({
      sourceMotionRunId: runId,
      status: 'PENDING',
      nextAttemptAt: now,
      attemptCount: DI_V0_DS4_ASSESSMENT_TUNING.maxProcessingAttempts - 1,
    });
    const claimToken = randomUUID();
    await db.diV0Ds4AssessmentOutboxV1.update({
      where: { outboxId },
      data: { status: 'PROCESSING', claimToken, claimExpiresAt: new Date(now.getTime() + 60_000) },
    });

    const outcome = await outbox.markFailedRetryable(outboxId, claimToken, {
      nextAttemptAt: new Date(now.getTime() + 60_000),
      errorCode: 'TEST_ERROR',
      now,
      maxProcessingAttempts: DI_V0_DS4_ASSESSMENT_TUNING.maxProcessingAttempts,
    });
    expect(outcome).toBe('terminal');
    const row = await db.diV0Ds4AssessmentOutboxV1.findUnique({ where: { outboxId } });
    expect(row?.status).toBe('FAILED_TERMINAL');
  });
});
