import {
  BatteryMeasurementQuality,
  BatteryMeasurementSessionStatus,
  BatteryMeasurementType,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { BatteryRestTargetEvaluateHandler } from '../jobs/handlers/battery-rest-target-evaluate.handler';
import { buildRestMissedMeasurementIdempotencyKey } from './battery-rest-target-evaluation';
import { LvRestAssessmentHandoffService } from './lv-rest-assessment-handoff.service';
import {
  LV_REST_ASSESSMENT_HANDOFF_STATUS,
  readAssessmentHandoffFromTargetMetadata,
} from './lv-rest-assessment-handoff.metadata';
import { LV_REST_TARGET_JOB_STATUS } from './lv-rest-window-target.metadata';
import { LvRestWindowState } from '../battery-v2-domain';

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';
const SESSION = 'clsess123456789012345678901';
const WINDOW_ID = `lv-rest:${VEH}:1721124000000`;
const MEAS = 'clmeas123456789012345678901';

function buildIntegratedPrisma() {
  let metadata: Record<string, unknown> = {
    lvRestWindowState: LvRestWindowState.RESTING,
    scheduledTargets: {
      REST_60M: {
        idempotencyKey: `battery-rest:${VEH}:${WINDOW_ID}:60m`,
        scheduledFor: '2026-09-02T09:00:00.000Z',
        status: LV_REST_TARGET_JOB_STATUS.ENQUEUED,
      },
    },
  };
  let updatedAt = new Date('2026-09-02T10:00:00.000Z');

  return {
    batteryMeasurementSession: {
      findFirst: jest.fn(async () => ({
        id: SESSION,
        organizationId: ORG,
        vehicleId: VEH,
        status: BatteryMeasurementSessionStatus.ACTIVE,
        startedAt: new Date('2026-09-02T08:00:00.000Z'),
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
    batteryMeasurement: {
      findFirst: jest.fn(),
    },
    getMetadata: () => metadata,
  };
}

describe('BatteryRestTargetEvaluateHandler handoff metadata integration', () => {
  const originalEnv = process.env.BATTERY_V2_REST_SHADOW_ENABLED;

  beforeEach(() => {
    process.env.BATTERY_V2_REST_SHADOW_ENABLED = 'true';
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.BATTERY_V2_REST_SHADOW_ENABLED;
    } else {
      process.env.BATTERY_V2_REST_SHADOW_ENABLED = originalEnv;
    }
  });

  const basePayload = () => ({
    organizationId: ORG,
    vehicleId: VEH,
    idempotencyKey: `battery-rest:${VEH}:${WINDOW_ID}:60m`,
    restWindowId: WINDOW_ID,
    restTargetType: 'REST_60M' as const,
    sourceEntityId: SESSION,
    requestedAt: new Date().toISOString(),
    modelVersion: '1.0.0' as const,
    correlationId: 'corr-integration',
    attemptContext: {
      attemptNumber: 1,
      maxAttempts: 3,
      enqueuedAt: new Date().toISOString(),
    },
  });

  it('final metadata contains COMPLETED target and ENQUEUED assessmentHandoff after direct success', async () => {
    const NEW_MEAS = 'clmeasnew123456789012345678';
    const prisma = buildIntegratedPrisma();
    const measurementStore = new Map<string, Record<string, unknown>>();

    prisma.batteryMeasurement.findFirst.mockImplementation(
      async (args: {
        where?: {
          sessionId?: string;
          id?: string;
          organizationId?: string;
          vehicleId?: string;
        };
      }) => {
        if (args.where?.id) {
          return measurementStore.get(args.where.id) ?? null;
        }
        if (args.where?.sessionId) {
          return null;
        }
        return null;
      },
    );

    const evaluateAndPersist = jest.fn().mockImplementation(async () => {
      const persisted = {
        id: NEW_MEAS,
        organizationId: ORG,
        vehicleId: VEH,
        sessionId: SESSION,
        type: BatteryMeasurementType.REST_60M,
        provenance: { sourceObservationId: 'obs-direct-1' },
      };
      measurementStore.set(NEW_MEAS, persisted);
      return {
        ok: true,
        measurementId: NEW_MEAS,
        sourceObservationId: 'obs-direct-1',
        quality: 'VALID',
      };
    });

    const jobProducer = {
      enqueue: jest.fn().mockResolvedValue('bull-job-1'),
      hasLiveJob: jest.fn().mockResolvedValue(false),
    };
    const deadLetters = { isDeadLetter: jest.fn().mockResolvedValue(false) };
    const assessmentHandoff = new LvRestAssessmentHandoffService(
      prisma as never,
      jobProducer as never,
      deadLetters as never,
    );
    const handler = new BatteryRestTargetEvaluateHandler(
      prisma as never,
      { evaluateAndPersist } as never,
      { recordLvRestShadowMeasurement: jest.fn() } as never,
      assessmentHandoff,
    );

    await handler.handle(basePayload());

    expect(evaluateAndPersist).toHaveBeenCalledTimes(1);
    const metadata = prisma.getMetadata();
    const target = (metadata.scheduledTargets as any).REST_60M;
    expect(target.status).toBe(LV_REST_TARGET_JOB_STATUS.COMPLETED);
    const handoff = readAssessmentHandoffFromTargetMetadata(metadata, 'REST_60M');
    expect(handoff?.status).toBe(LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED);
    expect(handoff?.measurementId).toBe(NEW_MEAS);
    expect(jobProducer.enqueue).toHaveBeenCalledWith(
      'BATTERY_ASSESSMENT_RECOMPUTE',
      expect.objectContaining({
        inputVersion: NEW_MEAS,
        sourceEntityId: NEW_MEAS,
        idempotencyKey: `assess:${VEH}:LV_HEALTH:${NEW_MEAS}`,
      }),
    );
  });

  it('replay eligible measurement preserves handoff after COMPLETED write', async () => {
    const prisma = buildIntegratedPrisma();
    prisma.batteryMeasurement.findFirst.mockResolvedValue({
      id: MEAS,
      type: BatteryMeasurementType.REST_60M,
      provenance: { sourceObservationId: 'obs-replay' },
    });
    const jobProducer = {
      enqueue: jest.fn().mockResolvedValue('bull-job-replay'),
      hasLiveJob: jest.fn().mockResolvedValue(false),
    };
    const assessmentHandoff = new LvRestAssessmentHandoffService(
      prisma as never,
      jobProducer as never,
      { isDeadLetter: jest.fn().mockResolvedValue(false) } as never,
    );
    const handler = new BatteryRestTargetEvaluateHandler(
      prisma as never,
      { evaluateAndPersist: jest.fn() } as never,
      { recordLvRestShadowMeasurement: jest.fn() } as never,
      assessmentHandoff,
    );

    await handler.handle(basePayload());

    const metadata = prisma.getMetadata();
    expect((metadata.scheduledTargets as any).REST_60M.status).toBe(
      LV_REST_TARGET_JOB_STATUS.COMPLETED,
    );
    expect(
      readAssessmentHandoffFromTargetMetadata(metadata, 'REST_60M')?.status,
    ).toBe(LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED);
  });

  it('replay synthetic missed measurement restores MISSED without handoff', async () => {
    const prisma = buildIntegratedPrisma();
    prisma.batteryMeasurement.findFirst.mockResolvedValue({
      id: 'meas-missed',
      type: BatteryMeasurementType.REST_60M,
      quality: BatteryMeasurementQuality.MISSED,
      sessionId: SESSION,
      idempotencyKey: buildRestMissedMeasurementIdempotencyKey({
        sessionId: SESSION,
        restTargetType: 'REST_60M',
      }),
      provenance: { qualityReasonCode: 'missed_no_valid_observation' },
    });
    const assessmentHandoff = {
      ensureAssessmentHandoff: jest.fn(),
    };
    const handler = new BatteryRestTargetEvaluateHandler(
      prisma as never,
      { evaluateAndPersist: jest.fn() } as never,
      { recordLvRestShadowMeasurement: jest.fn() } as never,
      assessmentHandoff as never,
    );

    await handler.handle(basePayload());

    const target = (prisma.getMetadata().scheduledTargets as any).REST_60M;
    expect(target.status).toBe(LV_REST_TARGET_JOB_STATUS.MISSED);
    expect(target.cancelReason).toBe('missed_no_valid_observation');
    expect(assessmentHandoff.ensureAssessmentHandoff).not.toHaveBeenCalled();
    expect(readAssessmentHandoffFromTargetMetadata(prisma.getMetadata(), 'REST_60M')).toBeNull();
  });

  it('replay synthetic unsupported measurement restores FAILED without handoff', async () => {
    const prisma = buildIntegratedPrisma();
    prisma.batteryMeasurement.findFirst.mockResolvedValue({
      id: 'meas-unsupported',
      type: BatteryMeasurementType.REST_60M,
      quality: BatteryMeasurementQuality.UNSUPPORTED_PROFILE,
      sessionId: SESSION,
      idempotencyKey: buildRestMissedMeasurementIdempotencyKey({
        sessionId: SESSION,
        restTargetType: 'REST_60M',
      }),
      provenance: { qualityReasonCode: 'unsupported_profile' },
    });
    const assessmentHandoff = {
      ensureAssessmentHandoff: jest.fn(),
    };
    const handler = new BatteryRestTargetEvaluateHandler(
      prisma as never,
      { evaluateAndPersist: jest.fn() } as never,
      { recordLvRestShadowMeasurement: jest.fn() } as never,
      assessmentHandoff as never,
    );

    await handler.handle(basePayload());

    const target = (prisma.getMetadata().scheduledTargets as any).REST_60M;
    expect(target.status).toBe(LV_REST_TARGET_JOB_STATUS.FAILED);
    expect(target.cancelReason).toBe('unsupported_profile');
    expect(assessmentHandoff.ensureAssessmentHandoff).not.toHaveBeenCalled();
  });
});
