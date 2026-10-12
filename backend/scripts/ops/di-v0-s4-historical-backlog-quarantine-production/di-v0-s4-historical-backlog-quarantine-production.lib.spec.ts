import {
  evaluateGate6PreflightGuards,
  resolveEffectiveGate6OpenIntent,
  resolveGate6OpenIntent,
  type Gate6OpenGuardInput,
} from '../di-v0-s4-gate6-open-rekill-production/di-v0-s4-gate6-open-rekill-production.lib';
import { createHash } from 'crypto';
import { DI_V0_S4_ENV_FLAGS } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';
import { DI_V0_S4_ENV_ALLOWLISTS } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation';
import {
  CANONICAL_TINY_ORGANIZATION_ID,
  CANONICAL_TINY_VEHICLE_ID,
} from '../di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-authority';
import {
  deriveFiveFlagAttestationFingerprint,
  FIVE_FLAG_ON_KEYS,
  FIVE_FLAG_TRUE_VALUE,
} from '../di-v0-s4-five-flag-tiny-activation-production/di-v0-s4-five-flag-tiny-activation-production.lib';
import { envMapFromFileContent } from '../di-v0-s4f-global-budget-rollout/di-v0-s4f-global-budget-rollout.lib';
import { expectedVehicleAllowlistForWave } from '../di-v0-s4-gate6-open-rekill-production/di-v0-s4-fleet-rollout.lib';

function wave3Env(): string {
  const staged = [
    'DIMO_GLOBAL_BUDGET_ENABLED=true',
    `DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE=2026-10-09T07:03:05.861Z`,
    `${DI_V0_S4_ENV_ALLOWLISTS.organization}=${CANONICAL_TINY_ORGANIZATION_ID}`,
    `${DI_V0_S4_ENV_ALLOWLISTS.vehicle}=${expectedVehicleAllowlistForWave(3)}`,
    ...Object.values(DI_V0_S4_ENV_FLAGS).map((k) => `${k}=false`),
  ].join('\n');
  let content = staged;
  for (const key of FIVE_FLAG_ON_KEYS) {
    content = content.replace(`${key}=false`, `${key}=${FIVE_FLAG_TRUE_VALUE}`);
  }
  return content;
}

function reopenInput(overrides: Partial<Gate6OpenGuardInput> = {}): Gate6OpenGuardInput {
  const envContent = wave3Env();
  const envSha = createHash('sha256').update(envContent).digest('hex');
  const fp = deriveFiveFlagAttestationFingerprint(envMapFromFileContent(envContent));
  return {
    gate6Ack: 'YES',
    gate6Authorized: 'YES',
    rolloutWave: 3,
    requiredSha: 'f'.repeat(40),
    actualSha: 'f'.repeat(40),
    requiredReleaseId: '20261012091511_v4994',
    actualReleaseId: '20261012091511_v4994',
    requiredEnvSha256: envSha,
    actualEnvSha256: envSha,
    expectedAttestationFingerprint: undefined,
    replicaAFingerprint: fp,
    replicaBFingerprint: fp,
    globalRowLines: ['1', 'KILLED'],
    s4PersistenceLines: ['1', '19', '19', '1', '1', '1018'],
    envContent,
    vehicleDbLines: ['1', CANONICAL_TINY_ORGANIZATION_ID, 'ACTIVE', 'LTE_R1', '1', '1'],
    topologyOk: true,
    budgetConfigOk: true,
    budgetRuntimeOk: true,
    redisOk: true,
    reopenWithHistoryAck: 'YES',
    backlogSafetyOk: true,
    backlogRunnableCount: 0,
    explicitOpenIntent: 'REOPEN_WITH_HISTORY',
    ...overrides,
  };
}

describe('S4P9B REOPEN_WITH_HISTORY gate-6 contract', () => {
  it('INITIAL_OPEN still fails S4_PERSISTENCE_NONZERO when persistence present', () => {
    const g = evaluateGate6PreflightGuards(
      reopenInput({
        explicitOpenIntent: undefined,
        reopenWithHistoryAck: undefined,
        backlogSafetyOk: undefined,
        s4PersistenceLines: ['1', '19', '19', '1', '1', '1018'],
      }),
    );
    expect(g.failures).toContain('S4_PERSISTENCE_NONZERO');
  });

  it('auto intent remains INITIAL_OPEN under KILLED + nonzero persistence', () => {
    const input = reopenInput({ explicitOpenIntent: undefined });
    expect(resolveGate6OpenIntent(input)).toBe('INITIAL_OPEN');
  });

  it('REOPEN_WITH_HISTORY passes preflight when backlog safety proof is present', () => {
    const env = { DI_S4_GATE6_REOPEN_WITH_HISTORY_ACK: 'YES' };
    expect(
      evaluateGate6PreflightGuards(reopenInput(), env).ok,
    ).toBe(true);
    expect(resolveEffectiveGate6OpenIntent(reopenInput(), env)).toBe('REOPEN_WITH_HISTORY');
  });

  it('REOPEN_WITH_HISTORY fails without backlog safety proof', () => {
    const g = evaluateGate6PreflightGuards(reopenInput({ backlogSafetyOk: false }));
    expect(g.failures).toContain('REOPEN_WITH_HISTORY_BACKLOG_UNSAFE');
  });

  it('REOPEN_WITH_HISTORY refuses when auto intent would be WAVE_PROMOTION', () => {
    const g = evaluateGate6PreflightGuards(
      reopenInput({
        globalRowLines: ['1', 'NOT_KILLED'],
      }),
    );
    expect(g.failures).toContain('REOPEN_WITH_HISTORY_MISCLASSIFIED_AS_WAVE_PROMOTION');
  });

  it('REOPEN_WITH_HISTORY requires GLOBAL KILLED', () => {
    const g = evaluateGate6PreflightGuards(reopenInput({ globalRowLines: ['1', 'NOT_KILLED'] }));
    expect(g.failures).toContain('GLOBAL_PRESTATE_MUST_BE_KILLED_FOR_REOPEN_WITH_HISTORY');
  });
});
