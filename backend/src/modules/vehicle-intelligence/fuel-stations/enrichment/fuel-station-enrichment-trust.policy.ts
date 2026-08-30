import type {
  FuelStationEnrichmentResolutionStatus,
  FuelStationMatchConfidence,
} from '@prisma/client';

/**
 * Station-match trust policy — separate from VehicleEnergyEvent.confidence.
 * LOW matches are diagnostic only; HIGH/MEDIUM are trusted assignments.
 */
export function isTrustedFuelStationAssignment(input: {
  resolutionStatus: FuelStationEnrichmentResolutionStatus | null | undefined;
  matchConfidence: FuelStationMatchConfidence | null | undefined;
}): boolean {
  return (
    input.resolutionStatus === 'MATCHED' &&
    (input.matchConfidence === 'HIGH' || input.matchConfidence === 'MEDIUM')
  );
}

export function isRetryableFuelStationResolutionStatus(
  resolutionStatus: FuelStationEnrichmentResolutionStatus | null | undefined,
): boolean {
  return resolutionStatus === 'ERROR';
}

export function isTerminalFuelStationResolutionStatus(
  resolutionStatus: FuelStationEnrichmentResolutionStatus,
): boolean {
  return resolutionStatus !== 'ERROR';
}
