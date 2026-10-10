import {
  CANONICAL_TINY_VEHICLE_ID,
} from '../di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-authority';
import {
  DI_V0_S4_ENV_ALLOWLISTS,
  DI_V0_S4_ENV_FLAGS,
} from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';
import {
  evaluateRolloutWaveAllowlists,
  expectedVehicleAllowlistForWave,
  ROLLOUT_WAVE_VEHICLE_IDS,
  S4_ELIGIBLE_FLEET_VEHICLE_IDS,
  S4_FLEET_ORGANIZATION_ID,
} from './di-v0-s4-fleet-rollout.lib';

function waveEnv(wave: 1 | 2 | 3): Record<string, string> {
  const env: Record<string, string> = {
    [DI_V0_S4_ENV_ALLOWLISTS.organization]: S4_FLEET_ORGANIZATION_ID,
    [DI_V0_S4_ENV_ALLOWLISTS.vehicle]: expectedVehicleAllowlistForWave(wave),
    [DI_V0_S4_ENV_FLAGS.native]: 'false',
  };
  for (const key of Object.values(DI_V0_S4_ENV_FLAGS)) {
    if (key === DI_V0_S4_ENV_FLAGS.native) continue;
    env[key] = 'true';
  }
  return env;
}

describe('S4 fleet rollout waves', () => {
  it('wave 1 is pilot vehicle only', () => {
    expect(ROLLOUT_WAVE_VEHICLE_IDS[1]).toEqual([CANONICAL_TINY_VEHICLE_ID]);
    expect(evaluateRolloutWaveAllowlists(waveEnv(1), 1).ok).toBe(true);
  });

  it('wave 3 covers all eligible fleet vehicles', () => {
    expect(ROLLOUT_WAVE_VEHICLE_IDS[3].length).toBe(S4_ELIGIBLE_FLEET_VEHICLE_IDS.length);
    expect(evaluateRolloutWaveAllowlists(waveEnv(3), 3).ok).toBe(true);
  });

  it('rejects native on', () => {
    const env = { ...waveEnv(1), [DI_V0_S4_ENV_FLAGS.native]: 'true' };
    const r = evaluateRolloutWaveAllowlists(env, 1);
    expect(r.ok).toBe(false);
  });

  it('rejects wrong vehicle allowlist for wave', () => {
    const env = waveEnv(1);
    env[DI_V0_S4_ENV_ALLOWLISTS.vehicle] = CANONICAL_TINY_VEHICLE_ID + ',extra-id';
    const r = evaluateRolloutWaveAllowlists(env, 1);
    expect(r.ok).toBe(false);
  });
});
