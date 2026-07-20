import { describe, expect, it } from 'vitest';
import { buildModuleFindingTaskCoverage, findDuplicateHealthTask } from '../health-task-bridge.utils';
import {
  healthMetadata,
  healthTask,
  ORG_A,
  rentalModule,
  VEHICLE_A,
} from './fixtures';

describe('health-finding-work-bridge/legacy-without-finding-id', () => {
  it('legacy-matches unambiguous module task when both sides lack sourceFindingId', () => {
    const tasks = [
      healthTask({
        id: 'legacy-brake',
        type: 'BRAKE_CHECK',
        metadata: healthMetadata({ module: 'brakes' }),
      }),
    ];

    const match = findDuplicateHealthTask(tasks, {
      organizationId: ORG_A,
      vehicleId: VEHICLE_A,
      module: 'brakes',
    });

    expect(match.matchKind).toBe('legacy');
    expect(match.task?.id).toBe('legacy-brake');
  });

  it('does not suppress new finding-backed task when only legacy task exists', () => {
    const tasks = [
      healthTask({
        id: 'legacy-brake',
        type: 'BRAKE_CHECK',
        metadata: healthMetadata({ module: 'brakes' }),
      }),
    ];

    const coverage = buildModuleFindingTaskCoverage({
      module: 'brakes',
      organizationId: ORG_A,
      vehicleId: VEHICLE_A,
      rentalModule: rentalModule('critical', [
        {
          finding_code: 'WEAR_FRONT_CRITICAL',
          source_entity_type: 'rental_reason_code',
          source_entity_id: 'front_axle',
          source_finding_id: 'f'.repeat(64),
          finding_occurrence_id: 'occ'.repeat(32),
          occurrence_generation: 1,
          version: 'health-finding-identity-v1',
          first_observed_at: '2026-06-22T00:00:00.000Z',
          current_observed_at: '2026-06-22T00:00:00.000Z',
          severity: 'critical',
        },
      ]),
      openTasks: tasks,
    });

    expect(coverage.findingStates[0]?.duplicate.matchKind).not.toBe('exact');
    expect(coverage.findingStates[0]?.canCreate).toBe(true);
  });
});
