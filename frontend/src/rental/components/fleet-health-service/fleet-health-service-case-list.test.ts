import { describe, expect, it } from 'vitest';
import type { ApiServiceCase } from '../../../lib/api';
import type { VehicleData } from '../../data/vehicles';
import {
  buildFleetHealthServiceCaseListRows,
  countOpenServiceCaseTasks,
  deriveServiceCaseCostStatus,
  filterServiceCasesByWorkFilter,
  resolveServiceCaseVehicleDisplay,
} from './fleet-health-service-case-list';

function serviceCase(
  overrides: Partial<ApiServiceCase> & Pick<ApiServiceCase, 'id' | 'vehicleId' | 'status'>,
): ApiServiceCase {
  return {
    organizationId: 'org-1',
    vendorId: null,
    title: 'Bremsen prüfen',
    description: '',
    category: 'BRAKES',
    priority: 'HIGH',
    source: 'HEALTH',
    openedAt: '2026-07-19T10:00:00.000Z',
    scheduledAt: '2026-07-21T09:00:00.000Z',
    expectedReadyAt: '2026-07-22T17:00:00.000Z',
    completedAt: null,
    cancelledAt: null,
    estimatedCostCents: 25000,
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
    updatedAt: '2026-07-20T08:00:00.000Z',
    taskCount: 2,
    tasks: [
      {
        id: 't-open',
        title: 'Bremsen',
        status: 'OPEN',
        type: 'BRAKE_CHECK',
        dueDate: null,
      },
      {
        id: 't-done',
        title: 'Diagnose',
        status: 'DONE',
        type: 'VEHICLE_SERVICE',
        dueDate: null,
      },
    ],
    ...overrides,
  };
}

const vehicle = {
  id: 'v1',
  license: 'KS-SD 101',
  make: 'VW',
  model: 'Golf',
  year: 2022,
} as VehicleData;

describe('fleet-health-service-case-list', () => {
  it('resolves license plate and vehicle name without exposing UUIDs', () => {
    const display = resolveServiceCaseVehicleDisplay(vehicle);
    expect(display.licensePlate).toBe('KS-SD 101');
    expect(display.vehicleName).toBe('VW Golf 2022');
    expect(display.vehicleName).not.toContain('v1');
  });

  it('filters cases by work-area status chips', () => {
    const cases = [
      serviceCase({ id: 'sc-open', vehicleId: 'v1', status: 'OPEN' }),
      serviceCase({ id: 'sc-scheduled', vehicleId: 'v1', status: 'SCHEDULED' }),
      serviceCase({
        id: 'sc-blocked',
        vehicleId: 'v2',
        status: 'IN_PROGRESS',
        blocksRental: true,
      }),
      serviceCase({ id: 'sc-done', vehicleId: 'v2', status: 'COMPLETED' }),
    ];

    expect(filterServiceCasesByWorkFilter(cases, 'open')).toHaveLength(1);
    expect(filterServiceCasesByWorkFilter(cases, 'blocks-vehicle')).toHaveLength(1);
    expect(filterServiceCasesByWorkFilter(cases, 'completed')).toHaveLength(1);
  });

  it('builds list rows with partner, costs, open tasks and timestamps', () => {
    const rows = buildFleetHealthServiceCaseListRows({
      serviceCases: [
        serviceCase({
          id: 'sc-1',
          vehicleId: 'v1',
          status: 'SCHEDULED',
          vendorId: 'vendor-1',
          actualCostCents: 19900,
        }),
      ],
      vehicleById: new Map([['v1', vehicle]]),
      vendorById: new Map([['vendor-1', { id: 'vendor-1', name: 'Werkstatt Nord' } as never]]),
      filter: 'scheduled',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.licensePlate).toBe('KS-SD 101');
    expect(rows[0]?.vendorName).toBe('Werkstatt Nord');
    expect(rows[0]?.openTasksCount).toBe(1);
    expect(rows[0]?.costStatusLabel).toBe('Ist erfasst');
    expect(rows[0]?.scheduledAtLabel).toContain('2026');
    expect(rows[0]?.titleLine).toBe('Bremsen prüfen');
  });

  it('derives cost and open-task semantics', () => {
    expect(deriveServiceCaseCostStatus({ estimatedCostCents: 12000, actualCostCents: null }).label).toBe(
      'Geschätzt',
    );
    expect(
      countOpenServiceCaseTasks(
        serviceCase({ id: 'sc-1', vehicleId: 'v1', status: 'OPEN', taskCount: 5, tasks: [] }),
      ),
    ).toBe(5);
  });
});
