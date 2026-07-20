import { describe, expect, it } from 'vitest';
import { findDuplicateHealthTask } from '../health-task-bridge.utils';
import { matchOpenTaskForHealthSignal } from '../../components/fleet-health-service/fleet-health-service.view-model';
import type { VehicleHealthResponse } from '../../../lib/api';
import {
  duplicateQuery,
  findingId,
  healthTask,
  ORG_A,
  sourceFinding,
  VEHICLE_A,
} from './fixtures';

describe('health-finding-work-bridge/blocking-foreign-task', () => {
  const finding = sourceFinding({
    source_finding_id: findingId('tire-pressure'),
    finding_code: 'PRESSURE_WARNING',
    source_entity_type: 'rental_reason_code',
    source_entity_id: 'pressure_warning',
  });

  const health: VehicleHealthResponse = {
    vehicle_id: VEHICLE_A,
    organization_id: ORG_A,
    overall_state: 'critical',
    rental_blocked: true,
    blocking_reasons: ['tire_pressure'],
    modules: {
      battery: { state: 'good', reason: 'OK', last_updated_at: '2026-06-22T00:00:00.000Z', data_stale: false },
      tires: {
        state: 'critical',
        reason: 'Reifendruck',
        last_updated_at: '2026-06-22T00:00:00.000Z',
        data_stale: false,
        source_findings: [finding],
      },
      brakes: { state: 'good', reason: 'OK', last_updated_at: '2026-06-22T00:00:00.000Z', data_stale: false },
      error_codes: { state: 'good', reason: 'OK', last_updated_at: '2026-06-22T00:00:00.000Z', data_stale: false },
      service_compliance: { state: 'good', reason: 'OK', last_updated_at: '2026-06-22T00:00:00.000Z', data_stale: false },
      complaints: { state: 'good', reason: 'OK', last_updated_at: '2026-06-22T00:00:00.000Z', data_stale: false },
      vehicle_alerts: { state: 'good', reason: 'OK', last_updated_at: '2026-06-22T00:00:00.000Z', data_stale: false },
    },
    generated_at: '2026-06-22T00:00:00.000Z',
  };

  it('ignores blocksVehicleAvailability without health metadata', () => {
    const tasks = [
      healthTask({
        id: 'foreign-blocking',
        type: 'VEHICLE_SERVICE',
        blocksVehicleAvailability: true,
        sourceType: 'MANUAL',
        metadata: null,
      }),
    ];

    const match = findDuplicateHealthTask(
      tasks,
      duplicateQuery('tires', finding.source_finding_id),
    );

    expect(match.matchKind).toBe('none');
    expect(match.possiblyRelatedTask).toBeNull();
  });

  it('does not link rental_blocked health to unrelated blocking task', () => {
    const tasks = [
      healthTask({
        id: 'foreign-blocking',
        type: 'VEHICLE_SERVICE',
        blocksVehicleAvailability: true,
        sourceType: 'MANUAL',
        metadata: { healthModule: 'service_compliance' },
      }),
    ];

    expect(matchOpenTaskForHealthSignal(tasks, VEHICLE_A, health)).toBeNull();
  });
});
