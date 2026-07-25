import { WorkflowEventOutboxStatus } from '@prisma/client';
import { WorkflowEventOutboxProcessorService } from './workflow-event-outbox-processor.service';
import { WorkflowEventOutboxDispatchService } from './workflow-event-outbox-dispatch.service';
import { WorkflowEventOutboxRepository } from './workflow-event-outbox.repository';
import { WorkflowEventOutboxObservabilityService } from './workflow-event-outbox-observability.service';
import { WorkflowEventOutboxSchedulerService } from './workflow-event-outbox-scheduler.service';
import { WorkflowEventOutboxReplayService } from './workflow-event-outbox-replay.service';
import {
  WorkflowEventOutboxProcessingError,
  computeWorkflowOutboxBackoffMs,
} from './workflow-event-outbox-error.util';
import { resetWorkflowEventOutboxWorkerIdForTests } from './workflow-event-outbox-worker-id.util';
import {
  FIXTURE_OUTBOX_ORG_ID,
  validBookingConfirmedOutboxInput,
} from './workflow-event-outbox.fixtures';
import { createWorkflowDomainEventEnvelope } from '../envelope';
import { envelopeToOutboxCreateData } from './workflow-event-outbox.mapper';

const config = {
  enabled: true,
  maxAttempts: 3,
  baseBackoffMs: 1000,
  maxBackoffMs: 60_000,
  jitterMs: 0,
  pollBatchSize: 10,
  jobAttempts: 2,
  jobBackoffMs: 500,
  leaseMs: 1000,
  heartbeatMs: 200,
  staleClaimMs: 500,
  shutdownDrainMs: 1000,
};

function buildOutboxRow(overrides: Record<string, unknown> = {}) {
  const envelopeResult = createWorkflowDomainEventEnvelope(validBookingConfirmedOutboxInput());
  if (!envelopeResult.ok) throw new Error('fixture invalid');
  const createData = envelopeToOutboxCreateData(
    envelopeResult.envelope,
    'booking.confirmed:test',
  );
  return {
    ...createData,
    id: 'outbox-1',
    status: WorkflowEventOutboxStatus.PENDING,
    attemptCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    claimedAt: null,
    claimedBy: null,
    leaseExpiresAt: null,
    dispatchedAt: null,
    deadLetteredAt: null,
    lastErrorCode: null,
    lastErrorSummary: null,
    workflowRunId: null,
    ...overrides,
  };
}

describe('WorkflowEventOutboxProcessorService', () => {
  beforeEach(() => {
    resetWorkflowEventOutboxWorkerIdForTests();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function createHarness() {
    const row = buildOutboxRow();
    const outboxRepo = {
      findById: jest.fn().mockResolvedValue(row),
      claimForProcessing: jest.fn().mockImplementation(async () => ({
        ...row,
        status: WorkflowEventOutboxStatus.CLAIMED,
        attemptCount: 1,
        claimedBy: 'worker-a',
      })),
      renewLease: jest.fn().mockResolvedValue(true),
      markDispatched: jest.fn().mockResolvedValue(undefined),
      markRetryScheduled: jest.fn().mockResolvedValue(undefined),
      markDeadLetter: jest.fn().mockResolvedValue(undefined),
      releaseExpiredClaim: jest.fn().mockResolvedValue(true),
      findExpiredClaimsBatch: jest.fn().mockResolvedValue([]),
    };
    const dispatchService = {
      dispatchClaimedRow: jest.fn().mockResolvedValue(['run-1']),
    };
    const observability = {
      log: jest.fn(),
      logWarn: jest.fn(),
      logError: jest.fn(),
      recordDispatched: jest.fn(),
      recordFailed: jest.fn(),
      recordRetry: jest.fn(),
      recordDeadLetter: jest.fn(),
      observeProcessingDuration: jest.fn(),
    };
    const processor = new WorkflowEventOutboxProcessorService(
      config as never,
      outboxRepo as unknown as WorkflowEventOutboxRepository,
      dispatchService as unknown as WorkflowEventOutboxDispatchService,
      observability as unknown as WorkflowEventOutboxObservabilityService,
    );
    return { processor, outboxRepo, dispatchService, observability, row };
  }

  it('dispatches successfully', async () => {
    const { processor, outboxRepo, dispatchService, observability } = createHarness();
    const outcome = await processor.processOutboxId('outbox-1');
    expect(outcome).toBe('dispatched');
    expect(dispatchService.dispatchClaimedRow).toHaveBeenCalled();
    expect(outboxRepo.markDispatched).toHaveBeenCalledWith('outbox-1', ['run-1']);
    expect(observability.recordDispatched).toHaveBeenCalledWith('booking.confirmed');
  });

  it('schedules retry on temporary error', async () => {
    const h = createHarness();
    h.dispatchService.dispatchClaimedRow.mockRejectedValue(new Error('connection reset'));
    const outcome = await h.processor.processOutboxId('outbox-1');
    expect(outcome).toBe('retry_scheduled');
    expect(h.outboxRepo.markRetryScheduled).toHaveBeenCalled();
    expect(h.observability.recordRetry).toHaveBeenCalled();
  });

  it('dead-letters permanent validation errors immediately', async () => {
    const h = createHarness();
    h.dispatchService.dispatchClaimedRow.mockRejectedValue(
      new WorkflowEventOutboxProcessingError('invalid payload', 'validation', 'INVALID_PAYLOAD'),
    );
    const outcome = await h.processor.processOutboxId('outbox-1');
    expect(outcome).toBe('dead_letter');
    expect(h.outboxRepo.markDeadLetter).toHaveBeenCalled();
    expect(h.outboxRepo.markRetryScheduled).not.toHaveBeenCalled();
  });

  it('dead-letters after max retryable attempts', async () => {
    const h = createHarness();
    h.outboxRepo.claimForProcessing.mockResolvedValue({
      ...buildOutboxRow(),
      status: WorkflowEventOutboxStatus.CLAIMED,
      attemptCount: config.maxAttempts,
    });
    h.dispatchService.dispatchClaimedRow.mockRejectedValue(new Error('db timeout'));
    const outcome = await h.processor.processOutboxId('outbox-1');
    expect(outcome).toBe('dead_letter');
    expect(h.outboxRepo.markDeadLetter).toHaveBeenCalled();
  });

  it('skips duplicate worker claim', async () => {
    const h = createHarness();
    h.outboxRepo.claimForProcessing.mockResolvedValue(null);
    const outcome = await h.processor.processOutboxId('outbox-1');
    expect(outcome).toBe('skipped');
    expect(h.dispatchService.dispatchClaimedRow).not.toHaveBeenCalled();
  });

  it('recovers expired lease claims', async () => {
    const h = createHarness();
    h.outboxRepo.findExpiredClaimsBatch.mockResolvedValue([{ id: 'outbox-stale' }]);
    const recovered = await h.processor.recoverExpiredClaims();
    expect(recovered).toEqual(['outbox-stale']);
    expect(h.outboxRepo.releaseExpiredClaim).toHaveBeenCalledWith('outbox-stale', expect.any(Date));
  });

  it('skips new work during graceful shutdown', async () => {
    const h = createHarness();
    await h.processor.onModuleDestroy();
    const outcome = await h.processor.processOutboxId('outbox-1');
    expect(outcome).toBe('skipped');
  });
});

describe('WorkflowEventOutboxSchedulerService', () => {
  it('records poll errors when Redis queue is unavailable', async () => {
    const queue = {
      getJob: jest.fn().mockRejectedValue(new Error('Redis connection lost')),
      add: jest.fn(),
    };
    const outboxRepo = {
      countQueueLag: jest.fn().mockResolvedValue(2),
      findPendingBatch: jest.fn().mockResolvedValue([{ id: 'outbox-1' }]),
    };
    const processor = {
      recoverExpiredClaims: jest.fn().mockResolvedValue([]),
      isShuttingDown: jest.fn().mockReturnValue(false),
    };
    const observability = { setQueueLag: jest.fn() };
    const scheduler = new WorkflowEventOutboxSchedulerService(
      queue as never,
      config as never,
      outboxRepo as never,
      processor as never,
      observability as never,
    );

    await scheduler.pollPendingOutbox();
    expect(scheduler.getLastPollError()).toContain('Redis connection lost');
  });
});

describe('WorkflowEventOutboxReplayService', () => {
  it('replays dead-letter rows with audit log and reschedule', async () => {
    const row = buildOutboxRow({ status: WorkflowEventOutboxStatus.DEAD_LETTER });
    const outboxRepo = {
      findById: jest.fn().mockResolvedValue(row),
      replayDeadLetter: jest.fn().mockResolvedValue(true),
    };
    const scheduler = { scheduleOutboxIds: jest.fn().mockResolvedValue(undefined) };
    const observability = { log: jest.fn() };
    const replay = new WorkflowEventOutboxReplayService(
      outboxRepo as never,
      scheduler as never,
      observability as never,
    );

    const result = await replay.replayDeadLetter({
      organizationId: FIXTURE_OUTBOX_ORG_ID,
      outboxId: 'outbox-1',
      actorUserId: 'user-admin',
    });

    expect(result).toEqual({ outboxId: 'outbox-1', status: 'PENDING' });
    expect(scheduler.scheduleOutboxIds).toHaveBeenCalledWith(['outbox-1']);
    expect(observability.log).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'replay_requested', actorUserId: 'user-admin' }),
    );
  });
});

describe('workflow event outbox backoff', () => {
  it('applies exponential backoff with cap', () => {
    expect(computeWorkflowOutboxBackoffMs(1000, 5000, 0, 1)).toBe(1000);
    expect(computeWorkflowOutboxBackoffMs(1000, 5000, 0, 2)).toBe(2000);
    expect(computeWorkflowOutboxBackoffMs(1000, 5000, 0, 10)).toBe(5000);
  });
});

describe('WorkflowEventOutboxDispatchService', () => {
  it('rejects unknown tenant before dispatch', async () => {
    const row = buildOutboxRow();
    const outboxRepo = {
      organizationExists: jest.fn().mockResolvedValue(null),
    };
    const engine = { processEvent: jest.fn() };
    const dispatch = new WorkflowEventOutboxDispatchService(
      outboxRepo as never,
      engine as never,
    );

    await expect(dispatch.dispatchClaimedRow(row as never)).rejects.toMatchObject({
      errorClass: 'tenant_violation',
      errorCode: 'TENANT_NOT_FOUND',
    });
    expect(engine.processEvent).not.toHaveBeenCalled();
  });
});
