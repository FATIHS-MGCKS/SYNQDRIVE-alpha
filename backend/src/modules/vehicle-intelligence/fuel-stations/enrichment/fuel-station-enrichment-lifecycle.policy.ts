import type { VehicleEnergyEventFuelStationEnrichment } from '@prisma/client';
import { FUEL_STATION_RESOLVER_VERSION } from '../fuel-station-location.types';
import { isRetryableFuelStationResolutionStatus } from './fuel-station-enrichment-trust.policy';

export type FuelStationEnrichmentAutomaticSkipReason =
  | 'terminal_failed'
  | 'terminal_completed';

/**
 * Database-authoritative gate for automatic producer/recovery/orchestrator paths.
 * FAILED and COMPLETED rows with the same fingerprint + resolverVersion are terminal.
 * Manual repair may reset terminal state in a future phase — not automatic paths.
 */
export function getFuelStationEnrichmentAutomaticSkipReason(input: {
  enrichment: VehicleEnergyEventFuelStationEnrichment | null | undefined;
  inputFingerprint: string;
  resolverVersion?: string;
}): FuelStationEnrichmentAutomaticSkipReason | null {
  const resolverVersion = input.resolverVersion ?? FUEL_STATION_RESOLVER_VERSION;
  const existing = input.enrichment;
  if (!existing) return null;
  if (existing.inputFingerprint !== input.inputFingerprint) return null;
  if (existing.resolverVersion !== resolverVersion) return null;

  if (existing.processingStatus === 'FAILED') {
    return 'terminal_failed';
  }

  if (existing.processingStatus === 'COMPLETED') {
    if (existing.resolutionStatus == null) return null;
    if (isRetryableFuelStationResolutionStatus(existing.resolutionStatus)) {
      return null;
    }
    return 'terminal_completed';
  }

  return null;
}

export function shouldSkipAutomaticFuelStationEnrichment(input: {
  enrichment: VehicleEnergyEventFuelStationEnrichment | null | undefined;
  inputFingerprint: string;
  resolverVersion?: string;
}): boolean {
  return getFuelStationEnrichmentAutomaticSkipReason(input) != null;
}
