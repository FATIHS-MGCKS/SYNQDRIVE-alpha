import { UnrecoverableError } from 'bullmq';
import { BatteryV2Processor } from '@workers/processors/battery-v2.processor';
import { BATTERY_V2_JOB_ERROR_CODES, BatteryV2JobProcessingError } from './battery-v2-job.errors';
import { buildBatteryV2AttemptContext } from './battery-v2-job.validation';

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';

function basePayload() {
  return {
    organizationId: ORG,
    vehicleId: VEH,
    idempotencyKey: 'hv-snap:test-key',
    sourceEntityId: null,
    requestedAt: '2026-07-16T12:00:00.000Z',
    modelVersion: '1.0.0' as const,
    correlationId: 'corr-1',
    attemptContext: buildBatteryV2AttemptContext({ maxAttempts: 3 }),
    snapshotContext: null,
  };
}

function buildJob(attemptsMade: number, attempts = 3) {
  return {
    name: 'BATTERY_OBSERVATION_CLASSIFY',
    data: basePayload(),
    attemptsMade,
    opts: { attempts },
    timestamp: Date.now(),
  } as any;
}

describe('BatteryV2Processor pipeline hardening', () => {
  const handlerRegistry = {
    dispatch: jest.fn(),
  };
  const idempotentExecution = {
    execute: jest.fn(),
  };
  const deadLetters = {
    recordDeadLetter: jest.fn().mockResolvedValue(undefined),
  };
  const observability = {
    recordCompleted: jest.fn(),
    recordRetry: jest.fn(),
    recordFailed: jest.fn(),
    recordDeadLetter: jest.fn(),
    observeProcessingDuration: jest.fn(),
    logWarn: jest.fn(),
  };

  let processor: BatteryV2Processor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new BatteryV2Processor(
      handlerRegistry as any,
      idempotentExecution as any,
      deadLetters as any,
      observability as any,
      undefined,
    );
  });

  it('completes successfully after transient failure retry', async () => {
    idempotentExecution.execute
      .mockRejectedValueOnce(new Error('redis timeout'))
      .mockResolvedValueOnce({ skipped: false });

    await expect(processor.process(buildJob(0))).rejects.toThrow('redis timeout');
    expect(deadLetters.recordDeadLetter).not.toHaveBeenCalled();
    expect(observability.recordRetry).toHaveBeenCalled();

    await processor.process(buildJob(1));
    expect(observability.recordCompleted).toHaveBeenCalledWith('BATTERY_OBSERVATION_CLASSIFY');
  });

  it('records dead letter after exhausted attempts', async () => {
    idempotentExecution.execute.mockRejectedValue(new Error('DIMO 503'));

    await expect(processor.process(buildJob(2))).rejects.toThrow('DIMO 503');

    expect(deadLetters.recordDeadLetter).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        vehicleId: VEH,
        jobType: 'BATTERY_OBSERVATION_CLASSIFY',
        errorCode: BATTERY_V2_JOB_ERROR_CODES.PROVIDER_UNAVAILABLE,
        attempts: 3,
      }),
    );
    expect(observability.recordDeadLetter).toHaveBeenCalled();
  });

  it('uses UnrecoverableError for non-retryable failures', async () => {
    idempotentExecution.execute.mockRejectedValue(
      new BatteryV2JobProcessingError({
        code: BATTERY_V2_JOB_ERROR_CODES.PERMANENT_CONFIG,
        message: 'not configured',
        retryable: false,
      }),
    );

    await expect(processor.process(buildJob(0))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(observability.recordFailed).toHaveBeenCalled();
  });

  it('treats worker abort retry as idempotent skip on subsequent run', async () => {
    idempotentExecution.execute.mockResolvedValue({
      skipped: true,
      skipReason: 'already_completed',
    });

    await processor.process(buildJob(1));
    expect(handlerRegistry.dispatch).not.toHaveBeenCalled();
    expect(deadLetters.recordDeadLetter).not.toHaveBeenCalled();
  });
});
