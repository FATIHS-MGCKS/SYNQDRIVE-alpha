import { describe, expect, it } from 'vitest';
import type { ApiTask, RentalHealthModule, RentalHealthSourceFinding } from '../../lib/api';
import {
  buildHealthTaskPrefill,
  findDuplicateHealthTask,
  healthContextFromTask,
  pickPrimarySourceFinding,
} from './health-task-bridge.utils';

const ORG_ID = 'org-1';
const VEHICLE_ID = 'veh-1';

function sourceFinding(
  overrides: Partial<RentalHealthSourceFinding> = {},
): RentalHealthSourceFinding {
  return {
    finding_code: 'PRESSURE_WARNING',
    source_entity_type: 'rental_reason_code',
    source_entity_id: 'pressure_warning',
    source_finding_id: 'a'.repeat(64),
    finding_occurrence_id: 'b'.repeat(64),
    occurrence_generation: 1,
    version: 'health-finding-identity-v1',
    first_observed_at: '2026-07-10T08:00:00.000Z',
    current_observed_at: '2026-07-10T08:00:00.000Z',
    severity: 'warning',
    ...overrides,
  };
}

function rentalModule(
  state: RentalHealthModule['state'],
  sourceFindings?: RentalHealthSourceFinding[],
): RentalHealthModule {
  return {
    state,
    reason: `${state} reason`,
    last_updated_at: '2026-07-10T08:00:00.000Z',
    data_stale: false,
    ...(sourceFindings ? { source_findings: sourceFindings } : {}),
  };
}

const MODULE_CASES = [
  {
    module: 'tires' as const,
    finding: sourceFinding({
      finding_code: 'PRESSURE_WARNING',
      source_entity_type: 'rental_reason_code',
      source_entity_id: 'pressure_warning',
      source_finding_id: '1'.repeat(64),
    }),
    expectedType: 'TIRE_CHECK',
  },
  {
    module: 'brakes' as const,
    finding: sourceFinding({
      finding_code: 'WEAR_MEASURED_CRITICAL',
      source_entity_type: 'rental_reason_code',
      source_entity_id: 'wear_measured_critical',
      source_finding_id: '2'.repeat(64),
      severity: 'critical',
    }),
    expectedType: 'BRAKE_CHECK',
  },
  {
    module: 'battery' as const,
    finding: sourceFinding({
      finding_code: 'BATTERY_WARNING_LIGHT',
      source_entity_type: 'battery_signal',
      source_entity_id: 'battery_warning_light',
      source_finding_id: '3'.repeat(64),
    }),
    expectedType: 'BATTERY_CHECK',
  },
  {
    module: 'error_codes' as const,
    finding: sourceFinding({
      finding_code: 'DTC_P0420',
      source_entity_type: 'dtc_code',
      source_entity_id: 'p0420',
      source_finding_id: '4'.repeat(64),
      severity: 'critical',
    }),
    expectedType: 'REPAIR',
  },
  {
    module: 'service_compliance' as const,
    finding: sourceFinding({
      finding_code: 'TUV_OVERDUE',
      source_entity_type: 'compliance_signal',
      source_entity_id: 'tuv',
      source_finding_id: '5'.repeat(64),
      severity: 'critical',
    }),
    expectedType: 'VEHICLE_INSPECTION',
  },
  {
    module: 'vehicle_alerts' as const,
    finding: sourceFinding({
      finding_code: 'LIMP_MODE_ACTIVE',
      source_entity_type: 'vehicle_alert',
      source_entity_id: 'limp_mode',
      source_finding_id: '6'.repeat(64),
      severity: 'critical',
    }),
    expectedType: 'REPAIR',
  },
  {
    module: 'complaints' as const,
    finding: sourceFinding({
      finding_code: 'COMPLAINT_BLOCKS_RENTAL',
      source_entity_type: 'complaint',
      source_entity_id: 'complaint-uuid-1',
      source_finding_id: '7'.repeat(64),
      severity: 'critical',
    }),
    expectedType: 'VEHICLE_SERVICE',
  },
];

describe('health-task-bridge.utils', () => {
  it.each(MODULE_CASES)(
    'buildHealthTaskPrefill($module) persists full finding identity',
    ({ module, finding, expectedType }) => {
      const prefill = buildHealthTaskPrefill({
        module,
        organizationId: ORG_ID,
        vehicleId: VEHICLE_ID,
        rentalModule: rentalModule(finding.severity === 'critical' ? 'critical' : 'warning', [finding]),
        sourceFinding: finding,
      });

      expect(prefill.type).toBe(expectedType);
      expect(prefill.metadata).toMatchObject({
        sourceType: 'HEALTH',
        organizationId: ORG_ID,
        vehicleId: VEHICLE_ID,
        healthModule: module,
        sourceFindingId: finding.source_finding_id,
        findingCode: finding.finding_code,
        sourceEntityType: finding.source_entity_type,
        sourceEntityId: finding.source_entity_id,
        findingVersion: 'health-finding-identity-v1',
      });
      expect(prefill.metadata).not.toHaveProperty('dtcCodes');
      expect(prefill.metadata).not.toHaveProperty('tire_read_model');
    },
  );

  it('does not copy DTC codes into metadata — only description', () => {
    const finding = sourceFinding({
      finding_code: 'DTC_P0301',
      source_entity_type: 'dtc_code',
      source_entity_id: 'p0301',
      source_finding_id: '8'.repeat(64),
    });
    const prefill = buildHealthTaskPrefill({
      module: 'error_codes',
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      rentalModule: rentalModule('critical', [finding]),
      sourceFinding: finding,
      dtcCodes: ['P0301', 'P0420'],
    });

    expect(prefill.metadata.sourceFindingId).toBe(finding.source_finding_id);
    expect(prefill.metadata).not.toHaveProperty('dtcCodes');
    expect(prefill.description).toContain('P0301');
  });

  it('pickPrimarySourceFinding prefers critical over warning', () => {
    const chosen = pickPrimarySourceFinding(
      rentalModule('warning', [
        sourceFinding({ severity: 'warning', source_finding_id: '9'.repeat(64) }),
        sourceFinding({ severity: 'critical', source_finding_id: 'c'.repeat(64), finding_code: 'WEAR_MEASURED_CRITICAL' }),
      ]),
    );
    expect(chosen?.source_finding_id).toBe('c'.repeat(64));
  });

  it('findDuplicateHealthTask matches by sourceFindingId before module', () => {
    const findingId = 'd'.repeat(64);
    const tasks = [
      {
        id: 'task-1',
        vehicleId: VEHICLE_ID,
        status: 'OPEN',
        type: 'CUSTOM',
        metadata: { healthModule: 'battery', sourceFindingId: findingId },
      },
    ] as ApiTask[];

    const match = findDuplicateHealthTask(tasks, VEHICLE_ID, 'error_codes', 'REPAIR', findingId);
    expect(match?.id).toBe('task-1');
  });

  it('healthContextFromTask remains readable for legacy tasks without sourceFindingId', () => {
    const ctx = healthContextFromTask({
      id: 'legacy-task',
      sourceType: 'HEALTH',
      metadata: {
        healthModule: 'tires',
        healthState: 'warning',
        healthReason: 'Reifenwarnung',
        origin: 'HEALTH_UI',
      },
    } as ApiTask);

    expect(ctx?.moduleLabel).toBe('Reifen');
    expect(ctx?.sourceFindingId).toBeNull();
    expect(ctx?.findingCode).toBeNull();
  });
});
