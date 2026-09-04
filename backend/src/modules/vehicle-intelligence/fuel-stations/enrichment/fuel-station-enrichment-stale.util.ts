import type { VehicleEnergyEventFuelStationEnrichment } from '@prisma/client';
import { getFuelStationEnrichmentAutomaticSkipReason } from './fuel-station-enrichment-lifecycle.policy';

/** Aligns with legacy fuel-station enrichment recovery stale PROCESSING threshold. */
export const FUEL_STATION_ENRICHMENT_STALE_PROCESSING_MS = 15 * 60_000;

export function isFuelStationEnrichmentStaleProcessing(
  enrichment: Pick<VehicleEnergyEventFuelStationEnrichment, 'processingStatus' | 'lastAttemptAt'>,
  asOfMs: number,
  staleProcessingMs: number = FUEL_STATION_ENRICHMENT_STALE_PROCESSING_MS,
): boolean {
  return (
    enrichment.processingStatus === 'PROCESSING' &&
    enrichment.lastAttemptAt != null &&
    enrichment.lastAttemptAt.getTime() < asOfMs - staleProcessingMs
  );
}

/**
 * V2-owned stale enrichment recoverable via physical-refuel recovery (stale_enrichment).
 * PENDING or stale PROCESSING only — never COMPLETED/terminal FAILED/active PROCESSING.
 */
export function isV2StaleEnrichmentRecoverable(
  enrichment: VehicleEnergyEventFuelStationEnrichment | null | undefined,
  asOfMs: number,
  inputFingerprint?: string,
): boolean {
  if (!enrichment) return false;

  if (inputFingerprint) {
    const terminalSkip = getFuelStationEnrichmentAutomaticSkipReason({
      enrichment,
      inputFingerprint,
    });
    if (terminalSkip) return false;
  }

  if (enrichment.processingStatus === 'PENDING') return true;
  if (isFuelStationEnrichmentStaleProcessing(enrichment, asOfMs)) return true;
  return false;
}
