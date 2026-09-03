import {
  BatteryMeasurementSessionStatus,
  BatteryMeasurementSessionType,
  BatteryMeasurementType,
} from '@prisma/client';
import { BatteryV2JobDeadLetterService } from './battery-v2-job-dead-letter.service';
import { LvRestAssessmentHandoffService } from '../lv-rest-window/lv-rest-assessment-handoff.service';
import {
  LV_REST_ASSESSMENT_HANDOFF_OUTCOME,
  LV_REST_ASSESSMENT_HANDOFF_REARM_REASON,
  LV_REST_ASSESSMENT_HANDOFF_STATUS,
  mergeAssessmentHandoffState,
  readAssessmentHandoffFromTargetMetadata,
} from '../lv-rest-window/lv-rest-assessment-handoff.metadata';
import { LV_REST_TARGET_TYPES } from '../lv-rest-window/lv-rest-window-target.metadata';
import { isLegacyAssessPersistence54000DeadLetter } from './battery-v2-job-dead-letter.policy';

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';
const SESSION = 'clsess123456789012345678901';
const MEAS = 'clmeas123456789012345678901';
const IDEM = `assess:${VEH}:LV_HEALTH:${MEAS}`;

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

describe('M3.0D.2 closure — legacy 54000 recovery + FAILED rearm', () => {
  describe('BatteryV2JobDeadLetterService legacy 54000 authority', () => {
    const prisma = {
      batteryV2JobDeadLetter: {
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };
    let service: BatteryV2JobDeadLetterService;

    beforeEach(() => {
      jest.clearAllMocks();
      service = new BatteryV2JobDeadLetterService(prisma as never);
    });

    it('clears only legacy assess persistence 54000 DLQ rows', async () => {
      prisma.batteryV2JobDeadLetter.findUnique.mockResolvedValue({
        jobType: 'BATTERY_ASSESSMENT_RECOMPUTE',
        errorCode: 'HANDLER_FAILED',
        errorMessage: 'PostgresError { code: "54000", message: "index row size" }',
      });
      prisma.batteryV2JobDeadLetter.delete.mockResolvedValue({});

      const cleared = await service.clearLegacyAssessPersistence54000DeadLetterIfPresent(
        'BATTERY_ASSESSMENT_RECOMPUTE',
        IDEM,
      );

      expect(cleared).toBe(true);
      expect(prisma.batteryV2JobDeadLetter.delete).toHaveBeenCalled();
    });

    it('does not clear unrelated HANDLER_FAILED DLQ rows', async () => {
      prisma.batteryV2JobDeadLetter.findUnique.mockResolvedValue({
        jobType: 'BATTERY_ASSESSMENT_RECOMPUTE',
        errorCode: 'HANDLER_FAILED',
        errorMessage: 'null value in column organization_id',
      });

      const cleared = await service.clearLegacyAssessPersistence54000DeadLetterIfPresent(
        'BATTERY_ASSESSMENT_RECOMPUTE',
        IDEM,
      );

      expect(cleared).toBe(false);
      expect(prisma.batteryV2JobDeadLetter.delete).not.toHaveBeenCalled();
    });
  });

  describe('LvRestAssessmentHandoffService lifecycle', () => {
    let sessionMetadata: Record<string, unknown> = {};
    let updatedAt = new Date('2026-09-02T10:00:00.000Z');
    const prisma = {
      batteryMeasurement: { findFirst: jest.fn() },
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
      hasAssessDispatchConflict: jest.fn(),
    };
    const deadLetters = {
      isDeadLetter: jest.fn(),
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
      prisma.batteryMeasurement.findFirst.mockResolvedValue(eligibleMeasurement());
      prisma.batteryMeasurementSession.findFirst.mockImplementation(async () => ({
        id: SESSION,
        organizationId: ORG,
        metadata: sessionMetadata,
        updatedAt,
        status: BatteryMeasurementSessionStatus.ACTIVE,
        type: BatteryMeasurementSessionType.LV_REST_WINDOW,
      }));
      jobProducer.enqueue.mockResolvedValue('bull-job-replay');
      jobProducer.hasLiveJob.mockResolvedValue(false);
      jobProducer.hasAssessDispatchConflict.mockResolvedValue(false);
      deadLetters.isDeadLetter.mockResolvedValue(false);
    });

    const baseInput = () => ({
      organizationId: ORG,
      vehicleId: VEH,
      sessionId: SESSION,
      restTargetType: LV_REST_TARGET_TYPES.REST_60M,
      measurementId: MEAS,
    });

    it('replays ENQUEUED + legacy 54000 DLQ carrier after DLQ clearance', async () => {
      sessionMetadata = {
        scheduledTargets: {
          REST_60M: {
            assessmentHandoff: {
              measurementId: MEAS,
              idempotencyKey: IDEM,
              status: LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED,
              enqueuedAt: '2026-09-02T09:00:00.000Z',
              lastAttemptAt: '2026-09-02T09:00:00.000Z',
            },
          },
        },
      };
      deadLetters.isDeadLetter.mockResolvedValueOnce(true).mockResolvedValue(false);

      const blocked = await service.ensureAssessmentHandoff(baseInput());
      expect(blocked.reason).toBe('dead_letter');

      const replayed = await service.reconcileAssessmentHandoff(baseInput());
      expect(replayed.enqueued).toBe(true);
      expect(jobProducer.enqueue).toHaveBeenCalled();
    });

    it('rearms FAILED handoff to ENQUEUED when DLQ is cleared (explicit recovery)', async () => {
      sessionMetadata = {
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
                errorMessage: '54000 index row size',
              },
            },
          },
        },
      };

      const terminal = await service.ensureAssessmentHandoff(baseInput());
      expect(terminal.reason).toBe('terminal_failed');

      const recovered = await service.reconcileAssessmentHandoff(baseInput());
      expect(recovered.enqueued).toBe(true);

      const handoff = readAssessmentHandoffFromTargetMetadata(
        sessionMetadata,
        LV_REST_TARGET_TYPES.REST_60M,
      );
      expect(handoff?.status).toBe(LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED);
      expect(handoff?.rearmReason).toBe(
        LV_REST_ASSESSMENT_HANDOFF_REARM_REASON.LEGACY_PERSISTENCE_54000,
      );
    });
  });

  it('allows explicit FAILED → ENQUEUED rearm in metadata merge', () => {
    const merged = mergeAssessmentHandoffState(
      {
        measurementId: MEAS,
        idempotencyKey: IDEM,
        status: LV_REST_ASSESSMENT_HANDOFF_STATUS.FAILED,
        outcome: LV_REST_ASSESSMENT_HANDOFF_OUTCOME.PERSISTENCE_FAILED,
      },
      {
        measurementId: MEAS,
        idempotencyKey: IDEM,
        status: LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED,
        rearmReason: LV_REST_ASSESSMENT_HANDOFF_REARM_REASON.LEGACY_PERSISTENCE_54000,
        rearmedAt: '2026-09-03T08:00:00.000Z',
      },
    );
    expect(merged.status).toBe(LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED);
    expect(merged.rearmReason).toBe(
      LV_REST_ASSESSMENT_HANDOFF_REARM_REASON.LEGACY_PERSISTENCE_54000,
    );
  });

  it('identifies legacy 54000 DLQ rows used by production carriers', () => {
    expect(
      isLegacyAssessPersistence54000DeadLetter({
        jobType: 'BATTERY_ASSESSMENT_RECOMPUTE',
        errorCode: 'HANDLER_FAILED',
        errorMessage:
          'Invalid `prisma.batteryAssessment.create()` invocation: PostgresError { code: "54000"',
      }),
    ).toBe(true);
  });
});
