import { TaskCompletionMode } from '@prisma/client';
import {
  BOOKING_TASK_FIXED_NOW,
  confirmedBookingInput,
  createBookingTaskPipelineFixtures,
} from './__fixtures__/booking-task-pipeline.fixtures';
import { bookingPreparationDedupKey } from './booking-task-automation.constants';
import { createBookingTaskPipelineHarness } from './booking-task-pipeline.harness';
import { vehicleCleaningDedupKey } from './vehicle-cleaning-task.util';

describe('Vehicle cleaning task deduplication integration', () => {
  const ids = createBookingTaskPipelineFixtures();

  function booking(overrides?: Parameters<typeof confirmedBookingInput>[1]) {
    return confirmedBookingInput(ids, overrides);
  }

  it('materialises one canonical cleaning task when vehicle NEEDS_CLEANING', async () => {
    const { store, vehicleCleaningTasks } = createBookingTaskPipelineHarness();
    store.setVehicleCleaningStatus(ids.vehicleA, 'NEEDS_CLEANING');

    const res = await vehicleCleaningTasks.ensureCleaningTask(ids.orgA, ids.vehicleA);

    expect(res.action).toBe('created');
    const tasks = store.activeCleaningTasksForVehicle(ids.orgA, ids.vehicleA);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.dedupKey).toBe(vehicleCleaningDedupKey(ids.vehicleA, 'STANDALONE'));
    expect(tasks[0]?.type).toBe('VEHICLE_CLEANING');
  });

  it('does not create a cleaning task on CONFIRMED booking when vehicle is clean', async () => {
    const { store, automation } = createBookingTaskPipelineHarness();
    store.setVehicleCleaningStatus(ids.vehicleA, 'CLEAN');

    await automation.ensureBookingLifecycleTasks(booking());

    expect(store.activeCleaningTasksForVehicle(ids.orgA, ids.vehicleA)).toHaveLength(0);
    expect(store.tasksByDedupKey(ids.orgA, bookingPreparationDedupKey(ids.bookingA))).toHaveLength(1);
  });

  it('updates existing cleaning task context when next booking is confirmed', async () => {
    const { store, automation, vehicleCleaningTasks } = createBookingTaskPipelineHarness();
    store.setVehicleCleaningStatus(ids.vehicleA, 'NEEDS_CLEANING');
    store.seedBooking({
      id: ids.bookingA,
      organizationId: ids.orgA,
      vehicleId: ids.vehicleA,
      customerId: ids.customerA,
      startDate: new Date('2026-07-25T10:00:00.000Z'),
      endDate: new Date('2026-07-28T10:00:00.000Z'),
    });

    await vehicleCleaningTasks.ensureCleaningTask(ids.orgA, ids.vehicleA);
    await automation.ensureBookingLifecycleTasks(booking());

    const tasks = store.activeCleaningTasksForVehicle(ids.orgA, ids.vehicleA);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.dedupKey).toBe(vehicleCleaningDedupKey(ids.vehicleA, 'PRE_BOOKING'));
    expect(tasks[0]?.bookingId).toBe(ids.bookingA);
    expect(tasks[0]?.dueDate).toEqual(new Date('2026-07-25T08:00:00.000Z'));
  });

  it('migrates legacy booking:clean into the canonical vehicle cleaning identity', async () => {
    const { store, vehicleCleaningTasks } = createBookingTaskPipelineHarness();
    store.setVehicleCleaningStatus(ids.vehicleA, 'NEEDS_CLEANING');
    const legacy = store.seedLegacyCleanTask(ids.bookingA, ids.vehicleA);

    await vehicleCleaningTasks.ensureCleaningTask(ids.orgA, ids.vehicleA);

    const migrated = store.tables.orgTasks.find((t) => t.id === legacy.id)!;
    expect(migrated.status).toBe('OPEN');
    expect(migrated.dedupKey).toBe(vehicleCleaningDedupKey(ids.vehicleA, 'STANDALONE'));
    expect(store.activeCleaningTasksForVehicle(ids.orgA, ids.vehicleA)).toHaveLength(1);
    expect(store.activeCleaningTasksForVehicle(ids.orgA, ids.vehicleA)[0]?.source).toBe('BOOKING');
  });

  it('keeps cleaning task vehicle-scoped when booking is cancelled but vehicle still dirty', async () => {
    const { store, vehicleCleaningTasks } = createBookingTaskPipelineHarness();
    store.setVehicleCleaningStatus(ids.vehicleA, 'NEEDS_CLEANING');
    store.seedBooking({
      id: ids.bookingA,
      organizationId: ids.orgA,
      vehicleId: ids.vehicleA,
      customerId: ids.customerA,
      startDate: new Date('2026-07-25T10:00:00.000Z'),
      endDate: new Date('2026-07-28T10:00:00.000Z'),
    });

    await vehicleCleaningTasks.syncBookingPreparationContext(booking(), {
      now: BOOKING_TASK_FIXED_NOW,
    });
    await vehicleCleaningTasks.onBookingCancelled(ids.orgA, ids.bookingA, ids.vehicleA);

    const tasks = store.activeCleaningTasksForVehicle(ids.orgA, ids.vehicleA);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.bookingId).toBeNull();
    expect(tasks[0]?.dedupKey).toBe(vehicleCleaningDedupKey(ids.vehicleA, 'STANDALONE'));
  });

  it('supersedes cleaning task on cancel when vehicle is clean', async () => {
    const { store, vehicleCleaningTasks } = createBookingTaskPipelineHarness();
    store.setVehicleCleaningStatus(ids.vehicleA, 'NEEDS_CLEANING');
    store.seedBooking({
      id: ids.bookingA,
      organizationId: ids.orgA,
      vehicleId: ids.vehicleA,
      customerId: ids.customerA,
      startDate: new Date('2026-07-25T10:00:00.000Z'),
      endDate: new Date('2026-07-28T10:00:00.000Z'),
    });

    await vehicleCleaningTasks.syncBookingPreparationContext(booking(), {
      now: BOOKING_TASK_FIXED_NOW,
    });
    store.setVehicleCleaningStatus(ids.vehicleA, 'CLEAN');
    await vehicleCleaningTasks.onBookingCancelled(ids.orgA, ids.bookingA, ids.vehicleA);

    expect(store.activeCleaningTasksForVehicle(ids.orgA, ids.vehicleA)).toHaveLength(0);
  });

  it('moves booking context to new vehicle on vehicle change', async () => {
    const { store, vehicleCleaningTasks } = createBookingTaskPipelineHarness();
    store.setVehicleCleaningStatus(ids.vehicleA, 'NEEDS_CLEANING');
    store.setVehicleCleaningStatus(ids.vehicleB, 'NEEDS_CLEANING');
    store.seedBooking({
      id: ids.bookingA,
      organizationId: ids.orgA,
      vehicleId: ids.vehicleA,
      customerId: ids.customerA,
      startDate: new Date('2026-07-25T10:00:00.000Z'),
      endDate: new Date('2026-07-28T10:00:00.000Z'),
    });

    await vehicleCleaningTasks.syncBookingPreparationContext(booking(), {
      now: BOOKING_TASK_FIXED_NOW,
    });
    await vehicleCleaningTasks.onBookingVehicleChanged(
      { ...booking(), vehicleId: ids.vehicleB },
      ids.vehicleA,
      { now: BOOKING_TASK_FIXED_NOW },
    );

    expect(store.activeCleaningTasksForVehicle(ids.orgA, ids.vehicleB)).toHaveLength(1);
    expect(store.activeCleaningTasksForVehicle(ids.orgA, ids.vehicleB)[0]?.bookingId).toBe(
      ids.bookingA,
    );
    const oldVehicleTasks = store.activeCleaningTasksForVehicle(ids.orgA, ids.vehicleA);
    expect(oldVehicleTasks.length).toBeLessThanOrEqual(1);
    if (oldVehicleTasks[0]) {
      expect(oldVehicleTasks[0].bookingId).toBeNull();
    }
  });

  it('auto-resolves all active cleaning tasks when vehicle becomes CLEAN', async () => {
    const { store, vehicleCleaningTasks } = createBookingTaskPipelineHarness();
    store.setVehicleCleaningStatus(ids.vehicleA, 'NEEDS_CLEANING');
    await vehicleCleaningTasks.ensureCleaningTask(ids.orgA, ids.vehicleA);

    store.setVehicleCleaningStatus(ids.vehicleA, 'CLEAN');
    const res = await vehicleCleaningTasks.completeOpenCleaningTasks(ids.orgA, ids.vehicleA, 'u1');

    expect(res.action).toBe('completed');
    expect(store.activeCleaningTasksForVehicle(ids.orgA, ids.vehicleA)).toHaveLength(0);
    const closed = store.tables.orgTasks.find((t) => t.vehicleId === ids.vehicleA);
    expect(closed?.resolutionCode).toBe('VEHICLE_CLEANED');
    expect(closed?.completionMode).toBe(TaskCompletionMode.AUTO_RESOLVED);
  });

  it('handles parallel ensureCleaningTask without duplicate open tasks', async () => {
    const { store, vehicleCleaningTasks } = createBookingTaskPipelineHarness();
    store.setVehicleCleaningStatus(ids.vehicleA, 'NEEDS_CLEANING');

    await Promise.allSettled(
      Array.from({ length: 8 }, () => vehicleCleaningTasks.ensureCleaningTask(ids.orgA, ids.vehicleA)),
    );

    expect(store.activeCleaningTasksForVehicle(ids.orgA, ids.vehicleA)).toHaveLength(1);
  });
});
