import type { VehicleEnergyEventChargingStationEnrichment } from '@prisma/client';
import { getChargingStationEnrichmentAutomaticSkipReason } from './charging-station-enrichment-lifecycle.policy';

export const CHARGING_STATION_ENRICHMENT_STALE_PROCESSING_MS = 15 * 60_000;

export function isChargingStationEnrichmentStaleProcessing(
  enrichment: Pick<VehicleEnergyEventChargingStationEnrichment, 'processingStatus' | 'lastAttemptAt'>,
  asOfMs: number,
  staleProcessingMs: number = CHARGING_STATION_ENRICHMENT_STALE_PROCESSING_MS,
): boolean {
  return (
    enrichment.processingStatus === 'PROCESSING' &&
    enrichment.lastAttemptAt != null &&
    enrichment.lastAttemptAt.getTime() < asOfMs - staleProcessingMs
  );
}

export function isChargingEnrichmentRecoverable(
  enrichment: VehicleEnergyEventChargingStationEnrichment | null | undefined,
  asOfMs: number,
  inputFingerprint?: string,
): boolean {
  if (!enrichment) return true;

  if (inputFingerprint) {
    const terminalSkip = getChargingStationEnrichmentAutomaticSkipReason({
      enrichment,
      inputFingerprint,
    });
    if (terminalSkip) return false;
  }

  if (enrichment.processingStatus === 'PENDING') return true;
  if (isChargingStationEnrichmentStaleProcessing(enrichment, asOfMs)) return true;
  if (
    enrichment.processingStatus === 'PROCESSING' &&
    enrichment.resolutionStatus === 'ERROR'
  ) {
    return true;
  }
  return false;
}
