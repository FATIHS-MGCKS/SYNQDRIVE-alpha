import { describe, expect, it } from 'vitest';
import type { ApiTask } from '../../lib/api';
import { buildOperatorTodayTaskEntries } from './operatorTodayTasks';

function task(partial: Partial<ApiTask> & Pick<ApiTask, 'id' | 'title' | 'type'>): ApiTask {
  return {
    organizationId: 'org',
    description: '',
    category: 'Booking',
    status: 'OPEN',
    priority: 'NORMAL',
    source: null,
    sourceType: 'BOOKING',
    dedupKey: null,
    vehicleId: 'v1',
    bookingId: 'b1',
    customerId: null,
    vendorId: null,
    alertId: null,
    documentId: null,
    fineId: null,
    invoiceId: null,
    serviceCaseId: null,
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
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
    ...partial,
  };
}

describe('buildOperatorTodayTaskEntries', () => {
  it('groups booking lifecycle triplets by bookingId', () => {
    const entries = buildOperatorTodayTaskEntries([
      task({ id: '1', title: 'Buchung vorbereiten', type: 'BOOKING_PREPARATION', bookingId: 'b1' }),
      task({ id: '2', title: 'Fahrzeug reinigen', type: 'VEHICLE_CLEANING', bookingId: 'b1' }),
      task({ id: '3', title: 'Buchungsdokumente prüfen', type: 'DOCUMENT_REVIEW', bookingId: 'b1' }),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('booking-group');
    if (entries[0]?.kind === 'booking-group') {
      expect(entries[0].tasks).toHaveLength(3);
    }
  });

  it('keeps standalone tasks separate', () => {
    const entries = buildOperatorTodayTaskEntries([
      task({ id: '1', title: 'Reifen prüfen', type: 'TIRE_CHECK', bookingId: null }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('task');
  });
});
