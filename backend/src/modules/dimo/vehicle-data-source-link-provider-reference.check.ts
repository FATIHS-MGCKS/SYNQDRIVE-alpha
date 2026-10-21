/**
 * Mirrors DB CHECK `vehicle_data_source_links_provider_reference_check`.
 * Keep in sync with migration SQL.
 */
export type ProviderReferenceCheckInput = {
  provider: string;
  sourceType: string;
  dimoVehicleId: string | null;
  sourceReferenceId: string | null;
};

export type ProviderReferenceCheckResult =
  | { valid: true; classification: 'DIMO' | 'HM_CANONICAL' | 'HM_LEGACY' }
  | { valid: false; reason: string };

export function evaluateProviderReferenceCheck(
  input: ProviderReferenceCheckInput,
): ProviderReferenceCheckResult {
  const { provider, sourceType, dimoVehicleId, sourceReferenceId } = input;
  const hasDimo = dimoVehicleId != null;
  const hasHmRef = sourceReferenceId != null;

  if (hasDimo && hasHmRef) {
    return { valid: false, reason: 'both_provider_references_populated' };
  }

  if (
    provider === 'DIMO' &&
    sourceType === 'DIMO' &&
    hasDimo &&
    !hasHmRef
  ) {
    return { valid: true, classification: 'DIMO' };
  }

  if (
    provider === 'HIGH_MOBILITY' &&
    sourceType === 'HIGH_MOBILITY' &&
    !hasDimo &&
    hasHmRef
  ) {
    return { valid: true, classification: 'HM_CANONICAL' };
  }

  if (
    provider === 'UNKNOWN' &&
    sourceType === 'HIGH_MOBILITY' &&
    !hasDimo &&
    hasHmRef
  ) {
    return { valid: true, classification: 'HM_LEGACY' };
  }

  if (provider === 'DIMO' || sourceType === 'DIMO') {
    return { valid: false, reason: 'invalid_dimo_combination' };
  }

  if (sourceType === 'HIGH_MOBILITY') {
    return { valid: false, reason: 'invalid_high_mobility_combination' };
  }

  return { valid: false, reason: 'unsupported_provider_source_type' };
}

/** SQL predicate equivalent for read-only Production verification. */
export function productionLegacyHmRowPassesCheck(input: {
  provider: string;
  sourceType: string;
  sourceReferenceId: string | null;
  dimoVehicleId: string | null;
}): boolean {
  return evaluateProviderReferenceCheck(input).valid;
}
