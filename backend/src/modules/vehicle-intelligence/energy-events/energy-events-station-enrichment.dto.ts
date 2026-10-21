import type {
  FuelStationEnrichmentProcessingStatus,
  FuelStationEnrichmentResolutionStatus,
  FuelStationMatchConfidence,
  VehicleEnergyEventFuelStationEnrichment,
} from '@prisma/client';
import { isTrustedFuelStationAssignment } from '../fuel-stations/enrichment/fuel-station-enrichment-trust.policy';

/**
 * Nested station presentation for a persisted fuel-station enrichment row.
 * Only populated for MATCHED resolutions that carry station fields.
 */
export interface EnergyEventStationDto {
  osmType: string | null;
  osmId: string | null;
  name: string | null;
  brand: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number | null;
}

/**
 * Read-only API projection of VehicleEnergyEventFuelStationEnrichment.
 *
 * `trusted` uses the canonical Phase D trust policy (MATCHED + HIGH/MEDIUM).
 * `matchConfidence` / `score` are station-match fields — separate from
 * VehicleEnergyEvent.confidence (REFUEL detection confidence).
 */
export interface EnergyEventStationEnrichmentDto {
  processingStatus: FuelStationEnrichmentProcessingStatus;
  resolutionStatus: FuelStationEnrichmentResolutionStatus | null;
  trusted: boolean;
  matchConfidence: FuelStationMatchConfidence | null;
  score: number | null;
  station?: EnergyEventStationDto;
  resolverVersion: string | null;
  osmDatasetVersion: string | null;
  resolvedAt: string | null;
}

function buildStationDto(
  enrichment: VehicleEnergyEventFuelStationEnrichment,
): EnergyEventStationDto | undefined {
  if (enrichment.resolutionStatus !== 'MATCHED') {
    return undefined;
  }

  const hasStationData =
    enrichment.osmType != null ||
    enrichment.osmId != null ||
    enrichment.stationName != null ||
    enrichment.stationLatitude != null ||
    enrichment.stationLongitude != null;

  if (!hasStationData) {
    return undefined;
  }

  return {
    osmType: enrichment.osmType,
    osmId: enrichment.osmId,
    name: enrichment.stationName,
    brand: enrichment.brand,
    address: enrichment.address,
    latitude: enrichment.stationLatitude,
    longitude: enrichment.stationLongitude,
    distanceMeters: enrichment.distanceMeters,
  };
}

export function toStationEnrichmentDto(
  enrichment: VehicleEnergyEventFuelStationEnrichment,
): EnergyEventStationEnrichmentDto {
  const trusted = isTrustedFuelStationAssignment({
    resolutionStatus: enrichment.resolutionStatus,
    matchConfidence: enrichment.matchConfidence,
  });
  const station = buildStationDto(enrichment);

  return {
    processingStatus: enrichment.processingStatus,
    resolutionStatus: enrichment.resolutionStatus,
    trusted,
    matchConfidence: enrichment.matchConfidence,
    score: enrichment.matchScore,
    ...(station ? { station } : {}),
    resolverVersion: enrichment.resolverVersion,
    osmDatasetVersion: enrichment.osmDatasetVersion,
    resolvedAt: enrichment.resolvedAt?.toISOString() ?? null,
  };
}
