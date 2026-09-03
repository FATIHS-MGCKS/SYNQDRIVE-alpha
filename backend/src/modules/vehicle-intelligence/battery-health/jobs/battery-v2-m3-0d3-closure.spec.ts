import {
  BatteryMeasurementSessionStatus,
  BatteryMeasurementSessionType,
  BatteryMeasurementType,
} from '@prisma/client';
import { BatteryV2ReconciliationService } from './battery-v2-reconciliation.service';
import { fetchRestAssessmentHandoffReconcileCandidates } from '../lv-rest-window/lv-rest-assessment-handoff-reconciliation.query';
import { LvRestAssessmentHandoffService } from '../lv-rest-window/lv-rest-assessment-handoff.service';
import {
  LV_REST_ASSESSMENT_HANDOFF_OUTCOME,
  LV_REST_ASSESSMENT_HANDOFF_REARM_REASON,
  LV_REST_ASSESSMENT_HANDOFF_STATUS,
  readAssessmentHandoffFromTargetMetadata,
} from '../lv-rest-window/lv-rest-assessment-handoff.metadata';
import { LV_REST_TARGET_TYPES } from '../lv-rest-window/lv-rest-window-target.metadata';

jest.mock('@config/battery-health-v2.config', () => {
  const actual = jest.requireActual('@config/battery-health-v2.config');
  return {
    ...actual,
    isBatteryV2RestShadowEnabled: jest.fn().mockReturnValue(true),
  };
});

jest.mock('../lv-rest-window/lv-rest-assessment-handoff-reconciliation.query', () => ({
  fetchRestAssessmentHandoffReconcileCandidates: jest.fn(),
}));

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';
const SESSION = 'clsess123456789012345678901';
const MEAS = 'clmeas123456789012345678901';
const IDEM = `assess:${VEH}:LV_HEALTH:${MEAS}`;

function buildReconciliationHarness(sessionMetadata: Record<string, unknown>) {
  let updatedAt = new Date('2026-09-02T10:00:00.000Z');
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    batteryMeasurement: {
      findFirst: jest.fn(async () => ({
        id: MEAS,
        organizationId: ORG,
        vehicleId: VEH,
        sessionId: SESSION,
        type: BatteryMeasurementType.REST_60M,
        provenance: { sourceObservationId: 'obs-1' },
      })),
    },
    batteryMeasurementSession: {
      findFirst: jest.fn(async () => ({
        id: SESSION,
        organizationId: ORG,
        metadata: sessionMetadata,
        updatedAt,
        status: BatteryMeasurementSessionStatus.ACTIVE,
        type: BatteryMeasurementSessionType.LV_REST_WINDOW,
      })),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(async ({ data, where }: { data: { metadata: unknown }; where: { updatedAt?: Date } }) => {
        if (where.updatedAt?.getTime() !== updatedAt.getTime()) {
          return { count: 0 };
        }
        Object.assign(sessionMetadata, data.metadata as Record<string, unknown>);
        updatedAt = new Date(updatedAt.getTime() + 1);
        return { count: 1 };
      }),
    },
    batteryFeatures: { findMany: jest.fn().mockResolvedValue([]) },
    vehicleLatestState: { findMany: jest.fn().mockResolvedValue([]) },
    vehicleTrip: { findMany: jest.fn().mockResolvedValue([]) },
    vehicleEnergyEvent: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const jobProducer = {
    enqueue: jest.fn().mockResolvedValue('bull-job-reconcile'),
    hasLiveJob: jest.fn().mockResolvedValue(false),
    hasLiveAssessJobForVehicle: jest.fn().mockResolvedValue(false),
    hasAssessDispatchConflict: jest.fn().mockResolvedValue(false),
  };
  const deadLetters = {
    isDeadLetter: jest.fn().mockResolvedValue(false),
    clearReplayableDeadLetterIfPresent: jest.fn().mockResolvedValue(false),
    clearLegacyAssessPersistence54000DeadLetterIfPresent: jest.fn().mockResolvedValue(false),
  };
  const assessmentHandoff = new LvRestAssessmentHandoffService(
    prisma as never,
    jobProducer as never,
    deadLetters as never,
  );
  const reconciliation = new BatteryV2ReconciliationService(
    prisma as never,
    jobProducer as never,
    { classifyAndEnqueue: jest.fn().mockResolvedValue(0) } as never,
    deadLetters as never,
    {
      reconcilePeriodicRefresh: jest.fn().mockResolvedValue(0),
      reconcileSignalLossRefresh: jest.fn().mockResolvedValue(0),
    } as never,
    { enqueueSessionOpenForFinalizedTrip: jest.fn() } as never,
    { ensureLvRestWindowForFinalizedTrip: jest.fn() } as never,
    {
      scheduleRest60m: jest.fn(),
      scheduleRest6h: jest.fn(),
      buildScheduledTargetMetadata: jest.fn(),
      getRest60mDelayMs: jest.fn().mockReturnValue(3600000),
      getRest6hDelayMs: jest.fn().mockReturnValue(21600000),
    } as never,
    { enqueueStartProxy: jest.fn() } as never,
    { reconcilePeriodic: jest.fn().mockResolvedValue(0) } as never,
    assessmentHandoff,
    { reconcilePublicationHandoff: jest.fn().mockResolvedValue(0) } as never,
  );

  return { reconciliation, jobProducer, sessionMetadata, deadLetters };
}

describe('M3.0D.3 reservation + FAILED rearm runtime closure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchRestAssessmentHandoffReconcileCandidates as jest.Mock).mockResolvedValue([
      {
        id: MEAS,
        organizationId: ORG,
        vehicleId: VEH,
        sessionId: SESSION,
        type: BatteryMeasurementType.REST_60M,
        provenance: { sourceObservationId: 'obs-1' },
      },
    ]);
  });

  it('scheduler reconciliation reaches FAILED legacy 54000 and re-enqueues', async () => {
    const sessionMetadata: Record<string, unknown> = {
      scheduledTargets: {
        REST_60M: {
          assessmentHandoff: {
            measurementId: MEAS,
            idempotencyKey: IDEM,
            status: LV_REST_ASSESSMENT_HANDOFF_STATUS.FAILED,
            outcome: LV_REST_ASSESSMENT_HANDOFF_OUTCOME.PERSISTENCE_FAILED,
            failureHistory: {
              outcome: LV_REST_ASSESSMENT_HANDOFF_OUTCOME.PERSISTENCE_FAILED,
              failedAt: '2026-09-02T09:00:00.000Z',
              errorCode: 'HANDLER_FAILED',
              errorMessage: '54000 index row size exceeds maximum',
            },
          },
        },
      },
    };
    const { reconciliation, jobProducer } = buildReconciliationHarness(sessionMetadata);

    const result = await reconciliation.reconcileAll();

    expect(result.assessments).toBeGreaterThanOrEqual(1);
    expect(jobProducer.enqueue).toHaveBeenCalled();
    const handoff = readAssessmentHandoffFromTargetMetadata(
      sessionMetadata,
      LV_REST_TARGET_TYPES.REST_60M,
    );
    expect(handoff?.status).toBe(LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED);
    expect(handoff?.rearmReason).toBe(
      LV_REST_ASSESSMENT_HANDOFF_REARM_REASON.LEGACY_PERSISTENCE_54000,
    );
    expect(handoff?.failureHistory?.errorMessage).toContain('54000');
  });

  it('does not rearm unrelated FAILED persistence failures via scheduler path', async () => {
    const sessionMetadata: Record<string, unknown> = {
      scheduledTargets: {
        REST_60M: {
          assessmentHandoff: {
            measurementId: MEAS,
            idempotencyKey: IDEM,
            status: LV_REST_ASSESSMENT_HANDOFF_STATUS.FAILED,
            outcome: LV_REST_ASSESSMENT_HANDOFF_OUTCOME.PERSISTENCE_FAILED,
            failureHistory: {
              outcome: LV_REST_ASSESSMENT_HANDOFF_OUTCOME.PERSISTENCE_FAILED,
              failedAt: '2026-09-02T09:00:00.000Z',
              errorCode: 'HANDLER_FAILED',
              errorMessage: 'foreign key violation',
            },
          },
        },
      },
    };
    const { reconciliation, jobProducer } = buildReconciliationHarness(sessionMetadata);

    await reconciliation.reconcileAll();

    expect(jobProducer.enqueue).not.toHaveBeenCalled();
    const handoff = readAssessmentHandoffFromTargetMetadata(
      sessionMetadata,
      LV_REST_TARGET_TYPES.REST_60M,
    );
    expect(handoff?.status).toBe(LV_REST_ASSESSMENT_HANDOFF_STATUS.FAILED);
    expect(handoff?.rearmReason).toBeFalsy();
  });
});
