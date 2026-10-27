import type {
  NumericInterval,
  TireWearV3EvidenceLevel,
  TireWearV3TreadEvidenceClass,
} from './tire-wear-v3-prior.types';

/**
 * estimatedWearMm = rateMmPer1000Km * distanceKm / 1000  (dimensional: mm/km × km = mm)
 */
export function computeEstimatedWearMmInterval(
  rateMmPerKm: NumericInterval,
  distanceKm: number,
): NumericInterval {
  const d = Math.max(0, distanceKm);
  return {
    lo: rateMmPerKm.lo * d,
    hi: rateMmPerKm.hi * d,
  };
}

export function computeEstimatedWearMmFromDisplayRate(
  rateMmPer1000Km: NumericInterval,
  distanceKm: number,
): NumericInterval {
  const d = Math.max(0, distanceKm);
  return {
    lo: (rateMmPer1000Km.lo * d) / 1000,
    hi: (rateMmPer1000Km.hi * d) / 1000,
  };
}

export function remainingTreadMmFromAnchor(
  anchorTreadMm: number,
  wearMm: NumericInterval,
): NumericInterval {
  return {
    lo: Math.max(0, anchorTreadMm - wearMm.hi),
    hi: Math.max(0, anchorTreadMm - wearMm.lo),
  };
}

export function classifyTreadEvidenceClass(args: {
  rated: boolean;
  evidenceLevel: TireWearV3EvidenceLevel;
  kmSinceLatestMeasurement: number | null;
  measuredFreshKmThreshold: number;
  hasMeasurement: boolean;
}): TireWearV3TreadEvidenceClass {
  if (
    !args.rated ||
    args.evidenceLevel === 'UNRATED' ||
    args.evidenceLevel === 'L0'
  ) {
    return 'INSUFFICIENT';
  }

  if (
    args.hasMeasurement &&
    args.kmSinceLatestMeasurement != null &&
    args.kmSinceLatestMeasurement <= args.measuredFreshKmThreshold
  ) {
    return 'MEASURED';
  }

  if (args.evidenceLevel === 'L1') {
    return 'BASELINE_ESTIMATE';
  }

  if (args.evidenceLevel === 'L2' || args.evidenceLevel === 'L3' || args.evidenceLevel === 'L4') {
    return 'CALIBRATED_ESTIMATE';
  }

  return 'BASELINE_ESTIMATE';
}

export function resolveDisplayTreadForEvidenceClass(args: {
  treadEvidenceClass: TireWearV3TreadEvidenceClass;
  projectedTreadMm: NumericInterval;
  latestMeasuredTreadMm: number | null;
  measurementSigmaMm: number | null;
}): {
  displayTreadMm: NumericInterval | null;
  pointEstimateTreadMm: number | null;
} {
  const { treadEvidenceClass, projectedTreadMm, latestMeasuredTreadMm, measurementSigmaMm } =
    args;

  if (treadEvidenceClass === 'INSUFFICIENT') {
    return { displayTreadMm: null, pointEstimateTreadMm: null };
  }

  if (treadEvidenceClass === 'MEASURED' && latestMeasuredTreadMm != null) {
    const sigma = measurementSigmaMm ?? 0.4;
    return {
      displayTreadMm: {
        lo: Math.max(0, latestMeasuredTreadMm - 1.645 * sigma),
        hi: latestMeasuredTreadMm + 1.645 * sigma,
      },
      pointEstimateTreadMm: latestMeasuredTreadMm,
    };
  }

  if (treadEvidenceClass === 'CALIBRATED_ESTIMATE') {
    const mid = (projectedTreadMm.lo + projectedTreadMm.hi) / 2;
    return {
      displayTreadMm: projectedTreadMm,
      pointEstimateTreadMm: Math.round(mid * 100) / 100,
    };
  }

  return {
    displayTreadMm: projectedTreadMm,
    pointEstimateTreadMm: null,
  };
}
