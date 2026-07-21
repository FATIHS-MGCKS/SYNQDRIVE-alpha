import { describe, expect, it } from 'vitest';
import type { ApiServiceCase, ApiTask, RentalHealthModule, RentalHealthState, VehicleHealthResponse } from '../../../lib/api';
import type { VehicleData } from '../../data/vehicles';
import { buildVehicleRuntimeStates } from '../../components/dashboard/runtime/vehicleRuntimeStateBuilder';
import {
  buildFleetHealthServiceViewModel,
  buildFleetHealthServiceUiItem,
  countVendorWaitingTasks,
} from './fleet-health-service.view-model';
import { getBlockingServiceCaseVehicleIds } from './fleet-health-service-vehicle-overview';

type ModuleKey = keyof VehicleHealthResponse['modules'];

function mod(state: RentalHealthState, reason: string): RentalHealthModule {
  return {
    state,
    reason,
    last_updated_at: '2026-07-20T12:00:00.000Z',
    data_stale: false,
  };
}

function buildHealth(
  overrides: Partial<{
    vehicle_id: string;
    overall_state: RentalHealthState;
    availability?: VehicleHealthResponse['availability'];
    rental_blocked: boolean | null;
    blocking_reasons: string[];
    modules: Partial<Record<ModuleKey, RentalHealthModule>>;
  }> = {},
): VehicleHealthResponse {
  const baseModules: Record<ModuleKey, RentalHealthModule> = {
    battery: mod('good', 'OK'),
    tires: mod('good', 'OK'),
    brakes: mod('good', 'OK'),
    error_codes: mod('good', 'OK'),
    service_compliance: mod('good', 'OK'),
    complaints: mod('good', 'OK'),
    vehicle_alerts: mod('good', 'OK'),
  };
  return {
    vehicle_id: overrides.vehicle_id ?? 'v1',
    organization_id: 'org-fhs-a',
    overall_state: overrides.overall_state ?? 'good',
    availability:
      overrides.availability ??
      (overrides.overall_state === 'unknown' ? 'unavailable' : 'ready'),
    rental_blocked: overrides.rental_blocked ?? false,
    blocking_reasons: overrides.blocking_reasons ?? [],
    modules: { ...baseModules, ...(overrides.modules ?? {}) },
    generated_at: '2026-07-20T12:00:00.000Z',
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

function serviceCase(
  overrides: Partial<ApiServiceCase> & Pick<ApiServiceCase, 'id' | 'vehicleId'>,
): ApiServiceCase {
  return {
    organizationId: 'org-fhs-a',
    title: 'Service Case',
    description: '',
    category: 'SERVICE',
    status: 'OPEN',
    priority: 'NORMAL',
    source: 'MANUAL',
    openedAt: '2026-07-20T12:00:00.000Z',
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
    createdAt: '2026-07-20T12:00:00.000Z',
    updatedAt: '2026-07-20T12:00:00.000Z',
    taskCount: 0,
    tasks: [],
    comments: [],
    attachments: [],
    vendorId: null,
    ...overrides,
  };
}

function task(overrides: Partial<ApiTask> & Pick<ApiTask, 'id' | 'vehicleId'>): ApiTask {
  return {
    organizationId: 'org-fhs-a',
    title: 'Task',
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

describe('Fleet Health Service domain integration (read model)', () => {
  it('maps rental_blocked health into runtime renting block', () => {
    const healthMap = new Map([
      [
        'v-blocked',
        buildHealth({
          vehicle_id: 'v-blocked',
          overall_state: 'critical',
          rental_blocked: true,
          blocking_reasons: ['TÜV abgelaufen'],
        }),
      ],
      ['v-open', buildHealth({ vehicle_id: 'v-open' })],
    ]);

    const runtime = buildVehicleRuntimeStates({
      fleetVehicles: [vehicle('v-blocked', 'M-A 1'), vehicle('v-open', 'M-B 2')],
      healthMap,
      now: new Date('2026-07-20T12:00:00.000Z'),
    });

    const blocked = runtime.find((row) => row.vehicleId === 'v-blocked');
    const open = runtime.find((row) => row.vehicleId === 'v-open');
    expect(blocked?.isReadyToRent).toBe(false);
    expect(blocked?.isBlocked).toBe(true);
    expect(open?.isReadyToRent).toBe(true);
  });

  it('maps blocksRental service cases into blocking vehicle ids for FHS filters', () => {
    const cases = [
      serviceCase({ id: 'c1', vehicleId: 'v-blocked', blocksRental: true, status: 'OPEN' }),
      serviceCase({ id: 'c2', vehicleId: 'v-open', blocksRental: false, status: 'OPEN' }),
    ];
    expect(getBlockingServiceCaseVehicleIds(cases)).toEqual(new Set(['v-blocked']));
  });

  it('keeps case DONE while health finding remains visible in overview', () => {
    const health = buildHealth({
      vehicle_id: 'v1',
      overall_state: 'warning',
      modules: { complaints: mod('warning', 'Aktive Meldung') },
    });
    const cases = [
      serviceCase({ id: 'c-done', vehicleId: 'v1', status: 'COMPLETED', blocksRental: false }),
    ];
    const vm = buildFleetHealthServiceViewModel({
      vehicles: [vehicle('v1', 'M-XY 1')],
      healthMap: new Map([['v1', health]]),
      healthLoading: false,
      taskSummary: null,
      taskList: [],
      vendors: [],
      serviceLoading: false,
      serviceError: null,
      serviceLoaded: true,
      serviceCases: cases,
    });

    expect(vm.serviceCases[0]?.status).toBe('COMPLETED');
    expect(vm.healthGroups.vehiclesNeedingReview.some((row) => row.vehicleId === 'v1')).toBe(true);
  });

  it('surfaces per-vehicle health failure without blocking the whole fleet view model', () => {
    const healthMap = new Map([
      ['v-partial', buildHealth({ vehicle_id: 'v-partial', overall_state: 'unknown' })],
      ['v-ok', buildHealth({ vehicle_id: 'v-ok' })],
    ]);

    const vm = buildFleetHealthServiceViewModel({
      vehicles: [vehicle('v-partial', 'M-P 1'), vehicle('v-ok', 'M-O 2')],
      healthMap,
      healthLoading: false,
      taskSummary: null,
      taskList: [],
      vendors: [],
      serviceLoading: false,
      serviceError: null,
      serviceLoaded: true,
      serviceCases: [],
    });

    expect(vm.healthGroups.limitedDataVehicles.map((row) => row.vehicleId)).toEqual(['v-partial']);
    expect(vm.healthGroups.healthyVehicles.map((row) => row.vehicleId)).toEqual(['v-ok']);
  });

  it('matches case-linked tasks and vendor-waiting execution signals', () => {
    const health = buildHealth({
      vehicle_id: 'v1',
      overall_state: 'critical',
      modules: { brakes: mod('critical', 'Bremsen kritisch') },
    });
    const cases = [
      serviceCase({
        id: 'c1',
        vehicleId: 'v1',
        status: 'WAITING_VENDOR',
        vendorId: 'vendor-1',
        scheduledAt: '2026-07-25T08:00:00.000Z',
        expectedReadyAt: '2026-07-26T16:00:00.000Z',
        tasks: [{ id: 't1', title: 'Teil bestellen', status: 'WAITING', type: 'VEHICLE_SERVICE', dueDate: null }],
      }),
    ];
    const openTasks = [
      task({
        id: 't1',
        vehicleId: 'v1',
        status: 'WAITING',
        vendorId: 'vendor-1',
        serviceCaseId: 'c1',
        type: 'BRAKE_CHECK',
        sourceType: 'HEALTH',
        metadata: { healthModule: 'brakes' },
      }),
      task({ id: 't2', vehicleId: 'v1', status: 'OPEN', serviceCaseId: 'c1' }),
    ];

    const item = buildFleetHealthServiceUiItem(vehicle('v1', 'M-XY 1'), health, openTasks);
    const vm = buildFleetHealthServiceViewModel({
      vehicles: [vehicle('v1', 'M-XY 1')],
      healthMap: new Map([['v1', health]]),
      healthLoading: false,
      taskSummary: null,
      taskList: openTasks,
      vendors: [{ id: 'vendor-1', name: 'Werkstatt', category: 'WORKSHOP', isActive: true } as never],
      serviceLoading: false,
      serviceError: null,
      serviceLoaded: true,
      serviceCases: cases,
    });

    expect(item.existingTaskId).toBe('t1');
    expect(countVendorWaitingTasks(openTasks)).toBe(1);
    expect(vm.executionGroups.vendorWaitingTasks).toHaveLength(1);
    expect(vm.serviceCases[0]?.scheduledAt).toBe('2026-07-25T08:00:00.000Z');
    expect(vm.serviceCases[0]?.expectedReadyAt).toBe('2026-07-26T16:00:00.000Z');
  });

  it('ignores cross-tenant service cases when building blocking vehicle ids', () => {
    const cases = [
      serviceCase({ id: 'c-local', vehicleId: 'v1', organizationId: 'org-fhs-a', blocksRental: true }),
      serviceCase({ id: 'c-foreign', vehicleId: 'v9', organizationId: 'org-fhs-b', blocksRental: true }),
    ];

    const blocking = getBlockingServiceCaseVehicleIds(cases.filter((row) => row.organizationId === 'org-fhs-a'));
    expect([...blocking]).toEqual(['v1']);
  });
});
