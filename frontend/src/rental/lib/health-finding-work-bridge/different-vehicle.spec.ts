import { describe, expect, it } from 'vitest';
import { findDuplicateHealthTask } from '../health-task-bridge.utils';
import {
  duplicateQuery,
  findingId,
  healthMetadata,
  healthTask,
  ORG_A,
  sourceFinding,
  VEHICLE_A,
  VEHICLE_B,
} from './fixtures';

describe('health-finding-work-bridge/different-vehicle', () => {
  const finding = sourceFinding({
    source_finding_id: findingId('vehicle-scope'),
    finding_code: 'BATTERY_WARNING_LIGHT',
    source_entity_type: 'battery_signal',
    source_entity_id: 'battery_warning',
  });

  it('does not match task assigned to another vehicle', () => {
    const tasks = [
      healthTask({
        id: 'other-vehicle-task',
        vehicleId: VEHICLE_B,
        type: 'BATTERY_CHECK',
        metadata: healthMetadata({
          vehicleId: VEHICLE_B,
          module: 'battery',
          sourceFindingId: finding.source_finding_id,
        }),
      }),
    ];

    const match = findDuplicateHealthTask(
      tasks,
      duplicateQuery('battery', finding.source_finding_id, ORG_A, VEHICLE_A),
    );

    expect(match.matchKind).toBe('none');
    expect(match.task).toBeNull();
  });

  it('does not match when metadata vehicleId differs from query vehicle', () => {
    const tasks = [
      healthTask({
        id: 'metadata-vehicle-mismatch',
        vehicleId: VEHICLE_A,
        type: 'BATTERY_CHECK',
        metadata: healthMetadata({
          vehicleId: VEHICLE_B,
          module: 'battery',
          sourceFindingId: finding.source_finding_id,
        }),
      }),
    ];

    const match = findDuplicateHealthTask(
      tasks,
      duplicateQuery('battery', finding.source_finding_id, ORG_A, VEHICLE_A),
    );

    expect(match.matchKind).toBe('none');
  });
});
