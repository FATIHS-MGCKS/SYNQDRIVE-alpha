import { useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import {
  billingQueryKeys,
  parseBillingPaginated,
  serializeBillingQueryKey,
} from './billing-query.utils';
import type {
  TenantBillableVehicleListItemDto,
  TenantSubscriptionTariffDto,
  TenantVehicleBillingChangeDto,
} from '../../types/billing.types';
import { useBillingQuery } from './useBillingQuery';

export interface BillableVehicleListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: 'BILLABLE' | 'EXCLUDED';
  sort?: string;
}

export interface VehicleBillingChangesQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
}

const DEFAULT_VEHICLE_QUERY: BillableVehicleListQuery = {
  page: 1,
  pageSize: 10,
  sort: 'licensePlate',
};

const DEFAULT_CHANGES_QUERY: VehicleBillingChangesQuery = {
  page: 1,
  pageSize: 5,
  sort: '-effectiveAt',
};

export function useBillingTariffVehicles(orgId: string | undefined) {
  const [vehicleQuery, setVehicleQuery] = useState<BillableVehicleListQuery>(DEFAULT_VEHICLE_QUERY);
  const [changesQuery, setChangesQuery] = useState<VehicleBillingChangesQuery>(DEFAULT_CHANGES_QUERY);

  const vehicleQueryKey = serializeBillingQueryKey(vehicleQuery);
  const changesQueryKey = serializeBillingQueryKey(changesQuery);

  const tariffQuery = useBillingQuery<TenantSubscriptionTariffDto>({
    orgId,
    deps: [billingQueryKeys.subscriptionTariff(orgId ?? '')],
    fetcher: (signal) => api.billing.orgSubscriptionTariff(orgId, { signal }),
  });

  const vehiclesQuery = useBillingQuery({
    orgId,
    deps: [billingQueryKeys.billableVehicleList(orgId ?? '', vehicleQueryKey)],
    fetcher: async (signal) => {
      const payload = await api.billing.orgBillableVehiclesList(orgId, vehicleQuery, { signal });
      return parseBillingPaginated<TenantBillableVehicleListItemDto>(payload);
    },
  });

  const changesQueryResult = useBillingQuery({
    orgId,
    deps: [billingQueryKeys.vehicleBillingChanges(orgId ?? '', changesQueryKey)],
    fetcher: async (signal) => {
      const payload = await api.billing.orgVehicleBillingChanges(orgId, changesQuery, { signal });
      return parseBillingPaginated<TenantVehicleBillingChangeDto>(payload);
    },
  });

  return useMemo(
    () => ({
      tariff: tariffQuery.data,
      tariffLoading: tariffQuery.loading,
      tariffError: tariffQuery.error,
      reloadTariff: tariffQuery.reload,
      vehicles: vehiclesQuery.data?.data ?? [],
      vehiclesMeta: vehiclesQuery.data?.meta ?? null,
      vehiclesLoading: vehiclesQuery.loading,
      vehiclesError: vehiclesQuery.error,
      vehicleQuery,
      setVehicleQuery,
      reloadVehicles: vehiclesQuery.reload,
      changes: changesQueryResult.data?.data ?? [],
      changesMeta: changesQueryResult.data?.meta ?? null,
      changesLoading: changesQueryResult.loading,
      changesError: changesQueryResult.error,
      changesQuery,
      setChangesQuery,
      reloadChanges: changesQueryResult.reload,
      reloadAll: async () => {
        await Promise.all([
          tariffQuery.reload(),
          vehiclesQuery.reload(),
          changesQueryResult.reload(),
        ]);
      },
    }),
    [changesQuery, changesQueryResult, tariffQuery, vehicleQuery, vehiclesQuery],
  );
}
