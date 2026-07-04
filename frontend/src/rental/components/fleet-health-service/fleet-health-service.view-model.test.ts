import { describe, expect, it } from 'vitest';
import type { ApiTask, RentalHealthModule, RentalHealthState, VehicleHealthResponse } from '../../../lib/api';
import type { VehicleData } from '../../data/vehicles';
import {
  buildFleetHealthServiceUiItem,
  buildFleetHealthServiceViewModel,
  countOverdueServiceTasks,
  countVendorWaitingTasks,
  deriveRecommendedAction,
  matchOpenTaskForHealthSignal,
} from './fleet-health-service.view-model';

type ModuleKey = keyof VehicleHealthResponse['modules'];

function mod(
  state: RentalHealthState,
  reason: string,
  extra: Partial<RentalHealthModule> = {},
): RentalHealthModule {
  return {
    state,
    reason,
    last_updated_at: extra.last_updated_at ?? '2026-06-22T00:00:00.000Z',
    data_stale: extra.data_stale ?? false,
    ...extra,
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

describe('fleet-health-service view model', () => {
  it('critical health without task → create_task', () => {
    const health = buildHealth({
      overall_state: 'critical',
      modules: { brakes: mod('critical', 'Bremsen kritisch') },
    });
    const item = buildFleetHealthServiceUiItem(vehicle('v1', 'B-XY 1'), health, []);
    expect(item.recommendedAction).toBe('create_task');
    expect(item.existingTaskId).toBeNull();
  });

  it('critical health with matching open task → open_task', () => {
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
    expect(item.recommendedAction).toBe('open_task');
    expect(item.existingTaskId).toBe('t1');
  });

  it('healthy vehicle → no_action', () => {
    const health = buildHealth({ overall_state: 'good' });
    const item = buildFleetHealthServiceUiItem(vehicle('v1', 'B-XY 1'), health, []);
    expect(item.recommendedAction).toBe('no_action');
    expect(deriveRecommendedAction(health, null)).toBe('no_action');
  });

  it('limited data → review_vehicle', () => {
    const health = buildHealth({ overall_state: 'unknown' });
    const item = buildFleetHealthServiceUiItem(vehicle('v1', 'B-XY 1'), health, []);
    expect(item.recommendedAction).toBe('review_vehicle');
  });

  it('overdue task count is correct', () => {
    const tasks = [
      task({ id: 't1', vehicleId: 'v1', status: 'OPEN', isOverdue: true }),
      task({ id: 't2', vehicleId: 'v2', status: 'DONE', isOverdue: true }),
      task({ id: 't3', vehicleId: 'v3', status: 'IN_PROGRESS', isOverdue: false }),
    ];
    expect(countOverdueServiceTasks(tasks)).toBe(1);
  });

  it('vendor waiting task count is correct', () => {
    const tasks = [
      task({ id: 't1', vehicleId: 'v1', status: 'WAITING', vendorId: 'vendor-1' }),
      task({ id: 't2', vehicleId: 'v2', status: 'WAITING', vendorId: null }),
      task({ id: 't3', vehicleId: 'v3', status: 'OPEN', vendorId: 'vendor-2' }),
    ];
    expect(countVendorWaitingTasks(tasks)).toBe(1);
  });

  it('does not double-count overdue when health already links open task', () => {
    const health = buildHealth({
      vehicle_id: 'v1',
      overall_state: 'critical',
      modules: { service_compliance: mod('critical', 'TÜV überfällig') },
    });
    const openTasks = [
      task({
        id: 't-overdue',
        vehicleId: 'v1',
        type: 'VEHICLE_INSPECTION',
        status: 'OPEN',
        isOverdue: true,
        metadata: { healthModule: 'service_compliance' },
        sourceType: 'HEALTH',
      }),
    ];
    const vm = buildFleetHealthServiceViewModel({
      vehicles: [vehicle('v1', 'B-XY 1')],
      healthMap: new Map([['v1', health]]),
      healthLoading: false,
      taskSummary: null,
      taskList: openTasks,
      vendors: [],
      serviceLoading: false,
      serviceError: null,
      serviceLoaded: true,
    });

    expect(vm.uiItems[0]?.recommendedAction).toBe('open_task');
    expect(vm.overviewCounts.vehiclesWithLinkedHealthTask).toBe(1);
    expect(vm.overviewCounts.overdueExecutionOnlyTasks).toBe(0);
    expect(vm.executionGroups.overdueServiceTasks).toHaveLength(1);
  });

  it('matchOpenTaskForHealthSignal returns null when vehicleId differs', () => {
    const health = buildHealth({
      modules: { tires: mod('warning', 'Reifen prüfen') },
    });
    const openTasks = [
      task({ id: 't1', vehicleId: 'other', type: 'TIRE_CHECK', status: 'OPEN' }),
    ];
    expect(matchOpenTaskForHealthSignal(openTasks, 'v1', health)).toBeNull();
  });

  it('prioritized overview rows dedupe health + linked overdue task', () => {
    const health = buildHealth({
      vehicle_id: 'v1',
      overall_state: 'critical',
      modules: { brakes: mod('critical', 'Bremsen kritisch') },
    });
    const openTasks = [
      task({
        id: 't1',
        vehicleId: 'v1',
        type: 'BRAKE_CHECK',
        status: 'OPEN',
        isOverdue: true,
        metadata: { healthModule: 'brakes' },
        sourceType: 'HEALTH',
      }),
    ];
    const vm = buildFleetHealthServiceViewModel({
      vehicles: [vehicle('v1', 'B-XY 1')],
      healthMap: new Map([['v1', health]]),
      healthLoading: false,
      taskSummary: null,
      taskList: openTasks,
      vendors: [],
      serviceLoading: false,
      serviceError: null,
      serviceLoaded: true,
    });

    expect(vm.prioritizedOverviewRows).toHaveLength(1);
    expect(vm.prioritizedOverviewRows[0]?.kind).toBe('health');
    expect(vm.prioritizedOverviewRows[0]?.recommendedAction).toBe('open_task');
  });

  it('prioritized overview adds execution-only overdue when no health row', () => {
    const openTasks = [
      task({
        id: 't-only',
        vehicleId: 'v2',
        status: 'OPEN',
        isOverdue: true,
        title: 'Ölwechsel',
      }),
    ];
    const vm = buildFleetHealthServiceViewModel({
      vehicles: [vehicle('v1', 'B-XY 1'), vehicle('v2', 'B-AB 2')],
      healthMap: new Map([
        ['v1', buildHealth({ vehicle_id: 'v1', overall_state: 'good' })],
        ['v2', buildHealth({ vehicle_id: 'v2', overall_state: 'good' })],
      ]),
      healthLoading: false,
      taskSummary: null,
      taskList: openTasks,
      vendors: [],
      serviceLoading: false,
      serviceError: null,
      serviceLoaded: true,
    });

    const taskRows = vm.prioritizedOverviewRows.filter((r) => r.kind === 'task');
    expect(taskRows).toHaveLength(1);
    expect(taskRows[0]?.taskId).toBe('t-only');
  });
});
