import { SetMetadata } from '@nestjs/common';
import type { StationsV2FeatureFlagKey } from '@shared/stations/stations-v2-feature-flags.contract';

export const STATIONS_V2_FEATURE_FLAG_KEY = 'stationsV2FeatureFlag';

export const RequireStationsV2Feature = (flag: StationsV2FeatureFlagKey) =>
  SetMetadata(STATIONS_V2_FEATURE_FLAG_KEY, flag);
