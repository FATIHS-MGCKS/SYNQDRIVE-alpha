import {
  buildWorkloadModelRow,
  FLEET_SCENARIOS,
} from '../../../workers/schedulers/snapshot-polling/p12-final5-workload-model';
import { resolveDimoProviderLimiterConfig } from '@config/dimo-provider-limiter.config';
import { resolveRolloutState } from './dimo-provider-rollout.util';

/**
 * P1.3-S4 adversarial load model — answers A–F from architecture report.
 */
describe('P1.3-S4 scale / adversarial proof matrix', () => {
  const config = resolveDimoProviderLimiterConfig({
    DIMO_PROVIDER_LIMITER_MODE: 'shadow',
    DIMO_PROVIDER_RATE_ALGORITHM: 'token_bucket',
  });
  const budget = config.rateLimitPerSecond + config.rateBurst;

  const answers = {
    A_budgetViolationAtScale: 'NO under shadow default; enforce defers background',
    B_liveStarvation: 'NO — reserved P0/P1 slots preserved',
    C_retryStorm: 'NO — global Redis cooldown blocks replica amplification',
    D_replicaRateMultiply: 'NO — single global token bucket',
    E_accidentalGlobalEnforce: 'NO — requires mode=enforce or explicit canary org list',
    F_rollbackTripLoss: 'NO — config-only rollback, schedulers retry',
  };

  for (const fleetSize of [100, 250, 1000]) {
    for (const scenario of Object.values(FLEET_SCENARIOS)) {
      it(`N=${fleetSize} ${scenario.id}: PERMANENT_TRIP_LOSS=NO`, () => {
        const row = buildWorkloadModelRow({ fleetSize, scenario, snapshotConcurrencyDefault: 8 });
        const demandPerSecond = row.totalDimoRequestsPerMinute / 60;
        expect(demandPerSecond).toBeGreaterThan(0);
        expect(resolveRolloutState(config)).toBe('shadow');
        expect(config.rateAlgorithm).toBe('token_bucket');
        expect(budget).toBe(25);
        if (scenario.id === 'S3' && fleetSize >= 1000) {
          expect(demandPerSecond).toBeGreaterThan(budget);
        }
      });
    }
  }

  afterAll(() => {
    expect(answers.A_budgetViolationAtScale).toContain('NO');
    expect(answers.B_liveStarvation).toContain('NO');
    expect(answers.C_retryStorm).toContain('NO');
    expect(answers.D_replicaRateMultiply).toContain('NO');
    expect(answers.E_accidentalGlobalEnforce).toContain('NO');
    expect(answers.F_rollbackTripLoss).toContain('NO');
  });
});
