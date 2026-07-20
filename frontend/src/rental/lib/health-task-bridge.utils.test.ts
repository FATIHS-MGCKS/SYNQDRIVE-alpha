import { describe, expect, it } from 'vitest';
import type { ApiTask, RentalHealthModule, RentalHealthSourceFinding } from '../../lib/api';
import {
  buildHealthTaskPrefill,
  findDuplicateHealthTask,
  healthContextFromTask,
  MODULE_PREFILL_TASK_TYPES,
  pickPrimarySourceFinding,
} from './health-task-bridge.utils';

const ORG_ID = 'org-1';
const VEHICLE_ID = 'veh-1';
const FINDING_ID = 'd'.repeat(64);

function apiTask(overrides: Partial<ApiTask> & Pick<ApiTask, 'id'>): ApiTask {
  return {
    organizationId: ORG_ID,
    title: 'Service',
    description: '',
    category: 'Service',
    type: 'VEHICLE_SERVICE',
    status: 'OPEN',
    priority: 'NORMAL',
    source: null,
    sourceType: 'MANUAL',
    dedupKey: null,
    vehicleId: VEHICLE_ID,
    bookingId: null,
    customerId: null,
    vendorId: null,
    assignedUserId: null,
    dueDate: null,
    blocksVehicleAvailability: false,
    serviceCaseId: null,
    metadata: null,
    isOverdue: false,
    estimatedCostCents: null,
    actualCostCents: null,
    resolutionNote: null,
    alertId: null,
    documentId: null,
    fineId: null,
    invoiceId: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-07-10T08:00:00.000Z',
    updatedAt: '2026-07-10T08:00:00.000Z',
    ...overrides,
  };
}

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

      expect(prefill.type).toBe(MODULE_PREFILL_TASK_TYPES[module]);
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

  it('findDuplicateHealthTask exact match requires org + vehicle + HEALTH + sourceFindingId', () => {
    const tasks = [
      apiTask({
        id: 'task-1',
        type: 'CUSTOM',
        sourceType: 'HEALTH',
        metadata: {
          sourceType: 'HEALTH',
          organizationId: ORG_ID,
          vehicleId: VEHICLE_ID,
          healthModule: 'error_codes',
          sourceFindingId: FINDING_ID,
        },
      }),
    ];

    const match = findDuplicateHealthTask(tasks, {
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      module: 'error_codes',
      sourceFindingId: FINDING_ID,
    });
    expect(match.matchKind).toBe('exact');
    expect(match.task?.id).toBe('task-1');
  });

  it('findDuplicateHealthTask rejects generic REPAIR for brake finding', () => {
    const brakeFindingId = 'b'.repeat(64);
    const tasks = [
      apiTask({
        id: 'repair-task',
        type: 'REPAIR',
        sourceType: 'HEALTH',
        metadata: {
          sourceType: 'HEALTH',
          organizationId: ORG_ID,
          vehicleId: VEHICLE_ID,
          healthModule: 'brakes',
        },
      }),
    ];

    const match = findDuplicateHealthTask(tasks, {
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      module: 'brakes',
      sourceFindingId: brakeFindingId,
    });
    expect(match.matchKind).toBe('possibly_related');
    expect(match.task).toBeNull();
    expect(match.possiblyRelatedTask?.id).toBe('repair-task');
  });

  it('findDuplicateHealthTask flags CUSTOM as possibly related for DTC finding', () => {
    const dtcFindingId = 'e'.repeat(64);
    const tasks = [
      apiTask({
        id: 'custom-task',
        type: 'CUSTOM',
        sourceType: 'HEALTH',
        metadata: {
          sourceType: 'HEALTH',
          organizationId: ORG_ID,
          vehicleId: VEHICLE_ID,
          healthModule: 'error_codes',
        },
      }),
    ];

    const match = findDuplicateHealthTask(tasks, {
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      module: 'error_codes',
      sourceFindingId: dtcFindingId,
    });
    expect(match.matchKind).toBe('possibly_related');
    expect(match.possiblyRelatedTask?.id).toBe('custom-task');
  });

  it('findDuplicateHealthTask ignores blocksVehicleAvailability without health module metadata', () => {
    const tireFindingId = 't'.repeat(64);
    const tasks = [
      apiTask({
        id: 'blocking-only',
        type: 'VEHICLE_SERVICE',
        blocksVehicleAvailability: true,
        metadata: null,
      }),
    ];

    const match = findDuplicateHealthTask(tasks, {
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      module: 'tires',
      sourceFindingId: tireFindingId,
    });
    expect(match.matchKind).toBe('none');
    expect(match.possiblyRelatedTask).toBeNull();
  });

  it('findDuplicateHealthTask does not exact-match blocking task with module metadata only', () => {
    const tireFindingId = 't'.repeat(64);
    const tasks = [
      apiTask({
        id: 'blocking-task',
        type: 'VEHICLE_SERVICE',
        blocksVehicleAvailability: true,
        metadata: {
          sourceType: 'HEALTH',
          organizationId: ORG_ID,
          vehicleId: VEHICLE_ID,
          healthModule: 'tires',
        },
      }),
    ];

    const match = findDuplicateHealthTask(tasks, {
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      module: 'tires',
      sourceFindingId: tireFindingId,
    });
    expect(match.matchKind).toBe('possibly_related');
    expect(match.task).toBeNull();
    expect(match.possiblyRelatedTask?.id).toBe('blocking-task');
  });

  it('findDuplicateHealthTask legacy matches unambiguous module type without finding ids', () => {
    const tasks = [
      apiTask({
        id: 'legacy-brake',
        type: 'BRAKE_CHECK',
        sourceType: 'HEALTH',
        metadata: {
          sourceType: 'HEALTH',
          organizationId: ORG_ID,
          vehicleId: VEHICLE_ID,
          healthModule: 'brakes',
        },
      }),
    ];

    const match = findDuplicateHealthTask(tasks, {
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      module: 'brakes',
    });
    expect(match.matchKind).toBe('legacy');
    expect(match.task?.id).toBe('legacy-brake');
    expect(match.possiblyRelatedTask).toBeNull();
  });

  it('findDuplicateHealthTask surfaces ambiguous REPAIR as possibly related', () => {
    const tasks = [
      apiTask({
        id: 'repair-only',
        type: 'REPAIR',
        sourceType: 'HEALTH',
        metadata: {
          sourceType: 'HEALTH',
          organizationId: ORG_ID,
          vehicleId: VEHICLE_ID,
          healthModule: 'brakes',
        },
      }),
    ];

    const match = findDuplicateHealthTask(tasks, {
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      module: 'brakes',
    });
    expect(match.matchKind).toBe('possibly_related');
    expect(match.task).toBeNull();
    expect(match.possiblyRelatedTask?.id).toBe('repair-only');
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
