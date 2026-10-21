import type {
  ChargingStationEnrichmentResolutionStatus,
  ChargingStationMatchConfidence,
} from '@prisma/client';

export function isTrustedChargingStationAssignment(input: {
  resolutionStatus: ChargingStationEnrichmentResolutionStatus | null | undefined;
  matchConfidence: ChargingStationMatchConfidence | null | undefined;
}): boolean {
  return (
    input.resolutionStatus === 'MATCHED' &&
    (input.matchConfidence === 'HIGH' || input.matchConfidence === 'MEDIUM')
  );
}

export function isRetryableChargingStationResolutionStatus(
  resolutionStatus: ChargingStationEnrichmentResolutionStatus | null | undefined,
): boolean {
  return resolutionStatus === 'ERROR';
}
