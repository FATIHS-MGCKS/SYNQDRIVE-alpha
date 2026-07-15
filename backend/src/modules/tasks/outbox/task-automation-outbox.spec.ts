import { TaskAutomationOutboxStatus } from '@prisma/client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { TaskAutomationOutboxRepository } from './task-automation-outbox.repository';
import { TaskAutomationOutboxEnqueueService } from './task-automation-outbox-enqueue.service';
import { TaskAutomationOutboxProcessorService } from './task-automation-outbox-processor.service';
import { TaskAutomationOutboxExecutorService } from './task-automation-outbox-executor.service';
import { TaskAutomationOutboxObservabilityService } from './task-automation-outbox-observability.service';
import { TaskAutomationOutboxSchedulerService } from './task-automation-outbox-scheduler.service';
import { buildTaskAutomationIdempotencyKey } from './task-automation-outbox-idempotency.util';
import { buildOutboxMeta } from './task-automation-outbox-meta.util';
import { BOOKING_PREPARATION_RULE_ID, BOOKING_PREPARATION_RULE_VERSION } from '../booking-task-automation.constants';

describe('TaskAutomationOutboxRepository', () => {
  it('enqueueOrRefresh creates then refreshes an existing row', async () => {
    const rows = new Map<string, any>();
    let idSeq = 0;
    const prisma = {
      taskAutomationOutbox: {
        findUnique: jest.fn(async ({ where }: any) => rows.get(where.idempotencyKey) ?? null),
        create: jest.fn(async ({ data }: any) => {
          const row = { id: `out-${++idSeq}`, attempts: 0, ...data };
          rows.set(data.idempotencyKey, row);
          return row;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const existing = [...rows.values()].find((r) => r.id === where.id);
          Object.assign(existing, data);
          return existing;
        }),
      },
    };
    const repo = new TaskAutomationOutboxRepository(prisma as any);
    const meta = buildOutboxMeta({
      organizationId: 'org-1',
      ruleId: BOOKING_PREPARATION_RULE_ID,
      ruleVersion: BOOKING_PREPARATION_RULE_VERSION,
      entityType: 'BOOKING',
      entityId: 'booking-1',
      operation: 'SYNC_BOOKING_PREPARATION',
      payload: { bookingId: 'booking-1' },
    });

    const first = await repo.enqueueOrRefresh({ ...meta, lastError: 'first' });
    const second = await repo.enqueueOrRefresh({ ...meta, lastError: 'second' });

    expect(first.id).toBe(second.id);
    expect(second.lastError).toBe('second');
    expect(second.status).toBe(TaskAutomationOutboxStatus.PENDING);
  });

  it('recoverStaleProcessing resets PROCESSING rows older than threshold', async () => {
    const prisma = {
      taskAutomationOutbox: {
        findMany: jest.fn().mockResolvedValue([{ id: 'out-stale' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const repo = new TaskAutomationOutboxRepository(prisma as any);
    const staleBefore = new Date('2026-01-01T00:00:00.000Z');

    const recovered = await repo.recoverStaleProcessing(staleBefore);

    expect(recovered).toEqual(['out-stale']);
    expect(prisma.taskAutomationOutbox.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['out-stale'] } },
      data: {
        status: TaskAutomationOutboxStatus.PENDING,
        availableAt: expect.any(Date),
        processedAt: null,
      },
    });
  });

  it('claimForProcessing is idempotent under concurrent claims', async () => {
    const row = {
      id: 'out-1',
      status: TaskAutomationOutboxStatus.PENDING,
      attempts: 0,
    };
    const prisma = {
      taskAutomationOutbox: {
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue({ ...row, attempts: 1, status: 'PROCESSING' }),
      },
    };
    const repo = new TaskAutomationOutboxRepository(prisma as any);
    const first = await repo.claimForProcessing('out-1');
    const second = await repo.claimForProcessing('out-1');
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });
});

describe('buildTaskAutomationIdempotencyKey', () => {
  it('scopes by tenant rule and entity', () => {
    expect(
      buildTaskAutomationIdempotencyKey({
        organizationId: 'org-a',
        ruleId: 'booking.lifecycle.ensure',
        entityType: 'BOOKING',
        entityId: 'b-1',
      }),
    ).toBe('task-auto:org-a:booking.lifecycle.ensure:BOOKING:b-1');
  });
});

describe('TaskAutomationOutboxProcessorService', () => {
  const config = { maxAttempts: 3, backoffMs: 1000 };
  const metrics = new TripMetricsService();
  const observability = new TaskAutomationOutboxObservabilityService(metrics);

  function buildProcessor(deps: {
    executor: { execute: jest.Mock };
    repo: Record<string, jest.Mock>;
  }) {
    return new TaskAutomationOutboxProcessorService(
      config as any,
      deps.repo as any,
      deps.executor as any,
      observability,
    );
  }

  it('records initial failure and schedules retry', async () => {
    const repo = {
      claimForProcessing: jest.fn().mockResolvedValue({
        id: 'out-1',
        organizationId: 'org-1',
        ruleId: BOOKING_PREPARATION_RULE_ID,
        entityType: 'BOOKING',
        entityId: 'booking-1',
        attempts: 1,
        payload: { operation: 'SYNC_BOOKING_PREPARATION', bookingId: 'booking-1' },
      }),
      markCompleted: jest.fn(),
      markRetry: jest.fn(),
      markDeadLetter: jest.fn(),
    };
    const executor = { execute: jest.fn().mockRejectedValue(new Error('db down')) };
    const processor = buildProcessor({ executor, repo });

    const result = await processor.processOutboxId('out-1');

    expect(result).toBe('retry');
    expect(repo.markRetry).toHaveBeenCalled();
    expect(repo.markDeadLetter).not.toHaveBeenCalled();
  });

  it('completes on successful retry', async () => {
    const repo = {
      claimForProcessing: jest.fn().mockResolvedValue({
        id: 'out-1',
        organizationId: 'org-1',
        ruleId: BOOKING_PREPARATION_RULE_ID,
        entityType: 'BOOKING',
        entityId: 'booking-1',
        attempts: 2,
        payload: { operation: 'SYNC_BOOKING_PREPARATION', bookingId: 'booking-1' },
      }),
      markCompleted: jest.fn(),
      markRetry: jest.fn(),
      markDeadLetter: jest.fn(),
    };
    const executor = { execute: jest.fn().mockResolvedValue(undefined) };
    const processor = buildProcessor({ executor, repo });

    const result = await processor.processOutboxId('out-1');

    expect(result).toBe('completed');
    expect(repo.markCompleted).toHaveBeenCalledWith('out-1');
  });

  it('dead-letters after max attempts', async () => {
    const repo = {
      claimForProcessing: jest.fn().mockResolvedValue({
        id: 'out-1',
        organizationId: 'org-1',
        ruleId: BOOKING_PREPARATION_RULE_ID,
        entityType: 'BOOKING',
        entityId: 'booking-1',
        attempts: 3,
        payload: { operation: 'SYNC_BOOKING_PREPARATION', bookingId: 'booking-1' },
      }),
      markCompleted: jest.fn(),
      markRetry: jest.fn(),
      markDeadLetter: jest.fn(),
    };
    const executor = { execute: jest.fn().mockRejectedValue(new Error('still failing')) };
    const processor = buildProcessor({ executor, repo });

    const result = await processor.processOutboxId('out-1');

    expect(result).toBe('dead_letter');
    expect(repo.markDeadLetter).toHaveBeenCalled();
  });

  it('skips when another worker already claimed the row', async () => {
    const repo = {
      claimForProcessing: jest.fn().mockResolvedValue(null),
    };
    const executor = { execute: jest.fn() };
    const processor = buildProcessor({ executor, repo });

    expect(await processor.processOutboxId('out-1')).toBe('skipped');
    expect(executor.execute).not.toHaveBeenCalled();
  });
});

describe('TaskAutomationOutboxEnqueueService', () => {
  it('enqueues failure without throwing to caller', async () => {
    const repo = {
      enqueueOrRefresh: jest.fn().mockResolvedValue({
        id: 'out-1',
        attempts: 0,
        status: 'PENDING',
      }),
    };
    const scheduler = { scheduleOutboxIds: jest.fn() };
    const metrics = new TripMetricsService();
    const observability = new TaskAutomationOutboxObservabilityService(metrics);
    const service = new TaskAutomationOutboxEnqueueService(
      { enabled: true } as any,
      repo as any,
      scheduler as any,
      observability,
    );

    const id = await service.enqueueFailure(
      buildOutboxMeta({
        organizationId: 'org-1',
        ruleId: BOOKING_PREPARATION_RULE_ID,
        ruleVersion: BOOKING_PREPARATION_RULE_VERSION,
        entityType: 'BOOKING',
        entityId: 'booking-1',
        operation: 'SYNC_BOOKING_PREPARATION',
        payload: { bookingId: 'booking-1' },
      }),
      new Error('upsert failed'),
    );

    expect(id).toBe('out-1');
    expect(scheduler.scheduleOutboxIds).toHaveBeenCalledWith(['out-1']);
  });
});

describe('TaskAutomationOutboxExecutorService — tenant scope', () => {
  it('rejects cross-tenant booking replay', async () => {
    const prisma = {
      booking: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const executor = new TaskAutomationOutboxExecutorService(
      prisma as any,
      { fromOutbox: true } as any,
      { ensureBookingLifecycleTasks: jest.fn() } as any,
      {} as any,
      { rematerializeFromOutbox: jest.fn() } as any,
      {} as any,
      {} as any,
    );

    await expect(
      executor.execute({
        id: 'out-1',
        organizationId: 'org-1',
        ruleId: 'booking.lifecycle.ensure',
        ruleVersion: 1,
        entityType: 'BOOKING',
        entityId: 'booking-1',
        idempotencyKey: 'key',
        payload: { operation: 'ENSURE_BOOKING_LIFECYCLE', bookingId: 'booking-1' },
        status: 'PROCESSING',
        attempts: 1,
        availableAt: new Date(),
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        processedAt: null,
      } as any),
    ).rejects.toThrow(/not found for org/);
  });
});
