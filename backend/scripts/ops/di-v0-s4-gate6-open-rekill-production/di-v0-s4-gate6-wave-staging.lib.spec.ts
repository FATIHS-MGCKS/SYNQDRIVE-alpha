import { DI_V0_S4_ENV_ALLOWLISTS, DI_V0_S4_ENV_FLAGS } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';
import {
  CANONICAL_TINY_ORGANIZATION_ID,
  CANONICAL_TINY_VEHICLE_ID,
} from '../di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-authority';
import {
  applyFiveFlagMutation,
  FIVE_FLAG_ON_KEYS,
  FIVE_FLAG_TRUE_VALUE,
} from '../di-v0-s4-five-flag-tiny-activation-production/di-v0-s4-five-flag-tiny-activation-production.lib';
import {
  expectedVehicleAllowlistForWave,
  ROLLOUT_WAVE_VEHICLE_IDS,
  S4_SOLD_OR_REMOVED_FLEET_VEHICLE_IDS,
} from './di-v0-s4-fleet-rollout.lib';
import { assertGate6WaveStagingKeysPresentAndPinned } from './di-v0-s4-gate6-wave-staging.lib';

const STAGED_NOT_BEFORE = '2026-10-09T07:03:05.861Z';

function buildBaseStagedEnv(wave: 1 | 2 | 3): string {
  return [
    'DIMO_GLOBAL_BUDGET_ENABLED=true',
    `DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE=${STAGED_NOT_BEFORE}`,
    `${DI_V0_S4_ENV_ALLOWLISTS.organization}=${CANONICAL_TINY_ORGANIZATION_ID}`,
    `${DI_V0_S4_ENV_ALLOWLISTS.vehicle}=${expectedVehicleAllowlistForWave(wave)}`,
    ...Object.values(DI_V0_S4_ENV_FLAGS).map((k) => `${k}=false`),
  ].join('\n') + '\n';
}

function enableFiveFlagsOnStagedEnv(staged: string): string {
  let content = staged;
  for (const key of FIVE_FLAG_ON_KEYS) {
    content = content.replace(`${key}=false`, `${key}=${FIVE_FLAG_TRUE_VALUE}`);
  }
  return content;
}

function buildWave1FiveFlagEnv(): string {
  const staged = buildBaseStagedEnv(1);
  return applyFiveFlagMutation(staged).nextContent;
}

describe('Gate-6 wave-aware staging keys', () => {
  it('wave 1 matches legacy tiny single-vehicle pinning', () => {
    expect(assertGate6WaveStagingKeysPresentAndPinned(buildWave1FiveFlagEnv(), 1).ok).toBe(true);
  });

  it('wave 2 exact three vehicles pass', () => {
    expect(assertGate6WaveStagingKeysPresentAndPinned(enableFiveFlagsOnStagedEnv(buildBaseStagedEnv(2)), 2).ok).toBe(
      true,
    );
  });

  it('wave 3 exact five vehicles pass', () => {
    expect(assertGate6WaveStagingKeysPresentAndPinned(enableFiveFlagsOnStagedEnv(buildBaseStagedEnv(3)), 3).ok).toBe(
      true,
    );
  });

  it('wave 3 with four vehicles rejected', () => {
    const four = ROLLOUT_WAVE_VEHICLE_IDS[3].slice(0, 4).join(',');
    const env = buildBaseStagedEnv(3).replace(expectedVehicleAllowlistForWave(3), four);
    const r = assertGate6WaveStagingKeysPresentAndPinned(env, 3);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.includes('VEHICLE') || f.includes('BELOW'))).toBe(true);
  });

  it('wave 3 with six vehicles rejected', () => {
    const six = `${expectedVehicleAllowlistForWave(3)},17ae4a96-f658-43d4-b262-65d4624a5320`;
    const env = buildBaseStagedEnv(3).replace(expectedVehicleAllowlistForWave(3), six);
    const r = assertGate6WaveStagingKeysPresentAndPinned(env, 3);
    expect(r.ok).toBe(false);
  });

  it('rejects sold vehicle 187336 in allowlist', () => {
    const sold = S4_SOLD_OR_REMOVED_FLEET_VEHICLE_IDS[0];
    const env = buildBaseStagedEnv(3).replace(expectedVehicleAllowlistForWave(3), sold);
    const r = assertGate6WaveStagingKeysPresentAndPinned(env, 3);
    expect(r.ok).toBe(false);
    expect(r.failures).toContain('UNSUPPORTED_VEHICLE_IN_ALLOWLIST');
  });

  it('rejects wrong organization', () => {
    const env = buildBaseStagedEnv(3).replace(CANONICAL_TINY_ORGANIZATION_ID, '00000000-0000-0000-0000-000000000099');
    expect(assertGate6WaveStagingKeysPresentAndPinned(env, 3).failures).toContain('ORG_MISMATCH');
  });

  it('rejects missing not-before', () => {
    const env = buildBaseStagedEnv(3).replace(`DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE=${STAGED_NOT_BEFORE}\n`, '');
    const r = assertGate6WaveStagingKeysPresentAndPinned(env, 3);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.includes('NOT_BEFORE') || f.includes('DISCOVERY_TRIP_END'))).toBe(true);
  });

  it('rejects malformed not-before', () => {
    const env = buildBaseStagedEnv(3).replace(STAGED_NOT_BEFORE, 'not-a-timestamp');
    expect(assertGate6WaveStagingKeysPresentAndPinned(env, 3).failures).toContain('NOT_BEFORE_INVALID');
  });

  it('rejects duplicated staging keys', () => {
    const env = `${buildBaseStagedEnv(3)}${DI_V0_S4_ENV_ALLOWLISTS.vehicle}=${CANONICAL_TINY_VEHICLE_ID}\n`;
    const r = assertGate6WaveStagingKeysPresentAndPinned(env, 3);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.endsWith('_DUPLICATE'))).toBe(true);
  });

  it('wave 1 rejects multi-vehicle allowlist when wave is 1', () => {
    const env = buildBaseStagedEnv(1).replace(CANONICAL_TINY_VEHICLE_ID, expectedVehicleAllowlistForWave(3));
    expect(assertGate6WaveStagingKeysPresentAndPinned(env, 1).failures).toContain('VEH_MISMATCH');
  });
});
