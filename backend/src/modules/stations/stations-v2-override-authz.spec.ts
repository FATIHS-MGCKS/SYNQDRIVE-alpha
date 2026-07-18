import { evaluateStationsV2Permission } from '@shared/auth/stations-v2-permission.util';
import {
  STATIONS_V2_READ_ONLY_PERMISSIONS,
  STATIONS_V2_STATION_MANAGER_PERMISSIONS,
} from '@shared/auth/stations-v2-role-permissions';
import { STATION_RULE_MANUAL_OVERRIDE_PERMISSION } from '@shared/stations/station-rule-manual-override.contract';

describe('Stations override_rules security', () => {
  it('denies override_rules for read-only membership', () => {
    const allowed = evaluateStationsV2Permission(
      STATIONS_V2_READ_ONLY_PERMISSIONS,
      STATION_RULE_MANUAL_OVERRIDE_PERMISSION,
    );

    expect(allowed).toBe(false);
  });

  it('allows override_rules for station manager membership', () => {
    const allowed = evaluateStationsV2Permission(
      STATIONS_V2_STATION_MANAGER_PERMISSIONS,
      STATION_RULE_MANUAL_OVERRIDE_PERMISSION,
    );

    expect(allowed).toBe(true);
  });
});
