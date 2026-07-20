import type { ServiceCaseListFilters } from './types';

function stableFilterKey(filters?: ServiceCaseListFilters): string {
  if (!filters) return '';
  const entries = Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

export const serviceCaseQueryKeys = {
  root: (orgId: string) => ['service-cases', orgId] as const,
  lists: (orgId: string) => ['service-cases', orgId, 'list'] as const,
  list: (orgId: string, filters?: ServiceCaseListFilters) =>
    ['service-cases', orgId, 'list', stableFilterKey(filters)] as const,
  summary: (orgId: string) => ['service-cases', orgId, 'summary'] as const,
  detail: (orgId: string, serviceCaseId: string) =>
    ['service-cases', orgId, 'detail', serviceCaseId] as const,
  forVehicle: (orgId: string, vehicleId: string, filters?: ServiceCaseListFilters) =>
    ['service-cases', orgId, 'vehicle', vehicleId, stableFilterKey(filters)] as const,
  forVendor: (orgId: string, vendorId: string, filters?: ServiceCaseListFilters) =>
    ['service-cases', orgId, 'vendor', vendorId, stableFilterKey(filters)] as const,
};
