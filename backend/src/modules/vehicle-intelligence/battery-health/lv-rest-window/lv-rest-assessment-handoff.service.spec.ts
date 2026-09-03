import {
  BatteryMeasurementSessionStatus,
  BatteryMeasurementSessionType,
  BatteryMeasurementType,
} from '@prisma/client';
import { LvRestAssessmentHandoffService } from './lv-rest-assessment-handoff.service';
import {
  LV_REST_ASSESSMENT_HANDOFF_OUTCOME,
  LV_REST_ASSESSMENT_HANDOFF_STATUS,
  readAssessmentHandoffFromTargetMetadata,
} from './lv-rest-assessment-handoff.metadata';
import { LV_REST_TARGET_TYPES } from './lv-rest-window-target.metadata';

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';
const SESSION = 'clsess123456789012345678901';
const MEAS = 'clmeas123456789012345678901';

function eligibleMeasurement() {
  return {
    id: MEAS,
    organizationId: ORG,
    vehicleId: VEH,
    sessionId: SESSION,
    type: BatteryMeasurementType.REST_60M,
    provenance: { sourceObservationId: 'obs-1' },
  };
}

describe('LvRestAssessmentHandoffService', () => {
  let sessionMetadata: Record<string, unknown> = {};
  let updatedAt = new Date('2026-09-02T10:00:00.000Z');
  const prisma = {
    batteryMeasurement: {
      findFirst: jest.fn(),
    },
    batteryMeasurementSession: {
      findFirst: jest.fn(),
      updateMany: jest.fn(async ({ data, where }: { data: { metadata: unknown }; where: { updatedAt?: Date } }) => {
        if (where.updatedAt?.getTime() !== updatedAt.getTime()) {
          return { count: 0 };
        }
        sessionMetadata = data.metadata as Record<string, unknown>;
        updatedAt = new Date(updatedAt.getTime() + 1);
        return { count: 1 };
      }),
    },
  };
  const jobProducer = {
    enqueue: jest.fn(),
    hasLiveJob: jest.fn(),
    hasLiveAssessJobForVehicle: jest.fn(),
  };
  const deadLetters = {
    isDeadLetter: jest.fn().mockResolvedValue(false),
  };

  let service: LvRestAssessmentHandoffService;

  beforeEach(() => {
    jest.clearAllMocks();
    sessionMetadata = {};
    updatedAt = new Date('2026-09-02T10:00:00.000Z');
    service = new LvRestAssessmentHandoffService(
      prisma as never,
      jobProducer as never,
      deadLetters as never,
    );
    prisma.batteryMeasurement.findFirst.mockImplementation(async () => eligibleMeasurement());
    prisma.batteryMeasurementSession.findFirst.mockImplementation(async () => ({
      id: SESSION,
      organizationId: ORG,
      metadata: sessionMetadata,
      updatedAt,
      status: BatteryMeasurementSessionStatus.ACTIVE,
      type: BatteryMeasurementSessionType.LV_REST_WINDOW,
    }));
    jobProducer.enqueue.mockResolvedValue('bull-job-1');
    jobProducer.hasLiveJob.mockResolvedValue(false);
    jobProducer.hasLiveAssessJobForVehicle.mockResolvedValue(false);
    deadLetters.isDeadLetter.mockResolvedValue(false);
  });

  const baseInput = () => ({
    organizationId: ORG,
    vehicleId: VEH,
    sessionId: SESSION,
    restTargetType: LV_REST_TARGET_TYPES.REST_60M,
    measurementId: MEAS,
  });

  it('enqueues assessment with inputVersion and sourceEntityId = measurement.id (D1)', async () => {
    const result = await service.ensureAssessmentHandoff(baseInput());

    expect(result.enqueued).toBe(true);
    expect(jobProducer.enqueue).toHaveBeenCalledWith(
      'BATTERY_ASSESSMENT_RECOMPUTE',
      expect.objectContaining({
        inputVersion: MEAS,
        sourceEntityId: MEAS,
        idempotencyKey: `assess:${VEH}:LV_HEALTH:${MEAS}`,
        assessmentType: 'LV_HEALTH',
      }),
    );
  });

  it('persists ENQUEUED handoff state after successful enqueue', async () => {
    await service.ensureAssessmentHandoff(baseInput());

    const handoff = readAssessmentHandoffFromTargetMetadata(
      sessionMetadata,
      LV_REST_TARGET_TYPES.REST_60M,
    );
    expect(handoff?.status).toBe(LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED);
    expect(handoff?.measurementId).toBe(MEAS);
    expect(handoff?.bullJobId).toBe('bull-job-1');
  });

  it('records reconciliation fairness on stable already_enqueued_live skip', async () => {
    sessionMetadata = {
      scheduledTargets: {
        REST_60M: {
          idempotencyKey: 'rest-key',
          scheduledFor: new Date().toISOString(),
          status: 'COMPLETED',
          assessmentHandoff: {
            measurementId: MEAS,
            idempotencyKey: `assess:${VEH}:LV_HEALTH:${MEAS}`,
            status: LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED,
            lastAttemptAt: null,
          },
        },
      },
    };
    jobProducer.hasLiveJob.mockResolvedValue(true);

    const result = await service.reconcileAssessmentHandoff(baseInput());

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('already_enqueued_live');
    const handoff = readAssessmentHandoffFromTargetMetadata(
      sessionMetadata,
      LV_REST_TARGET_TYPES.REST_60M,
    );
    expect(handoff?.status).toBe(LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED);
    expect(handoff?.lastAttemptAt).toBeTruthy();
  });

  it('skips ineligible measurements without enqueue', async () => {
    prisma.batteryMeasurement.findFirst.mockResolvedValue({
      ...eligibleMeasurement(),
      provenance: { syntheticMissed: true },
    });

    const result = await service.ensureAssessmentHandoff(baseInput());

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('measurement_not_handoff_eligible');
    expect(jobProducer.enqueue).not.toHaveBeenCalled();
  });

  it('is idempotent when ENQUEUED and live job exists', async () => {
    sessionMetadata = {
      scheduledTargets: {
        REST_60M: {
          idempotencyKey: 'rest-key',
          scheduledFor: new Date().toISOString(),
          status: 'COMPLETED',
          assessmentHandoff: {
            measurementId: MEAS,
            idempotencyKey: `assess:${VEH}:LV_HEALTH:${MEAS}`,
            status: LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED,
            bullJobId: 'existing-job',
          },
        },
      },
    };
    jobProducer.hasLiveJob.mockResolvedValue(true);

    const result = await service.ensureAssessmentHandoff(baseInput());

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('already_enqueued_live');
    expect(jobProducer.enqueue).not.toHaveBeenCalled();
  });

  it('re-enqueues when ENQUEUED metadata exists but job is not live (crash boundary repair)', async () => {
    sessionMetadata = {
      scheduledTargets: {
        REST_60M: {
          idempotencyKey: 'rest-key',
          scheduledFor: new Date().toISOString(),
          status: 'COMPLETED',
          assessmentHandoff: {
            measurementId: MEAS,
            idempotencyKey: `assess:${VEH}:LV_HEALTH:${MEAS}`,
            status: LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED,
            bullJobId: 'orphaned-job',
          },
        },
      },
    };
    jobProducer.hasLiveJob.mockResolvedValue(false);

    const result = await service.ensureAssessmentHandoff(baseInput());

    expect(result.enqueued).toBe(true);
    expect(jobProducer.enqueue).toHaveBeenCalled();
  });

  it('skips when handoff already EXECUTED for same measurement', async () => {
    sessionMetadata = {
      scheduledTargets: {
        REST_60M: {
          idempotencyKey: 'rest-key',
          scheduledFor: new Date().toISOString(),
          status: 'COMPLETED',
          assessmentHandoff: {
            measurementId: MEAS,
            idempotencyKey: `assess:${VEH}:LV_HEALTH:${MEAS}`,
            status: LV_REST_ASSESSMENT_HANDOFF_STATUS.EXECUTED,
            outcome: LV_REST_ASSESSMENT_HANDOFF_OUTCOME.ASSESSMENT_PERSISTED,
          },
        },
      },
    };

    const result = await service.ensureAssessmentHandoff(baseInput());

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('already_executed');
    expect(jobProducer.enqueue).not.toHaveBeenCalled();
  });

  it('acknowledgeExecuted marks handoff EXECUTED without regressing', async () => {
    sessionMetadata = {
      scheduledTargets: {
        REST_60M: {
          idempotencyKey: 'rest-key',
          scheduledFor: new Date().toISOString(),
          status: 'COMPLETED',
          assessmentHandoff: {
            measurementId: MEAS,
            idempotencyKey: `assess:${VEH}:LV_HEALTH:${MEAS}`,
            status: LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED,
          },
        },
      },
    };

    await service.acknowledgeExecuted({
      organizationId: ORG,
      vehicleId: VEH,
      measurementId: MEAS,
      outcome: LV_REST_ASSESSMENT_HANDOFF_OUTCOME.POLICY_SKIPPED,
    });

    const handoff = readAssessmentHandoffFromTargetMetadata(
      sessionMetadata,
      LV_REST_TARGET_TYPES.REST_60M,
    );
    expect(handoff?.status).toBe(LV_REST_ASSESSMENT_HANDOFF_STATUS.EXECUTED);
    expect(handoff?.outcome).toBe(LV_REST_ASSESSMENT_HANDOFF_OUTCOME.POLICY_SKIPPED);
  });

  it('does not enqueue when dead-lettered', async () => {
    deadLetters.isDeadLetter.mockResolvedValue(true);

    const result = await service.ensureAssessmentHandoff(baseInput());

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('dead_letter');
    expect(jobProducer.enqueue).not.toHaveBeenCalled();
  });

  it('does not enqueue when another live assess job exists for the vehicle', async () => {
    deadLetters.isDeadLetter.mockResolvedValue(false);
    jobProducer.hasLiveAssessJobForVehicle.mockResolvedValue(true);

    const result = await service.ensureAssessmentHandoff(baseInput());

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('vehicle_assess_job_live');
    expect(jobProducer.enqueue).not.toHaveBeenCalled();
  });
});
