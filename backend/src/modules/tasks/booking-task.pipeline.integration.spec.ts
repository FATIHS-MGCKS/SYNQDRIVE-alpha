/**
 * Booking-task automation integration matrix (in-memory relational store).
 *
 * Covers scenarios 1–10 from the booking lifecycle task prompt. Remaining gaps
 * are listed in the closing describe block — no real Postgres / BookingsService
 * e2e here (project convention: in-memory pipeline tests).
 */
import { TaskCompletionMode } from '@prisma/client';
import {
  BOOKING_TASK_FIXED_NOW,
  confirmedBookingInput,
  createBookingTaskPipelineFixtures,
} from './__fixtures__/booking-task-pipeline.fixtures';
import {
  bookingPickupDedupKey,
  bookingPreparationDedupKey,
  bookingReturnDedupKey,
} from './booking-task-automation.constants';
import { createBookingTaskPipelineHarness } from './booking-task-pipeline.harness';
import { checklistForType } from './task-templates';

describe('Booking task pipeline integration', () => {
  const ids = createBookingTaskPipelineFixtures();

  function bookingConfirmed(overrides?: Parameters<typeof confirmedBookingInput>[1]) {
    return confirmedBookingInput(ids, overrides);
  }

  describe('1 — CONFIRMED materialization', () => {
    it('creates exactly one BOOKING_PREPARATION with links and checklist, no legacy clean/document tasks', async () => {
      const { store, automation } = createBookingTaskPipelineHarness();
      const booking = bookingConfirmed();

      await automation.ensureBookingLifecycleTasks(booking);

      const prepRows = store.tasksByDedupKey(ids.orgA, bookingPreparationDedupKey(ids.bookingA));
      expect(prepRows).toHaveLength(1);
      const prep = prepRows[0]!;
      expect(prep.type).toBe('BOOKING_PREPARATION');
      expect(prep.bookingId).toBe(ids.bookingA);
      expect(prep.vehicleId).toBe(ids.vehicleA);
      expect(prep.customerId).toBe(ids.customerA);
      expect(prep.source).toBe('BOOKING');

      const checklist = store.tables.taskChecklistItems.filter((i) => i.taskId === prep.id);
      expect(checklist).toHaveLength(checklistForType('BOOKING_PREPARATION').length);

      const legacyKeys = store.tables.orgTasks
        .filter((t) => t.bookingId === ids.bookingA)
        .map((t) => t.dedupKey);
      expect(legacyKeys).not.toContain(`booking:clean:${ids.bookingA}`);
      expect(legacyKeys).not.toContain(`booking:document:${ids.bookingA}`);
      expect(legacyKeys).not.toContain(`booking:invoice:${ids.bookingA}`);
    });

    it('also materializes BOOKING_PICKUP on CONFIRMED (operational handover only)', async () => {
      const { store, automation } = createBookingTaskPipelineHarness();
      await automation.ensureBookingLifecycleTasks(bookingConfirmed());

      const pickup = store.tasksByDedupKey(ids.orgA, bookingPickupDedupKey(ids.bookingA));
      expect(pickup).toHaveLength(1);
      expect(pickup[0]?.type).toBe('BOOKING_PICKUP');
      expect(
        store.tables.taskChecklistItems.filter((i) => i.taskId === pickup[0]!.id),
      ).toHaveLength(checklistForType('BOOKING_PICKUP').length);
    });
  });

  describe('2 — Idempotency', () => {
    it('repeated ensureBookingLifecycleTasks keeps one row per dedup key', async () => {
      const { store, automation } = createBookingTaskPipelineHarness();
      const booking = bookingConfirmed();

      await automation.ensureBookingLifecycleTasks(booking);
      await automation.ensureBookingLifecycleTasks(booking);
      await automation.ensureBookingLifecycleTasks(booking);

      expect(store.tasksByDedupKey(ids.orgA, bookingPreparationDedupKey(ids.bookingA))).toHaveLength(1);
      expect(store.tasksByDedupKey(ids.orgA, bookingPickupDedupKey(ids.bookingA))).toHaveLength(1);
    });

    it('same status re-processed does not create extra rows', async () => {
      const { store, automation } = createBookingTaskPipelineHarness();
      const active = bookingConfirmed({ status: 'ACTIVE' });

      await automation.ensureBookingLifecycleTasks(active);
      await automation.ensureBookingLifecycleTasks(active);

      expect(store.tasksByDedupKey(ids.orgA, bookingReturnDedupKey(ids.bookingA))).toHaveLength(1);
    });

    it('concurrent ensureBookingLifecycleTasks does not duplicate tasks', async () => {
      const { store, automation } = createBookingTaskPipelineHarness();
      const booking = bookingConfirmed();

      await Promise.all(
        Array.from({ length: 8 }, () => automation.ensureBookingLifecycleTasks(booking)),
      );

      expect(store.tasksByDedupKey(ids.orgA, bookingPreparationDedupKey(ids.bookingA))).toHaveLength(1);
      expect(store.tasksByDedupKey(ids.orgA, bookingPickupDedupKey(ids.bookingA))).toHaveLength(1);
    });
  });

  describe('3 — Timing', () => {
    it('sets activatesAt and dueDate for preparation (48h / 2h leads)', async () => {
      const { store, automation } = createBookingTaskPipelineHarness();
      await automation.syncBookingPreparationTiming(bookingConfirmed(), {
        now: BOOKING_TASK_FIXED_NOW,
      });

      const prep = store.tasksByDedupKey(ids.orgA, bookingPreparationDedupKey(ids.bookingA))[0]!;
      expect(prep.activatesAt).toEqual(new Date('2026-07-23T10:00:00.000Z'));
      expect(prep.dueDate).toEqual(new Date('2026-07-25T08:00:00.000Z'));
    });

    it('activates preparation immediately when pickup is within 48 hours', async () => {
      const { store, automation } = createBookingTaskPipelineHarness();
      await automation.syncBookingPreparationTiming(
        bookingConfirmed({ startDate: new Date('2026-07-16T00:00:00.000Z') }),
        { now: BOOKING_TASK_FIXED_NOW },
      );

      const prep = store.tasksByDedupKey(ids.orgA, bookingPreparationDedupKey(ids.bookingA))[0]!;
      expect(prep.activatesAt).toEqual(BOOKING_TASK_FIXED_NOW);
    });

    it('schedules future activation when pickup is outside 48 hours', async () => {
      const { store, automation } = createBookingTaskPipelineHarness();
      await automation.syncBookingPreparationTiming(bookingConfirmed(), {
        now: BOOKING_TASK_FIXED_NOW,
      });

      const prep = store.tasksByDedupKey(ids.orgA, bookingPreparationDedupKey(ids.bookingA))[0]!;
      expect((prep.activatesAt as Date).getTime()).toBeGreaterThan(BOOKING_TASK_FIXED_NOW.getTime());
    });

    it('uses org timezone metadata (Europe/Berlin)', async () => {
      const { store, automation } = createBookingTaskPipelineHarness();
      await automation.syncBookingPreparationTiming(bookingConfirmed(), {
        now: BOOKING_TASK_FIXED_NOW,
      });

      const prep = store.tasksByDedupKey(ids.orgA, bookingPreparationDedupKey(ids.bookingA))[0]!;
      const metadata = prep.metadata as { timing?: { timeZone?: string } };
      expect(metadata.timing?.timeZone).toBe('Europe/Berlin');
    });
  });

  describe('4 — Reschedule', () => {
    it('updates task timing and records TIMING_CHANGED without duplicate rows', async () => {
      const { store, automation } = createBookingTaskPipelineHarness();
      const booking = bookingConfirmed();
      await automation.syncBookingPreparationTiming(booking, { now: BOOKING_TASK_FIXED_NOW });

      const previousStartDate = booking.startDate;
      const nextStartDate = new Date('2026-07-28T10:00:00.000Z');
      await automation.syncBookingPreparationTiming(
        { ...booking, startDate: nextStartDate },
        { previousStartDate, now: BOOKING_TASK_FIXED_NOW },
      );

      expect(store.tasksByDedupKey(ids.orgA, bookingPreparationDedupKey(ids.bookingA))).toHaveLength(1);
      const prep = store.tasksByDedupKey(ids.orgA, bookingPreparationDedupKey(ids.bookingA))[0]!;
      expect(prep.dueDate).toEqual(new Date('2026-07-28T08:00:00.000Z'));

      const events = store.eventsForTask(prep.id as string);
      expect(events.some((e) => e.type === 'TIMING_CHANGED')).toBe(true);
    });

    it('does not reopen manually completed preparation on minor reschedule', async () => {
      const { store, automation, tasks } = createBookingTaskPipelineHarness();
      const booking = bookingConfirmed();
      await automation.syncBookingPreparationTiming(booking, { now: BOOKING_TASK_FIXED_NOW });
      const prep = store.tasksByDedupKey(ids.orgA, bookingPreparationDedupKey(ids.bookingA))[0]!;

      await tasks.completeTask(ids.orgA, prep.id as string, {}, { id: 'operator-1' });

      await automation.syncBookingPreparationTiming(
        { ...booking, startDate: new Date('2026-07-25T12:00:00.000Z') },
        { previousStartDate: booking.startDate, now: BOOKING_TASK_FIXED_NOW },
      );

      const rows = store.tasksByDedupKey(ids.orgA, bookingPreparationDedupKey(ids.bookingA));
      expect(rows.filter((r) => r.status === 'DONE')).toHaveLength(1);
      expect(rows.filter((r) => r.status !== 'DONE')).toHaveLength(0);
    });
  });

  describe('5 — Vehicle change', () => {
    it('updates vehicleId on existing lifecycle tasks via ensureBookingLifecycleTasks', async () => {
      const { store, automation } = createBookingTaskPipelineHarness();
      const booking = bookingConfirmed();
      await automation.ensureBookingLifecycleTasks(booking);

      await automation.ensureBookingLifecycleTasks({
        ...booking,
        vehicleId: ids.vehicleB,
      });

      const prep = store.tasksByDedupKey(ids.orgA, bookingPreparationDedupKey(ids.bookingA))[0]!;
      const pickup = store.tasksByDedupKey(ids.orgA, bookingPickupDedupKey(ids.bookingA))[0]!;
      expect(prep.vehicleId).toBe(ids.vehicleB);
      expect(pickup.vehicleId).toBe(ids.vehicleB);
      expect(store.tasksByDedupKey(ids.orgA, bookingPreparationDedupKey(ids.bookingA))).toHaveLength(1);
    });

    it('does not touch legacy clean task on old vehicle when booking vehicle changes', async () => {
      const { store, automation } = createBookingTaskPipelineHarness();
      const booking = bookingConfirmed();
      const legacy = store.seedLegacyCleanTask(ids.bookingA, ids.vehicleA);

      await automation.ensureBookingLifecycleTasks(booking);
      await automation.ensureBookingLifecycleTasks({ ...booking, vehicleId: ids.vehicleB });

      const legacyAfter = store.tables.orgTasks.find((t) => t.id === legacy.id);
      expect(legacyAfter?.vehicleId).toBe(ids.vehicleA);
      expect(legacyAfter?.status).toBe('OPEN');
    });
  });

  describe('6 — Cancellation', () => {
    it('supersedes active and planned lifecycle tasks with BOOKING_CANCELLED', async () => {
      const { store, automation } = createBookingTaskPipelineHarness();
      await automation.ensureBookingLifecycleTasks(bookingConfirmed());

      await automation.supersedeBookingLifecycleOnCancellation(ids.orgA, ids.bookingA);

      const terminal = store.tables.orgTasks.filter(
        (t) => t.bookingId === ids.bookingA && t.source === 'BOOKING',
      );
      expect(terminal.every((t) => t.status === 'DONE')).toBe(true);
      expect(
        terminal.every((t) => t.completionMode === TaskCompletionMode.SUPERSEDED),
      ).toBe(true);
      expect(terminal.some((t) => t.resolutionCode === 'BOOKING_CANCELLED')).toBe(true);
    });
  });

  describe('7 — Pickup handover', () => {
    it('activates pickup before planned time and auto-resolves on handover completion', async () => {
      const { store, automation } = createBookingTaskPipelineHarness();
      const booking = bookingConfirmed();
      await automation.ensureBookingLifecycleTasks(booking);

      const pickup = store.tasksByDedupKey(ids.orgA, bookingPickupDedupKey(ids.bookingA))[0]!;
      expect((pickup.activatesAt as Date).getTime()).toBeLessThanOrEqual(booking.startDate.getTime());

      await automation.onPickupHandoverCompleted({ ...booking, status: 'ACTIVE' });

      const pickupAfter = store.tables.orgTasks.find((t) => t.id === pickup.id)!;
      expect(pickupAfter.status).toBe('DONE');
      expect(pickupAfter.completionMode).toBe(TaskCompletionMode.AUTO_RESOLVED);
      expect(pickupAfter.resolutionCode).toBe('HANDOVER_PICKUP_COMPLETED');

      const events = store.eventsForTask(pickup.id as string);
      expect(events.some((e) => e.type === 'AUTO_RESOLVED')).toBe(true);

      expect(store.tasksByDedupKey(ids.orgA, bookingReturnDedupKey(ids.bookingA))).toHaveLength(1);
    });
  });

  describe('8 — Return handover', () => {
    it('activates return before planned end and auto-resolves on return handover', async () => {
      const { store, automation } = createBookingTaskPipelineHarness();
      const active = bookingConfirmed({ status: 'ACTIVE' });
      await automation.ensureBookingLifecycleTasks(active);

      const ret = store.tasksByDedupKey(ids.orgA, bookingReturnDedupKey(ids.bookingA))[0]!;
      expect((ret.activatesAt as Date).getTime()).toBeLessThanOrEqual(active.endDate.getTime());

      await automation.onReturnHandoverCompleted({ ...active, status: 'COMPLETED' });

      const retAfter = store.tables.orgTasks.find((t) => t.id === ret.id)!;
      expect(retAfter.status).toBe('DONE');
      expect(retAfter.completionMode).toBe(TaskCompletionMode.AUTO_RESOLVED);
      expect(retAfter.resolutionCode).toBe('HANDOVER_RETURN_COMPLETED');
    });
  });

  describe('9 — No-show and overdue', () => {
    it('uses BOOKING_NO_SHOW resolution on no-show path', async () => {
      const { store, automation } = createBookingTaskPipelineHarness();
      await automation.ensureBookingLifecycleTasks(bookingConfirmed());
      await automation.handleBookingNoShow(ids.orgA, ids.bookingA);

      const pickup = store.tasksByDedupKey(ids.orgA, bookingPickupDedupKey(ids.bookingA))[0]!;
      expect(pickup.resolutionCode).toBe('BOOKING_NO_SHOW');
      expect(pickup.completionMode).toBe(TaskCompletionMode.AUTO_RESOLVED);

      const prep = store.tasksByDedupKey(ids.orgA, bookingPreparationDedupKey(ids.bookingA))[0]!;
      expect(prep.resolutionCode).toBe('BOOKING_NO_SHOW');
      expect(prep.completionMode).toBe(TaskCompletionMode.SUPERSEDED);
    });

    it('escalates overdue pickup priority without creating a duplicate task', async () => {
      const { store, automation } = createBookingTaskPipelineHarness();
      const overdue = bookingConfirmed({ startDate: new Date('2026-07-15T11:00:00.000Z') });

      await automation.syncBookingPickupTiming(overdue, { now: BOOKING_TASK_FIXED_NOW });
      await automation.syncBookingPickupTiming(overdue, { now: BOOKING_TASK_FIXED_NOW });

      expect(store.tasksByDedupKey(ids.orgA, bookingPickupDedupKey(ids.bookingA))).toHaveLength(1);
      expect(store.tasksByDedupKey(ids.orgA, bookingPickupDedupKey(ids.bookingA))[0]?.priority).toBe(
        'HIGH',
      );
    });
  });

  describe('10 — Tenant isolation', () => {
    it('does not cross-link tasks across organizations', async () => {
      const { store, automation } = createBookingTaskPipelineHarness();

      await automation.ensureBookingLifecycleTasks(bookingConfirmed());
      await automation.ensureBookingLifecycleTasks({
        id: ids.bookingB,
        organizationId: ids.orgB,
        vehicleId: ids.vehicleOtherOrg,
        customerId: ids.customerB,
        status: 'CONFIRMED',
        startDate: new Date('2026-07-26T10:00:00.000Z'),
        endDate: new Date('2026-07-29T10:00:00.000Z'),
      });

      const orgATasks = store.tables.orgTasks.filter((t) => t.organizationId === ids.orgA);
      const orgBTasks = store.tables.orgTasks.filter((t) => t.organizationId === ids.orgB);

      expect(orgATasks.length).toBeGreaterThan(0);
      expect(orgBTasks.length).toBeGreaterThan(0);
      expect(orgATasks.every((t) => t.organizationId === ids.orgA)).toBe(true);
      expect(orgBTasks.every((t) => t.organizationId === ids.orgB)).toBe(true);
      expect(orgATasks.some((t) => t.bookingId === ids.bookingB)).toBe(false);
    });
  });

  describe('Documented remaining gaps (not covered here)', () => {
    it('serves as checklist anchor — see test file header and PR notes', () => {
      const gaps = [
        'BookingsService.update vehicle-only change HTTP path (hook added; no full service integration test)',
        'BookingsHandoverService full transaction + document bundle side effects',
        'Real Postgres / testcontainers lifecycle',
        'HTTP e2e via supertest',
        'W1–W4 insight-gated materialization',
        'Legacy booking:clean rows backfill migration',
      ];
      expect(gaps.length).toBeGreaterThan(0);
    });
  });
});
