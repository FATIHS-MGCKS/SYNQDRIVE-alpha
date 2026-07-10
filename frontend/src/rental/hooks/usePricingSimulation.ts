import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { PricingInputPayload, PricingSimulationResult } from '../pricing/pricingTypes';
import { parseApiError } from '../pricing/pricingUtils';

export interface SimulatePriceParams {
  vehicleId: string;
  pickupAt: string;
  returnAt: string;
  pricing?: PricingInputPayload;
}

export function usePricingSimulation(
  orgId: string | null | undefined,
  params: SimulatePriceParams | null,
  debounceMs = 400,
) {
  const [result, setResult] = useState<PricingSimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async () => {
    if (!orgId || !params?.vehicleId || !params.pickupAt || !params.returnAt) {
      setResult(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.pricing.simulate(orgId, {
        vehicleId: params.vehicleId,
        pickupAt: params.pickupAt,
        returnAt: params.returnAt,
        selectedMileagePackageId: params.pricing?.selectedMileagePackageId,
        selectedInsuranceOptionIds: params.pricing?.selectedInsuranceOptionIds,
        selectedExtraOptionIds: params.pricing?.selectedExtraOptionIds,
        manualDiscountCents: params.pricing?.manualDiscountCents,
        manualAdjustmentCents: params.pricing?.manualAdjustmentCents,
      });
      setResult(data);
    } catch (e: unknown) {
      setResult(null);
      setError(parseApiError(e));
    } finally {
      setLoading(false);
    }
  }, [orgId, params]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!params?.vehicleId || !params.pickupAt || !params.returnAt) {
      setResult(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(() => {
      void run();
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [params, debounceMs, run]);

  return { result, loading, error, refresh: run };
}
