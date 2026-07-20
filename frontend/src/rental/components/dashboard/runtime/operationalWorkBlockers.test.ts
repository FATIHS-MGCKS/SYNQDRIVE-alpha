import { describe, expect, it } from 'vitest';
import type { ApiServiceCase, ApiTask } from '../../../../lib/api';
import { buildVehicleRuntimeStates } from './vehicleRuntimeStateBuilder';
import { buildOperationalWorkBlockersForVehicle } from './operationalWorkBlockers';
import {
  SERVICE_CASE_RUNTIME_REASON_CODE,
} from './serviceCaseRuntimeReasons';
import { TASK_RUNTIME_REASON_CODE } from './taskRuntimeReasons';
import {
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
} from '../../../lib/vehicle-operational-state';
import type { VehicleData } from '../../../data/vehicles';

const NOW = new Date('2026-07-15T12:00:00.000Z');

function serviceCase(overrides: Partial<ApiServiceCase> = {}): ApiServiceCase {
  return {
    id: overrides.id ?? 'sc-1',
    organizationId: overrides.organizationId ?? 'org-1',
    vehicleId: overrides.vehicleId ?? 'v1',
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
    vehicleId: overrides.vehicleId ?? 'v1',
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

function operationalVehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: overrides.id ?? 'v1',
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

describe('buildOperationalWorkBlockersForVehicle', () => {
  it('creates a blocking task-only reason for active tasks', () => {
    const reasons = buildOperationalWorkBlockersForVehicle({
      vehicleId: 'v1',
      tasks: [task({ id: 'task-only', title: 'Bremsen prüfen' })],
    });

    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatchObject({
      source: 'TASK',
      reasonCode: TASK_RUNTIME_REASON_CODE,
      taskId: 'task-only',
      title: 'Bremsen prüfen',
      blocking: true,
    });
  });

  it('creates a blocking case-only reason for active service cases', () => {
    const reasons = buildOperationalWorkBlockersForVehicle({
      vehicleId: 'v1',
      serviceCases: [serviceCase({ id: 'sc-only', title: 'Karosserie' })],
    });

    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatchObject({
      source: 'SERVICE_CASE',
      reasonCode: SERVICE_CASE_RUNTIME_REASON_CODE,
      serviceCaseId: 'sc-only',
      title: 'Karosserie',
      blocking: true,
    });
  });

  it('dedupes linked task+case into parent case and child task', () => {
    const reasons = buildOperationalWorkBlockersForVehicle({
      vehicleId: 'v1',
      serviceCases: [serviceCase({ id: 'sc-linked', title: 'Servicefall Haupt' })],
      tasks: [
        task({
          id: 'task-linked',
          title: 'Unteraufgabe Werkstatt',
          serviceCaseId: 'sc-linked',
        }),
      ],
    });

    expect(reasons).toHaveLength(2);
    const parent = reasons.find((reason) => reason.source === 'SERVICE_CASE');
    const child = reasons.find((reason) => reason.source === 'TASK');
    expect(parent).toMatchObject({
      serviceCaseId: 'sc-linked',
      blocking: true,
    });
    expect(child).toMatchObject({
      taskId: 'task-linked',
      parentReasonId: parent?.id,
      serviceCaseId: 'sc-linked',
      blocking: false,
    });
    expect(reasons.filter((reason) => reason.blocking === true)).toHaveLength(1);
  });

  it('ignores DONE and CANCELLED blocking tasks', () => {
    const reasons = buildOperationalWorkBlockersForVehicle({
      vehicleId: 'v1',
      tasks: [
        task({ id: 'done', status: 'DONE' }),
        task({ id: 'cancelled', status: 'CANCELLED' }),
      ],
    });

    expect(reasons).toHaveLength(0);
  });

  it('keeps task blocking when linked case is completed', () => {
    const reasons = buildOperationalWorkBlockersForVehicle({
      vehicleId: 'v1',
      serviceCases: [serviceCase({ id: 'sc-done', status: 'COMPLETED' })],
      tasks: [task({ id: 'task-open', serviceCaseId: 'sc-done' })],
    });

    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatchObject({
      source: 'TASK',
      taskId: 'task-open',
      blocking: true,
    });
  });
});

describe('buildVehicleRuntimeStates operational work blockers', () => {
  it('keeps rental health separate from task blocking', () => {
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [operationalVehicle()],
      now: NOW,
      tasks: [task({ id: 'task-health', title: 'Wartung offen' })],
      healthMap: new Map([
        [
          'v1',
          {
            vehicle_id: 'v1',
            organization_id: 'org-1',
            overall_state: 'good',
            rental_blocked: false,
            blocking_reasons: [],
            modules: {},
            generated_at: NOW.toISOString(),
          },
        ],
      ]),
    });

    expect(state?.healthSeverity).toBe('ok');
    expect(state?.blockReasons.some((reason) => reason.source === 'TASK')).toBe(true);
    expect(state?.isBlocked).toBe(true);
  });
});
