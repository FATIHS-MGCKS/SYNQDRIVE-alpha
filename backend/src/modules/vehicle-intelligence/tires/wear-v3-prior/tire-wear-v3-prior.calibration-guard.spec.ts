import { TireOdometerAnchorStatus } from '@prisma/client';
import { TIRE_WEAR_V3_PRIOR_CONFIG } from './tire-wear-v3-prior.config';
import {
  rateCalibrationBlockedByMeasurementQuality,
  resolveRateCalibrationSigmaMm,
} from './tire-wear-v3-prior.calibration';
import {
  buildWearRateEstimate,
  computeMinOdometerSpanKmFor3Sigma,
  deriveEvidenceLevel,
  fitWearRateFromMeasurements,
} from './tire-wear-v3-prior.math';

describe('tire-wear-v3-prior calibration guards', () => {
  it('keeps default σ when only isCalibrationPoint or workshop is set', () => {
    const workshopOnly = resolveRateCalibrationSigmaMm([
      {
        measuredAt: new Date('2026-01-01'),
        odometerKm: 10000,
        treadMm: 7.5,
        source: 'workshop',
        isCalibrationPoint: false,
      },
    ]);
    expect(workshopOnly.sigmaMm).toBe(
      TIRE_WEAR_V3_PRIOR_CONFIG.defaultMeasurementUncertaintyMm,
    );
    expect(workshopOnly.flags).toContain('MEASUREMENT_PRECISION_CLAIM_NOT_VERIFIED');

    const calibrationFlag = resolveRateCalibrationSigmaMm([
      {
        measuredAt: new Date('2026-01-01'),
        odometerKm: 10000,
        treadMm: 7.5,
        source: 'manual',
        isCalibrationPoint: true,
      },
    ]);
    expect(calibrationFlag.sigmaMm).toBe(0.4);
    expect(calibrationFlag.flags).toContain('MEASUREMENT_PRECISION_CLAIM_NOT_VERIFIED');
  });

  it('does not tighten σ for mixed manual and workshop points', () => {
    const mixed = resolveRateCalibrationSigmaMm([
      {
        measuredAt: new Date('2026-01-01'),
        odometerKm: 10000,
        treadMm: 8,
        source: 'manual',
        isCalibrationPoint: false,
      },
      {
        measuredAt: new Date('2026-06-01'),
        odometerKm: 17000,
        treadMm: 7.2,
        source: 'workshop',
        isCalibrationPoint: true,
      },
    ]);
    expect(mixed.sigmaMm).toBe(0.4);
    expect(mixed.sigmaMm).toBeGreaterThan(
      TIRE_WEAR_V3_PRIOR_CONFIG.refinedMeasurementUncertaintyMm,
    );
  });

  it('blocks rate fusion on TREAD_JUMP_SUSPECT (prior-only)', () => {
    const points = [
      {
        measuredAt: new Date('2026-01-01'),
        odometerKm: 10000,
        treadMm: 8,
        source: 'manual',
        isCalibrationPoint: false,
      },
      {
        measuredAt: new Date('2026-03-01'),
        odometerKm: 20000,
        treadMm: 7.5,
        source: 'manual',
        isCalibrationPoint: false,
      },
      {
        measuredAt: new Date('2026-06-01'),
        odometerKm: 30000,
        treadMm: 5.2,
        source: 'manual',
        isCalibrationPoint: false,
      },
    ];
    const fit = fitWearRateFromMeasurements(points, 0.4);
    expect(fit.flags).toContain('TREAD_JUMP_SUSPECT');
    expect(rateCalibrationBlockedByMeasurementQuality(fit.flags)).toBe(true);

    const estimate = buildWearRateEstimate({
      initialTreadMm: 8,
      replacementMm: 3,
      spec: null,
      archetype: 'default',
      season: 'SUMMER',
      setupExpectedLifeKm: 40000,
      expectedLifeKmFront: null,
      expectedLifeKmRear: null,
      position: 'FL',
      widenedBaseline: false,
      measurements: points,
      sigmaMeasMm: 0.4,
    });
    expect(estimate.source).not.toBe('measurement_fused');
    expect(estimate.flags).toContain('RATE_CALIBRATION_PRIOR_ONLY');
  });

  it('blocks fusion and L2+ when series is contradictory (high residual)', () => {
    const points = [
      {
        measuredAt: new Date('2026-01-01'),
        odometerKm: 10000,
        treadMm: 8,
        source: 'workshop',
        isCalibrationPoint: true,
      },
      {
        measuredAt: new Date('2026-04-01'),
        odometerKm: 20000,
        treadMm: 7.5,
        source: 'workshop',
        isCalibrationPoint: true,
      },
      {
        measuredAt: new Date('2026-07-01'),
        odometerKm: 30000,
        treadMm: 7.8,
        source: 'workshop',
        isCalibrationPoint: true,
      },
    ];
    const fit = fitWearRateFromMeasurements(points, 0.4);
    expect(fit.flags).toContain('RATE_MEASUREMENT_SERIES_CONTRADICTORY');

    const estimate = buildWearRateEstimate({
      initialTreadMm: 8,
      replacementMm: 3,
      spec: null,
      archetype: 'default',
      season: 'SUMMER',
      setupExpectedLifeKm: 40000,
      expectedLifeKmFront: null,
      expectedLifeKmRear: null,
      position: 'FL',
      widenedBaseline: false,
      measurements: points,
      sigmaMeasMm: 0.4,
    });
    expect(estimate.source).not.toBe('measurement_fused');

    const meets3Sigma =
      fit.rateMmPerKm != null &&
      fit.spanKm != null &&
      fit.spanKm >= computeMinOdometerSpanKmFor3Sigma(0.4, fit.rateMmPerKm);
    const level = deriveEvidenceLevel({
      anchorStatus: TireOdometerAnchorStatus.ANCHORED,
      measurementCount: 3,
      ratePointCount: 3,
      empiricalRateMmPerKm: fit.rateMmPerKm,
      empiricalRateSigmaMmPerKm: fit.rateSigmaMmPerKm,
      measurementSpanKm: fit.spanKm,
      meets3SigmaSpacing: meets3Sigma,
      rateRejected: false,
      priorOnlyForRate: true,
    });
    expect(level).toBe('L1');
  });
});
