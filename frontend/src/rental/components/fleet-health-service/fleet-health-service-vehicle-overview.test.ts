import { describe, expect, it } from 'vitest';
import type { ApiServiceCase, ApiTask, RentalHealthModule, RentalHealthState, VehicleHealthResponse } from '../../../lib/api';
import type { VehicleData } from '../../data/vehicles';
import { buildFleetHealthServiceUiItem } from './fleet-health-service.view-model';
import {
  buildVehicleOverviewRow,
  buildVehicleOverviewSections,
  isOpenServiceCase,
} from './fleet-health-service-vehicle-overview';

type ModuleKey = keyof VehicleHealthResponse['modules'];

function mod(
  state: RentalHealthState,
  reason: string,
): RentalHealthModule {
  return {
    state,
    reason,
    last_updated_at: '2026-06-22T00:00:00.000Z',
    data_stale: false,
  };
}

function buildHealth(
  overrides: Partial<{
    vehicle_id: string;
    overall_state: RentalHealthState;
    rental_blocked: boolean;
    blocking_reasons: string[];
    modules: Partial<Record<ModuleKey, RentalHealthModule>>;
  }> = {},
): VehicleHealthResponse {
  const baseModules: Record<ModuleKey, RentalHealthModule> = {
    battery: mod('good', 'Batterie OK'),
    tires: mod('good', 'Reifen OK'),
    brakes: mod('good', 'Bremsen OK'),
    error_codes: mod('good', 'Keine aktiven Fehler'),
    service_compliance: mod('good', 'Service aktuell'),
    complaints: mod('good', 'Keine Beschwerden'),
    vehicle_alerts: mod('good', 'Keine Hinweise'),
  };
  return {
    vehicle_id: overrides.vehicle_id ?? 'v1',
    organization_id: 'org1',
    overall_state: overrides.overall_state ?? 'good',
    rental_blocked: overrides.rental_blocked ?? false,
    blocking_reasons: overrides.blocking_reasons ?? [],
    modules: { ...baseModules, ...(overrides.modules ?? {}) },
    generated_at: '2026-06-22T00:00:00.000Z',
  };
}

function vehicle(id: string, license: string): VehicleData {
  return {
    id,
    license,
    model: 'Golf',
    make: 'VW',
    year: 2022,
    station: 'Zentrale',
    fuelType: 'Petrol',
    status: 'Available',
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: true,
    lastSignal: 'now',
    badge: 0,
    odometer: 10000,
    fuel: 80,
    alert: false,
  };
}

function task(
  overrides: Partial<ApiTask> & Pick<ApiTask, 'id' | 'vehicleId'>,
): ApiTask {
  return {
    organizationId: 'org1',
    title: 'Service',
    description: '',
    category: 'Service',
    type: 'VEHICLE_SERVICE',
    status: 'OPEN',
    priority: 'NORMAL',
    source: null,
    sourceType: 'MANUAL',
    dedupKey: null,
    bookingId: null,
    customerId: null,
    vendorId: null,
    assignedUserId: null,
    dueDate: null,
    blocksVehicleAvailability: false,
    serviceCaseId: null,
    metadata: null,
    ...overrides,
  };
}

function serviceCase(
  overrides: Partial<ApiServiceCase> & Pick<ApiServiceCase, 'id' | 'vehicleId'>,
): ApiServiceCase {
  return {
    organizationId: 'org1',
    title: 'Werkstattfall',
    description: '',
    category: 'REPAIR',
    status: 'OPEN',
    priority: 'NORMAL',
    source: 'HEALTH',
    vendorId: null,
    openedAt: '2026-06-22T00:00:00.000Z',
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
    createdAt: '2026-06-22T00:00:00.000Z',
    updatedAt: '2026-06-22T00:00:00.000Z',
    taskCount: 0,
    tasks: [],
    ...overrides,
  };
}

describe('fleet-health-service vehicle overview', () => {
  it('isOpenServiceCase includes active workflow statuses only', () => {
    expect(isOpenServiceCase(serviceCase({ id: 'c1', vehicleId: 'v1', status: 'OPEN' }))).toBe(true);
    expect(isOpenServiceCase(serviceCase({ id: 'c1', vehicleId: 'v1', status: 'COMPLETED' }))).toBe(
      false,
    );
  });

  it('aggregates multiple independent health findings per vehicle', () => {
    const health = buildHealth({
      overall_state: 'critical',
      modules: {
        brakes: mod('critical', 'Bremsen kritisch'),
        tires: mod('warning', 'Reifen prüfen'),
      },
    });
    const item = buildFleetHealthServiceUiItem(vehicle('v1', 'B-XY 1'), health, []);
    const row = buildVehicleOverviewRow(item, health, [], []);

    expect(row?.findings).toHaveLength(2);
    expect(row?.additionalFindingsCount).toBe(1);
    expect(row?.moreCount).toBeGreaterThanOrEqual(1);
  });

  it('keeps execution-only overdue work visible on healthy vehicles', () => {
    const health = buildHealth({ vehicle_id: 'v2', overall_state: 'good' });
    const openTasks = [
      task({
        id: 't-only',
        vehicleId: 'v2',
        status: 'OPEN',
        isOverdue: true,
        title: 'Ölwechsel',
      }),
    ];
    const item = buildFleetHealthServiceUiItem(vehicle('v2', 'B-AB 2'), health, openTasks);
    const row = buildVehicleOverviewRow(item, health, openTasks, []);

    expect(row).not.toBeNull();
    expect(row?.section).toBe('handle_today');
    expect(row?.findings).toHaveLength(0);
    expect(row?.unmatchedTasks).toHaveLength(1);
    expect(row?.unmatchedTasks[0]?.id).toBe('t-only');
  });

  it('does not duplicate exactly linked health tasks in unmatched work', () => {
    const health = buildHealth({
      overall_state: 'critical',
      modules: { brakes: mod('critical', 'Bremsen kritisch') },
    });
    const openTasks = [
      task({
        id: 't1',
        vehicleId: 'v1',
        type: 'BRAKE_CHECK',
        status: 'OPEN',
        metadata: { healthModule: 'brakes' },
        sourceType: 'HEALTH',
      }),
    ];
    const item = buildFleetHealthServiceUiItem(vehicle('v1', 'B-XY 1'), health, openTasks);
    const row = buildVehicleOverviewRow(item, health, openTasks, []);

    expect(row?.findings[0]?.linkedTaskId).toBe('t1');
    expect(row?.unmatchedTasks).toHaveLength(0);
    expect(row?.matchedTasks.some((entry) => entry.id === 't1')).toBe(false);
  });

  it('matches service case tasks via case refs even without serviceCaseId on task', () => {
    const health = buildHealth({ overall_state: 'good' });
    const openTasks = [
      task({
        id: 't-case',
        vehicleId: 'v1',
        title: 'Bremsen prüfen',
        status: 'OPEN',
      }),
    ];
    const openCases = [
      serviceCase({
        id: 'c1',
        vehicleId: 'v1',
        tasks: [{ id: 't-case', title: 'Bremsen prüfen', status: 'OPEN', type: 'BRAKE_CHECK', dueDate: null }],
      }),
    ];
    const item = buildFleetHealthServiceUiItem(vehicle('v1', 'B-XY 1'), health, openTasks);
    const row = buildVehicleOverviewRow(item, health, openTasks, openCases);

    expect(row?.cases).toHaveLength(1);
    expect(row?.cases[0]?.linkedTaskIds).toEqual(['t-case']);
    expect(row?.unmatchedTasks).toHaveLength(0);
    expect(row?.matchedTasks.map((entry) => entry.id)).toEqual(['t-case']);
  });

  it('buildVehicleOverviewSections emits one row per vehicle without covered dedupe', () => {
    const healthV1 = buildHealth({
      vehicle_id: 'v1',
      overall_state: 'critical',
      modules: { brakes: mod('critical', 'Bremsen kritisch') },
    });
    const healthV2 = buildHealth({ vehicle_id: 'v2', overall_state: 'good' });
    const openTasks = [
      task({
        id: 't2',
        vehicleId: 'v2',
        status: 'OPEN',
        isOverdue: true,
        title: 'Ölwechsel',
      }),
    ];
    const items = [
      buildFleetHealthServiceUiItem(vehicle('v1', 'B-XY 1'), healthV1, openTasks),
      buildFleetHealthServiceUiItem(vehicle('v2', 'B-AB 2'), healthV2, openTasks),
    ];
    const sections = buildVehicleOverviewSections(
      items,
      new Map([
        ['v1', healthV1],
        ['v2', healthV2],
      ]),
      openTasks,
      [],
    );

    const rowCount = sections.reduce((sum, section) => sum + section.rows.length, 0);
    expect(rowCount).toBe(2);
  });
});
