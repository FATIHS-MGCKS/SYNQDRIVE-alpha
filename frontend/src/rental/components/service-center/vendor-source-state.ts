export {
  VENDOR_SOURCE_ERROR_MESSAGE,
  normalizeArrayResponse as normalizeVendorList,
  resolveSourceAfterError,
  resolveSourceAfterSuccess,
  type ServiceCenterSourceStatus as VendorSourceState,
} from './service-center-source-state';

import type { Vendor } from '../../../lib/api';
import {
  normalizeArrayResponse,
  resolveSourceAfterError,
  resolveSourceAfterSuccess,
  type ServiceCenterSourceStatus,
} from './service-center-source-state';

export function resolveVendorSourceAfterSuccess(
  response: unknown,
  fetchedAt: string,
): {
  vendors: Vendor[];
  status: 'ready';
  fetchedAt: string;
  error: null;
} {
  const next = resolveSourceAfterSuccess(normalizeArrayResponse<Vendor>(response), fetchedAt);
  return {
    vendors: next.data,
    status: next.status,
    fetchedAt: next.fetchedAt!,
    error: next.error,
  };
}

export function resolveVendorSourceAfterError(
  previousVendors: Vendor[],
  previousStatus: ServiceCenterSourceStatus,
): {
  vendors: Vendor[];
  status: 'error' | 'stale';
  error: string;
} {
  const next = resolveSourceAfterError({
    previousData: previousVendors,
    previousStatus,
    previousFetchedAt: null,
    emptyData: [],
    hasMeaningfulData: (vendors) => vendors.length > 0,
    errorMessage: 'Partnerdaten konnten nicht geladen werden.',
  });
  return {
    vendors: next.data,
    status: next.status,
    error: next.error!,
  };
}
