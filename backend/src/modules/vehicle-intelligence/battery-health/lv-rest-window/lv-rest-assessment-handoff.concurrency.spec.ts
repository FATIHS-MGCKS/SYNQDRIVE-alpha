import type { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  LV_REST_ASSESSMENT_HANDOFF_OUTCOME,
  LV_REST_ASSESSMENT_HANDOFF_STATUS,
  mergeSessionAssessmentHandoffMetadata,
  readAssessmentHandoffFromTargetMetadata,
} from './lv-rest-assessment-handoff.metadata';
import { LvRestAssessmentHandoffService } from './lv-rest-assessment-handoff.service';
import {
  LvRestSessionMetadataConflictError,
  mutateLvRestSessionMetadata,
} from './lv-rest-session-metadata.mutation';
import { LV_REST_TARGET_TYPES } from './lv-rest-window-target.metadata';
import { mergeLvRestTargetJobMetadata } from './lv-rest-window-target.metadata';

const ORG = 'clorg1234567890123456789012';
const SESSION = 'clsess123456789012345678901';
const VEH = 'clveh1234567890123456789012';
const MEAS = 'clmeas123456789012345678901';

function buildSessionStore(initial: Record<string, unknown> = {}) {
  let metadata: Record<string, unknown> = initial;
  let updatedAt = new Date('2026-09-02T10:00:00.000Z');

  const prisma = {
    batteryMeasurementSession: {
      findFirst: jest.fn(async () => ({
        id: SESSION,
        organizationId: ORG,
        metadata,
        updatedAt,
      })),
      updateMany: jest.fn(
        async (args: {
          where: { updatedAt?: Date };
          data: { metadata: Prisma.InputJsonValue };
        }) => {
          if (args.where.updatedAt?.getTime() !== updatedAt.getTime()) {
            return { count: 0 };
          }
          metadata = args.data.metadata as Record<string, unknown>;
          updatedAt = new Date(updatedAt.getTime() + 1);
          return { count: 1 };
        },
      ),
    },
    getMetadata: () => metadata,
    bumpUpdatedAtExternally: () => {
      updatedAt = new Date(updatedAt.getTime() + 1);
    },
  };

  return prisma;
}

describe('lv-rest-session-metadata.mutation', () => {
  it('retries on updatedAt conflict and converges', async () => {
    const store = buildSessionStore({ lvRestWindowState: 'RESTING' });
    const prisma = store as unknown as PrismaService;

    let attempts = 0;
    const result = await mutateLvRestSessionMetadata(prisma, {
      sessionId: SESSION,
      organizationId: ORG,
      mutate: (current) => {
        attempts += 1;
        if (attempts === 1) {
          store.bumpUpdatedAtExternally();
        }
        return {
          ...(current as object),
          customField: 'ok',
        } as Prisma.InputJsonValue;
      },
    });

    expect(result).toEqual(expect.objectContaining({ customField: 'ok' }));
    expect(attempts).toBe(2);
    expect(store.batteryMeasurementSession.updateMany).toHaveBeenCalledTimes(2);
  });

  it('throws after bounded conflict exhaustion', async () => {
    const store = buildSessionStore();
    const prisma = store as unknown as PrismaService;
    store.batteryMeasurementSession.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      mutateLvRestSessionMetadata(prisma, {
        sessionId: SESSION,
        organizationId: ORG,
        mutate: (current) => current as Prisma.InputJsonValue,
        maxAttempts: 2,
      }),
    ).rejects.toBeInstanceOf(LvRestSessionMetadataConflictError);
  });
});

describe('lv-rest-assessment-handoff concurrency (D2)', () => {
  const baseHandoff = () => ({
    measurementId: MEAS,
    idempotencyKey: `assess:${VEH}:LV_HEALTH:${MEAS}`,
    status: LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED,
    enqueuedAt: '2026-09-02T10:00:00.000Z',
  });

  it('RACE A: late ENQUEUED acknowledgement cannot regress EXECUTED', async () => {
    const store = buildSessionStore({
      scheduledTargets: {
        REST_60M: {
          idempotencyKey: 'rest-key',
          scheduledFor: '2026-09-02T09:00:00.000Z',
          status: 'COMPLETED',
          assessmentHandoff: {
            ...baseHandoff(),
            status: LV_REST_ASSESSMENT_HANDOFF_STATUS.EXECUTED,
            outcome: LV_REST_ASSESSMENT_HANDOFF_OUTCOME.ASSESSMENT_PERSISTED,
            executedAt: '2026-09-02T10:01:00.000Z',
          },
        },
      },
    });
    const prisma = store as unknown as PrismaService;

    await mutateLvRestSessionMetadata(prisma, {
      sessionId: SESSION,
      organizationId: ORG,
      mutate: (metadata) =>
        mergeSessionAssessmentHandoffMetadata(metadata, LV_REST_TARGET_TYPES.REST_60M, {
          ...baseHandoff(),
          status: LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED,
          lastAttemptAt: '2026-09-02T10:02:00.000Z',
        }),
    });

    const handoff = readAssessmentHandoffFromTargetMetadata(
      store.getMetadata(),
      LV_REST_TARGET_TYPES.REST_60M,
    );
    expect(handoff?.status).toBe(LV_REST_ASSESSMENT_HANDOFF_STATUS.EXECUTED);
  });

  it('RACE B: COMPLETED target write preserves ENQUEUED assessmentHandoff', async () => {
    const store = buildSessionStore({
      scheduledTargets: {
        REST_60M: {
          idempotencyKey: 'rest-key',
          scheduledFor: '2026-09-02T09:00:00.000Z',
          status: 'ENQUEUED',
          assessmentHandoff: baseHandoff(),
        },
      },
    });
    const prisma = store as unknown as PrismaService;

    await mutateLvRestSessionMetadata(prisma, {
      sessionId: SESSION,
      organizationId: ORG,
      mutate: (metadata) =>
        mergeLvRestTargetJobMetadata(metadata, LV_REST_TARGET_TYPES.REST_60M, {
          status: 'COMPLETED',
          completedAt: '2026-09-02T10:02:00.000Z',
        }),
    });

    const target = (store.getMetadata().scheduledTargets as any).REST_60M;
    expect(target.status).toBe('COMPLETED');
    expect(target.assessmentHandoff?.status).toBe(
      LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED,
    );
  });

  it('RACE C: REST_60M and REST_6H sibling targets are both preserved', async () => {
    const store = buildSessionStore({
      lvRestWindowState: 'RESTING',
      anchorAt: '2026-09-02T08:00:00.000Z',
      scheduledTargets: {
        REST_60M: {
          idempotencyKey: 'rest-60m',
          scheduledFor: '2026-09-02T09:00:00.000Z',
          status: 'COMPLETED',
          assessmentHandoff: baseHandoff(),
        },
        REST_6H: {
          idempotencyKey: 'rest-6h',
          scheduledFor: '2026-09-02T14:00:00.000Z',
          status: 'ENQUEUED',
        },
      },
    });
    const prisma = store as unknown as PrismaService;

    await mutateLvRestSessionMetadata(prisma, {
      sessionId: SESSION,
      organizationId: ORG,
      mutate: (metadata) =>
        mergeLvRestTargetJobMetadata(metadata, LV_REST_TARGET_TYPES.REST_6H, {
          status: 'COMPLETED',
          completedAt: '2026-09-02T15:00:00.000Z',
        }),
    });

    const targets = store.getMetadata().scheduledTargets as Record<string, unknown>;
    expect((targets.REST_60M as any).assessmentHandoff?.status).toBe(
      LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED,
    );
    expect((targets.REST_6H as any).status).toBe('COMPLETED');
    expect(store.getMetadata().lvRestWindowState).toBe('RESTING');
    expect(store.getMetadata().anchorAt).toBe('2026-09-02T08:00:00.000Z');
  });

  it('RACE D: duplicate ensureAssessmentHandoff converges on one identity', async () => {
    const store = buildSessionStore({
      scheduledTargets: {
        REST_60M: {
          idempotencyKey: 'rest-key',
          scheduledFor: '2026-09-02T09:00:00.000Z',
          status: 'COMPLETED',
        },
      },
    });
    const jobProducer = {
      enqueue: jest.fn().mockResolvedValue('bull-job-d'),
      hasLiveJob: jest.fn(),
      hasLiveAssessJobForVehicle: jest.fn().mockResolvedValue(false),
      hasAssessDispatchConflict: jest.fn().mockResolvedValue(false),
    };
    let live = false;
    jobProducer.enqueue.mockImplementation(async () => {
      live = true;
      return 'bull-job-d';
    });
    jobProducer.hasLiveJob.mockImplementation(async () => live);
    const prisma = {
      batteryMeasurement: {
        findFirst: jest.fn(async () => ({
          id: MEAS,
          organizationId: ORG,
          vehicleId: VEH,
          sessionId: SESSION,
          type: 'REST_60M',
          provenance: { sourceObservationId: 'obs-1' },
        })),
      },
      batteryMeasurementSession: store.batteryMeasurementSession,
    } as unknown as PrismaService;

    const service = new LvRestAssessmentHandoffService(
      prisma,
      jobProducer as never,
      { isDeadLetter: jest.fn().mockResolvedValue(false) } as never,
    );

    const input = {
      organizationId: ORG,
      vehicleId: VEH,
      sessionId: SESSION,
      restTargetType: LV_REST_TARGET_TYPES.REST_60M,
      measurementId: MEAS,
    };

    const first = await service.ensureAssessmentHandoff(input);
    const second = await service.ensureAssessmentHandoff(input);

    expect(first.enqueued).toBe(true);
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe('already_enqueued_live');
    expect(jobProducer.enqueue).toHaveBeenCalledTimes(1);
    expect(
      readAssessmentHandoffFromTargetMetadata(store.getMetadata(), LV_REST_TARGET_TYPES.REST_60M)
        ?.idempotencyKey,
    ).toBe(`assess:${VEH}:LV_HEALTH:${MEAS}`);
  });

  it('RACE E: EXECUTED handoff ack preserves unrelated session metadata', async () => {
    const store = buildSessionStore({
      lvRestWindowState: 'RESTING',
      unrelatedNote: 'keep-me',
      scheduledTargets: {
        REST_60M: {
          idempotencyKey: 'rest-key',
          scheduledFor: '2026-09-02T09:00:00.000Z',
          status: 'COMPLETED',
          assessmentHandoff: baseHandoff(),
        },
      },
    });
    const prisma = {
      batteryMeasurement: {
        findFirst: jest.fn(async () => ({
          id: MEAS,
          organizationId: ORG,
          vehicleId: VEH,
          sessionId: SESSION,
          type: 'REST_60M',
          provenance: { sourceObservationId: 'obs-1' },
        })),
      },
      batteryMeasurementSession: store.batteryMeasurementSession,
    } as unknown as PrismaService;

    const service = new LvRestAssessmentHandoffService(
      prisma,
      { enqueue: jest.fn(), hasLiveJob: jest.fn(), hasLiveAssessJobForVehicle: jest.fn().mockResolvedValue(false), hasAssessDispatchConflict: jest.fn().mockResolvedValue(false) } as never,
      { isDeadLetter: jest.fn().mockResolvedValue(false) } as never,
    );

    await service.acknowledgeExecuted({
      organizationId: ORG,
      vehicleId: VEH,
      measurementId: MEAS,
      outcome: LV_REST_ASSESSMENT_HANDOFF_OUTCOME.POLICY_SKIPPED,
    });

    expect(store.getMetadata().unrelatedNote).toBe('keep-me');
    expect(
      readAssessmentHandoffFromTargetMetadata(
        store.getMetadata(),
        LV_REST_TARGET_TYPES.REST_60M,
      )?.status,
    ).toBe(LV_REST_ASSESSMENT_HANDOFF_STATUS.EXECUTED);
  });
});
