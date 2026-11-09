import { computeDs4PowertrainDemandSustainedLoadResearchV1 } from '../ds4-powertrain-demand-sustained-load.kernel.v1';
import { buildBoundPowertrainInput, buildObservationSeries } from './ds4-powertrain-demand-research.test-helpers';

describe('P2-B3 load coverage gate (Opus P1-03)', () => {
  it('5 load labels scattered in 300 buckets yield INSUFFICIENT_OBSERVATIONS not NOT_OBSERVED', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 300, 1, (i) => {
      const sparseLoad = i % 60 === 0 && i < 300 ? { loadPct: 20 as number } : {};
      return { rpm: 3000, throttlePct: 90, speedKmh: 55, ...sparseLoad };
    });
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid }),
    );
    expect(out.sustainedLoad.tripEvidenceClassification).toBe('INSUFFICIENT_OBSERVATIONS');
    expect(out.status).toBe('COMPUTED');
    expect(out.sustainedLoad.coverageEvidence.loadPresentBucketCount).toBe(5);
  });

  it('contiguous sub-threshold load without entry remains NOT_OBSERVED when opportunity is adequate', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, () => ({
      rpm: 2500,
      throttlePct: 40,
      speedKmh: 55,
      loadPct: 25,
    }));
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid }),
    );
    expect(out.sustainedLoad.tripEvidenceClassification).toBe('NOT_OBSERVED');
    expect(out.sustainedLoad.entryLabelCount).toBe(0);
    expect(out.sustainedLoad.deduplicatedCandidateCount).toBe(0);
  });
});
