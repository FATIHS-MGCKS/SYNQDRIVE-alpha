import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { WorkflowTimerRepository } from '../cancellation/workflow-timer.repository';
import { WorkflowDurableTimerService } from './workflow-durable-timer.service';
import { WorkflowDelayActionService } from './workflow-delay-action.service';
import { WorkflowDelayResumeService } from './workflow-delay-resume.service';
import { WorkflowTimerFireService } from './workflow-timer-fire.service';
import { BookingPickupOverdueRecheckService } from './booking-pickup-overdue-recheck.service';
import { BookingPickupOverdueTimerService } from './booking-pickup-overdue-timer.service';
import { WorkflowRunWorkerService } from '../workflow-run-worker.service';
import { WorkflowBookingTimingEmitterService } from '../../outbox/workflow-booking-timing-emitter.service';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BOOKING_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('WorkflowDurableTimers', () => {
  const prisma: {
    $transaction: jest.Mock;
    workflowTimer: Record<string, jest.Mock>;
    booking: { findFirst: jest.Mock };
    outboundEmail: { count: jest.Mock };
    workflowDefinition: { count: jest.Mock };
    workflowActionRun: { updateMany: jest.Mock };
  } = {
    $transaction: jest.fn(),
    workflowTimer: {
      create: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    booking: { findFirst: jest.fn() },
    outboundEmail: { count: jest.fn() },
    workflowDefinition: { count: jest.fn() },
    workflowActionRun: { updateMany: jest.fn() },
  };
  prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));

  const timerRepo = {
    schedule: jest.fn(),
    cancelScheduledByOccurrence: jest.fn(),
    findDueBatch: jest.fn(),
    markFired: jest.fn(),
  };

  const config = {
    get: jest.fn((key: string, fallback?: unknown) => {
      const map: Record<string, unknown> = {
        'workflowRuntime.maxTimerDelayMs': 30 * 24 * 60 * 60 * 1000,
        'workflowRuntime.bookingPickupOverdueOffsetMinutes': 30,
        'workflowRuntime.timerLateWarningMs': 60_000,
        'workflowRuntime.pollBatchSize': 25,
      };
      return map[key] ?? fallback;
    }),
  };

  let durableTimers: WorkflowDurableTimerService;
  let delayAction: WorkflowDelayActionService;
  let fireService: WorkflowTimerFireService;
  let recheck: BookingPickupOverdueRecheckService;
  let pickupTimer: BookingPickupOverdueTimerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        WorkflowDurableTimerService,
        WorkflowDelayActionService,
        BookingPickupOverdueRecheckService,
        BookingPickupOverdueTimerService,
        { provide: PrismaService, useValue: prisma },
        { provide: WorkflowTimerRepository, useValue: timerRepo },
        { provide: ConfigService, useValue: config },
        { provide: WorkflowBookingTimingEmitterService, useValue: { emitPickupTimingStandalone: jest.fn() } },
        {
          provide: WorkflowDelayResumeService,
          useValue: { resumeFromTimer: jest.fn().mockResolvedValue(true) },
        },
        {
          provide: WorkflowRunWorkerService,
          useValue: { processRun: jest.fn() },
        },
        WorkflowTimerFireService,
      ],
    }).compile();

    durableTimers = module.get(WorkflowDurableTimerService);
    delayAction = module.get(WorkflowDelayActionService);
    fireService = module.get(WorkflowTimerFireService);
    recheck = module.get(BookingPickupOverdueRecheckService);
    pickupTimer = module.get(BookingPickupOverdueTimerService);
  });

  describe('schedule / replace / cancel', () => {
    it('schedules timer with organizationId and occurrenceId', async () => {
      timerRepo.schedule.mockResolvedValue({ id: 'timer-1' });
      const dueAt = new Date(Date.now() + 60_000);
      await durableTimers.scheduleOrReplace({
        organizationId: ORG_A,
        occurrenceId: 'booking.pickup_overdue:booking-1:2026-07-25',
        idempotencyKey: 'timer:booking.pickup_overdue:booking-1:2026-07-25',
        timerType: 'SCHEDULED_TRIGGER',
        dueAt,
      });
      expect(timerRepo.cancelScheduledByOccurrence).toHaveBeenCalledWith(
        prisma,
        ORG_A,
        'booking.pickup_overdue:booking-1:2026-07-25',
      );
      expect(timerRepo.schedule).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          organizationId: ORG_A,
          occurrenceId: 'booking.pickup_overdue:booking-1:2026-07-25',
          fireAt: dueAt,
        }),
      );
    });

    it('replaces timer when pickupAt changes', async () => {
      timerRepo.schedule.mockResolvedValue({ id: 'timer-2' });
      const firstDue = new Date('2026-07-25T11:00:00Z');
      const secondDue = new Date('2026-07-25T12:00:00Z');
      const occurrenceId = pickupTimer.buildOccurrenceId(BOOKING_ID, '2026-07-25');

      await durableTimers.scheduleOrReplace({
        organizationId: ORG_A,
        occurrenceId,
        idempotencyKey: `timer:${occurrenceId}`,
        timerType: 'SCHEDULED_TRIGGER',
        dueAt: firstDue,
      });
      await durableTimers.scheduleOrReplace({
        organizationId: ORG_A,
        occurrenceId,
        idempotencyKey: `timer:${occurrenceId}`,
        timerType: 'SCHEDULED_TRIGGER',
        dueAt: secondDue,
      });

      expect(timerRepo.cancelScheduledByOccurrence).toHaveBeenCalledTimes(2);
    });

    it('cancels scheduled timer', async () => {
      timerRepo.cancelScheduledByOccurrence.mockResolvedValue({ count: 1 });
      await durableTimers.cancelByOccurrence(ORG_A, 'occ-1');
      expect(timerRepo.cancelScheduledByOccurrence).toHaveBeenCalledWith(prisma, ORG_A, 'occ-1');
    });

    it('rejects delay beyond max wait', () => {
      expect(() =>
        durableTimers.validateDueAt(new Date(Date.now() + 40 * 24 * 60 * 60 * 1000)),
      ).toThrow(BadRequestException);
    });
  });

  describe('delay action', () => {
    it('schedules RESUME_DELAY timer for workflow.delay', async () => {
      timerRepo.schedule.mockResolvedValue({ id: 'delay-1' });
      const run = {
        id: 'run-1',
        organizationId: ORG_A,
      } as never;
      const actionRun = { id: 'action-1' } as never;
      const result = await delayAction.execute(
        { type: 'workflow.delay', config: { minutes: 15 } },
        run,
        actionRun,
      );
      expect(result.status).toBe('WAITING');
      expect(result.waitingUntil).toBeInstanceOf(Date);
      expect(timerRepo.schedule).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ timerType: 'RESUME_DELAY', actionRunId: 'action-1' }),
      );
    });
  });

  describe('fire idempotency and late worker', () => {
    it('fires due timer idempotently', async () => {
      timerRepo.markFired.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
      const timer = {
        id: 't1',
        organizationId: ORG_A,
        workflowRunId: 'run-1',
        actionRunId: null,
        timerType: 'RETRY_BACKOFF',
        fireAt: new Date(Date.now() - 120_000),
        occurrenceId: 'retry:run-1:action-1',
        payload: {},
      } as never;

      const first = await fireService.fireTimer(timer);
      const second = await fireService.fireTimer(timer);
      expect(first.fired).toBe(true);
      expect(second.fired).toBe(false);
      expect(first.lateMs).toBeGreaterThan(0);
    });
  });

  describe('booking pickup overdue recheck', () => {
    it('skips when booking cancelled', async () => {
      prisma.booking.findFirst.mockResolvedValue({
        status: 'CANCELLED',
        cancelledAt: new Date(),
        startDate: new Date('2026-07-25T10:00:00Z'),
        extrasJson: {},
        handoverProtocols: [],
        organization: { status: 'ACTIVE' },
      });
      const result = await recheck.evaluate(ORG_A, BOOKING_ID);
      expect(result.shouldEmit).toBe(false);
      expect(result.skipReason).toBe('booking_cancelled');
    });

    it('skips when pickup already completed', async () => {
      prisma.booking.findFirst.mockResolvedValue({
        status: 'ACTIVE',
        cancelledAt: null,
        startDate: new Date('2026-07-25T10:00:00Z'),
        extrasJson: {},
        handoverProtocols: [{ id: 'hp-1' }],
        organization: { status: 'ACTIVE' },
      });
      const result = await recheck.evaluate(ORG_A, BOOKING_ID);
      expect(result.shouldEmit).toBe(false);
    });

    it('rejects cross-tenant booking lookup', async () => {
      prisma.booking.findFirst.mockResolvedValue(null);
      const result = await recheck.evaluate(ORG_B, BOOKING_ID);
      expect(result.shouldEmit).toBe(false);
      expect(result.skipReason).toBe('booking_not_found');
    });

    it('emits when all business checks pass', async () => {
      prisma.booking.findFirst.mockResolvedValue({
        status: 'CONFIRMED',
        cancelledAt: null,
        startDate: new Date('2026-07-25T10:00:00Z'),
        extrasJson: {},
        handoverProtocols: [],
        organization: { status: 'ACTIVE' },
      });
      prisma.outboundEmail.count.mockResolvedValue(0);
      prisma.workflowDefinition.count.mockResolvedValue(1);
      const result = await recheck.evaluate(
        ORG_A,
        BOOKING_ID,
        new Date('2026-07-25T11:00:00Z'),
      );
      expect(result.shouldEmit).toBe(true);
    });
  });

  describe('DST scheduling', () => {
    it('computes dueAt as UTC offset from pickupAt', () => {
      const pickupAt = new Date('2026-03-29T10:00:00Z');
      const dueAt = pickupTimer.computeDueAt(pickupAt);
      expect(dueAt.toISOString()).toBe('2026-03-29T10:30:00.000Z');
    });
  });
});
