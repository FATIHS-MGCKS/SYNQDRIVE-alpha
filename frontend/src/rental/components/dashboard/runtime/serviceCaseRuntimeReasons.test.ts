import { describe, expect, it } from 'vitest';
import type { ApiServiceCase } from '../../../../lib/api';
import {
  ACTIVE_SERVICE_CASE_STATUSES,
  blockingServiceCasesForVehicle,
  createServiceCaseRuntimeReason,
  isActiveServiceCaseStatus,
  isBlockingServiceCase,
  SERVICE_CASE_RUNTIME_REASON_CODE,
} from './serviceCaseRuntimeReasons';

function serviceCase(overrides: Partial<ApiServiceCase> = {}): ApiServiceCase {
  return {
    id: overrides.id ?? 'sc-1',
    organizationId: overrides.organizationId ?? 'org-1',
    vehicleId: overrides.vehicleId ?? 'v1',
    vendorId: overrides.vendorId ?? null,
    title: overrides.title ?? 'Bremsen Service',
    description: overrides.description ?? 'Bremsbeläge tauschen',
    category: overrides.category ?? 'BRAKES',
    status: overrides.status ?? 'IN_PROGRESS',
    priority: overrides.priority ?? 'HIGH',
    source: overrides.source ?? 'HEALTH',
    openedAt: overrides.openedAt ?? '2026-07-10T08:00:00.000Z',
    scheduledAt: overrides.scheduledAt ?? '2026-07-18T09:00:00.000Z',
    expectedReadyAt: overrides.expectedReadyAt ?? '2026-07-19T17:00:00.000Z',
    completedAt: overrides.completedAt ?? null,
    cancelledAt: overrides.cancelledAt ?? null,
    estimatedCostCents: overrides.estimatedCostCents ?? null,
    actualCostCents: overrides.actualCostCents ?? null,
    downtimeStart: overrides.downtimeStart ?? null,
    downtimeEnd: overrides.downtimeEnd ?? null,
    blocksRental: overrides.blocksRental ?? true,
    completionNotes: overrides.completionNotes ?? null,
    documentId: overrides.documentId ?? null,
    metadata: overrides.metadata ?? null,
    createdByUserId: overrides.createdByUserId ?? null,
    updatedByUserId: overrides.updatedByUserId ?? null,
    createdAt: overrides.createdAt ?? '2026-07-10T08:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-07-10T08:00:00.000Z',
    taskCount: overrides.taskCount ?? 0,
    tasks: overrides.tasks ?? [],
    comments: overrides.comments,
    attachments: overrides.attachments,
  };
}

describe('serviceCaseRuntimeReasons', () => {
  it('treats only active statuses as blocking candidates', () => {
    for (const status of ACTIVE_SERVICE_CASE_STATUSES) {
      expect(isActiveServiceCaseStatus(status)).toBe(true);
      expect(isBlockingServiceCase(serviceCase({ status }))).toBe(true);
    }

    expect(isBlockingServiceCase(serviceCase({ status: 'COMPLETED' }))).toBe(false);
    expect(isBlockingServiceCase(serviceCase({ status: 'CANCELLED' }))).toBe(false);
  });

  it('ignores cases without blocksRental', () => {
    expect(isBlockingServiceCase(serviceCase({ blocksRental: false }))).toBe(false);
  });

  it('creates a runtime reason with required service-case metadata', () => {
    const reason = createServiceCaseRuntimeReason(
      serviceCase({
        id: 'sc-42',
        title: 'Getriebe Diagnose',
        status: 'WAITING_VENDOR',
      }),
    );

    expect(reason).toMatchObject({
      reasonCode: SERVICE_CASE_RUNTIME_REASON_CODE,
      serviceCaseId: 'sc-42',
      title: 'Getriebe Diagnose',
      status: 'WAITING_VENDOR',
      scheduledAt: '2026-07-18T09:00:00.000Z',
      expectedReadyAt: '2026-07-19T17:00:00.000Z',
      blocking: true,
      source: 'SERVICE_CASE',
      category: 'operational',
      severity: 'critical',
    });
  });

  it('filters blocking cases per vehicle', () => {
    const cases = [
      serviceCase({ id: 'sc-a', vehicleId: 'v1' }),
      serviceCase({ id: 'sc-b', vehicleId: 'v2', blocksRental: false }),
      serviceCase({ id: 'sc-c', vehicleId: 'v1', status: 'COMPLETED' }),
      serviceCase({ id: 'sc-d', vehicleId: 'v1', title: 'Zweiter Case' }),
    ];

    expect(blockingServiceCasesForVehicle(cases, 'v1').map((item) => item.id)).toEqual([
      'sc-a',
      'sc-d',
    ]);
  });
});
