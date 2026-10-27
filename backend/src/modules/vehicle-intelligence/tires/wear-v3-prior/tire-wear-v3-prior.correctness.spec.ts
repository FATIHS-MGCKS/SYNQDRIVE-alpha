import { TireOdometerAnchorStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { TIRE_WEAR_V3_PRIOR_CONFIG } from './tire-wear-v3-prior.config';
import { computeTireWearV3PriorInputFingerprint } from './tire-wear-v3-prior.fingerprint';
import {
  filterLedgerRowsForMountPeriod,
  selectRateCalibrationSegment,
  sumLedgerDistanceKm,
} from './tire-wear-v3-prior.lifecycle';
import {
  computeMinOdometerSpanKmFor3Sigma,
  deriveEvidenceLevel,
  empiricalRateRelativeUncertainty,
  fitWearRateFromMeasurements,
  fuseRateWithPrior,
  priorWearRateIntervalMmPerKm,
} from './tire-wear-v3-prior.math';
import { TireWearV3PriorRepository } from './tire-wear-v3-prior.repository';
import { TireWearV3PriorService } from './tire-wear-v3-prior.service';

describe('tire-wear-v3-prior correctness', () => {
  it('preserves 0.000125 mm/km and tiny positive sigma without interval collapse', () => {
    const rate = 0.000125;
    const prior = priorWearRateIntervalMmPerKm(8, 3, { lo: 35000, hi: 45000 });
    const sigma = 1e-9;
    const fused = fuseRateWithPrior(prior, rate, sigma);
    expect(fused.interval.lo).toBeLessThanOrEqual(prior.lo);
    expect(fused.interval.hi).toBeGreaterThanOrEqual(prior.hi);
    expect(fused.measurementUncertainty?.hi).toBeGreaterThan(rate);
    const rel = empiricalRateRelativeUncertainty(rate, sigma);
    expect(rel).toBeGreaterThan(0);
  });

  it('computes 3σ span from σ_m and rate (6800 km example)', () => {
    const span = computeMinOdometerSpanKmFor3Sigma(0.2, 0.000125);
    expect(span).toBeGreaterThan(6750);
    expect(span).toBeLessThan(6850);
    expect(TIRE_WEAR_V3_PRIOR_CONFIG.reference3SigmaSpacingExampleKm).toBe(6800);
  });

  it('does not promote to L2 when span below 3σ even if Bayes would be tight', () => {
    const level = deriveEvidenceLevel({
      anchorStatus: TireOdometerAnchorStatus.ANCHORED,
      measurementCount: 2,
      ratePointCount: 2,
      empiricalRateMmPerKm: 0.000125,
      empiricalRateSigmaMmPerKm: 1e-8,
      measurementSpanKm: 1000,
      meets3SigmaSpacing: false,
      rateRejected: false,
      priorOnlyForRate: false,
    });
    expect(level).toBe('L1');
  });

  it('promotes to L2 with empirical uncertainty and sufficient span', () => {
    const fit = fitWearRateFromMeasurements(
      [
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
          treadMm: 7.1,
          source: 'manual',
          isCalibrationPoint: false,
        },
      ],
      0.2,
    );
    const meets3Sigma =
      fit.spanKm != null &&
      fit.rateMmPerKm != null &&
      fit.spanKm >= computeMinOdometerSpanKmFor3Sigma(0.2, fit.rateMmPerKm);
    const level = deriveEvidenceLevel({
      anchorStatus: TireOdometerAnchorStatus.ANCHORED,
      measurementCount: 2,
      ratePointCount: 2,
      empiricalRateMmPerKm: fit.rateMmPerKm,
      empiricalRateSigmaMmPerKm: fit.rateSigmaMmPerKm,
      measurementSpanKm: fit.spanKm,
      meets3SigmaSpacing: meets3Sigma,
      rateRejected: false,
      priorOnlyForRate: false,
    });
    expect(level).toBe('L2');
  });

  it('filters ledger to mount period without double counting', () => {
    const period = {
      id: 'p1',
      installedAt: new Date('2026-01-01'),
      removedAt: new Date('2026-06-01'),
      installedOdometerKm: 1000,
      odometerAnchorStatus: TireOdometerAnchorStatus.ANCHORED,
    };
    const rows = [
      {
        id: 'led-1',
        tripId: 't1',
        distanceKm: 10,
        revisionNumber: 1,
        sourceFingerprint: 'a',
        tripStartedAt: new Date('2026-02-01'),
      },
      {
        id: 'led-2',
        tripId: 't2',
        distanceKm: 20,
        revisionNumber: 1,
        sourceFingerprint: 'b',
        tripStartedAt: new Date('2026-07-01'),
      },
    ];
    const filtered = filterLedgerRowsForMountPeriod(rows, period);
    expect(filtered).toHaveLength(1);
    expect(sumLedgerDistanceKm(filtered)).toBe(10);
  });

  it('splits non-monotonic odometer measurements across mount context', () => {
    const { segment, flags } = selectRateCalibrationSegment([
      {
        measuredAt: new Date('2026-01-01'),
        odometerKm: 10000,
        treadMm: 7.5,
        source: 'manual',
        isCalibrationPoint: false,
      },
      {
        measuredAt: new Date('2026-02-01'),
        odometerKm: 9000,
        treadMm: 7.4,
        source: 'manual',
        isCalibrationPoint: false,
      },
      {
        measuredAt: new Date('2026-03-01'),
        odometerKm: 12000,
        treadMm: 7.2,
        source: 'manual',
        isCalibrationPoint: false,
      },
    ]);
    expect(segment).toHaveLength(2);
    expect(segment[0]?.odometerKm).toBe(9000);
    expect(segment[1]?.odometerKm).toBe(12000);
    expect(flags).toContain('ODOMETER_NON_MONOTONIC_SEGMENT_SPLIT');
  });

  it('produces stable fingerprint for identical business inputs', () => {
    const base = {
      tireSetupId: 's1',
      vehicleId: 'v1',
      organizationId: 'o1',
      setupRevision: {
        installedOdometerKm: 1000,
        odometerAnchorStatus: TireOdometerAnchorStatus.ANCHORED,
        initialTreadFrontMm: 8,
        initialTreadRearMm: 8,
        initialTreadDepthMm: 8,
        expectedLifeKm: 40000,
        tireSeason: 'SUMMER',
      },
      mountPeriod: {
        id: 'mp1',
        installedAtIso: '2026-01-01T00:00:00.000Z',
        removedAtIso: null,
        installedOdometerKm: 1000,
      },
      ledger: { activeRowCount: 2, totalDistanceKm: 150, contentDigest: 'abc' },
      measurements: [],
      currentOdometerKm: 1150,
    };
    const a = computeTireWearV3PriorInputFingerprint(base);
    const b = computeTireWearV3PriorInputFingerprint({
      ...base,
      ledger: { ...base.ledger, contentDigest: 'abc' },
    });
    expect(a).toBe(b);
    expect(a).not.toBe(
      computeTireWearV3PriorInputFingerprint({
        ...base,
        currentOdometerKm: 1151,
      }),
    );
  });

  it('blocks shadow write when env flag is off even if persistShadow=true', async () => {
    const repository = {
      insertShadowRowIdempotent: jest.fn(),
      findLatestShadowRow: jest.fn(),
      insertShadowRow: jest.fn(),
      findLatestDs4ShadowEvidenceByLedgerIds: jest.fn().mockResolvedValue([]),
    };
    const configService = { get: jest.fn().mockReturnValue(false) };
    const prisma = {
      vehicleTireSetup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'setup-1',
          vehicleId: 'v1',
          organizationId: 'o1',
          tireSeason: 'SUMMER',
          expectedLifeKm: 40000,
          expectedLifeKmFront: null,
          expectedLifeKmRear: null,
          initialTreadFrontMm: 8,
          initialTreadRearMm: 8,
          initialTreadDepthMm: 8,
          installedOdometerKm: 1000,
          installedAt: new Date('2026-01-01'),
          removedAt: null,
          odometerAnchorStatus: TireOdometerAnchorStatus.ANCHORED,
          initialTreadEvidenceSource: null,
          baselineStatus: null,
          aiTireSpec: null,
          vehicle: { organizationId: 'o1', latestState: { odometerKm: 2000 } },
          mountPeriods: [
            {
              id: 'mp1',
              installedAt: new Date('2026-01-01'),
              removedAt: null,
              installedOdometerKm: 1000,
              odometerAnchorStatus: TireOdometerAnchorStatus.ANCHORED,
            },
          ],
        }),
      },
      tireTripUsageLedger: { findMany: jest.fn().mockResolvedValue([]) },
      vehicleTireTreadMeasurement: { findMany: jest.fn().mockResolvedValue([]) },
      tirePositionHistory: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new TireWearV3PriorService(
      prisma as never,
      repository as unknown as TireWearV3PriorRepository,
      configService as unknown as ConfigService,
    );
    const result = await service.computeForSetup('setup-1', { persistShadow: true });
    expect(repository.insertShadowRowIdempotent).not.toHaveBeenCalled();
    expect(result?.setupFlags).toContain('SHADOW_WRITE_BLOCKED_BY_CONFIG');
  });
});
