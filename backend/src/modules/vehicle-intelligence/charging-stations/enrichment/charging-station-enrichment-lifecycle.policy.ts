import type { VehicleEnergyEventChargingStationEnrichment } from '@prisma/client';
import { CHARGING_STATION_RESOLVER_VERSION } from '../charging-station-location.types';
import { isRetryableChargingStationResolutionStatus } from './charging-station-enrichment-trust.policy';

export type ChargingStationEnrichmentAutomaticSkipReason =
  | 'terminal_failed'
  | 'terminal_completed';

export function getChargingStationEnrichmentAutomaticSkipReason(input: {
  enrichment: VehicleEnergyEventChargingStationEnrichment | null | undefined;
  inputFingerprint: string;
  resolverVersion?: string;
}): ChargingStationEnrichmentAutomaticSkipReason | null {
  const resolverVersion = input.resolverVersion ?? CHARGING_STATION_RESOLVER_VERSION;
  const existing = input.enrichment;
  if (!existing) return null;
  if (existing.inputFingerprint !== input.inputFingerprint) return null;
  if (existing.resolverVersion !== resolverVersion) return null;

  if (existing.processingStatus === 'FAILED') {
    return 'terminal_failed';
  }

  if (existing.processingStatus === 'COMPLETED') {
    if (existing.resolutionStatus == null) return null;
    if (isRetryableChargingStationResolutionStatus(existing.resolutionStatus)) {
      return null;
    }
    return 'terminal_completed';
  }

  return null;
}

export function shouldSkipAutomaticChargingStationEnrichment(input: {
  enrichment: VehicleEnergyEventChargingStationEnrichment | null | undefined;
  inputFingerprint: string;
  resolverVersion?: string;
}): boolean {
  return getChargingStationEnrichmentAutomaticSkipReason(input) != null;
}
