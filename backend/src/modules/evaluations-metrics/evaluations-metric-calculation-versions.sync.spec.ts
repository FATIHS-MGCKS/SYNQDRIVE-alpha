import { EVALUATIONS_METRIC_DEFINITIONS } from './evaluations-metric.definitions';
import {
  EVALUATIONS_INITIAL_CALCULATION_VERSION,
  EVALUATIONS_METRIC_CALCULATION_VERSION_OVERRIDES,
  resolveEvaluationsMetricCalculationVersion,
} from '@synq/evaluations-metrics/evaluations-metric-calculation-versions';

describe('evaluations metric calculation versions (shared sync)', () => {
  it('backend definitions match shared resolver for every registered metric', () => {
    for (const def of EVALUATIONS_METRIC_DEFINITIONS) {
      expect(resolveEvaluationsMetricCalculationVersion(def.id)).toBe(def.calculationVersion);
    }
  });

  it('override map values are semver strings present in definitions', () => {
    const ids = new Set(EVALUATIONS_METRIC_DEFINITIONS.map((d) => d.id));
    for (const [metricId, version] of Object.entries(EVALUATIONS_METRIC_CALCULATION_VERSION_OVERRIDES)) {
      expect(ids.has(metricId)).toBe(true);
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('defaults to initial version when no override exists', () => {
    expect(resolveEvaluationsMetricCalculationVersion('fin.mtd_issued_revenue')).toBe(
      EVALUATIONS_INITIAL_CALCULATION_VERSION,
    );
  });
});
