import {
  acquireOrchestratorLock,
  buildOrchestratorLockKey,
  evaluateEffectivePolicyGate,
  evaluateEffectivePolicyGateFromEnv,
  extendOrchestratorLock,
  isOrchestratorOwnedRecordingSession,
  releaseOrchestratorLock,
  resolveExp021TargetDeploySha,
  resolveFatalSessionCleanupMode,
} from '../../../../scripts/ops/reference-capture-exp-021-autonomous-orchestrator.lib';
import { parseHfRecoveryPolicyV2ConfigFromEnv } from './reference-capture-hf-recovery-v2.policy';

describe('reference-capture-exp-021-autonomous-orchestrator.lib', () => {
  describe('resolveExp021TargetDeploySha', () => {
    it('uses explicit SHA when provided', () => {
      expect(
        resolveExp021TargetDeploySha({
          explicitSha: 'abc123',
          productionSha: 'def456',
        }),
      ).toBe('abc123');
    });

    it('snapshots production SHA when explicit missing', () => {
      expect(
        resolveExp021TargetDeploySha({
          explicitSha: '',
          productionSha: 'def456',
        }),
      ).toBe('def456');
    });

    it('throws when no SHA authority exists', () => {
      expect(() =>
        resolveExp021TargetDeploySha({ explicitSha: '', productionSha: '' }),
      ).toThrow(/EXP021 deploy SHA unresolved/);
    });
  });

  describe('isOrchestratorOwnedRecordingSession', () => {
    it('rejects arbitrary recording sessions without ownership', () => {
      expect(isOrchestratorOwnedRecordingSession({ vehicleId: 'x' }, 'run-1')).toBe(false);
    });

    it('accepts matching orchestrator run id', () => {
      expect(
        isOrchestratorOwnedRecordingSession(
          { exp021AutonomousOrchestrator: { runId: 'run-1' } },
          'run-1',
        ),
      ).toBe(true);
    });
  });

  describe('evaluateEffectivePolicyGate', () => {
    it('allows V2 when token is in canary allowlist', () => {
      const base = parseHfRecoveryPolicyV2ConfigFromEnv({
        HF_RECOVERY_POLICY_V2_ENABLED: 'true',
        HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'true',
        HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS: '187361',
      });
      const result = evaluateEffectivePolicyGate(base, 187361);
      expect(result.allowed).toBe(true);
      expect(result.effectiveMode).toBe('V2');
    });

    it('blocks LEGACY token before recording (fail-before-recording gate)', () => {
      const result = evaluateEffectivePolicyGateFromEnv(
        {
          HF_RECOVERY_POLICY_V2_ENABLED: 'false',
          HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'true',
          HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS: '',
        },
        187361,
      );
      expect(result.allowed).toBe(false);
      expect(result.effectiveMode).toBe('LEGACY');
      expect(result.blocker).toContain('effective V2 policy');
    });

    it('keeps non-canary token on LEGACY when canary-only', () => {
      const base = parseHfRecoveryPolicyV2ConfigFromEnv({
        HF_RECOVERY_POLICY_V2_ENABLED: 'true',
        HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'true',
        HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS: '187361',
      });
      const result = evaluateEffectivePolicyGate(base, 999999);
      expect(result.allowed).toBe(false);
      expect(result.effectiveMode).toBe('LEGACY');
    });
  });

  describe('resolveFatalSessionCleanupMode', () => {
    it('uses abort when no calibration series (pre-phase failure)', () => {
      expect(resolveFatalSessionCleanupMode({ cycleCount: 10, hfCalibrationSeries: null })).toBe('abort');
    });

    it('uses abort when calibration series exists but no scientific phase started', () => {
      expect(
        resolveFatalSessionCleanupMode({
          hfCalibrationSeries: {
            calibrationSeriesId: 'series-1',
            vehicleId: 'veh-1',
            tokenId: 187361,
            seriesStartedAt: '2026-09-09T10:00:00.000Z',
            activePhase: null,
            pendingPhaseRequest: null,
            completedPhaseSummaries: [],
          },
        }),
      ).toBe('abort');
    });

    it('uses stop when scientific phase was activated', () => {
      expect(
        resolveFatalSessionCleanupMode({
          hfCalibrationSeries: {
            calibrationSeriesId: 'series-1',
            vehicleId: 'veh-1',
            tokenId: 187361,
            seriesStartedAt: '2026-09-09T10:00:00.000Z',
            activePhase: { effectivePollIntervalMs: 60000, phaseStartedAt: '2026-09-09T10:00:00.000Z' },
          },
        }),
      ).toBe('stop');
    });
  });

  describe('orchestrator lock', () => {
    function createRedisMock() {
      const store = new Map<string, string>();
      return {
        store,
        async set(key: string, value: string, _mode: string, _ttl: number, nx: string) {
          if (nx === 'NX' && store.has(key)) return null;
          store.set(key, value);
          return 'OK';
        },
        async eval(script: string, _numKeys: number, key: string, token: string, _ttl?: string) {
          if (script.includes('pexpire')) {
            return store.get(key) === token ? 1 : 0;
          }
          if (store.get(key) === token) {
            store.delete(key);
            return 1;
          }
          return 0;
        },
      } as unknown as Pick<import('ioredis').default, 'set' | 'eval'>;
    }

    it('acquires and releases lock exclusively', async () => {
      const redis = createRedisMock();
      const key = buildOrchestratorLockKey('org', 'veh');
      const first = await acquireOrchestratorLock(redis, key, 60_000);
      expect(first.acquired).toBe(true);
      const second = await acquireOrchestratorLock(redis, key, 60_000);
      expect(second.acquired).toBe(false);
      if (first.acquired) {
        await releaseOrchestratorLock(redis, first.handle);
      }
      const third = await acquireOrchestratorLock(redis, key, 60_000);
      expect(third.acquired).toBe(true);
      if (third.acquired) {
        await releaseOrchestratorLock(redis, third.handle);
      }
    });

    it('extends lock lease for same token', async () => {
      const redis = createRedisMock();
      const key = buildOrchestratorLockKey('org', 'veh');
      const acquired = await acquireOrchestratorLock(redis, key, 60_000);
      expect(acquired.acquired).toBe(true);
      if (acquired.acquired) {
        const extended = await extendOrchestratorLock(redis, acquired.handle, 120_000);
        expect(extended).toBe(true);
        await releaseOrchestratorLock(redis, acquired.handle);
      }
    });
  });
});
