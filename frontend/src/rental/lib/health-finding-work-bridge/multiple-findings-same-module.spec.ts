import { describe, expect, it } from 'vitest';
import { buildModuleFindingTaskCoverage } from '../health-task-bridge.utils';
import {
  findingId,
  healthMetadata,
  healthTask,
  ORG_A,
  rentalModule,
  sourceFinding,
  VEHICLE_A,
} from './fixtures';

describe('health-finding-work-bridge/multiple-findings-same-module', () => {
  const findings = [
    sourceFinding({
      source_finding_id: findingId('dtc-1'),
      finding_code: 'DTC_P0301',
      source_entity_type: 'dtc_code',
      source_entity_id: 'p0301',
      severity: 'critical',
    }),
    sourceFinding({
      source_finding_id: findingId('dtc-2'),
      finding_code: 'DTC_P0420',
      source_entity_type: 'dtc_code',
      source_entity_id: 'p0420',
      severity: 'warning',
    }),
    sourceFinding({
      source_finding_id: findingId('dtc-3'),
      finding_code: 'DTC_P0171',
      source_entity_type: 'dtc_code',
      source_entity_id: 'p0171',
      severity: 'warning',
    }),
  ];

  it('tracks three parallel findings with independent duplicate state', () => {
    const tasks = [
      healthTask({
        id: 'linked-middle',
        type: 'REPAIR',
        metadata: healthMetadata({
          module: 'error_codes',
          sourceFindingId: findings[1]!.source_finding_id,
          findingCode: findings[1]!.finding_code,
        }),
      }),
    ];

    const coverage = buildModuleFindingTaskCoverage({
      module: 'error_codes',
      organizationId: ORG_A,
      vehicleId: VEHICLE_A,
      rentalModule: rentalModule('critical', findings),
      openTasks: tasks,
    });

    expect(coverage.findingCount).toBe(3);
    expect(coverage.linkedFindingCount).toBe(1);
    expect(coverage.unlinkedFindingCount).toBe(2);
    expect(coverage.findingStates.map((s) => s.hasExactTask)).toEqual([false, true, false]);
    expect(coverage.findingStates.map((s) => s.canCreate)).toEqual([true, false, true]);
  });

  it('does not merge findings by healthModule alone', () => {
    const tasks = [
      healthTask({
        id: 'only-first',
        type: 'REPAIR',
        metadata: healthMetadata({
          module: 'error_codes',
          sourceFindingId: findings[0]!.source_finding_id,
        }),
      }),
    ];

    const coverage = buildModuleFindingTaskCoverage({
      module: 'error_codes',
      organizationId: ORG_A,
      vehicleId: VEHICLE_A,
      rentalModule: rentalModule('critical', findings),
      openTasks: tasks,
    });

    expect(coverage.findingStates[1]?.hasExactTask).toBe(false);
    expect(coverage.findingStates[2]?.hasExactTask).toBe(false);
  });
});
