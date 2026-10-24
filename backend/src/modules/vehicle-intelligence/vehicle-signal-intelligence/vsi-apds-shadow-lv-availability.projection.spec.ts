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
  lvDeclaredSupport: 'LISTED',
  lvEmpiricalObservation: VsiEmpiricalObservationStatus.OBSERVED,
  strictRestLiveVoltageMeasurementCount: 0,
  profileEligibleGapCount: 0,
  baselineProfileInvalidationReason: 'INSUFFICIENT_RECENT_EVIDENCE' as const,
};

describe('projectVsiApdsShadowLvAvailability', () => {
  it('classifies Tesla-like missing strict-rest LV corpus as LV_NOT_OBSERVED without fuelType inference', () => {
    const result = projectVsiApdsShadowLvAvailability({
      ...base,
      vehicleId: '68868291-5478-42cd-b0c4-cc77b2a78e21',
      lvEmpiricalObservation: VsiEmpiricalObservationStatus.NEVER_OBSERVED,
      strictRestLiveVoltageMeasurementCount: 0,
    });
    expect(result.classification).toBe(VsiApdsShadowLvAvailabilityClass.LV_NOT_OBSERVED);
    expect(result.signalAvailabilityLimitsProfileCadence).toBe(true);
    expect(result.limitations.some((l) => l.includes('cadence'))).toBe(true);
  });

  it('classifies Tiguan-like strict-rest measurements as LV_AVAILABLE_OBSERVED even when gaps < 5', () => {
    const result = projectVsiApdsShadowLvAvailability({
      ...base,
      vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
      strictRestLiveVoltageMeasurementCount: 12,
      profileEligibleGapCount: 2,
      baselineProfileInvalidationReason: 'INSUFFICIENT_RECENT_EVIDENCE',
    });
    expect(result.classification).toBe(VsiApdsShadowLvAvailabilityClass.LV_AVAILABLE_OBSERVED);
    expect(result.signalAvailabilityLimitsProfileCadence).toBe(false);
  });

  it('classifies declared NOT_LISTED only with trusted attribution', () => {
    const result = projectVsiApdsShadowLvAvailability({
      ...base,
      lvDeclaredSupport: 'NOT_LISTED',
    });
    expect(result.classification).toBe(
      VsiApdsShadowLvAvailabilityClass.LV_DECLARED_NOT_LISTED,
    );
  });

  it('does not treat UNKNOWN declared support as NOT_LISTED unsupported', () => {
    const result = projectVsiApdsShadowLvAvailability({
      ...base,
      lvDeclaredSupport: 'UNKNOWN',
      lvEmpiricalObservation: VsiEmpiricalObservationStatus.NEVER_OBSERVED,
    });
    expect(result.classification).toBe(VsiApdsShadowLvAvailabilityClass.LV_NOT_OBSERVED);
    expect(result.classification).not.toBe(
      VsiApdsShadowLvAvailabilityClass.LV_DECLARED_NOT_LISTED,
    );
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
      strictRestLiveVoltageMeasurementCount: 4,
      profileEligibleGapCount: 4,
    });
    expect(result.baselineProfileInvalidationReason).toBeNull();
  });
});
