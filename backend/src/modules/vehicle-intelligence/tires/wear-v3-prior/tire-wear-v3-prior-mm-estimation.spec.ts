import { TireOdometerAnchorStatus } from '@prisma/client';
import {
  classifyTreadEvidenceClass,
  computeEstimatedWearMmFromDisplayRate,
  computeEstimatedWearMmInterval,
  resolveDisplayTreadForEvidenceClass,
} from './tire-wear-v3-baseline.math';
import {
  applyDynamicFactorToRateInterval,
  boundedDynamicWearFactor,
  computeSetupDs4Severity,
} from './tire-wear-v3-dynamic.math';
import {
  TIRE_WEAR_V3_PRIOR_CONFIG,
  TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA,
  TIRE_WEAR_V3_PRIOR_LEGACY_MODEL_VERSION,
  TIRE_WEAR_V3_PRIOR_MODEL_VERSION,
  usePosteriorRateFusionForModelVersion,
} from './tire-wear-v3-prior.config';
import {
  fuseRateWithPrior,
  fuseRateWithPriorPosterior,
  priorWearRateIntervalMmPerKm,
} from './tire-wear-v3-prior.math';

describe('tire-wear-v3-prior mm estimation', () => {
  it('selects posterior fusion only for non-legacy model versions', () => {
    expect(usePosteriorRateFusionForModelVersion(TIRE_WEAR_V3_PRIOR_MODEL_VERSION)).toBe(
      true,
    );
    expect(
      usePosteriorRateFusionForModelVersion(TIRE_WEAR_V3_PRIOR_LEGACY_MODEL_VERSION),
    ).toBe(false);
  });

  it('computes wear mm with dimensional consistency (mm/km × km)', () => {
    const wear = computeEstimatedWearMmInterval(
      { lo: 0.0001, hi: 0.00015 },
      10000,
    );
    expect(wear.lo).toBeCloseTo(1, 6);
    expect(wear.hi).toBeCloseTo(1.5, 6);
    const fromDisplay = computeEstimatedWearMmFromDisplayRate(
      { lo: 0.1, hi: 0.15 },
      10000,
    );
    expect(fromDisplay.lo).toBeCloseTo(1, 6);
  });

  it('posterior fusion can narrow interval vs legacy union', () => {
    const prior = priorWearRateIntervalMmPerKm(8, 3, { lo: 35000, hi: 45000 });
    const rate = 0.00012;
    const sigma = 0.00001;
    const legacy = fuseRateWithPrior(prior, rate, sigma);
    const posterior = fuseRateWithPriorPosterior(prior, rate, sigma);
    const legacyWidth = legacy.interval.hi - legacy.interval.lo;
    const postWidth = posterior.interval.hi - posterior.interval.lo;
    expect(postWidth).toBeLessThan(legacyWidth);
    expect(posterior.interval.lo).toBeGreaterThanOrEqual(
      TIRE_WEAR_V3_PRIOR_CONFIG.minPlausibleWearRateMmPer1000km / 1000,
    );
  });

  it('keeps legacy fuseRateWithPrior widening behavior', () => {
    const prior = priorWearRateIntervalMmPerKm(8, 3, { lo: 35000, hi: 45000 });
    const fused = fuseRateWithPrior(prior, 0.000125, 1e-9);
    expect(fused.interval.lo).toBeLessThanOrEqual(prior.lo);
    expect(fused.interval.hi).toBeGreaterThanOrEqual(prior.hi);
  });

  it('classifies evidence without labeling estimates as measurements', () => {
    expect(
      classifyTreadEvidenceClass({
        rated: true,
        evidenceLevel: 'L1',
        kmSinceLatestMeasurement: 2000,
        measuredFreshKmThreshold: 500,
        hasMeasurement: true,
      }),
    ).toBe('BASELINE_ESTIMATE');

    expect(
      classifyTreadEvidenceClass({
        rated: true,
        evidenceLevel: 'L2',
        kmSinceLatestMeasurement: 2000,
        measuredFreshKmThreshold: 500,
        hasMeasurement: true,
      }),
    ).toBe('CALIBRATED_ESTIMATE');

    expect(
      classifyTreadEvidenceClass({
        rated: true,
        evidenceLevel: 'L2',
        kmSinceLatestMeasurement: 100,
        measuredFreshKmThreshold: 500,
        hasMeasurement: true,
      }),
    ).toBe('MEASURED');
  });

  it('suppresses display mm when evidence is insufficient', () => {
    const out = resolveDisplayTreadForEvidenceClass({
      treadEvidenceClass: 'INSUFFICIENT',
      projectedTreadMm: { lo: 5, hi: 6 },
      latestMeasuredTreadMm: 7,
      measurementSigmaMm: 0.4,
    });
    expect(out.displayTreadMm).toBeNull();
    expect(out.pointEstimateTreadMm).toBeNull();
  });

  it('does not apply dynamic wear when beta is zero', () => {
    expect(TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA).toBe(0);
    const dyn = boundedDynamicWearFactor(1.5, 1);
    expect(dyn.factor).toBe(1);
    expect(dyn.applied).toBe(false);
    const rate = applyDynamicFactorToRateInterval({ lo: 0.0001, hi: 0.0002 }, dyn);
    expect(rate).toEqual({ lo: 0.0001, hi: 0.0002 });
  });

  it('treats missing DS4 rows as reduced coverage not zero stress', () => {
    const severity = computeSetupDs4Severity(
      [
        {
          ledgerId: 'l1',
          distanceKm: 100,
          ds4ReadStatus: 'SUCCEEDED',
          temporalCoverage: 'PARTIAL',
          m3JPerKgPerKm: 20,
          validDrivingSeconds: 100,
          tripDurationSeconds: 200,
        },
      ],
      500,
    );
    expect(severity.coverage).toBeGreaterThan(0);
    expect(severity.coverage).toBeLessThan(1);
    const dyn = boundedDynamicWearFactor(severity.sRel, severity.coverage);
    expect(dyn.factor).toBe(1);
  });

  it('never projects negative tread depth in display resolution', () => {
    const out = resolveDisplayTreadForEvidenceClass({
      treadEvidenceClass: 'MEASURED',
      projectedTreadMm: { lo: 0, hi: 1 },
      latestMeasuredTreadMm: 1.6,
      measurementSigmaMm: 0.4,
    });
    expect(out.displayTreadMm?.lo).toBeGreaterThanOrEqual(0);
  });
});

describe('tire-wear-v3-prior evidence level guard', () => {
  it('marks unrated setups insufficient for mm display', () => {
    const cls = classifyTreadEvidenceClass({
      rated: false,
      evidenceLevel: 'UNRATED',
      kmSinceLatestMeasurement: null,
      measuredFreshKmThreshold: 500,
      hasMeasurement: false,
    });
    expect(cls).toBe('INSUFFICIENT');
  });
});
