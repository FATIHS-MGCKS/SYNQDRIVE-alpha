import { Injectable } from '@nestjs/common';
import { getStationsV2FeatureFlagsContractMetadata } from '@shared/stations/stations-v2-feature-flags.contract';
import type {
  StationsV2EffectiveFeatureFlags,
  StationsV2FeatureFlagKey,
} from '@shared/stations/stations-v2-feature-flags.contract';
import { resolveStationsV2EffectiveFeatureFlags } from '@shared/stations/stations-v2-feature-flags.resolver';
import {
  assertStationsV2FeatureEnabled,
  StationsV2FeatureDisabledError,
} from './stations-v2-feature-disabled.error';

@Injectable()
export class StationsV2ConfigService {
  resolve(organizationId?: string | null): StationsV2EffectiveFeatureFlags {
    return resolveStationsV2EffectiveFeatureFlags(organizationId);
  }

  isEnabled(organizationId: string, flag: StationsV2FeatureFlagKey): boolean {
    return this.resolve(organizationId)[flag];
  }

  assertEnabled(organizationId: string, flag: StationsV2FeatureFlagKey): void {
    assertStationsV2FeatureEnabled(organizationId, flag);
  }

  getContractMetadata() {
    return getStationsV2FeatureFlagsContractMetadata();
  }
}

export { StationsV2FeatureDisabledError };
