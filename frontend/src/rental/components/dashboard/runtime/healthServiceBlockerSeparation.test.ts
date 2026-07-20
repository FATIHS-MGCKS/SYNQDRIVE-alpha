import { describe, expect, it } from 'vitest';
import type { ApiServiceCase, ApiTask, VehicleHealthResponse } from '../../../../lib/api';
import type { VehicleData } from '../../../data/vehicles';
import {
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
} from '../../../lib/vehicle-operational-state';
import { buildVehicleRuntimeStates } from './vehicleRuntimeStateBuilder';
import {
  SERVICE_CASE_RUNTIME_REASON_CODE,
} from './serviceCaseRuntimeReasons';
import { TASK_RUNTIME_REASON_CODE } from './taskRuntimeReasons';

const NOW = new Date('2026-07-15T12:00:00.000Z');
const VEHICLE_ID = 'v1';

function operationalVehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: overrides.id ?? VEHICLE_ID,
    license: overrides.license ?? 'M-AB 123',
    make: overrides.make ?? 'VW',
    model: overrides.model ?? 'Golf',
    year: overrides.year ?? 2024,
    station: overrides.station ?? 'Berlin',
    stationId: overrides.stationId ?? 'st-1',
    fuelType: overrides.fuelType ?? 'Petrol',
    status: overrides.status ?? VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
    cleaningStatus: overrides.cleaningStatus ?? 'Clean',
    healthStatus: overrides.healthStatus ?? 'Good Health',
    online: overrides.online ?? true,
    lastSignal: overrides.lastSignal ?? NOW.toISOString(),
    badge: overrides.badge ?? 0,
    odometer: overrides.odometer ?? 10000,
    fuel: overrides.fuel ?? 72,
    battery: overrides.battery ?? 100,
    speed: overrides.speed ?? 0,
    coolant: overrides.coolant ?? 90,
    brakes: overrides.brakes ?? 90,
    tires: overrides.tires ?? 90,
    engineOil: overrides.engineOil ?? 90,
    isElectric: overrides.isElectric ?? false,
    hvBatteryCapacityKwh: overrides.hvBatteryCapacityKwh ?? null,
    leasingRate: '',
    insuranceCost: '',
    taxCost: '',
    totalMonthlyCost: '',
    operationalState: {
      status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
      reason: null,
      source: 'fleet-read-model',
      effectiveFrom: null,
      effectiveUntil: null,
      derivedAt: NOW.toISOString(),
      dataQualityState: VEHICLE_DATA_QUALITY_STATE.RELIABLE,
      dataQualityReasons: [],
      isReliable: true,
      ...overrides.operationalState,
    },
    ...overrides,
  };
}

function serviceCase(overrides: Partial<ApiServiceCase> = {}): ApiServiceCase {
  return {
    id: overrides.id ?? 'sc-1',
    organizationId: overrides.organizationId ?? 'org-1',
    vehicleId: overrides.vehicleId ?? VEHICLE_ID,
    vendorId: overrides.vendorId ?? null,
    title: overrides.title ?? 'Servicefall',
    description: overrides.description ?? 'Werkstatt',
    category: overrides.category ?? 'REPAIR',
    status: overrides.status ?? 'IN_PROGRESS',
    priority: overrides.priority ?? 'HIGH',
    source: overrides.source ?? 'MANUAL',
    openedAt: overrides.openedAt ?? '2026-07-10T08:00:00.000Z',
    scheduledAt: overrides.scheduledAt ?? '2026-07-18T09:00:00.000Z',
    expectedReadyAt: overrides.expectedReadyAt ?? '2026-07-19T17:00:00.000Z',
    completedAt: overrides.completedAt ?? null,
    cancelledAt: overrides.cancelledAt ?? null,
    estimatedCostCents: overrides.estimatedCostCents ?? null,
    actualCostCents: overrides.actualCostCents ?? null,
    downtimeStart: overrides.downtimeStart ?? null,
    downtimeEnd: overrides.downtimeEnd ?? null,
    blocksRental: overrides.blocksRental ?? true,
    completionNotes: overrides.completionNotes ?? null,
    documentId: overrides.documentId ?? null,
    metadata: overrides.metadata ?? null,
    createdByUserId: overrides.createdByUserId ?? null,
    updatedByUserId: overrides.updatedByUserId ?? null,
    createdAt: overrides.createdAt ?? '2026-07-10T08:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-07-10T08:00:00.000Z',
    taskCount: overrides.taskCount ?? 0,
    tasks: overrides.tasks ?? [],
  };
}

function task(overrides: Partial<ApiTask> = {}): ApiTask {
  return {
    id: overrides.id ?? 'task-1',
    organizationId: overrides.organizationId ?? 'org-1',
    title: overrides.title ?? 'Blockierende Aufgabe',
    description: overrides.description ?? 'Task Beschreibung',
    category: overrides.category ?? 'Service',
    type: overrides.type ?? 'REPAIR',
    status: overrides.status ?? 'OPEN',
    priority: overrides.priority ?? 'HIGH',
    source: overrides.source ?? 'MANUAL',
    sourceType: overrides.sourceType ?? 'MANUAL',
    dedupKey: overrides.dedupKey ?? null,
    vehicleId: overrides.vehicleId ?? VEHICLE_ID,
    bookingId: overrides.bookingId ?? null,
    customerId: overrides.customerId ?? null,
    vendorId: overrides.vendorId ?? null,
    alertId: overrides.alertId ?? null,
    documentId: overrides.documentId ?? null,
    fineId: overrides.fineId ?? null,
    invoiceId: overrides.invoiceId ?? null,
    serviceCaseId: overrides.serviceCaseId ?? null,
    assignedUserId: overrides.assignedUserId ?? null,
    estimatedCostCents: overrides.estimatedCostCents ?? null,
    actualCostCents: overrides.actualCostCents ?? null,
    resolutionNote: overrides.resolutionNote ?? null,
    blocksVehicleAvailability: overrides.blocksVehicleAvailability ?? true,
    metadata: overrides.metadata ?? null,
    isOverdue: overrides.isOverdue ?? false,
    dueDate: overrides.dueDate ?? '2026-07-20T10:00:00.000Z',
    startedAt: overrides.startedAt ?? null,
    completedAt: overrides.completedAt ?? null,
    cancelledAt: overrides.cancelledAt ?? null,
    createdAt: overrides.createdAt ?? '2026-07-10T08:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-07-10T08:00:00.000Z',
  };
}

function health(overrides: Partial<VehicleHealthResponse> = {}): VehicleHealthResponse {
  return {
    vehicle_id: overrides.vehicle_id ?? VEHICLE_ID,
    organization_id: overrides.organization_id ?? 'org-1',
    overall_state: overrides.overall_state ?? 'good',
    rental_blocked: overrides.rental_blocked ?? false,
    blocking_reasons: overrides.blocking_reasons ?? [],
    modules: overrides.modules ?? {},
    generated_at: overrides.generated_at ?? NOW.toISOString(),
  };
}

function buildRuntime(input: {
  health?: VehicleHealthResponse | null;
  serviceCases?: ApiServiceCase[];
  tasks?: ApiTask[];
}) {
  const healthMap =
    input.health === null
      ? undefined
      : new Map([[VEHICLE_ID, input.health ?? health()]]);

  const [state] = buildVehicleRuntimeStates({
    fleetVehicles: [operationalVehicle()],
    now: NOW,
    healthMap,
    serviceCases: input.serviceCases,
    tasks: input.tasks,
  });

  return state!;
}

describe('health / service / task / runtime separation', () => {
  it('health good, case blocks — runtime blocked without health escalation', () => {
    const state = buildRuntime({
      health: health({ overall_state: 'good', rental_blocked: false }),
      serviceCases: [serviceCase({ id: 'sc-block', title: 'Karosserie' })],
    });

    expect(state.healthSeverity).toBe('ok');
    expect(state.isBlocked).toBe(true);
    expect(state.isReadyToRent).toBe(false);
    expect(state.blockReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'SERVICE_CASE',
          reasonCode: SERVICE_CASE_RUNTIME_REASON_CODE,
          serviceCaseId: 'sc-block',
        }),
      ]),
    );
    expect(state.blockReasons.some((reason) => reason.source.startsWith('rental-health:'))).toBe(
      false,
    );
  });

  it('health blocked, no case — rental-health blocks without operational reasons', () => {
    const state = buildRuntime({
      health: health({
        overall_state: 'critical',
        rental_blocked: true,
        blocking_reasons: ['TÜV überfällig'],
      }),
    });

    expect(state.healthSeverity).toBe('critical');
    expect(state.isBlocked).toBe(true);
    expect(state.blockReasons.some((reason) => reason.source === 'SERVICE_CASE')).toBe(false);
    expect(state.blockReasons.some((reason) => reason.source === 'TASK')).toBe(false);
    expect(state.blockReasons.some((reason) => reason.source === 'rental-health:blocking-reason')).toBe(
      true,
    );
  });

  it('health unknown — runtime keeps health severity unknown without inventing blocks', () => {
    const state = buildRuntime({
      health: health({ overall_state: 'unknown', rental_blocked: false }),
    });

    expect(state.healthSeverity).toBe('unknown');
    expect(state.isBlocked).toBe(false);
    expect(state.isReadyToRent).toBe(true);
  });

  it('case completed, finding active — completed case ignored, health finding stays visible', () => {
    const state = buildRuntime({
      health: health({
        overall_state: 'warning',
        rental_blocked: false,
        modules: {
          tires: {
            state: 'warning',
            reason: 'Profiltiefe niedrig',
            last_updated_at: NOW.toISOString(),
            data_stale: false,
          },
        },
      }),
      serviceCases: [serviceCase({ id: 'sc-done', status: 'COMPLETED' })],
    });

    expect(state.blockReasons.some((reason) => reason.source === 'SERVICE_CASE')).toBe(false);
    expect(state.warningReasons.some((reason) => reason.source === 'rental-health:tires')).toBe(
      true,
    );
    expect(state.healthSeverity).toBe('warning');
    expect(state.isBlocked).toBe(false);
    expect(state.isReadyToRent).toBe(true);
  });

  it('task DONE, case open — only the open case blocks', () => {
    const state = buildRuntime({
      serviceCases: [serviceCase({ id: 'sc-open', status: 'OPEN', title: 'Werkstatt offen' })],
      tasks: [task({ id: 'task-done', status: 'DONE', serviceCaseId: 'sc-open' })],
    });

    expect(state.blockReasons).toEqual([
      expect.objectContaining({
        source: 'SERVICE_CASE',
        serviceCaseId: 'sc-open',
        blocking: true,
      }),
    ]);
    expect(state.blockReasons.some((reason) => reason.source === 'TASK')).toBe(false);
    expect(state.isBlocked).toBe(true);
  });

  it('case open, task DONE — completed task does not add a second blocker', () => {
    const state = buildRuntime({
      serviceCases: [serviceCase({ id: 'sc-open', status: 'IN_PROGRESS' })],
      tasks: [
        task({
          id: 'task-done',
          status: 'DONE',
          serviceCaseId: 'sc-open',
          blocksVehicleAvailability: true,
        }),
      ],
    });

    const blockingReasons = state.blockReasons.filter((reason) => reason.blocking === true);
    expect(blockingReasons).toHaveLength(1);
    expect(blockingReasons[0]).toMatchObject({
      source: 'SERVICE_CASE',
      serviceCaseId: 'sc-open',
    });
  });

  it('case blocked, booking create — runtime blocks operationally while health stays good (booking gate is health-only; see backend gate spec)', () => {
    const state = buildRuntime({
      health: health({ overall_state: 'good', rental_blocked: false }),
      serviceCases: [serviceCase({ id: 'sc-runtime-only' })],
    });

    expect(state.isBlocked).toBe(true);
    expect(state.healthSeverity).toBe('ok');
    expect(state.blockReasons.some((reason) => reason.source === 'SERVICE_CASE')).toBe(true);
    expect(state.blockReasons.some((reason) => reason.source.startsWith('rental-health:'))).toBe(
      false,
    );
  });

  it('warning without blocker — health warning visible but vehicle stays unblocked', () => {
    const state = buildRuntime({
      health: health({
        overall_state: 'warning',
        rental_blocked: false,
        modules: {
          battery: {
            state: 'warning',
            reason: 'Ladezustand niedrig',
            last_updated_at: NOW.toISOString(),
            data_stale: false,
          },
        },
      }),
    });

    expect(state.healthSeverity).toBe('warning');
    expect(state.isBlocked).toBe(false);
    expect(state.blockReasons).toHaveLength(0);
    expect(state.warningReasons.some((reason) => reason.source === 'rental-health:battery')).toBe(
      true,
    );
  });

  it('runtime ready despite health warning — warnings do not block readiness', () => {
    const state = buildRuntime({
      health: health({
        overall_state: 'warning',
        rental_blocked: false,
        modules: {
          brakes: {
            state: 'warning',
            reason: 'Verschleiß beobachten',
            last_updated_at: NOW.toISOString(),
            data_stale: false,
          },
        },
      }),
    });

    expect(state.isReadyToRent).toBe(true);
    expect(state.rentalReadiness).toBe('ready');
    expect(state.isBlocked).toBe(false);
    expect(state.healthSeverity).toBe('warning');
  });

  it('health API unavailable — missing health map keeps severity unknown without runtime block', () => {
    const state = buildRuntime({ health: null });

    expect(state.healthSeverity).toBe('unknown');
    expect(state.isBlocked).toBe(false);
    expect(state.isReadyToRent).toBe(true);
  });

  it('multiple independent blockers — health, case and task each contribute block reasons', () => {
    const state = buildRuntime({
      health: health({
        overall_state: 'critical',
        rental_blocked: true,
        blocking_reasons: ['DTC aktiv'],
      }),
      serviceCases: [serviceCase({ id: 'sc-multi', title: 'Servicefall' })],
      tasks: [task({ id: 'task-multi', title: 'Freistehende Aufgabe', serviceCaseId: null })],
    });

    expect(state.isBlocked).toBe(true);
    expect(state.healthSeverity).toBe('critical');
    expect(state.blockReasons.some((reason) => reason.source === 'rental-health:blocking-reason')).toBe(
      true,
    );
    expect(state.blockReasons.some((reason) => reason.source === 'SERVICE_CASE')).toBe(true);
    expect(state.blockReasons.some((reason) => reason.source === 'TASK')).toBe(true);
    expect(state.blockReasons.filter((reason) => reason.blocking === true).length).toBeGreaterThanOrEqual(
      3,
    );
    expect(
      new Set(
        state.blockReasons
          .filter((reason) => reason.blocking === true)
          .map((reason) => reason.source),
      ),
    ).toEqual(
      expect.objectContaining({
        size: 3,
      }),
    );
  });
});
