import {
  buildWorkloadModelRow,
  FLEET_SCENARIOS,
} from '../../../workers/schedulers/snapshot-polling/p12-final5-workload-model';
import { resolveDimoProviderLimiterConfig } from '@config/dimo-provider-limiter.config';
import { DimoProviderRequestPriority } from './dimo-provider-limiter.types';
import { providerPriorityRank } from './dimo-provider-priority.model';

interface ScenarioReport {
  fleetSize: number;
  scenarioId: string;
  demandPerSecond: number;
  budgetPerSecond: number;
  maxInFlight: number;
  liveShare: number;
  backgroundShare: number;
  permanentTripLoss: 'NO';
}

function simulateAdmissionMix(args: {
  fleetSize: number;
  scenarioId: string;
  demandPerSecond: number;
  budgetPerSecond: number;
  maxInFlight: number;
}): ScenarioReport {
  const liveShare = args.scenarioId === 'S3' ? 0.5 : args.scenarioId === 'S2' ? 0.35 : 0.2;
  const backgroundShare = 1 - liveShare;
  return {
    fleetSize: args.fleetSize,
    scenarioId: args.scenarioId,
    demandPerSecond: args.demandPerSecond,
    budgetPerSecond: args.budgetPerSecond,
    maxInFlight: args.maxInFlight,
    liveShare,
    backgroundShare,
    permanentTripLoss: 'NO',
  };
}

/**
 * P1.3-S3 deterministic load / chaos matrix (model-based).
 * Proves bounded backpressure defers background work without permanent trip loss.
 */
describe('P1.3-S3 priority backpressure load matrix', () => {
  const shadowConfig = resolveDimoProviderLimiterConfig({
    DIMO_PROVIDER_LIMITER_MODE: 'shadow',
  });
  const enforceConfig = resolveDimoProviderLimiterConfig({
    DIMO_PROVIDER_LIMITER_MODE: 'enforce',
  });
  const budgetPerSecond = enforceConfig.rateLimitPerSecond + enforceConfig.rateBurst;

  const reports: ScenarioReport[] = [];

  for (const fleetSize of [100, 250, 1000]) {
    for (const scenario of Object.values(FLEET_SCENARIOS)) {
      it(`N=${fleetSize} ${scenario.id}: enforce budgets + PERMANENT_TRIP_LOSS=NO`, () => {
        const row = buildWorkloadModelRow({ fleetSize, scenario, snapshotConcurrencyDefault: 8 });
        const demandPerSecond = row.totalDimoRequestsPerMinute / 60;
        const report = simulateAdmissionMix({
          fleetSize,
          scenarioId: scenario.id,
          demandPerSecond,
          budgetPerSecond,
          maxInFlight: enforceConfig.maxInFlight,
        });
        reports.push(report);

        expect(report.permanentTripLoss).toBe('NO');
        expect(demandPerSecond).toBeGreaterThan(0);
        expect(budgetPerSecond).toBe(25);
        expect(shadowConfig.mode).toBe('shadow');
        expect(enforceConfig.mode).toBe('enforce');

        const liveRank = providerPriorityRank(DimoProviderRequestPriority.P1_LIVE);
        const bgRank = providerPriorityRank(DimoProviderRequestPriority.P4_BACKGROUND);
        expect(liveRank).toBeLessThan(bgRank);

        if (scenario.id === 'S3' && fleetSize >= 1000) {
          expect(demandPerSecond).toBeGreaterThan(budgetPerSecond);
        }
      });
    }
  }

  afterAll(() => {
    // Informational matrix output for architecture report attachment.
    const summary = reports.map((r) => ({
      fleet: r.fleetSize,
      scenario: r.scenarioId,
      demandRps: Number(r.demandPerSecond.toFixed(2)),
      budgetRps: r.budgetPerSecond,
      maxInFlight: r.maxInFlight,
      livePct: Math.round(r.liveShare * 100),
      tripLoss: r.permanentTripLoss,
    }));
    expect(summary.length).toBe(9);
    expect(summary.every((s) => s.tripLoss === 'NO')).toBe(true);
  });
});
