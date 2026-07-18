import {
  STATIONS_V2_BOOKING_RULES_ENFORCEMENT_ENV,
  STATIONS_V2_FEATURE_FLAG_DEPENDENCIES,
  STATIONS_V2_FEATURE_FLAG_ENV_KEYS,
  STATIONS_V2_FLAGS_TEST_DEFAULT_ENV,
  STATIONS_V2_ORG_ALLOWLIST_ENV,
  type StationsV2BookingRulesEnforcementMode,
  type StationsV2EffectiveFeatureFlags,
  type StationsV2FeatureFlagKey,
  type StationsV2GlobalFeatureFlags,
} from './stations-v2-feature-flags.contract';

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function useStationsV2TestDefaults(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== 'test') return false;
  return parseBooleanEnv(env[STATIONS_V2_FLAGS_TEST_DEFAULT_ENV], true);
}

export function parseStationsV2OrgAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> | null {
  const raw = env[STATIONS_V2_ORG_ALLOWLIST_ENV]?.trim();
  if (!raw) return null;
  const ids = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
}

export function isOrgInStationsV2Rollout(
  organizationId: string,
  allowlist: Set<string> | null,
): boolean {
  if (!allowlist) return true;
  return allowlist.has(organizationId);
}

function parseBookingRulesEnforcementMode(
  env: NodeJS.ProcessEnv = process.env,
): StationsV2BookingRulesEnforcementMode {
  const raw = env[STATIONS_V2_BOOKING_RULES_ENFORCEMENT_ENV]?.trim().toLowerCase();
  if (raw === 'shadow' || raw === 'warning' || raw === 'enforce') {
    return raw;
  }
  return 'off';
}

function readGlobalBooleanFlag(
  key: StationsV2FeatureFlagKey,
  env: NodeJS.ProcessEnv,
  testDefaults: boolean,
): boolean {
  if (testDefaults) return true;
  const envKey = STATIONS_V2_FEATURE_FLAG_ENV_KEYS[key];
  return parseBooleanEnv(env[envKey], false);
}

export function resolveStationsV2GlobalFeatureFlags(
  env: NodeJS.ProcessEnv = process.env,
): StationsV2GlobalFeatureFlags {
  const testDefaults = useStationsV2TestDefaults(env);
  const flags = {
    stationsSchemaV2Enabled: readGlobalBooleanFlag('stationsSchemaV2Enabled', env, testDefaults),
    stationsScopeV2Enabled: readGlobalBooleanFlag('stationsScopeV2Enabled', env, testDefaults),
    stationsLifecycleV2Enabled: readGlobalBooleanFlag(
      'stationsLifecycleV2Enabled',
      env,
      testDefaults,
    ),
    stationSummaryV2Enabled: readGlobalBooleanFlag(
      'stationSummaryV2Enabled',
      env,
      testDefaults,
    ),
    stationDeltaAssignmentEnabled: readGlobalBooleanFlag(
      'stationDeltaAssignmentEnabled',
      env,
      testDefaults,
    ),
    stationPositioningV2Enabled: readGlobalBooleanFlag(
      'stationPositioningV2Enabled',
      env,
      testDefaults,
    ),
    stationBookingRulesEnabled: readGlobalBooleanFlag(
      'stationBookingRulesEnabled',
      env,
      testDefaults,
    ),
    stationCapacityWarningsEnabled: readGlobalBooleanFlag(
      'stationCapacityWarningsEnabled',
      env,
      testDefaults,
    ),
    stationTransfersEnabled: readGlobalBooleanFlag('stationTransfersEnabled', env, testDefaults),
    stationAuditTrailEnabled: readGlobalBooleanFlag('stationAuditTrailEnabled', env, testDefaults),
    stationGeofenceShadowEnabled: readGlobalBooleanFlag(
      'stationGeofenceShadowEnabled',
      env,
      testDefaults,
    ),
    stationsUiV2Enabled: readGlobalBooleanFlag('stationsUiV2Enabled', env, testDefaults),
    bookingRulesEnforcement: testDefaults
      ? 'enforce'
      : parseBookingRulesEnforcementMode(env),
    legacySetVehiclesEndpointDisabled: parseBooleanEnv(env.STATIONS_V2_SET_VEHICLES_DISABLED, false),
  };
  return applyDependencyClosure(flags);
}

function applyDependencyClosure(
  flags: StationsV2GlobalFeatureFlags,
): StationsV2GlobalFeatureFlags {
  const next = { ...flags };
  let changed = true;

  while (changed) {
    changed = false;
    for (const [flagKey, dependencies] of Object.entries(
      STATIONS_V2_FEATURE_FLAG_DEPENDENCIES,
    ) as Array<[StationsV2FeatureFlagKey, StationsV2FeatureFlagKey[]]>) {
      if (!next[flagKey]) continue;
      for (const dependency of dependencies) {
        if (!next[dependency]) {
          next[flagKey] = false;
          changed = true;
          break;
        }
      }
    }
  }

  if (!next.stationBookingRulesEnabled) {
    next.stationCapacityWarningsEnabled = false;
    if (next.bookingRulesEnforcement !== 'off') {
      next.bookingRulesEnforcement = 'off';
    }
  }

  return next;
}

export function resolveStationsV2EffectiveFeatureFlags(
  organizationId?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): StationsV2EffectiveFeatureFlags {
  const testDefaults = useStationsV2TestDefaults(env);
  const allowlist = parseStationsV2OrgAllowlist(env);
  const global = applyDependencyClosure(resolveStationsV2GlobalFeatureFlags(env));

  if (!organizationId) {
    return {
      ...global,
      organizationId: null,
      rolloutAllowlistActive: allowlist != null,
      testDefaultsApplied: testDefaults,
    };
  }

  const inRollout = isOrgInStationsV2Rollout(organizationId, allowlist);
  if (!inRollout) {
    return {
      stationsSchemaV2Enabled: false,
      stationsScopeV2Enabled: false,
      stationsLifecycleV2Enabled: false,
      stationSummaryV2Enabled: false,
      stationDeltaAssignmentEnabled: false,
      stationPositioningV2Enabled: false,
      stationBookingRulesEnabled: false,
      stationCapacityWarningsEnabled: false,
      stationTransfersEnabled: false,
      stationAuditTrailEnabled: false,
      stationGeofenceShadowEnabled: false,
      stationsUiV2Enabled: false,
      bookingRulesEnforcement: 'off',
      legacySetVehiclesEndpointDisabled: global.legacySetVehiclesEndpointDisabled,
      organizationId,
      rolloutAllowlistActive: true,
      testDefaultsApplied: testDefaults,
    };
  }

  return {
    ...global,
    organizationId,
    rolloutAllowlistActive: allowlist != null,
    testDefaultsApplied: testDefaults,
  };
}

export function isStationsV2FeatureEnabled(
  organizationId: string | null | undefined,
  flag: StationsV2FeatureFlagKey,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const effective = resolveStationsV2EffectiveFeatureFlags(organizationId, env);
  return effective[flag];
}
