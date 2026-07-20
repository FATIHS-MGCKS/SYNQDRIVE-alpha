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

describe('health-finding-work-bridge/task-and-service-case', () => {
  const findingA = sourceFinding({
    source_finding_id: findingId('case-a'),
    finding_code: 'WEAR_FRONT_CRITICAL',
    source_entity_id: 'front_axle',
  });
  const findingB = sourceFinding({
    source_finding_id: findingId('case-b'),
    finding_code: 'WEAR_REAR_WARNING',
    source_entity_id: 'rear_axle',
    severity: 'warning',
  });

  it('exact-matches task linked to a service case for the same finding', () => {
    const tasks = [
      healthTask({
        id: 'task-with-case',
        type: 'BRAKE_CHECK',
        serviceCaseId: 'service-case-42',
        metadata: healthMetadata({
          module: 'brakes',
          sourceFindingId: findingA.source_finding_id,
        }),
      }),
    ];

    const match = findDuplicateHealthTask(
      tasks,
      duplicateQuery('brakes', findingA.source_finding_id),
    );

    expect(match.matchKind).toBe('exact');
    expect(match.task?.serviceCaseId).toBe('service-case-42');
  });

  it('keeps sibling finding creatable when another finding already has task+case', () => {
    const tasks = [
      healthTask({
        id: 'task-with-case',
        type: 'BRAKE_CHECK',
        serviceCaseId: 'service-case-42',
        metadata: healthMetadata({
          module: 'brakes',
          sourceFindingId: findingA.source_finding_id,
        }),
      }),
    ];

    const coverage = buildModuleFindingTaskCoverage({
      module: 'brakes',
      organizationId: ORG_A,
      vehicleId: VEHICLE_A,
      rentalModule: rentalModule('critical', [findingA, findingB]),
      openTasks: tasks,
    });

    expect(coverage.linkedFindingCount).toBe(1);
    expect(coverage.unlinkedFindingCount).toBe(1);
    const rearState = coverage.findingStates.find(
      (s) => s.finding?.source_finding_id === findingB.source_finding_id,
    );
    expect(rearState?.canCreate).toBe(true);
    expect(rearState?.hasExactTask).toBe(false);
  });
});
