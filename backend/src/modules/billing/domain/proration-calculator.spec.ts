import { BillingBillableVehicleAssignmentStatus } from '@prisma/client';
import {
  buildProrationAmountCents,
  calculateProration,
  validateQuantityEvents,
} from './proration-calculator';

describe('proration-calculator', () => {
  const period = {
    periodStart: new Date('2026-07-01T00:00:00.000Z'),
    periodEnd: new Date('2026-08-01T00:00:00.000Z'),
  };
  const periodMs = period.periodEnd.getTime() - period.periodStart.getTime();

  const activeAssignment = (overrides: Partial<{
    vehicleId: string;
    assignmentId: string;
    billableFrom: Date;
    billableUntil: Date | null;
  }> = {}) => ({
    vehicleId: 'veh-1',
    assignmentId: 'asg-1',
    billableFrom: period.periodStart,
    billableUntil: null,
    status: BillingBillableVehicleAssignmentStatus.ACTIVE,
    reasonCode: null,
    ...overrides,
  });

  it('prorates a vehicle added on the first day for the full period', () => {
    const result = calculateProration({
      period,
      assignments: [activeAssignment()],
      unitPriceCents: 3000,
    });

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].activeMs).toBe(periodMs);
    expect(result.lines[0].prorationFactorBps).toBe(10_000);
    expect(result.proratedBillableQuantity).toBe(1);
    expect(result.proratedSubtotalCents).toBe(3000);
  });

  it('prorates a vehicle added mid-month', () => {
    const midMonth = new Date('2026-07-16T00:00:00.000Z');
    const result = calculateProration({
      period,
      assignments: [
        activeAssignment({
          billableFrom: midMonth,
        }),
      ],
      unitPriceCents: 3100,
    });

    const expectedActiveMs = period.periodEnd.getTime() - midMonth.getTime();
    expect(result.lines[0].activeMs).toBe(expectedActiveMs);
    expect(result.proratedBillableQuantity).toBeCloseTo(0.52, 2);
    expect(result.proratedSubtotalCents).toBe(
      buildProrationAmountCents(3100, expectedActiveMs, periodMs),
    );
  });

  it('prorates a vehicle removed before period end', () => {
    const removedAt = new Date('2026-07-31T00:00:00.000Z');
    const result = calculateProration({
      period,
      assignments: [
        activeAssignment({
          billableUntil: removedAt,
        }),
      ],
      unitPriceCents: 3000,
    });

    const expectedActiveMs = removedAt.getTime() - period.periodStart.getTime();
    expect(result.lines[0].activeMs).toBe(expectedActiveMs);
    expect(result.proratedBillableQuantity).toBeCloseTo(0.97, 2);
  });

  it('aggregates multiple assignment changes in one period', () => {
    const result = calculateProration({
      period,
      assignments: [
        activeAssignment({ vehicleId: 'veh-1', assignmentId: 'asg-1' }),
        activeAssignment({
          vehicleId: 'veh-2',
          assignmentId: 'asg-2',
          billableFrom: new Date('2026-07-16T00:00:00.000Z'),
        }),
      ],
      unitPriceCents: 1000,
    });

    expect(result.lines).toHaveLength(2);
    expect(result.proratedBillableQuantity).toBeCloseTo(1.52, 2);
    expect(result.proratedSubtotalCents).toBe(
      result.lines.reduce((sum, line) => sum + (line.amountCents ?? 0), 0),
    );
  });

  it('validates quantity ledger against prorated quantity', () => {
    const validation = validateQuantityEvents({
      period,
      ledgerQuantityAtPeriodEnd: 2,
      proratedBillableQuantity: 1.5,
      retroactiveEventCount: 0,
    });

    expect(validation.valid).toBe(false);
    expect(validation.warnings).toContain('QUANTITY_LEDGER_PRORATION_MISMATCH');
  });

  it('flags retroactive quantity events during validation', () => {
    const validation = validateQuantityEvents({
      period,
      ledgerQuantityAtPeriodEnd: 1,
      proratedBillableQuantity: 1,
      retroactiveEventCount: 1,
    });

    expect(validation.valid).toBe(false);
    expect(validation.warnings).toContain('RETROACTIVE_QUANTITY_EVENTS_PRESENT');
  });
});
