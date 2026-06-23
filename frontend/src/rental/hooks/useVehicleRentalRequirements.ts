import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type {
  EffectiveRentalRulesDto,
  OrganizationRentalRulesDto,
  VehicleRentalRequirementsDto,
} from '../components/settings/rental-rules/rental-rules.types';
import { parseApiError } from '../components/settings/rental-rules/rental-rules.utils';

export interface UseVehicleRentalRequirementsResult {
  effective: EffectiveRentalRulesDto | null;
  requirements: VehicleRentalRequirementsDto | null;
  orgDefaults: OrganizationRentalRulesDto | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useVehicleRentalRequirements(
  orgId: string | null | undefined,
  vehicleId: string | null | undefined,
  enabled = true,
): UseVehicleRentalRequirementsResult {
  const [effective, setEffective] = useState<EffectiveRentalRulesDto | null>(null);
  const [requirements, setRequirements] = useState<VehicleRentalRequirementsDto | null>(null);
  const [orgDefaults, setOrgDefaults] = useState<OrganizationRentalRulesDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled || !orgId || !vehicleId) {
      setEffective(null);
      setRequirements(null);
      setOrgDefaults(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [eff, req, defs] = await Promise.all([
        api.rentalRules.getVehicleEffective(orgId, vehicleId),
        api.rentalRules.getVehicleRequirements(orgId, vehicleId),
        api.rentalRules.getDefaults(orgId),
      ]);
      setEffective(eff);
      setRequirements(req);
      setOrgDefaults(defs);
    } catch (e: unknown) {
      setError(parseApiError(e));
      setEffective(null);
      setRequirements(null);
      setOrgDefaults(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, orgId, vehicleId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { effective, requirements, orgDefaults, loading, error, reload };
}
