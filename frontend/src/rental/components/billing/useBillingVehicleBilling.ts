import { useMemo } from 'react';
import { api } from '../../../lib/api';
import {
  billingQueryKeys,
  parseBillingPaginated,
  serializeBillingQueryKey,
} from './billing-query.utils';
import type { BillableVehiclesResponseDto } from '../../types/billing.types';
import { useBillingQuery } from './useBillingQuery';

export interface BillingVehicleLicenseItem {
  id: string;
  licensePlate: string | null;
  vehicleLabel: string | null;
  eventTypeLabel: string;
  billingStatusLabel: string;
  effectiveAt: string;
  reason: string | null;
}

export interface BillingVehicleBillingQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  from?: string;
  to?: string;
  sort?: string;
  [key: string]: string | number | undefined;
}

export function useBillingVehicleBilling(
  orgId: string | undefined,
  licenseQuery: BillingVehicleBillingQuery = {},
) {
  const licenseQueryKey = serializeBillingQueryKey(licenseQuery);

  const vehiclesQuery = useBillingQuery<BillableVehiclesResponseDto>({
    orgId,
    deps: [billingQueryKeys.vehicleBilling(orgId ?? '', 'snapshot')],
    fetcher: (signal) => api.billing.orgBillableVehicles(orgId, { signal }),
  });

  const licensesQuery = useBillingQuery({
    orgId,
    deps: [billingQueryKeys.vehicleBilling(orgId ?? '', licenseQueryKey)],
    fetcher: async (signal) => {
      const payload = await api.billing.orgVehicleLicenses(orgId, licenseQuery, { signal });
      return parseBillingPaginated<BillingVehicleLicenseItem>(payload);
    },
  });

  return useMemo(
    () => ({
      billableVehicles: vehiclesQuery.data,
      vehicleLicenses: licensesQuery.data,
      loadingVehicles: vehiclesQuery.loading,
      loadingLicenses: licensesQuery.loading,
      vehiclesError: vehiclesQuery.error,
      licensesError: licensesQuery.error,
      reloadVehicles: vehiclesQuery.reload,
      reloadLicenses: licensesQuery.reload,
      reloadAll: async () => {
        await Promise.all([vehiclesQuery.reload(), licensesQuery.reload()]);
      },
    }),
    [licensesQuery, vehiclesQuery],
  );
}
