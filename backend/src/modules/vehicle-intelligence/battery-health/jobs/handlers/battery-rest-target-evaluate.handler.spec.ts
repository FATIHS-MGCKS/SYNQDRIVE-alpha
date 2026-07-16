import {
  BatteryMeasurementSessionStatus,
  BatteryMeasurementSessionType,
} from '@prisma/client';
import { BatteryRestTargetEvaluateHandler } from './battery-rest-target-evaluate.handler';
import { LV_REST_TARGET_JOB_STATUS } from '../../lv-rest-window/lv-rest-window-target.metadata';
import { LvRestWindowState } from '../../battery-v2-domain';

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';
const SESSION = 'clsess123456789012345678901';
const WINDOW_ID = `lv-rest:${VEH}:1721124000000`;

describe('BatteryRestTargetEvaluateHandler', () => {
  const prisma = {
    batteryMeasurementSession: {
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    batteryMeasurement: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };

  const evaluation = {
    evaluateAndPersist: jest.fn(),
  };

  let handler: BatteryRestTargetEvaluateHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new BatteryRestTargetEvaluateHandler(prisma as any, evaluation as any);
  });

  const basePayload = (restTargetType: 'REST_60M' | 'REST_6H') => ({
    organizationId: ORG,
    vehicleId: VEH,
    idempotencyKey: `battery-rest:${VEH}:${WINDOW_ID}:${restTargetType === 'REST_6H' ? '6h' : '60m'}`,
    restWindowId: WINDOW_ID,
    restTargetType,
    sourceEntityId: SESSION,
    requestedAt: new Date().toISOString(),
    modelVersion: '1.0.0' as const,
    correlationId: 'corr-1',
    attemptContext: {
      attemptNumber: 1,
      maxAttempts: 3,
      enqueuedAt: new Date().toISOString(),
    },
  });

  it('cancels cleanly for invalidated rest window without measurement', async () => {
    prisma.batteryMeasurementSession.findFirst.mockResolvedValue({
      id: SESSION,
      organizationId: ORG,
      status: BatteryMeasurementSessionStatus.INVALID,
      metadata: {
        lvRestWindowState: LvRestWindowState.INVALIDATED,
        invalidatedReason: 'wake_detected',
      },
    });

    await handler.handle(basePayload('REST_6H'));

    expect(evaluation.evaluateAndPersist).not.toHaveBeenCalled();
    expect(prisma.batteryMeasurementSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            scheduledTargets: expect.objectContaining({
              REST_6H: expect.objectContaining({
                status: LV_REST_TARGET_JOB_STATUS.CANCELLED,
              }),
            }),
          }),
        }),
      }),
    );
  });

  it('persists separate REST_6H measurement via evaluation service', async () => {
    prisma.batteryMeasurementSession.findFirst.mockResolvedValue({
      id: SESSION,
      organizationId: ORG,
      status: BatteryMeasurementSessionStatus.ACTIVE,
      startedAt: new Date('2026-07-16T10:00:00.000Z'),
      metadata: { lvRestWindowState: LvRestWindowState.RESTING },
    });
    evaluation.evaluateAndPersist.mockResolvedValue({
      ok: true,
      measurementId: 'meas-6h',
      sourceObservationId: 'obs-6h',
    });

    await handler.handle(basePayload('REST_6H'));

    expect(evaluation.evaluateAndPersist).toHaveBeenCalledWith(
      expect.objectContaining({
        restTargetType: 'REST_6H',
      }),
    );
    expect(prisma.batteryMeasurementSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            scheduledTargets: expect.objectContaining({
              REST_6H: expect.objectContaining({
                status: LV_REST_TARGET_JOB_STATUS.COMPLETED,
              }),
            }),
          }),
        }),
      }),
    );
  });

  it('retries when evaluation is not yet ready', async () => {
    prisma.batteryMeasurementSession.findFirst.mockResolvedValue({
      id: SESSION,
      organizationId: ORG,
      status: BatteryMeasurementSessionStatus.ACTIVE,
      startedAt: new Date('2026-07-16T10:00:00.000Z'),
      metadata: { lvRestWindowState: LvRestWindowState.RESTING },
    });
    evaluation.evaluateAndPersist.mockResolvedValue({
      ok: false,
      reason: 'no_eligible_observation_in_target_window',
      retryable: true,
    });

    await expect(handler.handle(basePayload('REST_60M'))).rejects.toMatchObject({
      retryable: true,
    });
  });
});
