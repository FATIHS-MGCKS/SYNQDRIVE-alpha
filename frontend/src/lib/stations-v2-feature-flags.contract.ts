export const STATIONS_V2_FEATURE_FLAGS_VERSION = 1 as const;

export type StationsV2BookingRulesEnforcementMode =
  | 'off'
  | 'shadow'
  | 'warning'
  | 'enforce';

export type StationsV2FeatureFlagKey =
  | 'stationsSchemaV2Enabled'
  | 'stationsScopeV2Enabled'
  | 'stationsLifecycleV2Enabled'
  | 'stationSummaryV2Enabled'
  | 'stationDeltaAssignmentEnabled'
  | 'stationPositioningV2Enabled'
  | 'stationBookingRulesEnabled'
  | 'stationCapacityWarningsEnabled'
  | 'stationTransfersEnabled'
  | 'stationAuditTrailEnabled'
  | 'stationGeofenceShadowEnabled'
  | 'stationsUiV2Enabled';

export interface StationsV2GlobalFeatureFlags {
  stationsSchemaV2Enabled: boolean;
  stationsScopeV2Enabled: boolean;
  stationsLifecycleV2Enabled: boolean;
  stationSummaryV2Enabled: boolean;
  stationDeltaAssignmentEnabled: boolean;
  stationPositioningV2Enabled: boolean;
  stationBookingRulesEnabled: boolean;
  stationCapacityWarningsEnabled: boolean;
  stationTransfersEnabled: boolean;
  stationAuditTrailEnabled: boolean;
  stationGeofenceShadowEnabled: boolean;
  stationsUiV2Enabled: boolean;
  bookingRulesEnforcement: StationsV2BookingRulesEnforcementMode;
  legacySetVehiclesEndpointDisabled: boolean;
}

export type StationsV2EffectiveFeatureFlags = StationsV2GlobalFeatureFlags & {
  organizationId: string | null;
  rolloutAllowlistActive: boolean;
  testDefaultsApplied: boolean;
};
