import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BOOKING_PICKUP_RULE_ID,
  BOOKING_PREPARATION_RULE_ID,
  BOOKING_RETURN_RULE_ID,
  activeRentalPhaseDedupKeys,
  bookingPickupDedupKey,
  bookingPreparationDedupKey,
  bookingReturnDedupKey,
  confirmedPhaseActiveDedupKeys,
} from './booking-task-automation.constants';
import { BOOKING_PICKUP_TIMING_RULE } from './booking-pickup-return-timing.rules';
import { BOOKING_PREPARATION_TIMING_RULE } from './booking-preparation-timing.rules';
import { BOOKING_RETURN_TIMING_RULE } from './booking-pickup-return-timing.rules';
import { TaskAutomationService } from './task-automation.service';
import { TasksService } from './tasks.service';
import { VehicleCleaningTaskService } from './vehicle-cleaning-task.service';
import { checklistForType } from './task-templates';
import { TaskAutomationOutboxEnqueueService } from './outbox/task-automation-outbox-enqueue.service';
import { TaskAutomationOutboxExecutionContext } from './outbox/task-automation-outbox-execution.context';
import { TaskAutomationRuleResolverService } from './automation/task-automation-rule-resolver.service';
import {
  buildResolvedTaskAutomationRule,
  getOrgOverridableFieldKeys,
} from './automation/task-automation-effective-rule.util';
import { getAutomationRuleByCatalogKey } from './automation/task-automation-rule.util';

function createRuleResolverMock() {
  return {
    resolveByCatalogKey: jest.fn(async (_orgId: string, catalogKey: string) => {
      const rule = getAutomationRuleByCatalogKey(catalogKey as any);
      return buildResolvedTaskAutomationRule({
        rule,
        override: null,
        allowedOverrideFields: getOrgOverridableFieldKeys(rule),
      });
    }),
    resolveTaskAutomationRule: jest.fn(async (_orgId: string, ruleId: string) => {
      const rule = getAutomationRuleByCatalogKey('BOOKING_PREPARATION');
      return buildResolvedTaskAutomationRule({
        rule: { ...rule, ruleId },
        override: null,
        allowedOverrideFields: getOrgOverridableFieldKeys(rule),
      });
    }),
  };
}

describe('TaskAutomationService — booking lifecycle tasks', () => {
  let service: TaskAutomationService;
  let tasks: {
    upsertByDedup: jest.Mock;
    updateTaskTiming: jest.Mock;
    closeStaleBookingLifecycleTasks: jest.Mock;
    supersedeActiveBookingPreparationTasks: jest.Mock;
    supersedeActiveBookingLifecycleTasks: jest.Mock;
    autoResolveActiveBookingHandoverTask: jest.Mock;
  };
  let prisma: {
    organization: { findUnique: jest.Mock };
    orgTask: { findFirst: jest.Mock; update: jest.Mock };
  };

  const now = new Date('2026-07-15T12:00:00.000Z');

  const booking = {
    id: 'b1',
    organizationId: 'org1',
    vehicleId: 'v1',
    customerId: 'c1',
    status: 'CONFIRMED',
    startDate: new Date('2026-07-25T10:00:00.000Z'),
    endDate: new Date('2026-07-28T10:00:00.000Z'),
    pickupStationId: 'station-pickup',
    returnStationId: 'station-return',
  };

  beforeEach(async () => {
    tasks = {
      upsertByDedup: jest.fn().mockResolvedValue({ id: 'task-1' }),
      updateTaskTiming: jest.fn().mockResolvedValue({ id: 'task-1' }),
      closeStaleBookingLifecycleTasks: jest.fn().mockResolvedValue(0),
      supersedeActiveBookingPreparationTasks: jest.fn().mockResolvedValue(1),
      supersedeActiveBookingLifecycleTasks: jest.fn().mockResolvedValue(2),
      autoResolveActiveBookingHandoverTask: jest.fn().mockResolvedValue(1),
    };
    prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Berlin' }),
      },
      orgTask: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskAutomationService,
        { provide: TasksService, useValue: tasks },
        { provide: PrismaService, useValue: prisma },
        {
          provide: VehicleCleaningTaskService,
          useValue: {
            syncBookingPreparationContext: jest.fn().mockResolvedValue({ action: 'none' }),
          },
        },
        {
          provide: TaskAutomationOutboxEnqueueService,
          useValue: { isEnabled: () => false, enqueueFailure: jest.fn() },
        },
        { provide: TaskAutomationOutboxExecutionContext, useValue: { fromOutbox: false } },
        { provide: TaskAutomationRuleResolverService, useValue: createRuleResolverMock() },
      ],
    }).compile();

    service = module.get(TaskAutomationService);
  });

  describe('outbox reliability', () => {
    it('enqueues outbox row when task upsert fails without throwing', async () => {
      const enqueue = { isEnabled: () => true, enqueueFailure: jest.fn().mockResolvedValue('out-1') };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TaskAutomationService,
          { provide: TasksService, useValue: { ...tasks, upsertByDedup: jest.fn().mockRejectedValue(new Error('db down')) } },
          { provide: PrismaService, useValue: prisma },
          {
            provide: VehicleCleaningTaskService,
            useValue: { syncBookingPreparationContext: jest.fn().mockResolvedValue({ action: 'none' }) },
          },
          { provide: TaskAutomationOutboxEnqueueService, useValue: enqueue },
          { provide: TaskAutomationOutboxExecutionContext, useValue: { fromOutbox: false } },
          { provide: TaskAutomationRuleResolverService, useValue: createRuleResolverMock() },
        ],
      }).compile();

      const svc = module.get(TaskAutomationService);
      await expect(svc.syncBookingPreparationTiming(booking, { now })).resolves.toBeUndefined();
      expect(enqueue.enqueueFailure).toHaveBeenCalled();
    });
  });

  describe('BOOKING_PREPARATION', () => {
    it('materializes preparation with activatesAt 48h before pickup and dueDate 2h before', async () => {
      await service.syncBookingPreparationTiming(booking, { now });

      expect(tasks.upsertByDedup).toHaveBeenCalledWith(
        'org1',
        bookingPreparationDedupKey('b1'),
        expect.objectContaining({
          type: 'BOOKING_PREPARATION',
          activatesAt: new Date('2026-07-23T10:00:00.000Z'),
          dueDate: new Date('2026-07-25T08:00:00.000Z'),
          checklist: checklistForType('BOOKING_PREPARATION'),
          metadata: expect.objectContaining({
            timing: expect.objectContaining({
              activationLeadMs: BOOKING_PREPARATION_TIMING_RULE.activationLeadBeforePickupMs,
              dueLeadMs: BOOKING_PREPARATION_TIMING_RULE.dueLeadBeforePickupMs,
              timeZone: 'Europe/Berlin',
            }),
          }),
        }),
      );
    });

    it('does not reopen a manually completed preparation task on minor reschedule', async () => {
      prisma.orgTask.findFirst.mockResolvedValue({
        id: 'task-done',
        status: 'DONE',
        dedupKey: bookingPreparationDedupKey('b1'),
      });

      await service.syncBookingPreparationTiming(
        { ...booking, startDate: new Date('2026-07-25T12:00:00.000Z') },
        { previousStartDate: booking.startDate, now },
      );

      expect(tasks.upsertByDedup).not.toHaveBeenCalled();
      expect(tasks.updateTaskTiming).not.toHaveBeenCalled();
    });
  });

  describe('BOOKING_PICKUP', () => {
    it('materializes pickup 2h before planned pickup on CONFIRMED', async () => {
      await service.syncBookingPickupTiming(booking, { now });

      expect(tasks.upsertByDedup).toHaveBeenCalledWith(
        'org1',
        bookingPickupDedupKey('b1'),
        expect.objectContaining({
          type: 'BOOKING_PICKUP',
          activatesAt: new Date('2026-07-25T08:00:00.000Z'),
          dueDate: booking.startDate,
          priority: 'NORMAL',
          checklist: checklistForType('BOOKING_PICKUP'),
          metadata: expect.objectContaining({
            automation: { ruleId: BOOKING_PICKUP_RULE_ID, ruleVersion: 1, ruleScope: 'ORG' },
          }),
        }),
      );
    });

    it('escalates overdue pickup priority without creating a duplicate', async () => {
      prisma.orgTask.findFirst.mockResolvedValue({
        id: 'task-pickup',
        status: 'OPEN',
        dedupKey: bookingPickupDedupKey('b1'),
      });

      const overdueBooking = {
        ...booking,
        startDate: new Date('2026-07-15T11:00:00.000Z'),
      };

      await service.syncBookingPickupTiming(overdueBooking, { now });

      expect(tasks.upsertByDedup).not.toHaveBeenCalled();
      expect(tasks.updateTaskTiming).toHaveBeenCalledWith(
        'org1',
        'task-pickup',
        expect.objectContaining({
          activatesAt: now,
          dueDate: overdueBooking.startDate,
          priority: BOOKING_PICKUP_TIMING_RULE.overduePriority,
        }),
        expect.objectContaining({ ruleId: BOOKING_PICKUP_RULE_ID, bookingId: 'b1' }),
      );
    });

    it('updates timing on reschedule without duplicate when task is active', async () => {
      prisma.orgTask.findFirst.mockResolvedValue({
        id: 'task-pickup',
        status: 'OPEN',
        dedupKey: bookingPickupDedupKey('b1'),
      });

      const nextStartDate = new Date('2026-07-28T10:00:00.000Z');
      await service.syncBookingPickupTiming(
        { ...booking, startDate: nextStartDate },
        { previousStartDate: booking.startDate, now },
      );

      expect(tasks.upsertByDedup).not.toHaveBeenCalled();
      expect(tasks.updateTaskTiming).toHaveBeenCalledWith(
        'org1',
        'task-pickup',
        {
          activatesAt: new Date('2026-07-28T08:00:00.000Z'),
          dueDate: nextStartDate,
          priority: 'NORMAL',
        },
        expect.objectContaining({ ruleId: BOOKING_PICKUP_RULE_ID }),
      );
    });

    it('does not reopen a manually completed pickup task on minor reschedule', async () => {
      prisma.orgTask.findFirst.mockResolvedValue({
        id: 'task-done',
        status: 'DONE',
        dedupKey: bookingPickupDedupKey('b1'),
      });

      await service.syncBookingPickupTiming(
        { ...booking, startDate: new Date('2026-07-25T12:00:00.000Z') },
        { previousStartDate: booking.startDate, now },
      );

      expect(tasks.upsertByDedup).not.toHaveBeenCalled();
      expect(tasks.updateTaskTiming).not.toHaveBeenCalled();
    });
  });

  describe('BOOKING_RETURN', () => {
    const activeBooking = { ...booking, status: 'ACTIVE' };

    it('materializes return 24h before planned return on ACTIVE', async () => {
      await service.syncBookingReturnTiming(activeBooking, { now });

      expect(tasks.upsertByDedup).toHaveBeenCalledWith(
        'org1',
        bookingReturnDedupKey('b1'),
        expect.objectContaining({
          type: 'BOOKING_RETURN',
          activatesAt: new Date('2026-07-27T10:00:00.000Z'),
          dueDate: activeBooking.endDate,
          priority: 'NORMAL',
          checklist: checklistForType('BOOKING_RETURN'),
          metadata: expect.objectContaining({
            automation: { ruleId: BOOKING_RETURN_RULE_ID, ruleVersion: 1, ruleScope: 'ORG' },
          }),
        }),
      );
    });

    it('escalates overdue return priority without duplicate', async () => {
      prisma.orgTask.findFirst.mockResolvedValue({
        id: 'task-return',
        status: 'OPEN',
        dedupKey: bookingReturnDedupKey('b1'),
      });

      const overdueBooking = {
        ...activeBooking,
        endDate: new Date('2026-07-15T11:00:00.000Z'),
      };

      await service.syncBookingReturnTiming(overdueBooking, { now });

      expect(tasks.upsertByDedup).not.toHaveBeenCalled();
      expect(tasks.updateTaskTiming).toHaveBeenCalledWith(
        'org1',
        'task-return',
        expect.objectContaining({
          priority: BOOKING_RETURN_TIMING_RULE.overduePriority,
        }),
        expect.objectContaining({ ruleId: BOOKING_RETURN_RULE_ID }),
      );
    });

    it('does not create return task on COMPLETED', async () => {
      await service.syncBookingReturnTiming({ ...booking, status: 'COMPLETED' }, { now });
      expect(tasks.upsertByDedup).not.toHaveBeenCalled();
    });
  });

  describe('ensureBookingLifecycleTasks', () => {
    it('creates prep and pickup on CONFIRMED without invoice task', async () => {
      await service.ensureBookingLifecycleTasks(booking);

      const keys = tasks.upsertByDedup.mock.calls.map((call) => call[1]);
      expect(keys).toEqual([
        bookingPreparationDedupKey('b1'),
        bookingPickupDedupKey('b1'),
      ]);
      expect(tasks.closeStaleBookingLifecycleTasks).toHaveBeenCalledWith(
        'org1',
        'b1',
        confirmedPhaseActiveDedupKeys('b1'),
      );
    });

    it('creates only return on ACTIVE', async () => {
      await service.ensureBookingLifecycleTasks({ ...booking, status: 'ACTIVE' });

      expect(tasks.upsertByDedup).toHaveBeenCalledTimes(1);
      expect(tasks.upsertByDedup).toHaveBeenCalledWith(
        'org1',
        bookingReturnDedupKey('b1'),
        expect.objectContaining({ type: 'BOOKING_RETURN' }),
      );
      expect(tasks.closeStaleBookingLifecycleTasks).toHaveBeenCalledWith(
        'org1',
        'b1',
        activeRentalPhaseDedupKeys('b1'),
      );
    });

    it('is idempotent on repeated CONFIRMED processing', async () => {
      await service.ensureBookingLifecycleTasks(booking);
      await service.ensureBookingLifecycleTasks(booking);

      expect(tasks.upsertByDedup).toHaveBeenCalledTimes(4);
    });

    it('does not create invoice task on COMPLETED', async () => {
      await service.ensureBookingLifecycleTasks({ ...booking, status: 'COMPLETED' });
      expect(tasks.upsertByDedup).not.toHaveBeenCalled();
      expect(tasks.closeStaleBookingLifecycleTasks).toHaveBeenCalledWith('org1', 'b1', []);
    });
  });

  describe('terminal lifecycle paths', () => {
    it('supersedes all lifecycle tasks on cancellation', async () => {
      await service.supersedeBookingLifecycleOnCancellation('org1', 'b1');
      expect(tasks.supersedeActiveBookingLifecycleTasks).toHaveBeenCalledWith('org1', 'b1', {
        resolutionCode: 'BOOKING_CANCELLED',
        reason: expect.stringContaining('b1'),
        ruleId: 'booking.lifecycle.cancelled',
      });
    });

    it('auto-resolves pickup and supersedes remaining tasks on no-show', async () => {
      await service.handleBookingNoShow('org1', 'b1');

      expect(tasks.autoResolveActiveBookingHandoverTask).toHaveBeenCalledWith(
        'org1',
        'b1',
        'BOOKING_PICKUP',
        expect.objectContaining({
          resolutionCode: 'BOOKING_NO_SHOW',
          ruleId: 'booking.lifecycle.cancelled.noshow',
        }),
      );
      expect(tasks.supersedeActiveBookingLifecycleTasks).toHaveBeenCalledWith(
        'org1',
        'b1',
        expect.objectContaining({ resolutionCode: 'BOOKING_NO_SHOW' }),
      );
    });

    it('auto-resolves pickup and syncs ACTIVE lifecycle after handover', async () => {
      await service.onPickupHandoverCompleted({ ...booking, status: 'ACTIVE' });

      expect(tasks.autoResolveActiveBookingHandoverTask).toHaveBeenCalledWith(
        'org1',
        'b1',
        'BOOKING_PICKUP',
        expect.objectContaining({
          resolutionCode: 'HANDOVER_PICKUP_COMPLETED',
          ruleId: 'booking.handover.pickup.completed',
        }),
      );
      expect(tasks.upsertByDedup).toHaveBeenCalledWith(
        'org1',
        bookingReturnDedupKey('b1'),
        expect.objectContaining({ type: 'BOOKING_RETURN' }),
      );
    });

    it('auto-resolves return and closes stale tasks after return handover', async () => {
      await service.onReturnHandoverCompleted({ ...booking, status: 'COMPLETED' });

      expect(tasks.autoResolveActiveBookingHandoverTask).toHaveBeenCalledWith(
        'org1',
        'b1',
        'BOOKING_RETURN',
        expect.objectContaining({
          resolutionCode: 'HANDOVER_RETURN_COMPLETED',
          ruleId: 'booking.handover.return.completed',
        }),
      );
      expect(tasks.closeStaleBookingLifecycleTasks).toHaveBeenCalledWith('org1', 'b1', []);
    });
  });
});
