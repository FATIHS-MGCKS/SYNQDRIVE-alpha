import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../../lib/api';
import type {
  OrganizationRentalRulesDto,
  RentalFleetVehicleDto,
  RentalRulesOverviewDto,
  RentalVehicleCategoryDto,
} from './rental-rules.types';
import { parseApiError } from './rental-rules.utils';

export function useRentalRulesCenter(orgId: string | null) {
  const [overview, setOverview] = useState<RentalRulesOverviewDto | null>(null);
  const [defaults, setDefaults] = useState<OrganizationRentalRulesDto | null>(null);
  const [categories, setCategories] = useState<RentalVehicleCategoryDto[]>([]);
  const [fleetVehicles, setFleetVehicles] = useState<RentalFleetVehicleDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) {
      setOverview(null);
      setDefaults(null);
      setCategories([]);
      setFleetVehicles([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [ov, defs, cats, fleet] = await Promise.all([
        api.rentalRules.overview(orgId),
        api.rentalRules.getDefaults(orgId),
        api.rentalRules.listCategories(orgId, true),
        api.rentalRules.fleetVehicles(orgId),
      ]);
      setOverview(ov);
      setDefaults(defs);
      setCategories(cats);
      setFleetVehicles(fleet);
    } catch (e: unknown) {
      setError(parseApiError(e));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async <T,>(id: string, fn: () => Promise<T>): Promise<T | null> => {
      setActionId(id);
      try {
        const result = await fn();
        await load();
        return result;
      } finally {
        setActionId(null);
      }
    },
    [load],
  );

  return {
    overview,
    defaults,
    categories,
    fleetVehicles,
    loading,
    error,
    actionId,
    load,
    runAction,
    setDefaults,
    setCategories,
  };
}
