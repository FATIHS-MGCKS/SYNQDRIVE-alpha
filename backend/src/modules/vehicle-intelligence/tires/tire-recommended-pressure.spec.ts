import {
  buildRecommendedPressurePersistData,
  isConfirmedPressureSpecSource,
  PRESSURE_SPEC_MISSING_LABEL,
  resolveAxleRecommendedPressureBar,
  resolvePressureSpecConfidence,
  resolveRecommendedTirePressure,
} from './tire-recommended-pressure';
import { buildTirePressureContext } from './tire-pressure-context.builder';
import { TireWearModelService } from './tire-wear-model.service';

const AS_OF = new Date('2026-07-16T14:00:00.000Z');

describe('tire-recommended-pressure', () => {
  describe('resolveRecommendedTirePressure', () => {
    it('marks VEHICLE_MANUFACTURER with front/rear as wear-eligible', () => {
      const spec = resolveRecommendedTirePressure({
        recommendedPressureFrontBar: 2.5,
        recommendedPressureRearBar: 2.7,
        pressureSpecSource: 'VEHICLE_MANUFACTURER',
        isStaggered: true,
      });
      expect(spec.wearFactorEligible).toBe(true);
      expect(spec.pressureSpecConfidence).toBe(95);
      expect(spec.pressureSpecMissingLabel).toBeNull();
    });

    it('accepts DOOR_PLACARD with highest confidence', () => {
      const spec = resolveRecommendedTirePressure({
        recommendedPressureFrontBar: 2.4,
        recommendedPressureRearBar: 2.4,
        pressureSpecSource: 'DOOR_PLACARD',
      });
      expect(spec.pressureSpecSource).toBe('DOOR_PLACARD');
      expect(spec.pressureSpecConfidence).toBe(98);
      expect(spec.wearFactorEligible).toBe(true);
    });

    it('accepts USER_CONFIRMED when values are present', () => {
      const spec = resolveRecommendedTirePressure({
        recommendedPressureFrontBar: 2.3,
        recommendedPressureRearBar: 2.5,
        pressureSpecSource: 'USER_CONFIRMED',
        pressureSpecConfirmedAt: '2026-07-10T10:00:00.000Z',
      });
      expect(spec.pressureSpecSource).toBe('USER_CONFIRMED');
      expect(spec.pressureSpecConfidence).toBe(80);
      expect(spec.wearFactorEligible).toBe(true);
    });

    it('treats AI_ESTIMATED as not wear-eligible even with values', () => {
      const spec = resolveRecommendedTirePressure({
        recommendedPressureFrontBar: 2.5,
        recommendedPressureRearBar: 2.5,
        pressureSpecSource: 'AI_ESTIMATED',
      });
      expect(spec.pressureSpecConfidence).toBe(42);
      expect(spec.wearFactorEligible).toBe(false);
      expect(spec.pressureSpecMissingLabel).toBe(PRESSURE_SPEC_MISSING_LABEL);
    });

    it('caps explicit confidence for AI_ESTIMATED below confirmed sources', () => {
      expect(
        resolvePressureSpecConfidence('AI_ESTIMATED', 95),
      ).toBe(42);
      expect(
        resolvePressureSpecConfidence('DOOR_PLACARD', 95),
      ).toBe(95);
    });

    it('returns UNKNOWN with missing label when no confirmed spec', () => {
      const spec = resolveRecommendedTirePressure({
        pressureSpecSource: 'UNKNOWN',
      });
      expect(spec.wearFactorEligible).toBe(false);
      expect(spec.pressureSpecMissingLabel).toBe(PRESSURE_SPEC_MISSING_LABEL);
      expect(spec.pressureSpecConfidence).toBe(0);
    });

    it('mirrors front to rear on non-staggered setups', () => {
      const spec = resolveRecommendedTirePressure({
        recommendedPressureFrontBar: 2.5,
        pressureSpecSource: 'OWNER_MANUAL',
        isStaggered: false,
      });
      expect(spec.recommendedPressureRearBar).toBe(2.5);
      expect(spec.wearFactorEligible).toBe(true);
    });

    it('requires explicit rear on staggered setups', () => {
      const withoutRear = resolveRecommendedTirePressure({
        recommendedPressureFrontBar: 2.5,
        pressureSpecSource: 'DOOR_PLACARD',
        isStaggered: true,
      });
      expect(withoutRear.recommendedPressureRearBar).toBeNull();
      expect(withoutRear.wearFactorEligible).toBe(false);

      const withRear = resolveRecommendedTirePressure({
        recommendedPressureFrontBar: 2.5,
        recommendedPressureRearBar: 2.8,
        pressureSpecSource: 'DOOR_PLACARD',
        isStaggered: true,
      });
      expect(withRear.recommendedPressureRearBar).toBe(2.8);
      expect(withRear.wearFactorEligible).toBe(true);
    });

    it('resolves loaded axle values separately', () => {
      const spec = resolveRecommendedTirePressure({
        recommendedPressureFrontBar: 2.3,
        recommendedPressureRearBar: 2.3,
        recommendedPressureLoadedFrontBar: 2.6,
        recommendedPressureLoadedRearBar: 2.8,
        pressureSpecSource: 'WORKSHOP',
        isStaggered: true,
      });
      expect(
        resolveAxleRecommendedPressureBar('front', spec, { loaded: true }),
      ).toBe(2.6);
      expect(
        resolveAxleRecommendedPressureBar('rear', spec, { loaded: true }),
      ).toBe(2.8);
      expect(
        resolveAxleRecommendedPressureBar('front', spec, { loaded: false }),
      ).toBe(2.3);
    });

    it('never derives recommended pressure from maxInflationKpa on aiTireSpec', () => {
      const spec = resolveRecommendedTirePressure({
        pressureSpecSource: 'UNKNOWN',
        isStaggered: false,
      });
      expect(spec.recommendedPressureFrontBar).toBeNull();
      expect(spec.wearFactorEligible).toBe(false);
    });
  });

  describe('buildRecommendedPressurePersistData', () => {
    it('requires confirmPressureSpec for USER_CONFIRMED', () => {
      expect(() =>
        buildRecommendedPressurePersistData({
          recommendedPressureFrontBar: 2.5,
          pressureSpecSource: 'USER_CONFIRMED',
        }),
      ).toThrow(/confirmPressureSpec=true/);
    });

    it('sets confirmedAt for confirmed sources', () => {
      const data = buildRecommendedPressurePersistData({
        recommendedPressureFrontBar: 2.5,
        pressureSpecSource: 'DOOR_PLACARD',
      });
      expect(data.pressureSpecConfirmedAt).toBeInstanceOf(Date);
      expect(data.pressureSpecConfidence).toBe(98);
    });

    it('does not auto-confirm AI_ESTIMATED values', () => {
      const data = buildRecommendedPressurePersistData({
        recommendedPressureFrontBar: 2.5,
        pressureSpecSource: 'AI_ESTIMATED',
      });
      expect(data.pressureSpecConfirmedAt).toBeNull();
      expect(data.pressureSpecConfidence).toBe(42);
    });
  });

  describe('isConfirmedPressureSpecSource', () => {
    it('classifies allowed sources', () => {
      expect(isConfirmedPressureSpecSource('VEHICLE_MANUFACTURER')).toBe(true);
      expect(isConfirmedPressureSpecSource('AI_ESTIMATED')).toBe(false);
      expect(isConfirmedPressureSpecSource('UNKNOWN')).toBe(false);
    });
  });
});

describe('pressure wear integration', () => {
  const mockPrisma = {} as never;
  const mockDI = { getVehicleImpactForTire: jest.fn().mockResolvedValue(null) } as never;
  const wearModel = new TireWearModelService(mockPrisma, mockDI);

  it('uses neutral pressure factor when only maxInflationKpa would have been available', () => {
    const spec = { maxInflationKpa: 350 } as never;
    const factor = wearModel.computePressureFactor(
      'front',
      1.8,
      1.8,
      null,
      spec,
    );
    expect(factor).toBe(1);
  });

  it('applies underinflation wear when confirmed recommended pressure exists', () => {
    const factor = wearModel.computePressureFactor(
      'front',
      1.8,
      1.7,
      2.5,
      null,
    );
    expect(factor).toBeGreaterThan(1);
  });

  it('disables wear eligibility without confirmed recommended pressure', () => {
    const ctx = buildTirePressureContext({
      asOf: AS_OF,
      dimo: {
        tirePressureFl: 2.5,
        tirePressureFr: 2.5,
        tirePressureRl: 2.5,
        tirePressureRr: 2.5,
        providerSource: 'DIMO',
        sourceTimestamp: new Date('2026-07-16T13:30:00.000Z'),
        providerFetchedAt: new Date('2026-07-16T13:30:00.000Z'),
        lastSeenAt: new Date('2026-07-16T13:30:00.000Z'),
      },
      recommendedPressure: resolveRecommendedTirePressure({
        pressureSpecSource: 'UNKNOWN',
      }),
    });
    expect(ctx.wearEligibility.eligible).toBe(false);
    expect(ctx.pressureSpecMissingLabel).toBe(PRESSURE_SPEC_MISSING_LABEL);
  });

  it('keeps TPMS warning usable without confirmed recommended pressure', () => {
    const ctx = buildTirePressureContext({
      asOf: AS_OF,
      recommendedPressure: resolveRecommendedTirePressure({
        pressureSpecSource: 'UNKNOWN',
      }),
      dimo: {
        tirePressureFl: null,
        tirePressureFr: null,
        tirePressureRl: null,
        tirePressureRr: null,
        providerSource: 'DIMO',
        sourceTimestamp: new Date('2026-07-16T13:00:00.000Z'),
        providerFetchedAt: null,
        lastSeenAt: null,
        tpmsWarning: {
          signalPresent: true,
          value: true,
          sourceTimestamp: new Date('2026-07-16T13:00:00.000Z'),
        },
      },
    });
    expect(ctx.tpmsWarning).toBe(true);
    expect(ctx.overallStatus).toBe('ISSUE');
    expect(ctx.wearEligibility.eligible).toBe(false);
    expect(ctx.pressureSpecMissingLabel).toBe(PRESSURE_SPEC_MISSING_LABEL);
  });
});
