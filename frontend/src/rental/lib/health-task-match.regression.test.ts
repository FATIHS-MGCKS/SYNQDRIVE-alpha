/**
 * Audit regression tests — fleet-health-service-workflow-ux-test-matrix §10.2 (M2–M11).
 * Ensures broad task-type / blocking heuristics do not auto-match health findings.
 */
import { describe, expect, it } from 'vitest';
import type { ApiTask, RentalHealthSourceFinding, VehicleHealthResponse } from '../../lib/api';
import {
  buildFleetHealthServiceUiItem,
  matchOpenTaskForHealthSignal,
  resolveHealthTaskMatchForSignal,
} from '../components/fleet-health-service/fleet-health-service.view-model';
import type { VehicleData } from '../data/vehicles';
import { findDuplicateHealthTask } from './health-task-bridge.utils';

const ORG_ID = 'org-1';
const VEHICLE_ID = 'v1';

function finding(
  moduleCode: string,
  sourceFindingId: string,
): RentalHealthSourceFinding {
  return {
    finding_code: moduleCode,
    source_entity_type: 'rental_reason_code',
    source_entity_id: moduleCode.toLowerCase(),
    source_finding_id: sourceFindingId,
    finding_occurrence_id: 'occ'.repeat(32),
    occurrence_generation: 1,
    version: 'health-finding-identity-v1',
    first_observed_at: '2026-06-22T00:00:00.000Z',
    current_observed_at: '2026-06-22T00:00:00.000Z',
    severity: 'critical',
  };
}

function apiTask(overrides: Partial<ApiTask> & Pick<ApiTask, 'id'>): ApiTask {
  return {
    organizationId: ORG_ID,
    title: 'Service',
    description: '',
    category: 'Service',
    type: 'VEHICLE_SERVICE',
    status: 'OPEN',
    priority: 'NORMAL',
    source: null,
    sourceType: 'MANUAL',
    dedupKey: null,
    vehicleId: VEHICLE_ID,
    bookingId: null,
    customerId: null,
    vendorId: null,
    assignedUserId: null,
    dueDate: null,
    blocksVehicleAvailability: false,
    serviceCaseId: null,
    metadata: null,
    isOverdue: false,
    estimatedCostCents: null,
    actualCostCents: null,
    resolutionNote: null,
    alertId: null,
    documentId: null,
    fineId: null,
    invoiceId: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-06-22T00:00:00.000Z',
    updatedAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

function health(
  moduleKey: keyof VehicleHealthResponse['modules'],
  sourceFindingId: string,
  rentalBlocked = false,
): VehicleHealthResponse {
  return {
    vehicle_id: VEHICLE_ID,
    organization_id: ORG_ID,
    overall_state: 'critical',
    rental_blocked: rentalBlocked,
    blocking_reasons: rentalBlocked ? [`${moduleKey}_critical`] : [],
    modules: {
      battery: { state: 'good', reason: 'OK', last_updated_at: '2026-06-22T00:00:00.000Z', data_stale: false },
      tires: { state: 'good', reason: 'OK', last_updated_at: '2026-06-22T00:00:00.000Z', data_stale: false },
      brakes: { state: 'good', reason: 'OK', last_updated_at: '2026-06-22T00:00:00.000Z', data_stale: false },
      error_codes: { state: 'good', reason: 'OK', last_updated_at: '2026-06-22T00:00:00.000Z', data_stale: false },
      service_compliance: { state: 'good', reason: 'OK', last_updated_at: '2026-06-22T00:00:00.000Z', data_stale: false },
      complaints: { state: 'good', reason: 'OK', last_updated_at: '2026-06-22T00:00:00.000Z', data_stale: false },
      vehicle_alerts: { state: 'good', reason: 'OK', last_updated_at: '2026-06-22T00:00:00.000Z', data_stale: false },
      [moduleKey]: {
        state: 'critical',
        reason: `${moduleKey} critical`,
        last_updated_at: '2026-06-22T00:00:00.000Z',
        data_stale: false,
        source_findings: [finding(moduleKey, sourceFindingId)],
      },
    },
    generated_at: '2026-06-22T00:00:00.000Z',
  };
}

function vehicle(): VehicleData {
  return {
    id: VEHICLE_ID,
    license: 'B-XY 1',
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

describe('health-task-match audit regressions (M2–M11)', () => {
  it('M2: battery finding does not auto-match generic REPAIR', () => {
    const findingId = 'b'.repeat(64);
    const tasks = [
      apiTask({
        id: 'm2-repair',
        type: 'REPAIR',
        sourceType: 'HEALTH',
        metadata: {
          sourceType: 'HEALTH',
          organizationId: ORG_ID,
          vehicleId: VEHICLE_ID,
          healthModule: 'battery',
        },
      }),
    ];

    const match = findDuplicateHealthTask(tasks, {
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      module: 'battery',
      sourceFindingId: findingId,
    });

    expect(match.matchKind).not.toBe('exact');
    expect(match.task).toBeNull();
    expect(matchOpenTaskForHealthSignal(tasks, VEHICLE_ID, health('battery', findingId))).toBeNull();
  });

  it('M3: brake finding does not auto-match bodywork REPAIR', () => {
    const findingId = 'r'.repeat(64);
    const tasks = [
      apiTask({
        id: 'm3-repair',
        type: 'REPAIR',
        title: 'Karosserie',
        sourceType: 'HEALTH',
        metadata: {
          sourceType: 'HEALTH',
          organizationId: ORG_ID,
          vehicleId: VEHICLE_ID,
          healthModule: 'brakes',
        },
      }),
    ];

    const result = resolveHealthTaskMatchForSignal(tasks, VEHICLE_ID, health('brakes', findingId));
    expect(result.matchKind).not.toBe('exact');
    expect(result.matchKind).toBe('possibly_related');
    const item = buildFleetHealthServiceUiItem(vehicle(), health('brakes', findingId), tasks);
    expect(item.recommendedAction).toBe('create_task');
    expect(item.existingTaskId).toBeNull();
    expect(item.possiblyRelatedTaskId).toBe('m3-repair');
  });

  it('M4: DTC finding does not auto-match CUSTOM task', () => {
    const findingId = 'd'.repeat(64);
    const tasks = [
      apiTask({
        id: 'm4-custom',
        type: 'CUSTOM',
        sourceType: 'HEALTH',
        metadata: {
          sourceType: 'HEALTH',
          organizationId: ORG_ID,
          vehicleId: VEHICLE_ID,
          healthModule: 'error_codes',
        },
      }),
    ];

    const match = findDuplicateHealthTask(tasks, {
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      module: 'error_codes',
      sourceFindingId: findingId,
    });

    expect(match.matchKind).toBe('possibly_related');
    expect(match.task).toBeNull();
  });

  it('M6/M7: DONE and CANCELLED tasks are not matched', () => {
    const findingId = 'x'.repeat(64);
    const doneTask = apiTask({
      id: 'm6-done',
      type: 'BRAKE_CHECK',
      status: 'DONE',
      sourceType: 'HEALTH',
      metadata: {
        sourceType: 'HEALTH',
        organizationId: ORG_ID,
        vehicleId: VEHICLE_ID,
        healthModule: 'brakes',
        sourceFindingId: findingId,
      },
    });
    const cancelledTask = { ...doneTask, id: 'm7-cancelled', status: 'CANCELLED' as const };

    for (const task of [doneTask, cancelledTask]) {
      const match = findDuplicateHealthTask([task], {
        organizationId: ORG_ID,
        vehicleId: VEHICLE_ID,
        module: 'brakes',
        sourceFindingId: findingId,
      });
      expect(match.matchKind).toBe('none');
    }
  });

  it('M10: blocksVehicleAvailability alone does not link health signal', () => {
    const findingId = 't'.repeat(64);
    const tasks = [
      apiTask({
        id: 'm10-blocking',
        type: 'VEHICLE_SERVICE',
        blocksVehicleAvailability: true,
        metadata: null,
      }),
    ];

    expect(matchOpenTaskForHealthSignal(tasks, VEHICLE_ID, health('tires', findingId))).toBeNull();
    const item = buildFleetHealthServiceUiItem(vehicle(), health('tires', findingId), tasks);
    expect(item.recommendedAction).toBe('create_task');
    expect(item.existingTaskId).toBeNull();
  });

  it('M11: rental_blocked does not link arbitrary blocking task', () => {
    const findingId = 'f'.repeat(64);
    const tasks = [
      apiTask({
        id: 'm11-blocking',
        type: 'VEHICLE_SERVICE',
        blocksVehicleAvailability: true,
        metadata: { healthModule: 'service_compliance' },
      }),
    ];

    const h = health('brakes', findingId, true);
    expect(matchOpenTaskForHealthSignal(tasks, VEHICLE_ID, h)).toBeNull();
    const item = buildFleetHealthServiceUiItem(vehicle(), h, tasks);
    expect(item.recommendedAction).toBe('create_task');
    expect(item.existingTaskId).toBeNull();
    expect(item.possiblyRelatedTaskId).toBeNull();
  });
});
