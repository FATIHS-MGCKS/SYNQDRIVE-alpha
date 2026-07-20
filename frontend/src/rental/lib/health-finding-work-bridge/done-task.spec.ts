import { describe, expect, it } from 'vitest';
import { buildModuleFindingTaskCoverage, findDuplicateHealthTask } from '../health-task-bridge.utils';
import {
  duplicateQuery,
  findingId,
  healthMetadata,
  healthTask,
  ORG_A,
  rentalModule,
  sourceFinding,
  VEHICLE_A,
} from './fixtures';

describe('health-finding-work-bridge/done-task', () => {
  const finding = sourceFinding({
    source_finding_id: findingId('battery-done'),
    finding_code: 'BATTERY_WARNING_LIGHT',
    source_entity_type: 'battery_signal',
    source_entity_id: 'battery_warning',
  });

  it('does not treat DONE task as active duplicate', () => {
    const tasks = [
      healthTask({
        id: 'done-task',
        type: 'BATTERY_CHECK',
        status: 'DONE',
        completedAt: '2026-06-21T10:00:00.000Z',
        metadata: healthMetadata({
          module: 'battery',
          sourceFindingId: finding.source_finding_id,
        }),
      }),
    ];

    const match = findDuplicateHealthTask(
      tasks,
      duplicateQuery('battery', finding.source_finding_id),
    );

    expect(match.matchKind).toBe('none');
    expect(match.task).toBeNull();
  });

  it('allows new task creation when only DONE exists', () => {
    const tasks = [
      healthTask({
        id: 'done-task',
        type: 'BATTERY_CHECK',
        status: 'DONE',
        metadata: healthMetadata({
          module: 'battery',
          sourceFindingId: finding.source_finding_id,
        }),
      }),
    ];

    const coverage = buildModuleFindingTaskCoverage({
      module: 'battery',
      organizationId: ORG_A,
      vehicleId: VEHICLE_A,
      rentalModule: rentalModule('warning', [finding]),
      openTasks: tasks,
    });

    expect(coverage.findingStates[0]?.canCreate).toBe(true);
    expect(coverage.linkedFindingCount).toBe(0);
  });
});
