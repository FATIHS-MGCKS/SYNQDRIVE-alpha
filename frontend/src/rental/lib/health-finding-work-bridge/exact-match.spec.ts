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

describe('health-finding-work-bridge/exact-match', () => {
  const finding = sourceFinding({
    source_finding_id: findingId('brake-front'),
    finding_code: 'WEAR_FRONT_CRITICAL',
    source_entity_id: 'front_axle',
  });

  it('matches open HEALTH task with identical sourceFindingId', () => {
    const tasks = [
      healthTask({
        id: 'task-exact',
        type: 'BRAKE_CHECK',
        metadata: healthMetadata({
          module: 'brakes',
          sourceFindingId: finding.source_finding_id,
          findingCode: finding.finding_code,
        }),
      }),
    ];

    const match = findDuplicateHealthTask(tasks, duplicateQuery('brakes', finding.source_finding_id));

    expect(match.matchKind).toBe('exact');
    expect(match.task?.id).toBe('task-exact');
    expect(match.possiblyRelatedTask).toBeNull();
  });

  it('marks finding as linked in module coverage', () => {
    const tasks = [
      healthTask({
        id: 'task-exact',
        type: 'BRAKE_CHECK',
        metadata: healthMetadata({
          module: 'brakes',
          sourceFindingId: finding.source_finding_id,
        }),
      }),
    ];

    const coverage = buildModuleFindingTaskCoverage({
      module: 'brakes',
      organizationId: ORG_A,
      vehicleId: VEHICLE_A,
      rentalModule: rentalModule('critical', [finding]),
      openTasks: tasks,
    });

    expect(coverage.linkedFindingCount).toBe(1);
    expect(coverage.unlinkedFindingCount).toBe(0);
    expect(coverage.findingStates[0]?.hasExactTask).toBe(true);
    expect(coverage.findingStates[0]?.canCreate).toBe(false);
  });
});
