import { describe, expect, it } from 'vitest';
import { findDuplicateHealthTask } from '../health-task-bridge.utils';
import {
  duplicateQuery,
  findingId,
  healthMetadata,
  healthTask,
  sourceFinding,
} from './fixtures';

describe('health-finding-work-bridge/cancelled-task', () => {
  const finding = sourceFinding({
    source_finding_id: findingId('service-cancelled'),
    finding_code: 'TUV_OVERDUE',
    source_entity_type: 'compliance_signal',
    source_entity_id: 'tuv',
  });

  it('does not treat CANCELLED task as active duplicate', () => {
    const tasks = [
      healthTask({
        id: 'cancelled-task',
        type: 'VEHICLE_INSPECTION',
        status: 'CANCELLED',
        cancelledAt: '2026-06-21T12:00:00.000Z',
        metadata: healthMetadata({
          module: 'service_compliance',
          sourceFindingId: finding.source_finding_id,
        }),
      }),
    ];

    const match = findDuplicateHealthTask(
      tasks,
      duplicateQuery('service_compliance', finding.source_finding_id),
    );

    expect(match.matchKind).toBe('none');
    expect(match.task).toBeNull();
  });
});
