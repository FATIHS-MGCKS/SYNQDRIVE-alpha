import { computeDs4PowertrainDemandColdEngineResearchV1 } from '../ds4-powertrain-demand-cold-engine.kernel.v1';
import {
  buildColdEngineBoundInput,
  buildObservationSeries,
  coldEctGrid,
} from './ds4-powertrain-demand-research.test-helpers';

describe('P2-B2 negative assessability (Opus P2)', () => {
  it('warm ECT yields COMPUTED not NOT_OBSERVED when all subtypes are NOT_ASSESSABLE', () => {
    const grid = coldEctGrid(12, () => ({ coolantC: 85, loadPct: 90, rpm: null }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: grid }),
    );
    expect(out.status).toBe('COMPUTED');
    expect(Object.values(out.coldEngine.subtypeAssessability).every((s) => s.status === 'NOT_ASSESSABLE')).toBe(
      true,
    );
    expect(out.coldEngine.deduplicatedCandidateCount).toBe(0);
  });

  it('single cold bucket does not mark HIGH_LOAD assessable', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, (i) => ({
      coolantC: i === 5 ? 40 : 85,
      loadPct: 90,
      rpm: 2000,
    }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: grid }),
    );
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_HIGH_LOAD.status).toBe('NOT_ASSESSABLE');
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_HIGH_LOAD.reasonCodes).toContain(
      'INSUFFICIENT_COLD_WINDOW_OPPORTUNITY',
    );
  });

  it('three adjacent cold observations keep assessable opportunity and can yield NOT_OBSERVED when empty', () => {
    const grid = coldEctGrid(12, (i) => ({
      coolantC: 42,
      loadPct: i >= 2 && i <= 4 ? 10 : 5,
      rpm: 1500,
    }));
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      buildColdEngineBoundInput({ multichannelObservations: grid }),
    );
    expect(out.coldEngine.subtypeAssessability.COLD_ENGINE_HIGH_LOAD.status).toBe('ASSESSABLE');
    expect(out.status).toBe('NOT_OBSERVED');
  });
});
