import { describe, expect, it } from 'vitest';
import type { ApiTask } from '../../lib/api';
import {
  computeOperatorRank,
  deriveNextBookingContext,
  deriveTaskBlockingBadge,
  deriveTaskSourceBadge,
  isTaskDueBeforeNextBooking,
  pickNextBestAction,
} from './task-operator.utils';

function task(partial: Partial<ApiTask>): ApiTask {
  return {
    id: 't1',
    organizationId: 'org',
    title: 'Test',
    description: '',
    category: 'Maintenance',
    type: 'CUSTOM',
    status: 'OPEN',
    priority: 'NORMAL',
    source: null,
    sourceType: 'MANUAL',
    dedupKey: null,
    vehicleId: 'v1',
    bookingId: null,
    customerId: null,
    vendorId: null,
    alertId: null,
    documentId: null,
    fineId: null,
    invoiceId: null,
    assignedUserId: null,
    estimatedCostCents: null,
    actualCostCents: null,
    resolutionNote: null,
    blocksVehicleAvailability: false,
    metadata: null,
    isOverdue: false,
    dueDate: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('task-operator.utils', () => {
  it('maps damage metadata to Damage source badge', () => {
    expect(
      deriveTaskSourceBadge(
        task({ metadata: { origin: 'DAMAGE', damageId: 'd1' }, sourceType: 'MANUAL' }),
      ),
    ).toBe('Damage');
  });

  it('maps INSIGHT_HEALTH to Health source', () => {
    expect(
      deriveTaskSourceBadge(task({ source: 'INSIGHT_HEALTH', sourceType: 'ALERT' })),
    ).toBe('Health');
  });

  it('uses blocksVehicleAvailability for blocking badge', () => {
    expect(deriveTaskBlockingBadge(task({ blocksVehicleAvailability: true }))).toBe('blocks_rental');
    expect(deriveTaskBlockingBadge(task({ priority: 'CRITICAL' }))).toBe('attention');
    expect(deriveTaskBlockingBadge(task({ status: 'DONE' }))).toBe('no_block');
  });

  it('ranks overdue blocking tasks highest', () => {
    const blocking = computeOperatorRank(
      task({ blocksVehicleAvailability: true, isOverdue: true, status: 'OPEN' }),
    );
    const open = computeOperatorRank(task({ status: 'OPEN' }));
    expect(blocking).toBeLessThan(open);
  });

  it('detects due before next booking from vehicle reserved pickup', () => {
    const next = deriveNextBookingContext({
      id: 'v1',
      license: 'M-AB',
      model: 'X',
      year: 2024,
      station: 'S',
      fuelType: 'Petrol',
      status: 'Reserved',
      cleaningStatus: 'Clean',
      healthStatus: 'Good Health',
      online: true,
      lastSignal: '',
      badge: 0,
      odometer: 0,
      fuel: 0,
      battery: 0,
      speed: 0,
      coolant: 0,
      brakes: 0,
      tires: 0,
      engineOil: 0,
      isElectric: false,
      hvBatteryCapacityKwh: null,
      leasingRate: '',
      insuranceCost: '',
      taxCost: '',
      totalMonthlyCost: '',
      reservedPickupAt: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(next).not.toBeNull();
    expect(
      isTaskDueBeforeNextBooking(
        task({ dueDate: new Date(Date.now() + 3600000).toISOString() }),
        next,
      ),
    ).toBe(true);
  });

  it('recommends assign when no assignee', () => {
    const rows = [
      {
        id: 't1',
        title: 'A',
        description: '',
        apiStatus: 'OPEN' as const,
        displayStatus: 'open' as const,
        isOverdue: false,
        priority: 'high' as const,
        category: 'Repair',
        assigneeLabel: 'Nicht zugewiesen',
        dueDate: null,
        createdAt: null,
        sourceBadge: 'Manual' as const,
        blockingBadge: 'attention' as const,
        blocksVehicleAvailability: false,
        isDueBeforeNextBooking: false,
        operatorRank: 1,
      },
    ];
    expect(pickNextBestAction(rows)?.kind).toBe('assign');
  });
});
