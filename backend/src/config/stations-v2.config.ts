import { registerAs } from '@nestjs/config';
import {
  resolveStationsV2GlobalFeatureFlags,
  parseStationsV2OrgAllowlist,
} from '@shared/stations/stations-v2-feature-flags.resolver';
import {
  STATIONS_V2_BOOKING_RULES_ENFORCEMENT_ENV,
  STATIONS_V2_FEATURE_FLAG_ENV_KEYS,
  STATIONS_V2_ORG_ALLOWLIST_ENV,
} from '@shared/stations/stations-v2-feature-flags.contract';

export {
  STATIONS_V2_FEATURE_FLAG_ENV_KEYS,
  STATIONS_V2_BOOKING_RULES_ENFORCEMENT_ENV,
  STATIONS_V2_ORG_ALLOWLIST_ENV,
};

export default registerAs('stationsV2', () => {
  const flags = resolveStationsV2GlobalFeatureFlags();
  const allowlist = parseStationsV2OrgAllowlist();
  return {
    ...flags,
    orgAllowlist: allowlist ? [...allowlist] : [],
    orgAllowlistActive: allowlist != null,
  };
});
