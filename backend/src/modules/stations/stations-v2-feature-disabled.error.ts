import { ServiceUnavailableException } from '@nestjs/common';
import type {
  StationsV2EffectiveFeatureFlags,
  StationsV2FeatureFlagKey,
} from '@shared/stations/stations-v2-feature-flags.contract';
import { resolveStationsV2EffectiveFeatureFlags } from '@shared/stations/stations-v2-feature-flags.resolver';

export class StationsV2FeatureDisabledError extends ServiceUnavailableException {
  constructor(flag: StationsV2FeatureFlagKey, organizationId?: string) {
    super({
      message: `Stations V2 feature "${flag}" is not enabled${
        organizationId ? ` for organization ${organizationId}` : ''
      }.`,
      code: 'STATIONS_V2_FEATURE_DISABLED',
      flag,
      organizationId: organizationId ?? null,
    });
    this.name = 'StationsV2FeatureDisabledError';
  }
}

export function assertStationsV2FeatureEnabled(
  organizationId: string,
  flag: StationsV2FeatureFlagKey,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const effective = resolveStationsV2EffectiveFeatureFlags(organizationId, env);
  if (!effective[flag]) {
    throw new StationsV2FeatureDisabledError(flag, organizationId);
  }
}

export function getStationsV2EffectiveFlags(
  organizationId?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): StationsV2EffectiveFeatureFlags {
  return resolveStationsV2EffectiveFeatureFlags(organizationId, env);
}
