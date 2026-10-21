import type {
  ChargingStationEnrichmentProcessingStatus,
  ChargingStationEnrichmentResolutionStatus,
  ChargingStationMatchConfidence,
  VehicleEnergyEventChargingStationEnrichment,
} from '@prisma/client';
import { isTrustedChargingStationAssignment } from '../charging-stations/enrichment/charging-station-enrichment-trust.policy';

export interface EnergyEventChargingStationDto {
  osmType: string | null;
  osmId: string | null;
  name: string | null;
  brand: string | null;
  operator: string | null;
  network: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  geometryDistanceMeters: number | null;
  pointDistanceMeters: number | null;
  access: string | null;
  fee: string | null;
  capacity: string | null;
  connectors: unknown;
  stationMaxOutputKw: number | null;
}

export interface EnergyEventChargingStationEnrichmentDto {
  processingStatus: ChargingStationEnrichmentProcessingStatus;
  resolutionStatus: ChargingStationEnrichmentResolutionStatus | null;
  trusted: boolean;
  matchConfidence: ChargingStationMatchConfidence | null;
  score: number | null;
  station?: EnergyEventChargingStationDto;
  resolverVersion: string | null;
  osmDatasetVersion: string | null;
  resolvedAt: string | null;
}

function buildChargingStationDto(
  enrichment: VehicleEnergyEventChargingStationEnrichment,
): EnergyEventChargingStationDto | undefined {
  if (enrichment.resolutionStatus !== 'MATCHED') {
    return undefined;
  }

  const hasStationData =
    enrichment.osmType != null ||
    enrichment.osmId != null ||
    enrichment.stationName != null ||
    enrichment.stationLatitude != null;

  if (!hasStationData) {
    return undefined;
  }

  return {
    osmType: enrichment.osmType,
    osmId: enrichment.osmId,
    name: enrichment.stationName,
    brand: enrichment.brand,
    operator: enrichment.operator,
    network: enrichment.network,
    address: enrichment.address,
    latitude: enrichment.stationLatitude,
    longitude: enrichment.stationLongitude,
    geometryDistanceMeters: enrichment.geometryDistanceMeters,
    pointDistanceMeters: enrichment.pointDistanceMeters,
    access: enrichment.access,
    fee: enrichment.fee,
    capacity: enrichment.capacity,
    connectors: enrichment.connectors ?? null,
    stationMaxOutputKw: enrichment.stationMaxOutputKw,
  };
}

export function toChargingStationEnrichmentDto(
  enrichment: VehicleEnergyEventChargingStationEnrichment,
): EnergyEventChargingStationEnrichmentDto {
  const trusted = isTrustedChargingStationAssignment({
    resolutionStatus: enrichment.resolutionStatus,
    matchConfidence: enrichment.matchConfidence,
  });
  const station = buildChargingStationDto(enrichment);

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
