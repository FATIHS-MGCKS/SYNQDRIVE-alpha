import type { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  LV_PUBLICATION_HANDOFF_OUTCOME,
  LV_PUBLICATION_HANDOFF_STATUS,
  mergePublicationHandoffIntoAssessmentSummary,
  readPublicationHandoffFromAssessmentSummary,
} from './lv-publication-handoff.metadata';
import { LvPublicationHandoffService } from './lv-publication-handoff.service';
import {
  LvPublicationHandoffMetadataConflictError,
  mutateBatteryAssessmentPublicationHandoff,
} from './lv-publication-handoff.mutation';
import { LV_PUBLICATION_CONTRACT_VERSION } from './lv-publication-contract.policy';

const ORG = 'clorg1234567890123456789012';
const ASSESS = 'classess12345678901234567890';
const VEH = 'clveh1234567890123456789012';

function baseHandoff() {
  return {
    selectedAssessmentId: ASSESS,
    assessmentTrack: 'TELEMETRY' as const,
    idempotencyKey: `pub:${ASSESS}:v1`,
    publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
    epochAssessmentIds: [ASSESS],
    status: LV_PUBLICATION_HANDOFF_STATUS.ENQUEUED,
    enqueuedAt: '2026-09-02T10:00:00.000Z',
  };
}

function buildAssessmentStore(initial: Record<string, unknown> = {}) {
  let inputSummary: Record<string, unknown> = initial;
  let locked = false;

  const prisma: {
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
    batteryAssessment: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    getInputSummary: () => Record<string, unknown>;
  } = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    batteryAssessment: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    getInputSummary: () => inputSummary,
  };

  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
    if (locked) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    locked = true;
    try {
      return await fn(prisma);
    } finally {
      locked = false;
    }
  });
  prisma.$queryRaw.mockImplementation(async () => [{ input_summary: inputSummary }]);
  prisma.batteryAssessment.findFirst.mockImplementation(async () => ({
    id: ASSESS,
    organizationId: ORG,
    vehicleId: VEH,
    inputSummary,
  }));
  prisma.batteryAssessment.updateMany.mockImplementation(
    async (args: { data: { inputSummary: Prisma.InputJsonValue } }) => {
      inputSummary = args.data.inputSummary as Record<string, unknown>;
      return { count: 1 };
    },
  );

  return prisma;
}

describe('lv-publication-handoff.metadata monotonic merge', () => {
  it('RACE A: late ENQUEUED cannot regress EXECUTED', () => {
    const merged = mergePublicationHandoffIntoAssessmentSummary(
      {
        publicationHandoff: {
          ...baseHandoff(),
          status: LV_PUBLICATION_HANDOFF_STATUS.EXECUTED,
          outcome: LV_PUBLICATION_HANDOFF_OUTCOME.PUBLICATION_EVALUATED,
          executedAt: '2026-09-02T10:01:00.000Z',
        },
      },
      {
        ...baseHandoff(),
        status: LV_PUBLICATION_HANDOFF_STATUS.ENQUEUED,
        lastAttemptAt: '2026-09-02T10:02:00.000Z',
      },
    );

    const handoff = readPublicationHandoffFromAssessmentSummary(merged);
    expect(handoff?.status).toBe(LV_PUBLICATION_HANDOFF_STATUS.EXECUTED);
  });

  it('RACE E: repeated EXECUTED ack stays EXECUTED with same identity', () => {
    const merged = mergePublicationHandoffIntoAssessmentSummary(
      {
        publicationHandoff: {
          ...baseHandoff(),
          status: LV_PUBLICATION_HANDOFF_STATUS.EXECUTED,
          outcome: LV_PUBLICATION_HANDOFF_OUTCOME.POLICY_SKIPPED,
          executedAt: '2026-09-02T10:01:00.000Z',
        },
      },
      {
        ...baseHandoff(),
        status: LV_PUBLICATION_HANDOFF_STATUS.EXECUTED,
        outcome: LV_PUBLICATION_HANDOFF_OUTCOME.POLICY_SKIPPED,
        executedAt: '2026-09-02T10:03:00.000Z',
      },
    );

    const handoff = readPublicationHandoffFromAssessmentSummary(merged);
    expect(handoff?.status).toBe(LV_PUBLICATION_HANDOFF_STATUS.EXECUTED);
    expect(handoff?.idempotencyKey).toBe(`pub:${ASSESS}:v1`);
  });
});

describe('mutateBatteryAssessmentPublicationHandoff', () => {
  it('RACE D: unrelated inputSummary fields are preserved', async () => {
    const store = buildAssessmentStore({
      unrelatedField: 'keep-me',
      publicationHandoff: baseHandoff(),
    });
    const prisma = store as unknown as PrismaService;

    await mutateBatteryAssessmentPublicationHandoff(prisma, {
      assessmentId: ASSESS,
      organizationId: ORG,
      mutate: (summary) =>
        mergePublicationHandoffIntoAssessmentSummary(summary, {
          ...baseHandoff(),
          status: LV_PUBLICATION_HANDOFF_STATUS.EXECUTED,
          executedAt: '2026-09-02T10:01:00.000Z',
        }) as Prisma.InputJsonValue,
    });

    expect(store.getInputSummary().unrelatedField).toBe('keep-me');
    expect(
      readPublicationHandoffFromAssessmentSummary(store.getInputSummary())?.status,
    ).toBe(LV_PUBLICATION_HANDOFF_STATUS.EXECUTED);
  });

  it('throws when assessment row is missing', async () => {
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          $queryRaw: jest.fn(async () => []),
        }),
      ),
    } as unknown as PrismaService;

    await expect(
      mutateBatteryAssessmentPublicationHandoff(prisma, {
        assessmentId: ASSESS,
        organizationId: ORG,
        mutate: (summary) => summary as Prisma.InputJsonValue,
        maxAttempts: 1,
      }),
    ).rejects.toThrow('lv_publication_handoff_assessment_not_found');
  });

  it('throws after bounded update failure', async () => {
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          $queryRaw: jest.fn(async () => [{ input_summary: {} }]),
          batteryAssessment: {
            updateMany: jest.fn(async () => ({ count: 0 })),
          },
        }),
      ),
    } as unknown as PrismaService;

    await expect(
      mutateBatteryAssessmentPublicationHandoff(prisma, {
        assessmentId: ASSESS,
        organizationId: ORG,
        mutate: (summary) => summary as Prisma.InputJsonValue,
        maxAttempts: 2,
      }),
    ).rejects.toBeInstanceOf(LvPublicationHandoffMetadataConflictError);
  });
});

describe('lv-publication-handoff concurrency (PKG-02)', () => {
  it('sequential retry converges on one identity without duplicate enqueue', async () => {
    const store = buildAssessmentStore({});
    const jobProducer = {
      enqueue: jest.fn().mockResolvedValue('bull-job-pub'),
      hasLiveJob: jest.fn(),
    };
    let live = false;
    jobProducer.enqueue.mockImplementation(async () => {
      live = true;
      return 'bull-job-pub';
    });
    jobProducer.hasLiveJob.mockImplementation(async () => live);

    const prisma = {
      ...store,
      batteryAssessment: {
        ...store.batteryAssessment,
      },
    } as unknown as PrismaService;

    const service = new LvPublicationHandoffService(
      prisma,
      jobProducer as never,
      { isDeadLetter: jest.fn().mockResolvedValue(false) } as never,
    );

    const input = {
      organizationId: ORG,
      vehicleId: VEH,
      epochCandidates: [
        {
          assessmentId: ASSESS,
          assessmentTrack: 'TELEMETRY' as const,
          assessmentMode: 'CANONICAL' as const,
        },
      ],
    };

    const first = await service.ensurePublicationHandoff(input);
    const second = await service.ensurePublicationHandoff(input);

    expect(first.enqueued).toBe(true);
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe('already_enqueued_live');
    expect(jobProducer.enqueue).toHaveBeenCalledTimes(1);
    expect(
      readPublicationHandoffFromAssessmentSummary(store.getInputSummary())
        ?.idempotencyKey,
    ).toBe(`pub:${ASSESS}:v1`);
  });

  it('sequential direct then reconcile share durable pub identity', async () => {
    const store = buildAssessmentStore({});
    const jobProducer = {
      enqueue: jest.fn().mockResolvedValue('bull-job-pub'),
      hasLiveJob: jest.fn().mockResolvedValue(false),
    };
    const prisma = store as unknown as PrismaService;
    const service = new LvPublicationHandoffService(
      prisma,
      jobProducer as never,
      { isDeadLetter: jest.fn().mockResolvedValue(false) } as never,
    );

    const input = {
      organizationId: ORG,
      vehicleId: VEH,
      epochCandidates: [
        {
          assessmentId: ASSESS,
          assessmentTrack: 'WORKSHOP_OVERRIDE' as const,
          assessmentMode: 'CANONICAL' as const,
        },
      ],
    };

    await service.ensurePublicationHandoff(input);
    const handoff = readPublicationHandoffFromAssessmentSummary(store.getInputSummary());
    expect(handoff?.idempotencyKey).toBe(`pub:${ASSESS}:v1`);
    expect(handoff?.assessmentTrack).toBe('WORKSHOP_OVERRIDE');

    await service.reconcilePublicationHandoff(input);
    const after = readPublicationHandoffFromAssessmentSummary(store.getInputSummary());
    expect(after?.idempotencyKey).toBe(`pub:${ASSESS}:v1`);
    expect(after?.status).toBe(LV_PUBLICATION_HANDOFF_STATUS.ENQUEUED);
  });
});
