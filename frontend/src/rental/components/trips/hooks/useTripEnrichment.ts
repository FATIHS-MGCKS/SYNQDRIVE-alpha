import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../../lib/api';
import type { TripEnrichment } from '../../../../lib/api';
import type { TripData } from '../trips.types';

export function useTripEnrichment(vehicleId?: string, onTripsReload?: () => void) {
  const [enrichments, setEnrichments] = useState<Record<string, TripEnrichment>>({});
  const [enrichingId, setEnrichingId] = useState<string | null>(null);

  const enrichTrip = useCallback(
    async (trip: TripData) => {
      if (!vehicleId || enrichingId) return;
      setEnrichingId(trip.id);
      try {
        const result = await api.vehicleIntelligence.enrichTrip(vehicleId, trip.id);
        if (result) {
          setEnrichments((prev) => ({ ...prev, [trip.id]: result }));
          onTripsReload?.();
        }
      } catch {
        /* silent */
      }
      setEnrichingId(null);
    },
    [vehicleId, enrichingId, onTripsReload],
  );

  return { enrichments, enrichingId, enrichTrip };
}

export function useAutoTripEnrichment(
  selectedTrip: TripData | null,
  enrichments: Record<string, TripEnrichment>,
  enrichingId: string | null,
  enrichTrip: (trip: TripData) => void,
) {
  useEffect(() => {
    if (!selectedTrip || enrichingId) return;
    if (selectedTrip.enrichedAt || enrichments[selectedTrip.id]) return;
    enrichTrip(selectedTrip);
  }, [selectedTrip?.id]);
}
