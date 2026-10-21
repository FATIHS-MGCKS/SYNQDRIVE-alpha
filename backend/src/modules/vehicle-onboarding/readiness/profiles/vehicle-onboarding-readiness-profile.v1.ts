export type ReadinessPolicyLevel = 'REQUIRED' | 'OPTIONAL' | 'NOT_APPLICABLE' | 'DEFERRED_ALLOWED';

export type VinReadinessPolicy = {
  providerDiscoveredNullable: boolean;
  manualRequired: boolean;
  compositeRequiresConsistentVin: boolean;
};

export interface VehicleOnboardingReadinessProfileV1 {
  profileId: string;
  profileVersion: string;
  product: 'RENTAL' | 'FLEET' | 'GENERIC_OPERATIONS';
  jurisdictionScope: 'GLOBAL_ONLY' | 'ESTABLISHED_JURISDICTION';
  vin: VinReadinessPolicy;
  licensePlate: ReadinessPolicyLevel;
  station: ReadinessPolicyLevel;
  tireBaseline: ReadinessPolicyLevel;
  brakeBaseline: ReadinessPolicyLevel;
  hvBatteryByPowertrain: {
    ICE: ReadinessPolicyLevel;
    BEV: ReadinessPolicyLevel;
    HYBRID: ReadinessPolicyLevel;
    PLUGIN_HYBRID: ReadinessPolicyLevel;
    OTHER: ReadinessPolicyLevel;
    UNKNOWN: ReadinessPolicyLevel;
  };
  unknownCapabilityWhenNotRequired: 'UNKNOWN_ALLOWED' | 'REVIEW_REQUIRED';
  providerTelemetryPending: 'DEFERRED' | 'UNKNOWN_ALLOWED';
  hmClearanceWhenHmPrimary: boolean;
}
