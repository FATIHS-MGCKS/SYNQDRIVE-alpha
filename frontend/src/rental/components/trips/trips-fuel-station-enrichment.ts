import type { EnergyEvent, EnergyEventStationEnrichment } from '../../../lib/api';

export type FuelStationPresentationMode =
  | 'trusted'
  | 'possible'
  | 'ambiguous'
  | 'resolving'
  | 'none';

export interface FuelStationPresentation {
  mode: FuelStationPresentationMode;
  /** Primary human-readable station label (name or brand). */
  primaryLabel: string | null;
  /** Secondary line — typically address or supplemental brand. */
  secondaryLabel: string | null;
  /** Whether raw event coordinates should remain visible in the metrics row. */
  showCoordinatesFallback: boolean;
}

function stationIdentity(station: NonNullable<EnergyEventStationEnrichment['station']>): {
  primaryLabel: string | null;
  secondaryLabel: string | null;
} {
  const name = station.name?.trim() || null;
  const brand = station.brand?.trim() || null;
  const address = station.address?.trim() || null;

  const primaryLabel = name ?? brand;
  let secondaryLabel = address;

  if (name && brand && brand.toLowerCase() !== name.toLowerCase()) {
    secondaryLabel = address ? `${address} · ${brand}` : brand;
  }

  return { primaryLabel, secondaryLabel };
}

/**
 * Deterministic presentation policy for persisted fuel-station enrichment.
 * Trust semantics mirror backend Phase D/E (`trusted` flag).
 */
export function resolveFuelStationPresentation(
  enrichment: EnergyEventStationEnrichment | undefined,
): FuelStationPresentation {
  if (!enrichment) {
    return {
      mode: 'none',
      primaryLabel: null,
      secondaryLabel: null,
      showCoordinatesFallback: true,
    };
  }

  if (
    enrichment.processingStatus === 'PENDING' ||
    enrichment.processingStatus === 'PROCESSING'
  ) {
    return {
      mode: 'resolving',
      primaryLabel: null,
      secondaryLabel: null,
      showCoordinatesFallback: true,
    };
  }

  if (enrichment.trusted && enrichment.station) {
    const { primaryLabel, secondaryLabel } = stationIdentity(enrichment.station);
    if (primaryLabel || secondaryLabel) {
      return {
        mode: 'trusted',
        primaryLabel,
        secondaryLabel,
        showCoordinatesFallback: false,
      };
    }
  }

  if (
    enrichment.resolutionStatus === 'MATCHED' &&
    !enrichment.trusted &&
    enrichment.station
  ) {
    const { primaryLabel, secondaryLabel } = stationIdentity(enrichment.station);
    return {
      mode: 'possible',
      primaryLabel,
      secondaryLabel,
      showCoordinatesFallback: true,
    };
  }

  if (enrichment.resolutionStatus === 'AMBIGUOUS') {
    return {
      mode: 'ambiguous',
      primaryLabel: null,
      secondaryLabel: null,
      showCoordinatesFallback: true,
    };
  }

  return {
    mode: 'none',
    primaryLabel: null,
    secondaryLabel: null,
    showCoordinatesFallback: true,
  };
}

export function resolveRefuelFuelStationPresentation(
  event: EnergyEvent,
): FuelStationPresentation {
  if (event.kind !== 'REFUEL') {
    return {
      mode: 'none',
      primaryLabel: null,
      secondaryLabel: null,
      showCoordinatesFallback: true,
    };
  }
  return resolveFuelStationPresentation(event.stationEnrichment);
}
