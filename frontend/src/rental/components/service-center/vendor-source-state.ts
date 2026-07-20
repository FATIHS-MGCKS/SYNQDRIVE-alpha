import type { Vendor } from '../../../lib/api';

export type VendorSourceState = 'idle' | 'loading' | 'ready' | 'error' | 'stale';

export const VENDOR_SOURCE_ERROR_MESSAGE = 'Partnerdaten konnten nicht geladen werden.';

export function normalizeVendorList(response: unknown): Vendor[] {
  return Array.isArray(response) ? response : [];
}

export function resolveVendorSourceAfterSuccess(
  response: unknown,
  fetchedAt: string,
): { vendors: Vendor[]; status: 'ready'; fetchedAt: string; error: null } {
  return {
    vendors: normalizeVendorList(response),
    status: 'ready',
    fetchedAt,
    error: null,
  };
}

export function resolveVendorSourceAfterError(
  previousVendors: Vendor[],
  previousStatus: VendorSourceState,
): {
  vendors: Vendor[];
  status: 'error' | 'stale';
  error: string;
} {
  const hadPriorData =
    previousStatus === 'ready' ||
    previousStatus === 'stale' ||
    previousVendors.length > 0;

  if (hadPriorData) {
    return {
      vendors: previousVendors,
      status: 'stale',
      error: VENDOR_SOURCE_ERROR_MESSAGE,
    };
  }

  return {
    vendors: [],
    status: 'error',
    error: VENDOR_SOURCE_ERROR_MESSAGE,
  };
}
