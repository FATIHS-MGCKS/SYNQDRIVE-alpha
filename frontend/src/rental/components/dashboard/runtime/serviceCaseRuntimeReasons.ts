import type { ApiServiceCase, ApiServiceCaseStatus } from '../../../../lib/api';
import { createRuntimeReason } from './dashboardRuntimeReasons';
import type { RuntimeReason } from './dashboardRuntimeTypes';

export const SERVICE_CASE_RUNTIME_REASON_CODE = 'SERVICE_CASE_BLOCKS_RENTAL';

export const ACTIVE_SERVICE_CASE_STATUSES: readonly ApiServiceCaseStatus[] = [
  'OPEN',
  'SCHEDULED',
  'IN_PROGRESS',
  'WAITING_VENDOR',
  'WAITING_PARTS',
] as const;

const ACTIVE_SERVICE_CASE_STATUS_SET = new Set<ApiServiceCaseStatus>(ACTIVE_SERVICE_CASE_STATUSES);

export function isActiveServiceCaseStatus(status: ApiServiceCaseStatus): boolean {
  return ACTIVE_SERVICE_CASE_STATUS_SET.has(status);
}

export function isBlockingServiceCase(serviceCase: ApiServiceCase): boolean {
  return serviceCase.blocksRental === true && isActiveServiceCaseStatus(serviceCase.status);
}

export function createServiceCaseRuntimeReason(serviceCase: ApiServiceCase): RuntimeReason {
  return createRuntimeReason({
    category: 'operational',
    severity: 'critical',
    title: serviceCase.title,
    description: serviceCase.description?.trim() || undefined,
    source: 'SERVICE_CASE',
    blocking: true,
    preventsReady: true,
    reasonCode: SERVICE_CASE_RUNTIME_REASON_CODE,
    serviceCaseId: serviceCase.id,
    status: serviceCase.status,
    scheduledAt: serviceCase.scheduledAt,
    expectedReadyAt: serviceCase.expectedReadyAt,
  });
}

export function blockingServiceCasesForVehicle(
  serviceCases: ApiServiceCase[] | undefined,
  vehicleId: string,
): ApiServiceCase[] {
  if (!serviceCases?.length) return [];
  return serviceCases.filter(
    (serviceCase) => serviceCase.vehicleId === vehicleId && isBlockingServiceCase(serviceCase),
  );
}
