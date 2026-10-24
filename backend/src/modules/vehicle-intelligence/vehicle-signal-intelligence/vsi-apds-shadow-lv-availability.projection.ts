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
  lvDeclaredSupport: string | null;
  lvEmpiricalObservation: string | null;
  strictRestLiveVoltageMeasurementCount: number;
  profileEligibleGapCount: number;
  baselineProfileInvalidationReason: string | null;
};

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

  if (attributionTrusted && input.lvDeclaredSupport === 'NOT_LISTED') {
    classification = VsiApdsShadowLvAvailabilityClass.LV_DECLARED_NOT_LISTED;
    reasonCodes.push('VSI_DECLARED_CATALOG_NOT_LISTED');
  } else if (attributionTrusted) {
    const empirical = input.lvEmpiricalObservation;
    const hasStrictRestMeasurements = input.strictRestLiveVoltageMeasurementCount > 0;
    if (hasStrictRestMeasurements) {
      classification = VsiApdsShadowLvAvailabilityClass.LV_AVAILABLE_OBSERVED;
    } else if (
      empirical === VsiEmpiricalObservationStatus.NEVER_OBSERVED ||
      empirical === VsiEmpiricalObservationStatus.NOT_OBSERVED_IN_WINDOW
    ) {
      classification = VsiApdsShadowLvAvailabilityClass.LV_NOT_OBSERVED;
      reasonCodes.push(`VSI_EMPIRICAL_${empirical}`);
    } else if (empirical === VsiEmpiricalObservationStatus.OBSERVED ||
      empirical === VsiEmpiricalObservationStatus.OBSERVED_STALE) {
      classification = VsiApdsShadowLvAvailabilityClass.LV_NOT_OBSERVED;
      reasonCodes.push('STRICT_REST_LIVE_VOLTAGE_CORPUS_EMPTY');
      limitations.push(
        'VSI profile reports empirical LV history but APDS strict-rest battery_measurements corpus is empty at decision time',
      );
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
    strictRestLiveVoltageMeasurementCount: input.strictRestLiveVoltageMeasurementCount,
    profileEligibleGapCount: input.profileEligibleGapCount,
    baselineProfileInvalidationReason: input.baselineProfileInvalidationReason,
    signalAvailabilityLimitsProfileCadence,
    reasonCodes,
    limitations,
  };
}
