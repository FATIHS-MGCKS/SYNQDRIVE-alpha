import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import {
  buildTechnicalSpecsView,
  type ConnectedVehicleTechnicalSpecsView,
  type MotionPhysicsEvidenceTierUi,
} from './connected-vehicle-technical-specs.util';

export function useConnectedVehicleTechnicalSpecs(
  vehicleId: string | null,
  organizationId: string | null,
  enabled: boolean,
) {
  const [specs, setSpecs] = useState<ConnectedVehicleTechnicalSpecsView | null>(null);
  const [evidenceTier, setEvidenceTier] = useState<MotionPhysicsEvidenceTierUi>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled || !vehicleId || !organizationId) {
      setSpecs(null);
      setEvidenceTier(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [vehicleDto, motionRef] = await Promise.all([
        api.vehicles.get(vehicleId),
        api.vehicles.motionPhysicsReference
          .getActive(organizationId, vehicleId)
          .catch(() => null),
      ]);

      const tier = (motionRef?.evidenceTier as MotionPhysicsEvidenceTierUi) ?? null;
      setEvidenceTier(tier);
      setSpecs(
        buildTechnicalSpecsView({
          make: vehicleDto?.make,
          model: vehicleDto?.model,
          year: vehicleDto?.year,
          fuelType: vehicleDto?.fuelType,
          curbWeight: vehicleDto?.curbWeight,
          systemMotorPowerKw: vehicleDto?.systemMotorPowerKw,
          accel0To100S: vehicleDto?.accel0To100S,
          variantAssumption: vehicleDto?.motionPhysicsVariantAssumption,
          motionReference: motionRef,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'LOAD_FAILED');
      setSpecs(null);
      setEvidenceTier(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, organizationId, vehicleId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { specs, evidenceTier, loading, error, refresh: load };
}
