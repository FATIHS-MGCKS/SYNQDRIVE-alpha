import { computeBookingPickupTiming } from '@modules/tasks/booking-pickup-return-timing.util';
import { BOOKING_PICKUP_TIMING_RULE } from '@modules/tasks/booking-pickup-return-timing.rules';
import {
  WORKFLOW_PRODUCTION_SCENARIOS,
  countScenariosByStatus,
} from './testing/workflow-production-readiness.scenarios';

describe('Workflow Automation production readiness matrix', () => {
  it('defines all 42 minimum scenarios', () => {
    expect(WORKFLOW_PRODUCTION_SCENARIOS).toHaveLength(42);
    const ids = WORKFLOW_PRODUCTION_SCENARIOS.map((scenario) => scenario.id).sort((a, b) => a - b);
    expect(ids).toEqual(Array.from({ length: 42 }, (_, index) => index + 1));
  });

  it('documents coverage distribution', () => {
    const counts = countScenariosByStatus();
    expect(counts.automated).toBeGreaterThanOrEqual(28);
    expect(counts.automated + counts.partial + counts['not-applicable']).toBe(42);
  });

  describe('scenario 13: pickup 30 minutes overdue', () => {
    it('escalates priority to HIGH when pickup is 30 minutes past due', () => {
      const pickupAt = new Date('2026-07-25T10:00:00.000Z');
      const now = new Date(pickupAt.getTime() + 30 * 60 * 1000);
      const timing = computeBookingPickupTiming(pickupAt, now, 'UTC');

      expect(timing.isOverdue).toBe(true);
      expect(timing.priority).toBe(BOOKING_PICKUP_TIMING_RULE.overduePriority);
      expect(timing.dueDate.toISOString()).toBe(pickupAt.toISOString());
    });

    it('does not mark critical until 24h overdue threshold', () => {
      const pickupAt = new Date('2026-07-25T10:00:00.000Z');
      const now = new Date(pickupAt.getTime() + 30 * 60 * 1000);
      const timing = computeBookingPickupTiming(pickupAt, now, 'UTC');
      expect(timing.priority).not.toBe('CRITICAL');
    });
  });

  describe('scenario 19: action timeout (failure injection stub)', () => {
    it('documents outbox backoff as retry timer surrogate', () => {
      const scenario = WORKFLOW_PRODUCTION_SCENARIOS.find((entry) => entry.id === 19);
      expect(scenario?.status).toBe('partial');
      expect(scenario?.testRef).toContain('workflow-production-readiness');
    });
  });
});
