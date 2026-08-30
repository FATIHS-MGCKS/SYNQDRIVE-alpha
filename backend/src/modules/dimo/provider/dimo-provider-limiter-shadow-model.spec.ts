import {
  buildWorkloadModelRow,
  FLEET_SCENARIOS,
} from '../../../workers/schedulers/snapshot-polling/p12-final5-workload-model';
import { resolveDimoProviderLimiterConfig } from '@config/dimo-provider-limiter.config';

/**
 * Deterministic shadow-pressure model for P1.3-S2.
 * Uses P1.2 workload rows — not provider latency simulation.
 */
describe('P1.3-S2 shadow limiter load model', () => {
  const limiter = resolveDimoProviderLimiterConfig({
    DIMO_PROVIDER_LIMITER_MODE: 'shadow',
    DIMO_PROVIDER_RATE_LIMIT_PER_SECOND: '20',
    DIMO_PROVIDER_RATE_BURST: '5',
  });

  const budgetPerSecond = limiter.rateLimitPerSecond + limiter.rateBurst;

  for (const fleetSize of [100, 250, 1000]) {
    for (const scenario of Object.values(FLEET_SCENARIOS)) {
      it(`N=${fleetSize} ${scenario.id}: demand vs internal ${budgetPerSecond}/s budget`, () => {
        const row = buildWorkloadModelRow({ fleetSize, scenario, snapshotConcurrencyDefault: 8 });
        const demandPerSecond = row.totalDimoRequestsPerMinute / 60;
        const wouldRejectFraction =
          demandPerSecond > budgetPerSecond
            ? (demandPerSecond - budgetPerSecond) / demandPerSecond
            : 0;

        expect(row.totalDimoRequestsPerMinute).toBeGreaterThan(0);
        expect(limiter.documentedCoreRatePerSecond).toBe(25);
        expect(wouldRejectFraction).toBeGreaterThanOrEqual(0);
        expect(wouldRejectFraction).toBeLessThanOrEqual(1);

        // Informational assertion — extreme fleet scenarios exceed internal budget.
        if (scenario.id === 'S3' && fleetSize >= 1000) {
          expect(demandPerSecond).toBeGreaterThan(budgetPerSecond);
        }
      });
    }
  }
});
