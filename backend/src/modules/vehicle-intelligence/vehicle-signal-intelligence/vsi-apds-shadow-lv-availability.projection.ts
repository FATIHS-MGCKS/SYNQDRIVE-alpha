import { VsiEmpiricalObservationStatus } from './vehicle-signal-evidence.contract';
import {
  VSI_APDS_SHADOW_LV_AVAILABILITY_CONTRACT_VERSION,
  VsiApdsShadowLvAvailabilityClass,
  type VsiApdsShadowLvAvailabilityProjectionV1,
} from './vsi-apds-shadow-lv-availability.types';

export type ProjectVsiApdsShadowLvAvailabilityInput = {
  organizationId: string;
  vehicleId: string;
  evaluationTimeMs: number;
  providerSourceLinkId: string | null;
  linkActiveAtDecision: boolean;
  tenantScopeMatch: boolean;
  activeSourceLinkCountAtDecision: number;
  historicalLinkAttributionComplete: boolean;
  /** VSI signal profile materialized for the attributed provider link (not inferred). */
  vsiProfilePresent: boolean;
  lvDeclaredSupport: string | null;
  lvEmpiricalObservation: string | null;
  lvFreshnessClassification: string | null;
  profileLvLoaderVisibleMeasurementCount: number;
  profileEligibleGapCount: number;
  baselineProfileInvalidationReason: string | null;
};

function hasEmpiricalLvEvidence(empirical: string | null): boolean {
  return (
    empirical === VsiEmpiricalObservationStatus.OBSERVED ||
    empirical === VsiEmpiricalObservationStatus.OBSERVED_STALE ||
    empirical === VsiEmpiricalObservationStatus.NOT_OBSERVED_IN_WINDOW
  );
}

/**
 * Provider-link-scoped LV availability for APDS shadow (parallel to B2/B4 baseline).
 * Does not infer unsupported LV from fuel type alone.
 */
export function projectVsiApdsShadowLvAvailability(
  input: ProjectVsiApdsShadowLvAvailabilityInput,
): VsiApdsShadowLvAvailabilityProjectionV1 {
  const reasonCodes: string[] = [];
  const limitations: string[] = [];

  if (!input.tenantScopeMatch) {
    reasonCodes.push('TENANT_SCOPE_MISMATCH');
  }
  if (!input.historicalLinkAttributionComplete) {
    reasonCodes.push('HISTORICAL_LINK_ATTRIBUTION_INCOMPLETE');
  }
  if (input.activeSourceLinkCountAtDecision !== 1) {
    reasonCodes.push(
      input.activeSourceLinkCountAtDecision === 0
        ? 'NO_ACTIVE_PROVIDER_SOURCE_LINK'
        : 'MULTI_ACTIVE_PROVIDER_SOURCE_LINKS',
    );
  }
  if (!input.providerSourceLinkId || !input.linkActiveAtDecision) {
    reasonCodes.push('PROVIDER_SOURCE_LINK_INACTIVE_AT_DECISION');
  }

  let classification: VsiApdsShadowLvAvailabilityClass =
    VsiApdsShadowLvAvailabilityClass.LV_UNKNOWN_OR_UNTRUSTED;

  const attributionTrusted =
    input.tenantScopeMatch &&
    input.historicalLinkAttributionComplete &&
    input.activeSourceLinkCountAtDecision === 1 &&
    input.providerSourceLinkId != null &&
    input.linkActiveAtDecision;

  if (attributionTrusted && !input.vsiProfilePresent) {
    reasonCodes.push('VSI_PROFILE_NOT_FOUND_FOR_ATTRIBUTED_LINK');
  } else if (attributionTrusted) {
    const empirical = input.lvEmpiricalObservation;
    const visibleMeasurements = input.profileLvLoaderVisibleMeasurementCount;
    const notListed = input.lvDeclaredSupport === 'NOT_LISTED';
    const empiricalPresent = hasEmpiricalLvEvidence(empirical);
    const measurementPresent = visibleMeasurements > 0;

    if (
      notListed &&
      (empiricalPresent || measurementPresent || empirical === VsiEmpiricalObservationStatus.OBSERVED)
    ) {
      classification = VsiApdsShadowLvAvailabilityClass.LV_UNKNOWN_OR_UNTRUSTED;
      reasonCodes.push('CONFLICTING_NOT_LISTED_WITH_EMPIRICAL_OR_MEASUREMENT_EVIDENCE');
      limitations.push(
        'Declared NOT_LISTED cannot be classified as unsupported while empirical or loader-visible LV measurements exist',
      );
    } else if (notListed) {
      classification = VsiApdsShadowLvAvailabilityClass.LV_DECLARED_NOT_LISTED;
      reasonCodes.push('VSI_DECLARED_CATALOG_NOT_LISTED');
    } else if (
      measurementPresent &&
      empirical === VsiEmpiricalObservationStatus.OBSERVED &&
      input.lvFreshnessClassification !== 'STALE'
    ) {
      classification = VsiApdsShadowLvAvailabilityClass.LV_AVAILABLE_OBSERVED;
    } else if (
      empirical === VsiEmpiricalObservationStatus.OBSERVED_STALE ||
      input.lvFreshnessClassification === 'STALE'
    ) {
      classification = VsiApdsShadowLvAvailabilityClass.LV_UNKNOWN_OR_UNTRUSTED;
      reasonCodes.push('LV_EMPIRICAL_STALE_AT_EVALUATION');
      limitations.push('Stale VSI LV profile cannot assert safe observed availability at decision time');
    } else if (
      empirical === VsiEmpiricalObservationStatus.NEVER_OBSERVED ||
      empirical === VsiEmpiricalObservationStatus.NOT_OBSERVED_IN_WINDOW
    ) {
      classification = VsiApdsShadowLvAvailabilityClass.LV_NOT_OBSERVED;
      reasonCodes.push(`VSI_EMPIRICAL_${empirical}`);
    } else if (empirical === VsiEmpiricalObservationStatus.OBSERVED && !measurementPresent) {
      classification = VsiApdsShadowLvAvailabilityClass.LV_UNKNOWN_OR_UNTRUSTED;
      reasonCodes.push('VSI_EMPIRICAL_OBSERVED_WITHOUT_LOADER_VISIBLE_MEASUREMENTS');
    } else if (measurementPresent) {
      classification = VsiApdsShadowLvAvailabilityClass.LV_UNKNOWN_OR_UNTRUSTED;
      reasonCodes.push('LOADER_VISIBLE_MEASUREMENTS_WITHOUT_TRUSTED_VSI_EMPIRICAL_STATE');
    } else {
      classification = VsiApdsShadowLvAvailabilityClass.LV_UNKNOWN_OR_UNTRUSTED;
      reasonCodes.push('LV_SIGNAL_STATE_AMBIGUOUS');
    }
  }

  const signalAvailabilityLimitsProfileCadence =
    classification === VsiApdsShadowLvAvailabilityClass.LV_NOT_OBSERVED ||
    classification === VsiApdsShadowLvAvailabilityClass.LV_DECLARED_NOT_LISTED;

  if (
    signalAvailabilityLimitsProfileCadence &&
    input.baselineProfileInvalidationReason === 'INSUFFICIENT_RECENT_EVIDENCE'
  ) {
    limitations.push(
      'Baseline profile forced INSUFFICIENT_RECENT_EVIDENCE may reflect missing LV signal availability rather than cadence alone',
    );
  }

  return {
    contractVersion: VSI_APDS_SHADOW_LV_AVAILABILITY_CONTRACT_VERSION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    providerSourceLinkId: input.providerSourceLinkId,
    evaluationTimeMs: input.evaluationTimeMs,
    classification,
    profileLvLoaderVisibleMeasurementCount: input.profileLvLoaderVisibleMeasurementCount,
    profileEligibleGapCount: input.profileEligibleGapCount,
    baselineProfileInvalidationReason: input.baselineProfileInvalidationReason,
    signalAvailabilityLimitsProfileCadence,
    reasonCodes,
    limitations,
  };
}
