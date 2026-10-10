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
  S4_SOLD_OR_REMOVED_FLEET_VEHICLE_IDS,
  S4_UNSUPPORTED_VEHICLE_IDS,
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

  it('monitoring queries scope tenant isolation to rollout wave vehicles', () => {
    const { monitoringQueriesForWave } = require('./di-v0-s4-gate6-open-rekill-production.lib');
    const wave1 = monitoringQueriesForWave(1);
    const wave3 = monitoringQueriesForWave(3);
    expect(wave1.unexpectedTenantWork).toContain(CANONICAL_TINY_VEHICLE_ID);
    expect(wave3.unexpectedTenantWork).toContain('19fedd4b-c4e8-4de8-a125-dab293326e7e');
    expect(wave1.unexpectedTenantWork).not.toEqual(wave3.unexpectedTenantWork);
  });

  it('wave 3 is exactly five eligible fleet vehicles (direct pilot)', () => {
    expect(S4_ELIGIBLE_FLEET_VEHICLE_IDS).toHaveLength(5);
    expect(ROLLOUT_WAVE_VEHICLE_IDS[3]).toEqual([...S4_ELIGIBLE_FLEET_VEHICLE_IDS]);
    expect(evaluateRolloutWaveAllowlists(waveEnv(3), 3).ok).toBe(true);
  });

  it('rejects sold/removed KS MX 2024 (DIMO 187336) in any allowlist', () => {
    const soldId = S4_SOLD_OR_REMOVED_FLEET_VEHICLE_IDS[0];
    expect(S4_UNSUPPORTED_VEHICLE_IDS).toContain(soldId);
    expect(S4_ELIGIBLE_FLEET_VEHICLE_IDS).not.toContain(soldId);

    const env = waveEnv(3);
    env[DI_V0_S4_ENV_ALLOWLISTS.vehicle] = `${expectedVehicleAllowlistForWave(3)},${soldId}`;
    const r = evaluateRolloutWaveAllowlists(env, 3);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failures).toContain('VEHICLE_ALLOWLIST_EXCEEDS_WAVE');
    }
  });

  it('rejects allowlist that substitutes an unsupported cross-tenant vehicle', () => {
    const env = waveEnv(3);
    env[DI_V0_S4_ENV_ALLOWLISTS.vehicle] = expectedVehicleAllowlistForWave(3).replace(
      CANONICAL_TINY_VEHICLE_ID,
      '17ae4a96-f658-43d4-b262-65d4624a5320',
    );
    const r = evaluateRolloutWaveAllowlists(env, 3);
    expect(r.ok).toBe(false);
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
