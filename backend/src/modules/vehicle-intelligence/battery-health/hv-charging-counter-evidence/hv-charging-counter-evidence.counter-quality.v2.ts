import { evaluateHvChargingCounterQualityV1 } from './hv-charging-counter-evidence.counter-quality.v1';
import type { HvChargingCounterQualityAssessmentV1 } from './hv-charging-counter-evidence.counter-quality.v1';
import type { HvChargingCounterDimoIntervalRowV1 } from './hv-charging-counter-evidence.types.v1';
import { analyzeHvChargingCounterGapAwareMonotonicityV1 } from './hv-charging-counter-gap-aware-monotonicity.v1';
import type { HvChargingCounterGapAwareMonotonicityV1 } from './hv-charging-counter-gap-aware-monotonicity.v1';
import {
  analyzeHvChargingCounterReturnedRowNumericCoverageV1,
  analyzeHvChargingCounterTemporalCoverageV1,
  resolveHvChargingCounterTemporalCompletenessQualityV1,
  type HvChargingCounterReturnedRowNumericCoverageV1,
  type HvChargingCounterTemporalCompletenessQualityV1,
  type HvChargingCounterTemporalCoverageV1,
} from './hv-charging-counter-temporal-coverage.v1';

export type HvChargingCounterQualityAssessmentV2 = Omit<
  HvChargingCounterQualityAssessmentV1,
  'schemaVersion'
> & {
  schemaVersion: 'hv-r22-counter-quality-v2';
  returnedRowNumericCoverage: HvChargingCounterReturnedRowNumericCoverageV1;
  temporalCoverage: HvChargingCounterTemporalCoverageV1;
  monotonicityGapAware: HvChargingCounterGapAwareMonotonicityV1;
  temporalCompletenessQuality: HvChargingCounterTemporalCompletenessQualityV1;
};

export function evaluateHvChargingCounterQualityV2(input: {
  sessionStartInclusive: string;
  sessionEndInclusive: string;
  queryFromInclusive: string;
  queryToInclusive: string;
  rows: HvChargingCounterDimoIntervalRowV1[];
}): HvChargingCounterQualityAssessmentV2 {
  const v1 = evaluateHvChargingCounterQualityV1(input);
  const returnedRowNumericCoverage =
    analyzeHvChargingCounterReturnedRowNumericCoverageV1(input.rows);
  const temporalCoverage = analyzeHvChargingCounterTemporalCoverageV1({
    queryFromInclusive: input.queryFromInclusive,
    queryToInclusive: input.queryToInclusive,
    rows: input.rows,
  });
  const monotonicityGapAware = analyzeHvChargingCounterGapAwareMonotonicityV1(
    input.rows,
  );
  const temporalCompletenessQuality =
    resolveHvChargingCounterTemporalCompletenessQualityV1(temporalCoverage);

  return {
    ...v1,
    schemaVersion: 'hv-r22-counter-quality-v2',
    returnedRowNumericCoverage,
    temporalCoverage,
    monotonicityGapAware,
    temporalCompletenessQuality,
  };
}
