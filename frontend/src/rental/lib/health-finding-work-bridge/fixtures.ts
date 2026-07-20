import type { ApiTask, RentalHealthModule, RentalHealthSourceFinding } from '../../../lib/api';
import type { HealthActionModule } from '../health-task-bridge.utils';

export const ORG_A = 'org-alpha';
export const ORG_B = 'org-beta';
export const VEHICLE_A = 'veh-alpha';
export const VEHICLE_B = 'veh-beta';

export function findingId(seed: string): string {
  const normalized = seed.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'finding';
  return normalized.padEnd(64, '0').slice(0, 64);
}

export function sourceFinding(
  overrides: Partial<RentalHealthSourceFinding> & Pick<RentalHealthSourceFinding, 'source_finding_id'>,
): RentalHealthSourceFinding {
  return {
    finding_code: 'FINDING_CODE',
    source_entity_type: 'rental_reason_code',
    source_entity_id: 'entity-1',
    finding_occurrence_id: 'occ'.repeat(32),
    occurrence_generation: 1,
    version: 'health-finding-identity-v1',
    first_observed_at: '2026-06-22T00:00:00.000Z',
    current_observed_at: '2026-06-22T00:00:00.000Z',
    severity: 'critical',
    ...overrides,
  };
}

export function rentalModule(
  state: RentalHealthModule['state'],
  sourceFindings?: RentalHealthSourceFinding[],
): RentalHealthModule {
  return {
    state,
    reason: `${state} module reason`,
    last_updated_at: '2026-06-22T00:00:00.000Z',
    data_stale: false,
    ...(sourceFindings ? { source_findings: sourceFindings } : {}),
  };
}

export function healthTask(
  overrides: Partial<ApiTask> & Pick<ApiTask, 'id'>,
): ApiTask {
  return {
    organizationId: ORG_A,
    title: 'Health service task',
    description: '',
    category: 'Service',
    type: 'VEHICLE_SERVICE',
    status: 'OPEN',
    priority: 'NORMAL',
    source: null,
    sourceType: 'HEALTH',
    dedupKey: null,
    vehicleId: VEHICLE_A,
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
    createdAt: '2026-06-22T00:00:00.000Z',
    updatedAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

export function healthMetadata(opts: {
  organizationId?: string;
  vehicleId?: string;
  module: HealthActionModule;
  sourceFindingId?: string;
  findingCode?: string;
  occurrenceGeneration?: number;
}) {
  return {
    sourceType: 'HEALTH' as const,
    organizationId: opts.organizationId ?? ORG_A,
    vehicleId: opts.vehicleId ?? VEHICLE_A,
    healthModule: opts.module,
    ...(opts.sourceFindingId
      ? {
          sourceFindingId: opts.sourceFindingId,
          findingCode: opts.findingCode ?? 'FINDING_CODE',
          sourceEntityType: 'rental_reason_code',
          sourceEntityId: 'entity-1',
          findingVersion: 'health-finding-identity-v1',
        }
      : {}),
    ...(opts.occurrenceGeneration ? { occurrenceGeneration: opts.occurrenceGeneration } : {}),
  };
}

export function duplicateQuery(
  module: HealthActionModule,
  sourceFindingId: string,
  organizationId = ORG_A,
  vehicleId = VEHICLE_A,
) {
  return { organizationId, vehicleId, module, sourceFindingId };
}
