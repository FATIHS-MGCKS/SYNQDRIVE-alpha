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

describe('health-finding-work-bridge/false-match-repair', () => {
  const finding = sourceFinding({
    source_finding_id: findingId('brake-repair'),
    finding_code: 'WEAR_MEASURED_CRITICAL',
    source_entity_type: 'rental_reason_code',
    source_entity_id: 'wear_critical',
  });

  it('does not exact-match generic REPAIR for brake finding', () => {
    const tasks = [
      healthTask({
        id: 'repair-generic',
        type: 'REPAIR',
        title: 'Karosserie / allgemeine Reparatur',
        metadata: healthMetadata({ module: 'brakes' }),
      }),
    ];

    const match = findDuplicateHealthTask(tasks, duplicateQuery('brakes', finding.source_finding_id));

    expect(match.matchKind).not.toBe('exact');
    expect(match.task).toBeNull();
  });

  it('surfaces REPAIR as possibly related but keeps create enabled', () => {
    const tasks = [
      healthTask({
        id: 'repair-generic',
        type: 'REPAIR',
        metadata: healthMetadata({ module: 'brakes' }),
      }),
    ];

    const coverage = buildModuleFindingTaskCoverage({
      module: 'brakes',
      organizationId: ORG_A,
      vehicleId: VEHICLE_A,
      rentalModule: rentalModule('critical', [finding]),
      openTasks: tasks,
    });

    expect(coverage.findingStates[0]?.duplicate.matchKind).toBe('possibly_related');
    expect(coverage.findingStates[0]?.canCreate).toBe(true);
    expect(coverage.linkedFindingCount).toBe(0);
  });
});
