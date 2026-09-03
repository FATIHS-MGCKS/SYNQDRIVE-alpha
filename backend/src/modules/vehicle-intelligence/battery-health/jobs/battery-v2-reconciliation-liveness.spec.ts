import { UnrecoverableError } from 'bullmq';
import { BatteryV2Processor } from '@workers/processors/battery-v2.processor';
import { BatteryV2VehicleLockContendedError } from './battery-v2-vehicle-lock.service';
import {
  BATTERY_V2_JOB_ERROR_CODES,
  BatteryV2JobProcessingError,
} from './battery-v2-job.errors';
import { classifyBatteryV2JobError } from './battery-v2-job-error.util';
import { buildBatteryV2AttemptContext } from './battery-v2-job.validation';
import { LV_REST_ASSESSMENT_HANDOFF_OUTCOME } from '../lv-rest-window/lv-rest-assessment-handoff.metadata';

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';
const MEAS = 'clmeas123456789012345678901';

function assessPayload() {
  return {
    organizationId: ORG,
    vehicleId: VEH,
    idempotencyKey: `assess:${VEH}:LV_HEALTH:${MEAS}`,
    assessmentType: 'LV_HEALTH' as const,
    inputVersion: MEAS,
    sourceEntityId: MEAS,
    requestedAt: '2026-09-03T06:00:00.000Z',
    modelVersion: '1.0.0' as const,
    correlationId: `lv-rest-reconcile:${VEH}:${MEAS}`,
    attemptContext: buildBatteryV2AttemptContext({ maxAttempts: 5 }),
  };
}

function buildAssessJob(attemptsMade: number, attempts = 5) {
  return {
    name: 'BATTERY_ASSESSMENT_RECOMPUTE',
    data: assessPayload(),
    attemptsMade,
    opts: { attempts },
    timestamp: Date.now(),
  } as any;
}

describe('PKG-01 reconciliation liveness — processor error propagation', () => {
  const handlerRegistry = { dispatch: jest.fn() };
  const idempotentExecution = { execute: jest.fn() };
  const deadLetters = { recordDeadLetter: jest.fn().mockResolvedValue(undefined) };
  const observability = {
    recordCompleted: jest.fn(),
    recordRetry: jest.fn(),
    recordFailed: jest.fn(),
    recordDeadLetter: jest.fn(),
    observeProcessingDuration: jest.fn(),
    logWarn: jest.fn(),
  };
  const assessmentHandoff = {
    acknowledgeExecuted: jest.fn().mockResolvedValue(undefined),
  };

  let processor: BatteryV2Processor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new BatteryV2Processor(
      handlerRegistry as any,
      idempotentExecution as any,
      deadLetters as any,
      observability as any,
      assessmentHandoff as any,
      undefined,
    );
  });

  it('preserves LOCK_CONTENTION diagnostic message on retry throw', async () => {
    const contention = new BatteryV2VehicleLockContendedError(VEH, 'assess');
    idempotentExecution.execute.mockRejectedValue(contention);

    await expect(processor.process(buildAssessJob(0))).rejects.toBeInstanceOf(
      BatteryV2JobProcessingError,
    );
    await expect(processor.process(buildAssessJob(0))).rejects.toThrow(
      'Battery V2 vehicle lock contended',
    );
    expect(observability.recordRetry).toHaveBeenCalledWith(
      'BATTERY_ASSESSMENT_RECOMPUTE',
      BATTERY_V2_JOB_ERROR_CODES.LOCK_CONTENTION,
    );
  });

  it('acknowledges handoff when idempotent skip finds existing assessment', async () => {
    idempotentExecution.execute.mockResolvedValue({
      skipped: true,
      skipReason: 'already_completed',
    });

    await processor.process(buildAssessJob(1));

    expect(assessmentHandoff.acknowledgeExecuted).toHaveBeenCalledWith({
      organizationId: ORG,
      vehicleId: VEH,
      measurementId: MEAS,
      outcome: LV_REST_ASSESSMENT_HANDOFF_OUTCOME.ASSESSMENT_PERSISTED,
    });
  });

  it('classifies Prisma persistence 54000 as non-retryable HANDLER_FAILED with message', () => {
    const result = classifyBatteryV2JobError(
      new Error(
        'Invalid `prisma.batteryAssessment.create()` invocation: PostgresError { code: "54000"',
      ),
    );
    expect(result.code).toBe(BATTERY_V2_JOB_ERROR_CODES.HANDLER_FAILED);
    expect(result.retryable).toBe(false);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('uses UnrecoverableError with message for non-retryable persistence failures', async () => {
    idempotentExecution.execute.mockRejectedValue(
      new Error('PostgresError { code: "54000", message: "index row size exceeds maximum" }'),
    );

    await expect(processor.process(buildAssessJob(0))).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(processor.process(buildAssessJob(0))).rejects.toThrow('54000');
  });
});
