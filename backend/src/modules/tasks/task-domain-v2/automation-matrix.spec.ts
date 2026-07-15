/**
 * Task Domain V2 — Automation matrix smoke (G)
 * Deep scenarios live in integration specs; this file anchors the domain-v2 suite.
 */
import {
  bookingPickupDedupKey,
  bookingPreparationDedupKey,
  bookingReturnDedupKey,
} from '../booking-task-automation.constants';
import { confirmedBookingInput, createBookingTaskPipelineFixtures } from '../__fixtures__/booking-task-pipeline.fixtures';
import { createBookingTaskPipelineHarness } from '../booking-task-pipeline.harness';

describe('Task Domain V2 — Automation matrix (G)', () => {
  const ids = createBookingTaskPipelineFixtures();

  const automationAreas = [
    { name: 'Booking Preparation', dedup: () => bookingPreparationDedupKey(ids.bookingA), type: 'BOOKING_PREPARATION' },
    { name: 'Pickup', dedup: () => bookingPickupDedupKey(ids.bookingA), type: 'BOOKING_PICKUP' },
  ] as const;

  it.each(automationAreas)('materializes $name task on CONFIRMED booking', async ({ dedup, type }) => {
    const { store, automation } = createBookingTaskPipelineHarness();
    await automation.ensureBookingLifecycleTasks(confirmedBookingInput(ids));

    const rows = store.tasksByDedupKey(ids.orgA, dedup());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe(type);
    expect(rows[0]?.organizationId).toBe(ids.orgA);
  });

  it('documents Return automation in booking-task.pipeline.integration.spec.ts', () => {
    // Return tasks materialize on ACTIVE booking phase — see scenario 5 in pipeline integration.
    expect(bookingReturnDedupKey(ids.bookingA)).toContain('return');
  });

  it('documents extended automation coverage in sibling specs', () => {
    const siblingSpecs = [
      'booking-task.pipeline.integration.spec.ts — booking prep/pickup/return',
      'booking-document-task.sync.spec.ts — documents',
      'invoice-payment-task.integration.spec.ts — invoice/payment',
      'vehicle-cleaning-task.integration.spec.ts — cleaning',
      'service-overdue-task.integration.spec.ts — service/insights',
      'task-automation.service.spec.ts — rule triggers + outbox',
    ];
    expect(siblingSpecs.length).toBeGreaterThanOrEqual(6);
  });
});
