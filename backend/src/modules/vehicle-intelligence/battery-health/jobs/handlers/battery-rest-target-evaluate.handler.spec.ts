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

  let handler: BatteryRestTargetEvaluateHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new BatteryRestTargetEvaluateHandler(prisma as any);
  });

  it('cancels cleanly for invalidated rest window without measurement', async () => {
    prisma.batteryMeasurementSession.findFirst.mockResolvedValue({
      id: SESSION,
      organizationId: ORG,
      status: BatteryMeasurementSessionStatus.INVALID,
      metadata: {
        lvRestWindowState: LvRestWindowState.INVALIDATED,
        invalidatedReason: 'wake_detected',
        scheduledTargets: {
          REST_60M: {
            idempotencyKey: `battery-rest:${VEH}:${WINDOW_ID}:60m`,
            scheduledFor: '2026-07-16T11:00:00.000Z',
            status: LV_REST_TARGET_JOB_STATUS.ENQUEUED,
          },
        },
      },
    });

    await handler.handle({
      organizationId: ORG,
      vehicleId: VEH,
      idempotencyKey: `battery-rest:${VEH}:${WINDOW_ID}:60m`,
      restWindowId: WINDOW_ID,
      restTargetType: 'REST_60M',
      sourceEntityId: SESSION,
      requestedAt: new Date().toISOString(),
      modelVersion: '1.0.0',
      correlationId: 'corr-1',
      attemptContext: {
        attemptNumber: 1,
        maxAttempts: 3,
        enqueuedAt: new Date().toISOString(),
      },
    });

    expect(prisma.batteryMeasurementSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SESSION, organizationId: ORG },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            scheduledTargets: expect.objectContaining({
              REST_60M: expect.objectContaining({
                status: LV_REST_TARGET_JOB_STATUS.CANCELLED,
                cancelReason: 'wake_detected',
              }),
            }),
          }),
        }),
      }),
    );
  });

  it('marks valid session as pending evaluation without requiring live latest state', async () => {
    prisma.batteryMeasurementSession.findFirst.mockResolvedValue({
      id: SESSION,
      organizationId: ORG,
      status: BatteryMeasurementSessionStatus.ACTIVE,
      metadata: {
        lvRestWindowState: LvRestWindowState.RESTING,
        scheduledTargets: {
          REST_60M: {
            idempotencyKey: `battery-rest:${VEH}:${WINDOW_ID}:60m`,
            scheduledFor: '2026-07-16T11:00:00.000Z',
            status: LV_REST_TARGET_JOB_STATUS.ENQUEUED,
          },
        },
      },
    });

    await handler.handle({
      organizationId: ORG,
      vehicleId: VEH,
      idempotencyKey: `battery-rest:${VEH}:${WINDOW_ID}:60m`,
      restWindowId: WINDOW_ID,
      restTargetType: 'REST_60M',
      sourceEntityId: SESSION,
      requestedAt: new Date().toISOString(),
      modelVersion: '1.0.0',
      correlationId: 'corr-2',
      attemptContext: {
        attemptNumber: 1,
        maxAttempts: 3,
        enqueuedAt: new Date().toISOString(),
      },
    });

    expect(prisma.batteryMeasurementSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            scheduledTargets: expect.objectContaining({
              REST_60M: expect.objectContaining({
                status: LV_REST_TARGET_JOB_STATUS.PENDING_EVALUATION,
              }),
            }),
          }),
        }),
      }),
    );
  });

  it('retries when session lookup fails transiently', async () => {
    prisma.batteryMeasurementSession.findFirst.mockResolvedValue(null);

    await expect(
      handler.handle({
        organizationId: ORG,
        vehicleId: VEH,
        idempotencyKey: `battery-rest:${VEH}:${WINDOW_ID}:60m`,
        restWindowId: WINDOW_ID,
        restTargetType: 'REST_60M',
        sourceEntityId: SESSION,
        requestedAt: new Date().toISOString(),
        modelVersion: '1.0.0',
        correlationId: 'corr-3',
        attemptContext: {
          attemptNumber: 1,
          maxAttempts: 3,
          enqueuedAt: new Date().toISOString(),
        },
      }),
    ).rejects.toMatchObject({ retryable: true });
  });
});
