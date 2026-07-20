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

describe('health-finding-work-bridge/reoccurrence-after-done', () => {
  const findingIdValue = findingId('dtc-reopen');
  const priorDone = healthTask({
    id: 'prior-done',
    type: 'REPAIR',
    status: 'DONE',
    completedAt: '2026-06-10T08:00:00.000Z',
    metadata: healthMetadata({
      module: 'error_codes',
      sourceFindingId: findingIdValue,
      findingCode: 'DTC_P0301',
    }),
  });

  const reopenedFinding = sourceFinding({
    source_finding_id: findingIdValue,
    finding_code: 'DTC_P0301',
    source_entity_type: 'dtc_code',
    source_entity_id: 'p0301',
    occurrence_generation: 2,
    severity: 'critical',
  });

  it('allows new open task after prior DONE for same sourceFindingId', () => {
    const openSibling = healthTask({
      id: 'new-open',
      type: 'REPAIR',
      status: 'OPEN',
      metadata: healthMetadata({
        module: 'error_codes',
        sourceFindingId: findingIdValue,
        findingCode: 'DTC_P0301',
      }),
    });

    const match = findDuplicateHealthTask(
      [priorDone, openSibling],
      duplicateQuery('error_codes', findingIdValue),
    );

    expect(match.matchKind).toBe('exact');
    expect(match.task?.id).toBe('new-open');
  });

  it('permits create when only historical DONE exists for reopened finding', () => {
    const coverage = buildModuleFindingTaskCoverage({
      module: 'error_codes',
      organizationId: ORG_A,
      vehicleId: VEHICLE_A,
      rentalModule: rentalModule('critical', [reopenedFinding]),
      openTasks: [priorDone],
    });

    expect(coverage.findingStates[0]?.canCreate).toBe(true);
    expect(coverage.findingStates[0]?.hasExactTask).toBe(false);
  });
});
