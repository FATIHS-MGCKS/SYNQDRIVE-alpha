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

export const STATIONS_V2_FEATURE_FLAG_DEPENDENCIES: Partial<
  Record<StationsV2FeatureFlagKey, StationsV2FeatureFlagKey[]>
> = {
  stationsScopeV2Enabled: ['stationsSchemaV2Enabled'],
  stationsLifecycleV2Enabled: ['stationsSchemaV2Enabled'],
  stationSummaryV2Enabled: ['stationsSchemaV2Enabled', 'stationsScopeV2Enabled'],
  stationDeltaAssignmentEnabled: [
    'stationsSchemaV2Enabled',
    'stationsScopeV2Enabled',
  ],
  stationPositioningV2Enabled: [
    'stationsSchemaV2Enabled',
    'stationsScopeV2Enabled',
  ],
  stationBookingRulesEnabled: [
    'stationsSchemaV2Enabled',
    'stationsScopeV2Enabled',
  ],
  stationCapacityWarningsEnabled: ['stationBookingRulesEnabled'],
  stationTransfersEnabled: [
    'stationsSchemaV2Enabled',
    'stationPositioningV2Enabled',
  ],
  stationAuditTrailEnabled: ['stationsSchemaV2Enabled'],
  stationGeofenceShadowEnabled: ['stationsSchemaV2Enabled'],
  stationsUiV2Enabled: ['stationsScopeV2Enabled', 'stationSummaryV2Enabled'],
};

export const STATIONS_V2_FEATURE_FLAG_ENV_KEYS: Record<
  StationsV2FeatureFlagKey,
  string
> = {
  stationsSchemaV2Enabled: 'STATIONS_V2_SCHEMA_ENABLED',
  stationsScopeV2Enabled: 'STATIONS_V2_SCOPE_ENABLED',
  stationsLifecycleV2Enabled: 'STATIONS_V2_LIFECYCLE_ENABLED',
  stationSummaryV2Enabled: 'STATIONS_V2_SUMMARY_READ_MODEL_ENABLED',
  stationDeltaAssignmentEnabled: 'STATIONS_V2_DELTA_ASSIGNMENT_ENABLED',
  stationPositioningV2Enabled: 'STATIONS_V2_POSITIONING_ENABLED',
  stationBookingRulesEnabled: 'STATIONS_V2_BOOKING_RULES_ENABLED',
  stationCapacityWarningsEnabled: 'STATIONS_V2_CAPACITY_WARNINGS_ENABLED',
  stationTransfersEnabled: 'STATIONS_V2_TRANSFERS_ENABLED',
  stationAuditTrailEnabled: 'STATIONS_V2_AUDIT_TRAIL_ENABLED',
  stationGeofenceShadowEnabled: 'STATIONS_V2_GEOFENCE_SHADOW_ENABLED',
  stationsUiV2Enabled: 'STATIONS_V2_UI_ENABLED',
};

export const STATIONS_V2_BOOKING_RULES_ENFORCEMENT_ENV =
  'STATIONS_V2_BOOKING_RULES_ENFORCEMENT';

export const STATIONS_V2_ORG_ALLOWLIST_ENV = 'STATIONS_V2_ORG_ALLOWLIST';

export const STATIONS_V2_FLAGS_TEST_DEFAULT_ENV = 'STATIONS_V2_FLAGS_TEST_DEFAULT';

export function getStationsV2FeatureFlagsContractMetadata() {
  return {
    version: STATIONS_V2_FEATURE_FLAGS_VERSION,
    flags: STATIONS_V2_FEATURE_FLAG_ENV_KEYS,
    dependencies: STATIONS_V2_FEATURE_FLAG_DEPENDENCIES,
    bookingRulesEnforcementEnv: STATIONS_V2_BOOKING_RULES_ENFORCEMENT_ENV,
    orgAllowlistEnv: STATIONS_V2_ORG_ALLOWLIST_ENV,
    legacySetVehiclesDisableEnv: 'STATIONS_V2_SET_VEHICLES_DISABLED',
    defaults: 'all false in production; NODE_ENV=test enables all unless STATIONS_V2_FLAGS_TEST_DEFAULT=off',
  };
}
