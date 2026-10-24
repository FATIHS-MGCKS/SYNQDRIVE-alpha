import { VsiEmpiricalObservationStatus } from './vehicle-signal-evidence.contract';
import { projectVsiApdsShadowLvAvailability } from './vsi-apds-shadow-lv-availability.projection';
import { VsiApdsShadowLvAvailabilityClass } from './vsi-apds-shadow-lv-availability.types';

const base = {
  organizationId: 'org-1',
  vehicleId: 'veh-1',
  evaluationTimeMs: Date.parse('2026-10-23T12:00:00Z'),
  providerSourceLinkId: 'link-1',
  linkActiveAtDecision: true,
  tenantScopeMatch: true,
  activeSourceLinkCountAtDecision: 1,
  historicalLinkAttributionComplete: true,
  vsiProfilePresent: true,
  lvDeclaredSupport: 'LISTED',
  lvEmpiricalObservation: VsiEmpiricalObservationStatus.OBSERVED,
  lvFreshnessClassification: 'FRESH',
  profileLvLoaderVisibleMeasurementCount: 0,
  profileEligibleGapCount: 0,
  baselineProfileInvalidationReason: 'INSUFFICIENT_RECENT_EVIDENCE' as const,
};

describe('projectVsiApdsShadowLvAvailability', () => {
  it('classifies Tesla-like missing loader-visible LV corpus as LV_NOT_OBSERVED without fuelType inference', () => {
    const result = projectVsiApdsShadowLvAvailability({
      ...base,
      vehicleId: '68868291-5478-42cd-b0c4-cc77b2a78e21',
      lvEmpiricalObservation: VsiEmpiricalObservationStatus.NEVER_OBSERVED,
      profileLvLoaderVisibleMeasurementCount: 0,
    });
    expect(result.classification).toBe(VsiApdsShadowLvAvailabilityClass.LV_NOT_OBSERVED);
    expect(result.signalAvailabilityLimitsProfileCadence).toBe(true);
  });

  it('classifies Tiguan-like loader-visible measurements with fresh empirical OBSERVED as LV_AVAILABLE_OBSERVED', () => {
    const result = projectVsiApdsShadowLvAvailability({
      ...base,
      vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
      profileLvLoaderVisibleMeasurementCount: 12,
      profileEligibleGapCount: 2,
      lvEmpiricalObservation: VsiEmpiricalObservationStatus.OBSERVED,
      lvFreshnessClassification: 'FRESH',
      baselineProfileInvalidationReason: 'INSUFFICIENT_RECENT_EVIDENCE',
    });
    expect(result.classification).toBe(VsiApdsShadowLvAvailabilityClass.LV_AVAILABLE_OBSERVED);
    expect(result.signalAvailabilityLimitsProfileCadence).toBe(false);
  });

  it('classifies declared NOT_LISTED only without conflicting empirical or measurement evidence', () => {
    const result = projectVsiApdsShadowLvAvailability({
      ...base,
      lvDeclaredSupport: 'NOT_LISTED',
      lvEmpiricalObservation: VsiEmpiricalObservationStatus.NEVER_OBSERVED,
      profileLvLoaderVisibleMeasurementCount: 0,
    });
    expect(result.classification).toBe(
      VsiApdsShadowLvAvailabilityClass.LV_DECLARED_NOT_LISTED,
    );
  });

  it('treats NOT_LISTED plus empirical/measurement evidence as UNKNOWN with conflict reason', () => {
    const result = projectVsiApdsShadowLvAvailability({
      ...base,
      lvDeclaredSupport: 'NOT_LISTED',
      lvEmpiricalObservation: VsiEmpiricalObservationStatus.OBSERVED,
      profileLvLoaderVisibleMeasurementCount: 3,
    });
    expect(result.classification).toBe(
      VsiApdsShadowLvAvailabilityClass.LV_UNKNOWN_OR_UNTRUSTED,
    );
    expect(result.reasonCodes).toContain(
      'CONFLICTING_NOT_LISTED_WITH_EMPIRICAL_OR_MEASUREMENT_EVIDENCE',
    );
  });

  it('missing VSI profile on attributed link stays UNKNOWN', () => {
    const result = projectVsiApdsShadowLvAvailability({
      ...base,
      vsiProfilePresent: false,
    });
    expect(result.classification).toBe(
      VsiApdsShadowLvAvailabilityClass.LV_UNKNOWN_OR_UNTRUSTED,
    );
    expect(result.reasonCodes).toContain('VSI_PROFILE_NOT_FOUND_FOR_ATTRIBUTED_LINK');
  });

  it('provider link tenant mismatch stays UNKNOWN', () => {
    const result = projectVsiApdsShadowLvAvailability({
      ...base,
      tenantScopeMatch: false,
    });
    expect(result.classification).toBe(
      VsiApdsShadowLvAvailabilityClass.LV_UNKNOWN_OR_UNTRUSTED,
    );
    expect(result.reasonCodes).toContain('TENANT_SCOPE_MISMATCH');
  });

  it('stale empirical profile does not assert LV_AVAILABLE_OBSERVED', () => {
    const result = projectVsiApdsShadowLvAvailability({
      ...base,
      profileLvLoaderVisibleMeasurementCount: 8,
      lvEmpiricalObservation: VsiEmpiricalObservationStatus.OBSERVED_STALE,
      lvFreshnessClassification: 'STALE',
    });
    expect(result.classification).toBe(
      VsiApdsShadowLvAvailabilityClass.LV_UNKNOWN_OR_UNTRUSTED,
    );
    expect(result.reasonCodes).toContain('LV_EMPIRICAL_STALE_AT_EVALUATION');
  });

  it('marks multi active links as LV_UNKNOWN_OR_UNTRUSTED', () => {
    const result = projectVsiApdsShadowLvAvailability({
      ...base,
      activeSourceLinkCountAtDecision: 2,
    });
    expect(result.classification).toBe(
      VsiApdsShadowLvAvailabilityClass.LV_UNKNOWN_OR_UNTRUSTED,
    );
  });

  it('preserves baseline invalidation reason without changing it', () => {
    const result = projectVsiApdsShadowLvAvailability({
      ...base,
      baselineProfileInvalidationReason: null,
      profileLvLoaderVisibleMeasurementCount: 4,
      profileEligibleGapCount: 4,
      lvEmpiricalObservation: VsiEmpiricalObservationStatus.OBSERVED,
    });
    expect(result.baselineProfileInvalidationReason).toBeNull();
  });
});
