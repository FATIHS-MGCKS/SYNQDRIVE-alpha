import { describe, expect, it } from 'vitest';
import type { ApiTask, RentalHealthModule, RentalHealthState, VehicleHealthResponse } from '../../../lib/api';
import type { VehicleData } from '../../data/vehicles';
import {
  buildFleetHealthServiceUiItem,
  buildFleetHealthServiceViewModel,
  buildPrioritizedOverviewSections,
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
    rental_blocked: boolean | null;
    availability: VehicleHealthResponse['availability'];
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
    availability: overrides.availability ?? 'ready',
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

function getVehicleOverviewRow(
  sections: ReturnType<typeof buildFleetHealthServiceViewModel>['prioritizedOverviewSections'],
  vehicleId: string,
) {
  for (const section of sections) {
    const row = section.rows.find((entry) => entry.vehicleId === vehicleId);
    if (row) return row;
  }
  return undefined;
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

  it('pipeline-degraded health → review_vehicle, not create_task', () => {
    const health = buildHealth({
      overall_state: 'critical',
      availability: 'unavailable',
      rental_blocked: null,
    });
    const item = buildFleetHealthServiceUiItem(vehicle('v1', 'B-XY 1'), health, []);
    expect(item.recommendedAction).toBe('review_vehicle');
    expect(item.rentalBlocked).toBe(false);
    expect(item.primaryReason).toBe('Technical status not fully available');
  });

  it('does not match rental-block task when gate is unverified', () => {
    const health = buildHealth({
      rental_blocked: null,
      availability: 'partial',
      blocking_reasons: ['Should not match'],
    });
    const openTasks = [
      task({
        id: 't1',
        vehicleId: 'v1',
        status: 'OPEN',
        blocksVehicleAvailability: true,
      }),
    ];
    expect(matchOpenTaskForHealthSignal(openTasks, 'v1', health)).toBeNull();
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
    const vehicleRow = getVehicleOverviewRow(vm.prioritizedOverviewSections, 'v1');
    expect(vehicleRow?.findings).toHaveLength(1);
    expect(vehicleRow?.unmatchedTasks).toHaveLength(0);
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

    const vehicleRow = getVehicleOverviewRow(vm.prioritizedOverviewSections, 'v2');
    expect(vehicleRow?.section).toBe('handle_today');
    expect(vehicleRow?.openTaskCount).toBe(1);
    expect(vehicleRow?.unmatchedTasks[0]?.id).toBe('t-only');
  });

  it('priority sections place rental_blocked health in technically_blocked', () => {
    const health = buildHealth({
      vehicle_id: 'v1',
      rental_blocked: true,
      blocking_reasons: ['TÜV überfällig'],
      overall_state: 'critical',
      modules: { service_compliance: mod('critical', 'TÜV überfällig') },
    });
    const vm = buildFleetHealthServiceViewModel({
      vehicles: [vehicle('v1', 'B-XY 1')],
      healthMap: new Map([['v1', health]]),
      healthLoading: false,
      taskSummary: null,
      taskList: [],
      vendors: [],
      serviceLoading: false,
      serviceError: null,
      serviceLoaded: true,
    });

    const blocked = vm.prioritizedOverviewSections.find((s) => s.key === 'technically_blocked');
    expect(blocked?.rows).toHaveLength(1);
    expect(blocked?.rows[0]?.vehicleId).toBe('v1');
    expect(blocked?.rows[0]?.primaryBlockage).toContain('TÜV überfällig');
    expect(blocked?.rows[0]?.findings.length).toBeGreaterThan(0);
  });

  it('priority sections place warning health in technical_review', () => {
    const health = buildHealth({
      vehicle_id: 'v1',
      overall_state: 'warning',
      modules: { tires: mod('warning', 'Reifen prüfen') },
    });
    const vm = buildFleetHealthServiceViewModel({
      vehicles: [vehicle('v1', 'B-XY 1')],
      healthMap: new Map([['v1', health]]),
      healthLoading: false,
      taskSummary: null,
      taskList: [],
      vendors: [],
      serviceLoading: false,
      serviceError: null,
      serviceLoaded: true,
    });

    const review = vm.prioritizedOverviewSections.find((s) => s.key === 'technical_review');
    expect(review?.rows).toHaveLength(1);
    expect(review?.rows[0]?.recommendedAction).toBe('create_task');
  });

  it('priority sections place unknown health in incomplete_data', () => {
    const health = buildHealth({ vehicle_id: 'v1', overall_state: 'unknown' });
    const vm = buildFleetHealthServiceViewModel({
      vehicles: [vehicle('v1', 'B-XY 1')],
      healthMap: new Map([['v1', health]]),
      healthLoading: false,
      taskSummary: null,
      taskList: [],
      vendors: [],
      serviceLoading: false,
      serviceError: null,
      serviceLoaded: true,
    });

    const incomplete = vm.prioritizedOverviewSections.find((s) => s.key === 'incomplete_data');
    expect(incomplete?.rows).toHaveLength(1);
    expect(incomplete?.rows[0]?.recommendedAction).toBe('review_vehicle');
  });

  it('priority sections place due-soon tasks in due_soon', () => {
    const dueSoon = new Date();
    dueSoon.setDate(dueSoon.getDate() + 3);
    const openTasks = [
      task({
        id: 't-soon',
        vehicleId: 'v2',
        status: 'OPEN',
        dueDate: dueSoon.toISOString(),
        title: 'Ölwechsel planen',
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

    const dueSoonSection = vm.prioritizedOverviewSections.find((s) => s.key === 'due_soon');
    expect(dueSoonSection?.rows).toHaveLength(1);
    expect(dueSoonSection?.rows[0]?.vehicleId).toBe('v2');
    expect(dueSoonSection?.rows[0]?.openTaskCount).toBe(1);
  });

  it('buildPrioritizedOverviewSections returns five sections in order', () => {
    const sections = buildPrioritizedOverviewSections(
      [],
      {
        openServiceTasks: [],
        overdueServiceTasks: [],
        dueTodayServiceTasks: [],
        inProgressServiceTasks: [],
        vendorWaitingTasks: [],
        upcomingServiceItems: [],
        completedServiceItems: [],
        activeVendors: [],
      },
      new Map(),
      new Map(),
      [],
    );
    expect(sections).toHaveLength(5);
    expect(sections.map((s) => s.key)).toEqual([
      'technically_blocked',
      'handle_today',
      'technical_review',
      'incomplete_data',
      'due_soon',
    ]);
  });
});
