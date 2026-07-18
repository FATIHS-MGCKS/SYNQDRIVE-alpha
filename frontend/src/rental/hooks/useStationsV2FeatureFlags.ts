import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { StationsV2FeatureFlagsResponse } from '../lib/stations-v2-feature-flags';
import { useRentalOrg } from '../RentalContext';

export function useStationsV2FeatureFlags() {
  const { orgId } = useRentalOrg();
  const [flags, setFlags] = useState<StationsV2FeatureFlagsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!orgId) {
      setFlags(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    api.stations
      .featureFlags(orgId)
      .then((response) => {
        if (!cancelled) {
          setFlags(response);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setFlags(null);
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return {
    orgId,
    flags,
    loading,
    error,
    uiEnabled: flags?.stationsUiV2Enabled ?? false,
    scopeEnabled: flags?.stationsScopeV2Enabled ?? false,
    summaryEnabled: flags?.stationSummaryV2Enabled ?? false,
    transfersEnabled: flags?.stationTransfersEnabled ?? false,
    bookingRulesEnabled: flags?.stationBookingRulesEnabled ?? false,
    bookingRulesEnforcement: flags?.bookingRulesEnforcement ?? 'off',
  };
}
