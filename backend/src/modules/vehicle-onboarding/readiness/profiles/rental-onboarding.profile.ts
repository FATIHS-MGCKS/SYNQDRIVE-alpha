import type { VehicleOnboardingReadinessProfileV1 } from './vehicle-onboarding-readiness-profile.v1';

export const RENTAL_ONBOARDING_PROFILE_V1: VehicleOnboardingReadinessProfileV1 = {
  profileId: 'rental-onboarding-v1',
  profileVersion: '1.0.0',
  product: 'RENTAL',
  jurisdictionScope: 'GLOBAL_ONLY',
  vin: {
    providerDiscoveredNullable: true,
    manualRequired: true,
    compositeRequiresConsistentVin: true,
  },
  licensePlate: 'OPTIONAL',
  station: 'OPTIONAL',
  tireBaseline: 'DEFERRED_ALLOWED',
  brakeBaseline: 'DEFERRED_ALLOWED',
  hvBatteryByPowertrain: {
    ICE: 'NOT_APPLICABLE',
    BEV: 'REQUIRED',
    HYBRID: 'DEFERRED_ALLOWED',
    PLUGIN_HYBRID: 'DEFERRED_ALLOWED',
    OTHER: 'NOT_APPLICABLE',
    UNKNOWN: 'NOT_APPLICABLE',
  },
  unknownCapabilityWhenNotRequired: 'UNKNOWN_ALLOWED',
  providerTelemetryPending: 'UNKNOWN_ALLOWED',
  hmClearanceWhenHmPrimary: true,
};
