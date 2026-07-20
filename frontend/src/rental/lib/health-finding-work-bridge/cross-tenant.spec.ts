import { describe, expect, it } from 'vitest';
import { findDuplicateHealthTask } from '../health-task-bridge.utils';
import {
  duplicateQuery,
  findingId,
  healthMetadata,
  healthTask,
  ORG_A,
  ORG_B,
  sourceFinding,
  VEHICLE_A,
} from './fixtures';

describe('health-finding-work-bridge/cross-tenant', () => {
  const finding = sourceFinding({
    source_finding_id: findingId('cross-tenant'),
    finding_code: 'PRESSURE_WARNING',
  });

  it('does not match task from another organization', () => {
    const tasks = [
      healthTask({
        id: 'foreign-org-task',
        organizationId: ORG_B,
        type: 'TIRE_CHECK',
        metadata: healthMetadata({
          organizationId: ORG_B,
          module: 'tires',
          sourceFindingId: finding.source_finding_id,
        }),
      }),
    ];

    const match = findDuplicateHealthTask(
      tasks,
      duplicateQuery('tires', finding.source_finding_id, ORG_A, VEHICLE_A),
    );

    expect(match.matchKind).toBe('none');
    expect(match.task).toBeNull();
  });

  it('does not match when metadata organizationId differs from query scope', () => {
    const tasks = [
      healthTask({
        id: 'metadata-org-mismatch',
        organizationId: ORG_A,
        type: 'TIRE_CHECK',
        metadata: healthMetadata({
          organizationId: ORG_B,
          vehicleId: VEHICLE_A,
          module: 'tires',
          sourceFindingId: finding.source_finding_id,
        }),
      }),
    ];

    const match = findDuplicateHealthTask(
      tasks,
      duplicateQuery('tires', finding.source_finding_id, ORG_A, VEHICLE_A),
    );

    expect(match.matchKind).toBe('none');
  });
});
