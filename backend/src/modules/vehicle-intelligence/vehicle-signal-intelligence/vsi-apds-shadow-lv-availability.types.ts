export const VsiApdsShadowLvAvailabilityClass = {
  LV_AVAILABLE_OBSERVED: 'LV_AVAILABLE_OBSERVED',
  LV_DECLARED_NOT_LISTED: 'LV_DECLARED_NOT_LISTED',
  LV_NOT_OBSERVED: 'LV_NOT_OBSERVED',
  LV_UNKNOWN_OR_UNTRUSTED: 'LV_UNKNOWN_OR_UNTRUSTED',
} as const;

export type VsiApdsShadowLvAvailabilityClass =
  (typeof VsiApdsShadowLvAvailabilityClass)[keyof typeof VsiApdsShadowLvAvailabilityClass];

export const VSI_APDS_SHADOW_LV_AVAILABILITY_CONTRACT_VERSION =
  'vsi-apds-shadow-lv-availability-v1' as const;

export type VsiApdsShadowLvAvailabilityProjectionV1 = {
  contractVersion: typeof VSI_APDS_SHADOW_LV_AVAILABILITY_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string | null;
  evaluationTimeMs: number;
  classification: VsiApdsShadowLvAvailabilityClass;
  /**
   * Rows matching `buildP25ApdProfileLvLoaderWhere` at decision time (same corpus as B2/B4 profile LV loader;
   * decision-time visibility — not PS1 offline strict-rest session filtering).
   */
  profileLvLoaderVisibleMeasurementCount: number;
  profileEligibleGapCount: number;
  baselineProfileInvalidationReason: string | null;
  signalAvailabilityLimitsProfileCadence: boolean;
  reasonCodes: string[];
  limitations: string[];
};
