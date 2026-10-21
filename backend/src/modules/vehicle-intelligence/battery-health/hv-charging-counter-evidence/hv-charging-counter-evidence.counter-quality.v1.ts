import { analyzeHvChargingCounterBoundaryForensicsV1 } from './hv-charging-counter-boundary-forensics.v1';
import type { HvChargingCounterDimoIntervalRowV1 } from './hv-charging-counter-evidence.types.v1';
import type { HvChargingCounterBoundaryClassificationV1 } from './hv-charging-counter-boundary-forensics.v1';

export type HvChargingCounterEnergyDerivationQualityV1 =
  | 'RELIABLE_FIRST_LAST_IN_SESSION'
  | 'CONTEXT_ONLY_NUMERIC'
  | 'UNRELIABLE';

export interface HvChargingCounterQualityAssessmentV1 {
  schemaVersion: 'hv-r22-counter-quality-v1';
  numericCoverage: {
    bucketCount: number;
    numericLastCount: number;
    nullLastCount: number;
    numericCoverageRatio: number | null;
  };
  monotonicity: {
    positiveDeltas: number;
    negativeDeltas: number;
    zeroDeltas: number;
    maxMonotonicRunLength: number;
  };
  boundaryClassifications: HvChargingCounterBoundaryClassificationV1[];
  resetCandidates: number;
  boundaryUncertainty: boolean;
  counterDeltaFirstLastInSessionKwh: number | null;
  energyDerivationQuality: HvChargingCounterEnergyDerivationQualityV1;
  reliableSessionCounterDelta: boolean;
}

export function evaluateHvChargingCounterQualityV1(input: {
  sessionStartInclusive: string;
  sessionEndInclusive: string;
  queryFromInclusive: string;
  queryToInclusive: string;
  rows: HvChargingCounterDimoIntervalRowV1[];
}): HvChargingCounterQualityAssessmentV1 {
  const forensics = analyzeHvChargingCounterBoundaryForensicsV1(input);
  const ratio =
    forensics.bucketCount > 0
      ? forensics.numericLastCount / forensics.bucketCount
      : null;

  const boundaryUncertainty =
    forensics.classifications.includes('BOUNDARY_UNCERTAIN') ||
    forensics.classifications.includes('INSUFFICIENT_COVERAGE');

  let energyDerivationQuality: HvChargingCounterEnergyDerivationQualityV1 =
    'UNRELIABLE';
  if (forensics.reliableSessionDelta) {
    energyDerivationQuality = 'RELIABLE_FIRST_LAST_IN_SESSION';
  } else if (forensics.numericLastCount >= 2) {
    energyDerivationQuality = 'CONTEXT_ONLY_NUMERIC';
  }

  return {
    schemaVersion: 'hv-r22-counter-quality-v1',
    numericCoverage: {
      bucketCount: forensics.bucketCount,
      numericLastCount: forensics.numericLastCount,
      nullLastCount: forensics.nullLastCount,
      numericCoverageRatio: ratio,
    },
    monotonicity: {
      positiveDeltas: forensics.positiveDeltas,
      negativeDeltas: forensics.negativeDeltas,
      zeroDeltas: forensics.zeroDeltas,
      maxMonotonicRunLength: forensics.maxMonotonicRunLength,
    },
    boundaryClassifications: forensics.classifications,
    resetCandidates: forensics.resetCandidates,
    boundaryUncertainty,
    counterDeltaFirstLastInSessionKwh: forensics.counterDeltaFirstLastInSession,
    energyDerivationQuality,
    reliableSessionCounterDelta: forensics.reliableSessionDelta,
  };
}
