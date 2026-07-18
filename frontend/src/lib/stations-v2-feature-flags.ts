import type { StationsV2EffectiveFeatureFlags } from './stations-v2-feature-flags.contract';

export type { StationsV2EffectiveFeatureFlags, StationsV2FeatureFlagKey } from './stations-v2-feature-flags.contract';

export type StationsV2FeatureFlagsResponse = StationsV2EffectiveFeatureFlags;

export function isStationsV2UiEnabled(flags: StationsV2FeatureFlagsResponse | null | undefined): boolean {
  return flags?.stationsUiV2Enabled === true;
}

export function isStationsV2ScopeEnabled(flags: StationsV2FeatureFlagsResponse | null | undefined): boolean {
  return flags?.stationsScopeV2Enabled === true;
}
