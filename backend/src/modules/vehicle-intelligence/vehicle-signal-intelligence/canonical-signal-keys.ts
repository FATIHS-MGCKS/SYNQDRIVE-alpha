/**
 * VSI canonical signal vocabulary (contract-only).
 *
 * Stable keys for cross-domain read projections. Presence in this catalog does
 * not imply any vehicle supports the signal.
 *
 * Aligns with existing domain keys where established (e.g. driving `engine_rpm`).
 * DIMO provider names are documented aliases — not auto-merged across providers.
 */

export const VSI_CANONICAL_SIGNAL_CONTRACT_VERSION = 'vsi-canonical-signal-v1' as const;

export type VsiCanonicalSignalContractVersion =
  typeof VSI_CANONICAL_SIGNAL_CONTRACT_VERSION;

/** High-level grouping for navigation and consumer routing hints only. */
export const VsiSignalFamily = {
  POWERTRAIN_ENERGY: 'POWERTRAIN_ENERGY',
  MOVEMENT: 'MOVEMENT',
  CONNECTIVITY: 'CONNECTIVITY',
  HEALTH: 'HEALTH',
  PROVIDER_METADATA: 'PROVIDER_METADATA',
} as const;

export type VsiSignalFamily =
  (typeof VsiSignalFamily)[keyof typeof VsiSignalFamily];

/**
 * What the canonical key represents — do not mix semantics in one key.
 * - PHYSICAL_MEASUREMENT: provider-reported scalar sample (voltage, SOC, speed).
 * - DERIVED_STATE: computed or inferred state (e.g. aggregated motion state).
 * - LIFECYCLE_EVENT: discrete edge (wake, reconnect, trip boundary signal).
 * - PROVIDER_METADATA: catalog, auth, fetch, or provenance — not a vehicle physics sample.
 */
export const VsiSignalValueCategory = {
  PHYSICAL_MEASUREMENT: 'PHYSICAL_MEASUREMENT',
  DERIVED_STATE: 'DERIVED_STATE',
  LIFECYCLE_EVENT: 'LIFECYCLE_EVENT',
  PROVIDER_METADATA: 'PROVIDER_METADATA',
} as const;

export type VsiSignalValueCategory =
  (typeof VsiSignalValueCategory)[keyof typeof VsiSignalValueCategory];

/** Canonical unit token when applicable; `dimensionless` for enums/flags; `none` for events/metadata. */
export const VsiCanonicalUnit = {
  VOLT: 'volt',
  PERCENT: 'percent',
  KILOWATT_HOUR: 'kilowatt_hour',
  KILOMETER: 'kilometer',
  KILOMETERS_PER_HOUR: 'kilometers_per_hour',
  DEGREE: 'degree',
  RPM: 'rpm',
  PASCAL: 'pascal',
  DIMENSIONLESS: 'dimensionless',
  NONE: 'none',
} as const;

export type VsiCanonicalUnit = (typeof VsiCanonicalUnit)[keyof typeof VsiCanonicalUnit];

/**
 * Versioned canonical signal keys. Extend only with a contract version bump.
 * Reuses `engine_rpm` from driving canonical catalog naming.
 */
export type VsiCanonicalSignalKey =
  | 'lv_voltage'
  | 'hv_battery_soc'
  | 'hv_charging_active'
  | 'fuel_level_relative'
  | 'engine_rpm'
  | 'vehicle_speed'
  | 'odometer'
  | 'position_coordinates'
  | 'trip_activity'
  | 'device_connectivity'
  | 'provider_source_timestamp'
  | 'provider_last_successful_fetch'
  | 'device_wake_event'
  | 'device_reconnect_event'
  | 'diagnostic_trouble_code'
  | 'tire_pressure'
  | 'warning_indicator'
  | 'provider_catalog_listing'
  | 'provider_authorization_result';

export type VsiCanonicalSignalDefinition = {
  key: VsiCanonicalSignalKey;
  contractVersion: VsiCanonicalSignalContractVersion;
  family: VsiSignalFamily;
  valueCategory: VsiSignalValueCategory;
  /** Human-readable semantics — not a translation key. */
  semanticMeaning: string;
  canonicalUnit: VsiCanonicalUnit;
  /**
   * Primary documented DIMO telemetry name when applicable.
   * High Mobility and other providers map via explicit per-link tables in VSI-03+.
   */
  primaryDimoSignalName?: string;
  /**
   * Provider-native names that must not auto-map to this key (unsafe alias equivalence).
   */
  prohibitedAutoAliases?: readonly string[];
  /** Non-normative semantics clarifications for reviewers and VSI-03 mappers. */
  semanticNotes?: readonly string[];
  /**
   * Related driving-intelligence canonical key when the same quantity is already named there.
   */
  drivingCanonicalKey?: string;
  iceOnly?: boolean;
  evOnly?: boolean;
};

export type VsiCanonicalAliasMappingVerdict =
  | 'EXPLICIT_PRIMARY_ALIAS'
  | 'ALIAS_CONFLICT_UNRESOLVED'
  | 'UNKNOWN_SIGNAL';

export const VSI_CANONICAL_SIGNAL_DEFINITIONS: Readonly<
  Record<VsiCanonicalSignalKey, VsiCanonicalSignalDefinition>
> = {
  lv_voltage: {
    key: 'lv_voltage',
    contractVersion: VSI_CANONICAL_SIGNAL_CONTRACT_VERSION,
    family: VsiSignalFamily.POWERTRAIN_ENERGY,
    valueCategory: VsiSignalValueCategory.PHYSICAL_MEASUREMENT,
    semanticMeaning:
      'Auxiliary low-voltage rail terminal voltage (typical 12V-class; 16V mild-hybrid only when domain maps the same physical quantity)',
    canonicalUnit: VsiCanonicalUnit.VOLT,
    primaryDimoSignalName: 'lowVoltageBatteryCurrentVoltage',
    semanticNotes: [
      'Not HV traction pack voltage',
      'Listed-in-catalog without samples does not prove 12V/16V support',
    ],
  },
  hv_battery_soc: {
    key: 'hv_battery_soc',
    contractVersion: VSI_CANONICAL_SIGNAL_CONTRACT_VERSION,
    family: VsiSignalFamily.POWERTRAIN_ENERGY,
    valueCategory: VsiSignalValueCategory.PHYSICAL_MEASUREMENT,
    semanticMeaning: 'High-voltage traction battery physical state of charge (BMS-reported, not display/estimated SOC)',
    canonicalUnit: VsiCanonicalUnit.PERCENT,
    primaryDimoSignalName: 'powertrainTractionBatteryStateOfChargeCurrent',
    prohibitedAutoAliases: [
      'powertrainTractionBatteryStateOfChargeDisplay',
      'powertrainTractionBatteryStateOfChargeTarget',
    ],
    semanticNotes: ['Display or target SOC requires a separate canonical mapping decision'],
    evOnly: true,
  },
  hv_charging_active: {
    key: 'hv_charging_active',
    contractVersion: VSI_CANONICAL_SIGNAL_CONTRACT_VERSION,
    family: VsiSignalFamily.POWERTRAIN_ENERGY,
    valueCategory: VsiSignalValueCategory.DERIVED_STATE,
    semanticMeaning: 'HV pack charging active (provider boolean/0-1)',
    canonicalUnit: VsiCanonicalUnit.DIMENSIONLESS,
    primaryDimoSignalName: 'powertrainTractionBatteryChargingIsCharging',
    evOnly: true,
  },
  fuel_level_relative: {
    key: 'fuel_level_relative',
    contractVersion: VSI_CANONICAL_SIGNAL_CONTRACT_VERSION,
    family: VsiSignalFamily.POWERTRAIN_ENERGY,
    valueCategory: VsiSignalValueCategory.PHYSICAL_MEASUREMENT,
    semanticMeaning: 'Fuel tank relative fill level',
    canonicalUnit: VsiCanonicalUnit.PERCENT,
    primaryDimoSignalName: 'powertrainFuelSystemRelativeLevel',
    iceOnly: true,
  },
  engine_rpm: {
    key: 'engine_rpm',
    contractVersion: VSI_CANONICAL_SIGNAL_CONTRACT_VERSION,
    family: VsiSignalFamily.POWERTRAIN_ENERGY,
    valueCategory: VsiSignalValueCategory.PHYSICAL_MEASUREMENT,
    semanticMeaning: 'Internal combustion engine crankshaft speed',
    canonicalUnit: VsiCanonicalUnit.RPM,
    primaryDimoSignalName: 'powertrainCombustionEngineSpeed',
    drivingCanonicalKey: 'engine_rpm',
    iceOnly: true,
  },
  vehicle_speed: {
    key: 'vehicle_speed',
    contractVersion: VSI_CANONICAL_SIGNAL_CONTRACT_VERSION,
    family: VsiSignalFamily.MOVEMENT,
    valueCategory: VsiSignalValueCategory.PHYSICAL_MEASUREMENT,
    semanticMeaning: 'Vehicle speed over ground',
    canonicalUnit: VsiCanonicalUnit.KILOMETERS_PER_HOUR,
    primaryDimoSignalName: 'speed',
  },
  odometer: {
    key: 'odometer',
    contractVersion: VSI_CANONICAL_SIGNAL_CONTRACT_VERSION,
    family: VsiSignalFamily.MOVEMENT,
    valueCategory: VsiSignalValueCategory.PHYSICAL_MEASUREMENT,
    semanticMeaning: 'Lifetime odometer / total distance counter (not trip segment distance)',
    canonicalUnit: VsiCanonicalUnit.KILOMETER,
    primaryDimoSignalName: 'powertrainTransmissionTravelledDistance',
    semanticNotes: [
      'DIMO powertrainTransmissionTravelledDistance may be trip-relative on some vehicles — do not auto-equate without domain mapper',
      'Distinct from trip_activity and segment distance accumulators',
    ],
  },
  position_coordinates: {
    key: 'position_coordinates',
    contractVersion: VSI_CANONICAL_SIGNAL_CONTRACT_VERSION,
    family: VsiSignalFamily.MOVEMENT,
    valueCategory: VsiSignalValueCategory.PHYSICAL_MEASUREMENT,
    semanticMeaning: 'Geographic position (lat/lon pair as one logical sample)',
    canonicalUnit: VsiCanonicalUnit.DEGREE,
    primaryDimoSignalName: 'currentLocationCoordinates',
  },
  trip_activity: {
    key: 'trip_activity',
    contractVersion: VSI_CANONICAL_SIGNAL_CONTRACT_VERSION,
    family: VsiSignalFamily.MOVEMENT,
    valueCategory: VsiSignalValueCategory.DERIVED_STATE,
    semanticMeaning: 'Vehicle in active trip / motion context (domain-specific derivation)',
    canonicalUnit: VsiCanonicalUnit.DIMENSIONLESS,
  },
  device_connectivity: {
    key: 'device_connectivity',
    contractVersion: VSI_CANONICAL_SIGNAL_CONTRACT_VERSION,
    family: VsiSignalFamily.CONNECTIVITY,
    valueCategory: VsiSignalValueCategory.DERIVED_STATE,
    semanticMeaning: 'Reachability / online state derived from provider connectivity semantics',
    canonicalUnit: VsiCanonicalUnit.DIMENSIONLESS,
    prohibitedAutoAliases: ['lastSeen'],
    semanticNotes: [
      'lastSeen is a provider timestamp sample — not equivalent to device_connectivity without explicit derivation',
      'Use provider_last_successful_fetch or provider_source_timestamp for fetch timing metadata',
    ],
  },
  provider_source_timestamp: {
    key: 'provider_source_timestamp',
    contractVersion: VSI_CANONICAL_SIGNAL_CONTRACT_VERSION,
    family: VsiSignalFamily.CONNECTIVITY,
    valueCategory: VsiSignalValueCategory.PROVIDER_METADATA,
    semanticMeaning: 'Provider-asserted source time of last meaningful telemetry bundle',
    canonicalUnit: VsiCanonicalUnit.NONE,
  },
  provider_last_successful_fetch: {
    key: 'provider_last_successful_fetch',
    contractVersion: VSI_CANONICAL_SIGNAL_CONTRACT_VERSION,
    family: VsiSignalFamily.CONNECTIVITY,
    valueCategory: VsiSignalValueCategory.PROVIDER_METADATA,
    semanticMeaning: 'SynqDrive wall-clock time of last successful provider acquisition',
    canonicalUnit: VsiCanonicalUnit.NONE,
  },
  device_wake_event: {
    key: 'device_wake_event',
    contractVersion: VSI_CANONICAL_SIGNAL_CONTRACT_VERSION,
    family: VsiSignalFamily.CONNECTIVITY,
    valueCategory: VsiSignalValueCategory.LIFECYCLE_EVENT,
    semanticMeaning: 'Provider or platform wake correlation (e.g. R9 wake ingress)',
    canonicalUnit: VsiCanonicalUnit.NONE,
  },
  device_reconnect_event: {
    key: 'device_reconnect_event',
    contractVersion: VSI_CANONICAL_SIGNAL_CONTRACT_VERSION,
    family: VsiSignalFamily.CONNECTIVITY,
    valueCategory: VsiSignalValueCategory.LIFECYCLE_EVENT,
    semanticMeaning: 'Device or provider session reconnect edge',
    canonicalUnit: VsiCanonicalUnit.NONE,
  },
  diagnostic_trouble_code: {
    key: 'diagnostic_trouble_code',
    contractVersion: VSI_CANONICAL_SIGNAL_CONTRACT_VERSION,
    family: VsiSignalFamily.HEALTH,
    valueCategory: VsiSignalValueCategory.PHYSICAL_MEASUREMENT,
    semanticMeaning: 'OBD diagnostic trouble code set snapshot',
    canonicalUnit: VsiCanonicalUnit.DIMENSIONLESS,
    primaryDimoSignalName: 'obdDTCList',
  },
  tire_pressure: {
    key: 'tire_pressure',
    contractVersion: VSI_CANONICAL_SIGNAL_CONTRACT_VERSION,
    family: VsiSignalFamily.HEALTH,
    valueCategory: VsiSignalValueCategory.PHYSICAL_MEASUREMENT,
    semanticMeaning: 'Tire pressure logical family — each wheel position is a separate observation axis',
    canonicalUnit: VsiCanonicalUnit.PASCAL,
    primaryDimoSignalName: 'chassisAxleRow1WheelLeftTirePressure',
    semanticNotes: [
      'Do not aggregate left/right/axle native signals into one sample without wheel identity',
      'warning_indicator is not interchangeable with scalar tire_pressure',
    ],
  },
  warning_indicator: {
    key: 'warning_indicator',
    contractVersion: VSI_CANONICAL_SIGNAL_CONTRACT_VERSION,
    family: VsiSignalFamily.HEALTH,
    valueCategory: VsiSignalValueCategory.DERIVED_STATE,
    semanticMeaning: 'Manufacturer warning / telltale indicator state',
    canonicalUnit: VsiCanonicalUnit.DIMENSIONLESS,
    primaryDimoSignalName: 'chassisTireSystemIsWarningOn',
  },
  provider_catalog_listing: {
    key: 'provider_catalog_listing',
    contractVersion: VSI_CANONICAL_SIGNAL_CONTRACT_VERSION,
    family: VsiSignalFamily.PROVIDER_METADATA,
    valueCategory: VsiSignalValueCategory.PROVIDER_METADATA,
    semanticMeaning: 'Signal name present in provider catalog (e.g. availableSignals)',
    canonicalUnit: VsiCanonicalUnit.NONE,
  },
  provider_authorization_result: {
    key: 'provider_authorization_result',
    contractVersion: VSI_CANONICAL_SIGNAL_CONTRACT_VERSION,
    family: VsiSignalFamily.PROVIDER_METADATA,
    valueCategory: VsiSignalValueCategory.PROVIDER_METADATA,
    semanticMeaning: 'Outcome of provider auth/entitlement for acquisition',
    canonicalUnit: VsiCanonicalUnit.NONE,
  },
};

export function getVsiCanonicalSignalDefinition(
  key: VsiCanonicalSignalKey,
): VsiCanonicalSignalDefinition {
  return VSI_CANONICAL_SIGNAL_DEFINITIONS[key];
}

export function isVsiCanonicalSignalKey(value: string): value is VsiCanonicalSignalKey {
  return Object.prototype.hasOwnProperty.call(VSI_CANONICAL_SIGNAL_DEFINITIONS, value);
}

/**
 * Rejects unsafe automatic alias equivalence (no implicit cross-signal merging).
 */
export function evaluateCanonicalProviderNativeAlias(
  canonicalKey: VsiCanonicalSignalKey,
  providerNativeSignalName: string | null | undefined,
): VsiCanonicalAliasMappingVerdict {
  if (!providerNativeSignalName?.trim()) {
    return 'UNKNOWN_SIGNAL';
  }
  const native = providerNativeSignalName.trim();
  const def = VSI_CANONICAL_SIGNAL_DEFINITIONS[canonicalKey];
  if (def.prohibitedAutoAliases?.includes(native)) {
    return 'ALIAS_CONFLICT_UNRESOLVED';
  }
  if (def.primaryDimoSignalName && def.primaryDimoSignalName === native) {
    return 'EXPLICIT_PRIMARY_ALIAS';
  }
  if (def.primaryDimoSignalName && def.primaryDimoSignalName !== native) {
    return 'ALIAS_CONFLICT_UNRESOLVED';
  }
  return 'UNKNOWN_SIGNAL';
}
