import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiServiceCase } from '../../../lib/api';
import {
  buildFleetHealthServiceCaseLayer,
  buildCasesByVehicleId,
  isActiveServiceCase,
  isServiceCaseExpectedReadyOverdue,
  isServiceCaseMissingRequiredPartner,
  isServiceCaseScheduledOverdue,
  isServiceCaseWithoutAppointment,
} from './fleet-health-service-case.view-model';

const NOW = Date.parse('2026-07-20T12:00:00.000Z');

function serviceCase(
  overrides: Partial<ApiServiceCase> & Pick<ApiServiceCase, 'id' | 'vehicleId' | 'status'>,
): ApiServiceCase {
  return {
    organizationId: 'org-1',
    vendorId: null,
    title: 'Servicefall',
    description: '',
    category: 'REPAIR',
    priority: 'NORMAL',
    source: 'MANUAL',
    openedAt: '2026-07-19T10:00:00.000Z',
    scheduledAt: null,
    expectedReadyAt: null,
    completedAt: null,
    cancelledAt: null,
    estimatedCostCents: null,
    actualCostCents: null,
    downtimeStart: null,
    downtimeEnd: null,
    blocksRental: false,
    completionNotes: null,
    documentId: null,
    metadata: null,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: '2026-07-19T10:00:00.000Z',
    updatedAt: '2026-07-19T10:00:00.000Z',
    taskCount: 0,
    tasks: [],
    ...overrides,
  };
}

describe('fleet-health-service-case view model', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('computes status-specific case KPIs without counting terminal cases', () => {
    const layer = buildFleetHealthServiceCaseLayer({
      dataReady: true,
      serviceCases: [
        serviceCase({ id: 'sc-open', vehicleId: 'v1', status: 'OPEN' }),
        serviceCase({ id: 'sc-scheduled', vehicleId: 'v1', status: 'SCHEDULED', scheduledAt: '2026-07-21T10:00:00.000Z' }),
        serviceCase({ id: 'sc-progress', vehicleId: 'v2', status: 'IN_PROGRESS', vendorId: 'vendor-1' }),
        serviceCase({ id: 'sc-wait-vendor', vehicleId: 'v2', status: 'WAITING_VENDOR', vendorId: 'vendor-1' }),
        serviceCase({ id: 'sc-wait-parts', vehicleId: 'v3', status: 'WAITING_PARTS', vendorId: 'vendor-1' }),
        serviceCase({ id: 'sc-done', vehicleId: 'v3', status: 'COMPLETED' }),
        serviceCase({ id: 'sc-cancelled', vehicleId: 'v3', status: 'CANCELLED' }),
      ],
      nowMs: NOW,
    });

    expect(layer.kpis.dataReady).toBe(true);
    expect(layer.kpis.activeCases).toBe(5);
    expect(layer.kpis.openCases).toBe(1);
    expect(layer.kpis.scheduled).toBe(1);
    expect(layer.kpis.inProgress).toBe(1);
    expect(layer.kpis.waitingVendor).toBe(1);
    expect(layer.kpis.waitingParts).toBe(1);
  });

  it('detects scheduled and expected-ready overdue cases', () => {
    const layer = buildFleetHealthServiceCaseLayer({
      dataReady: true,
      serviceCases: [
        serviceCase({
          id: 'sc-overdue-appt',
          vehicleId: 'v1',
          status: 'SCHEDULED',
          scheduledAt: '2026-07-19T08:00:00.000Z',
        }),
        serviceCase({
          id: 'sc-overdue-ready',
          vehicleId: 'v2',
          status: 'IN_PROGRESS',
          vendorId: 'vendor-1',
          expectedReadyAt: '2026-07-19T18:00:00.000Z',
        }),
      ],
      nowMs: NOW,
    });

    expect(layer.kpis.overdue).toBe(1);
    expect(layer.kpis.expectedReadyOverdue).toBe(1);
    expect(layer.groups.overdueCases.map((row) => row.id)).toEqual(['sc-overdue-appt']);
    expect(layer.groups.expectedReadyOverdueCases.map((row) => row.id)).toEqual(['sc-overdue-ready']);
  });

  it('tracks rental-blocking cases, missing appointments, and required partners separately', () => {
    const layer = buildFleetHealthServiceCaseLayer({
      dataReady: true,
      serviceCases: [
        serviceCase({ id: 'sc-block', vehicleId: 'v1', status: 'OPEN', blocksRental: true }),
        serviceCase({ id: 'sc-no-appt', vehicleId: 'v1', status: 'OPEN' }),
        serviceCase({
          id: 'sc-no-partner',
          vehicleId: 'v2',
          status: 'IN_PROGRESS',
          vendorId: null,
        }),
        serviceCase({
          id: 'sc-with-partner',
          vehicleId: 'v2',
          status: 'IN_PROGRESS',
          vendorId: 'vendor-1',
        }),
      ],
      nowMs: NOW,
    });

    expect(layer.kpis.rentalBlockingCases).toBe(1);
    expect(layer.kpis.withoutAppointment).toBe(4);
    expect(layer.kpis.withoutRequiredPartner).toBe(1);
  });

  it('groups active cases per vehicle without mixing vehicles', () => {
    const casesByVehicle = buildCasesByVehicleId([
      serviceCase({ id: 'sc-1', vehicleId: 'v1', status: 'OPEN' }),
      serviceCase({ id: 'sc-2', vehicleId: 'v1', status: 'SCHEDULED' }),
      serviceCase({ id: 'sc-3', vehicleId: 'v2', status: 'OPEN' }),
      serviceCase({ id: 'sc-done', vehicleId: 'v2', status: 'COMPLETED' }),
    ]);

    expect(casesByVehicle.get('v1')).toHaveLength(2);
    expect(casesByVehicle.get('v2')).toHaveLength(1);
    expect(casesByVehicle.get('v2')?.[0]?.id).toBe('sc-3');
  });

  it('returns unknown KPI values when service cases are not ready', () => {
    const layer = buildFleetHealthServiceCaseLayer({
      dataReady: false,
      serviceCases: [serviceCase({ id: 'sc-1', vehicleId: 'v1', status: 'OPEN' })],
    });

    expect(layer.kpis.dataReady).toBe(false);
    expect(layer.kpis.activeCases).toBeNull();
    expect(layer.kpis.openCases).toBeNull();
    expect(layer.kpis.overdue).toBeNull();
    expect(layer.groups.activeCases).toEqual([]);
    expect(layer.casesByVehicleId.size).toBe(0);
  });

  it('classifies helper predicates for active, overdue, and partner requirements', () => {
    const active = serviceCase({ id: 'sc-1', vehicleId: 'v1', status: 'OPEN' });
    const completed = serviceCase({ id: 'sc-2', vehicleId: 'v1', status: 'COMPLETED' });

    expect(isActiveServiceCase(active)).toBe(true);
    expect(isActiveServiceCase(completed)).toBe(false);
    expect(
      isServiceCaseScheduledOverdue(
        serviceCase({
          id: 'sc-3',
          vehicleId: 'v1',
          status: 'SCHEDULED',
          scheduledAt: '2026-07-19T08:00:00.000Z',
        }),
        NOW,
      ),
    ).toBe(true);
    expect(
      isServiceCaseExpectedReadyOverdue(
        serviceCase({
          id: 'sc-4',
          vehicleId: 'v1',
          status: 'IN_PROGRESS',
          expectedReadyAt: '2026-07-19T08:00:00.000Z',
        }),
        NOW,
      ),
    ).toBe(true);
    expect(isServiceCaseWithoutAppointment(active)).toBe(true);
    expect(
      isServiceCaseMissingRequiredPartner(
        serviceCase({ id: 'sc-5', vehicleId: 'v1', status: 'WAITING_VENDOR', vendorId: null }),
      ),
    ).toBe(true);
    expect(
      isServiceCaseMissingRequiredPartner(
        serviceCase({ id: 'sc-6', vehicleId: 'v1', status: 'OPEN', vendorId: null }),
      ),
    ).toBe(false);
  });
});
