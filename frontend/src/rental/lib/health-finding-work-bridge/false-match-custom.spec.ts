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

describe('health-finding-work-bridge/false-match-custom', () => {
  const finding = sourceFinding({
    source_finding_id: findingId('dtc-p0420'),
    finding_code: 'DTC_P0420',
    source_entity_type: 'dtc_code',
    source_entity_id: 'p0420',
  });

  it('does not exact-match CUSTOM for DTC finding', () => {
    const tasks = [
      healthTask({
        id: 'custom-task',
        type: 'CUSTOM',
        metadata: healthMetadata({ module: 'error_codes' }),
      }),
    ];

    const match = findDuplicateHealthTask(
      tasks,
      duplicateQuery('error_codes', finding.source_finding_id),
    );

    expect(match.matchKind).not.toBe('exact');
    expect(match.task).toBeNull();
  });

  it('allows DTC task creation when only CUSTOM exists', () => {
    const tasks = [
      healthTask({
        id: 'custom-task',
        type: 'CUSTOM',
        metadata: healthMetadata({ module: 'error_codes' }),
      }),
    ];

    const coverage = buildModuleFindingTaskCoverage({
      module: 'error_codes',
      organizationId: ORG_A,
      vehicleId: VEHICLE_A,
      rentalModule: rentalModule('critical', [finding]),
      openTasks: tasks,
    });

    expect(coverage.findingStates[0]?.duplicate.matchKind).toBe('possibly_related');
    expect(coverage.findingStates[0]?.canCreate).toBe(true);
  });
});
