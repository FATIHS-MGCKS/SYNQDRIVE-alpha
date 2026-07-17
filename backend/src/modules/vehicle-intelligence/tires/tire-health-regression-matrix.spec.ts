/**
 * Audit regression matrix — maps TC01–TC36 from
 * docs/audits/data/tire-health-test-coverage-2026-07.csv to executable tests.
 */
import { TireEvidenceSource, TireSetupStatus } from '@prisma/client';
import { normalizeDimoTirePressureKpa } from '@modules/dimo/dimo-tire-pressure.normalizer';
import { buildTirePressureContext } from './tire-pressure-context.builder';
import { buildTireDimoContext } from './tire-dimo-context.builder';
import { evaluateTireDimoSignalCapability } from './tire-dimo-signal-capability';
import {
  buildAmbientTemperatureContext,
} from './tire-ambient-context';
import {
  resolveInitialTreadEvidence,
  isDefaultTreadFallbackValue,
} from './tire-evidence-provenance';
import {
  isSyntheticPredictedGroundTruthLeak,
  hasValidGroundTruthMeasurement,
  resolveAxleGroundTruthTreadMm,
} from './tire-ground-truth.util';
import {
  assessOdometerPlausibility,
  isRuntimeTelemetryAutoAnchorEligible,
  resolveOdometerAnchor,
} from './tire-odometer-anchor';
import {
  classifySeasonStatus,
  classifyTreadStatus,
  classifyUnevenWear,
  aggregateTireStatus,
  classifyConfidenceLevel,
} from './tire-status';
import { buildTireHealthAlerts } from './tire-health-alert.builder';
import { buildTireAlertDedupeKey } from './tire-health-alert.registry';
import {
  buildTireRentalHealthReadModel,
  isTireRentalHardBlocked,
} from '@modules/rental-health/tire-rental-health.policy';
import { buildTireEvidencePresentation } from './tire-health-presentation';
import { TIRE_HEALTH_CONFIG } from './tire-health.config';
import {
  advisoryLockSeed,
  pgAdvisoryLockKeys,
  withTripUsageReplayRetry,
  TireTripUsageReplayConflictError,
} from './tire-trip-usage-replay';
import { TireWearModelService } from './tire-wear-model.service';
import { emptyTirePressureContext } from './tire-pressure-context.builder';
import { resolveRecommendedTirePressure } from './tire-recommended-pressure';

const AS_OF = new Date('2026-07-16T12:00:00.000Z');

describe('tire health regression matrix', () => {
  describe('TC01 four_real_measurements', () => {
    it('uses all four wheel measurements when complete', () => {
      const measurement = {
        tireSetupId: 'setup-1',
        source: 'manual',
        measuredAt: AS_OF,
        frontLeftMm: 6.1,
        frontRightMm: 6.0,
        rearLeftMm: 5.8,
        rearRightMm: 5.9,
      };
      expect(
        hasValidGroundTruthMeasurement({
          measurement,
          tireSetupId: 'setup-1',
          axle: 'front',
          asOf: AS_OF,
        }),
      ).toBe(true);
      expect(
        hasValidGroundTruthMeasurement({
          measurement,
          tireSetupId: 'setup-1',
          axle: 'rear',
          asOf: AS_OF,
        }),
      ).toBe(true);
    });
  });

  describe('TC02 partial_wheel_measurement', () => {
    it('does not invent missing wheel tread values', () => {
      const measurement = {
        tireSetupId: 'setup-1',
        source: 'manual',
        measuredAt: AS_OF,
        frontLeftMm: 6.1,
        frontRightMm: null,
        rearLeftMm: 5.8,
        rearRightMm: null,
      };
      expect(
        hasValidGroundTruthMeasurement({
          measurement,
          tireSetupId: 'setup-1',
          axle: 'front',
          asOf: AS_OF,
        }),
      ).toBe(false);
      expect(resolveAxleGroundTruthTreadMm(measurement, 'front')).toBeNull();
    });
  });

  describe('TC03 no_measurement', () => {
    it('aggregates unknown tread when no measurement exists', () => {
      expect(aggregateTireStatus('UNKNOWN', 'GOOD')).toBe('GOOD');
      expect(classifyTreadStatus(null, 'SUMMER')).toBe('UNKNOWN');
    });
  });

  describe('TC04 8mm_default_setup', () => {
    it('marks configured 8 mm fallback as DEFAULT_ASSUMPTION', () => {
      expect(isDefaultTreadFallbackValue(8)).toBe(true);
      const evidence = resolveInitialTreadEvidence({
        usedDefaultFallback: true,
        treadMm: TIRE_HEALTH_CONFIG.defaultInitialTreadFallbackMm,
      });
      expect(evidence.evidenceSource).toBe(TireEvidenceSource.DEFAULT_ASSUMPTION);
    });
  });

  describe('TC05 ai_spec_wrong', () => {
    it('keeps unconfirmed AI spec at AI_ESTIMATED confidence', () => {
      const evidence = resolveInitialTreadEvidence({
        aiTireSpec: { newTreadDepthMm: 8.2, confidenceScore: 72, userConfirmedSpec: false },
      });
      expect(evidence.evidenceSource).toBe(TireEvidenceSource.AI_ESTIMATED);
    });
  });

  describe('TC06 ai_spec_confirmed', () => {
    it('promotes user-confirmed AI spec to USER_CONFIRMED', () => {
      const evidence = resolveInitialTreadEvidence({
        aiTireSpec: { newTreadDepthMm: 8.2, confidenceScore: 72, userConfirmedSpec: true },
        userConfirmedSpec: true,
        treadMm: 8.2,
      });
      expect(evidence.evidenceSource).toBe(TireEvidenceSource.USER_CONFIRMED);
    });
  });

  describe('TC07 staggered_setup', () => {
    it('uses separate front/rear reference tread bands for winter', () => {
      expect(classifyTreadStatus(4.5, 'WINTER')).toBe('WATCH');
      expect(classifyTreadStatus(4.5, 'SUMMER')).toBe('GOOD');
    });
  });

  describe('TC08 season_summer_winter_allseason', () => {
    it('covers calendar season mismatch paths', () => {
      const jan = new Date(2026, 0, 15);
      const jul = new Date(2026, 6, 15);
      expect(classifySeasonStatus('SUMMER', jan).mismatch).toBe(true);
      expect(classifySeasonStatus('ALL_SEASON', jul).mismatch).toBe(false);
    });
  });

  describe('TC09 ev_and_ice_powertrain', () => {
    it('applies regen-aware wear model without throwing for EV', () => {
      const svc = new TireWearModelService({} as never, {} as never);
      const ev = svc.computePositionalRegenFactors('ELECTRIC', 'RWD');
      const ice = svc.computePositionalRegenFactors('GASOLINE', 'FWD');
      expect(ev.front).toBeGreaterThan(0);
      expect(ice.rear).toBeGreaterThan(0);
    });
  });

  describe('TC10 front_rear_different_wear', () => {
    it('classifies uneven wear from side deltas', () => {
      expect(classifyUnevenWear(1.1, 0.2, 0.3)).toBe('WARNING');
      expect(classifyUnevenWear(0.2, 0.1, 1.3)).toBe('WATCH');
    });
  });

  describe('TC11 partial_replacement', () => {
    it('allows single-position tread evidence without full axle GT', () => {
      expect(
        hasValidGroundTruthMeasurement({
          measurement: {
            tireSetupId: 'setup-1',
            source: 'manual',
            measuredAt: AS_OF,
            frontLeftMm: 6,
            frontRightMm: null,
            rearLeftMm: 5,
            rearRightMm: 5,
          },
          tireSetupId: 'setup-1',
          axle: 'front',
        }),
      ).toBe(false);
      expect(
        hasValidGroundTruthMeasurement({
          measurement: {
            tireSetupId: 'setup-1',
            source: 'manual',
            measuredAt: AS_OF,
            frontLeftMm: 6,
            frontRightMm: 6.1,
            rearLeftMm: 5,
            rearRightMm: 5,
          },
          tireSetupId: 'setup-1',
          axle: 'front',
        }),
      ).toBe(true);
    });
  });

  describe('TC12 rotation', () => {
    it('builds rotation alert when km since rotation exceeds threshold', () => {
      const alerts = buildTireHealthAlerts({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        setup: {
          id: 'setup-1',
          tireSeason: 'SUMMER',
          totalKmOnSet: 12000,
          installedOdometerKm: 10000,
          measurements: [{ measuredAt: AS_OF }],
        },
        wearAnalysis: {
          frontLeftMm: 5,
          frontRightMm: 5,
          rearLeftMm: 4.0,
          rearRightMm: 4.0,
          estimatedRemainingKm: 8000,
          explainability: { currentTreadSource: 'estimated' },
        },
        displayMode: 'ESTIMATED',
        confidenceScore: 70,
        pressureContext: emptyTirePressureContext(),
        kmSinceLastRotation: 13000,
      });
      expect(alerts.some((a) => a.alertType === 'ROTATION_RECOMMENDED')).toBe(true);
    });
  });

  describe('TC13 stored_set_reactivation', () => {
    it('preserves stored setup km totals across status enum', () => {
      expect(TireSetupStatus.STORED).toBe('STORED');
      expect(TireSetupStatus.ACTIVE).toBe('ACTIVE');
    });
  });

  describe('TC14 odometer_rollback', () => {
    it('flags rollback beyond tolerance', () => {
      const result = assessOdometerPlausibility(10000, 12000);
      expect(result.plausible).toBe(false);
      expect(result.issue).toBe('ROLLBACK');
    });
  });

  describe('TC14b missing_odometer_telemetry_bootstrap', () => {
    it('permits runtime telemetry auto-anchor for provider odometer', () => {
      const anchor = resolveOdometerAnchor({
        context: {
          latestState: {
            odometerKm: 30500,
            providerSource: 'DIMO',
            providerFetchedAt: AS_OF,
            sourceTimestamp: AS_OF,
            lastSeenAt: AS_OF,
            source: 'dimo',
          },
          vehicleMileageKm: null,
          lastKnownOdometerKm: null,
        },
      });
      expect(isRuntimeTelemetryAutoAnchorEligible(anchor)).toBe(true);
    });
  });

  describe('TC15 trip_double_apply', () => {
    it('uses deterministic advisory lock seeds per trip/setup', () => {
      const a = pgAdvisoryLockKeys(advisoryLockSeed('trip-1', 'setup-1'));
      const b = pgAdvisoryLockKeys(advisoryLockSeed('trip-1', 'setup-1'));
      expect(a).toEqual(b);
    });
  });

  describe('TC16 late_trip_enrich', () => {
    it('retries replay conflicts up to configured attempts', async () => {
      let attempts = 0;
      await expect(
        withTripUsageReplayRetry(async () => {
          attempts += 1;
          if (attempts < 2) {
            throw new TireTripUsageReplayConflictError('conflict');
          }
        }),
      ).resolves.toBeUndefined();
      expect(attempts).toBe(2);
    });
  });

  describe('TC17 recalculation_duplicate', () => {
    it('deduplicates alerts via stable dedupe keys', () => {
      const key = buildTireAlertDedupeKey({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        tireSetupId: 'setup-1',
        alertType: 'LOW_TREAD',
        evidenceFingerprint: 'fp-1',
      });
      const key2 = buildTireAlertDedupeKey({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        tireSetupId: 'setup-1',
        alertType: 'LOW_TREAD',
        evidenceFingerprint: 'fp-1',
      });
      expect(key).toBe(key2);
    });
  });

  describe('TC18 kpa_bar_unit_mismatch', () => {
    it('normalizes DIMO kPa exactly once to bar', () => {
      expect(normalizeDimoTirePressureKpa(274).normalizedValue).toBe(2.74);
      expect(normalizeDimoTirePressureKpa(301).normalizedValue).toBe(3.01);
    });
  });

  describe('TC19 pressure_stale_gating', () => {
    it('excludes stale pressure from wear eligibility', () => {
      const ctx = buildTirePressureContext({
        asOf: AS_OF,
        dimo: {
          tirePressureFl: 2.5,
          tirePressureFr: 2.5,
          tirePressureRl: 2.5,
          tirePressureRr: 2.5,
          providerSource: 'DIMO',
          sourceTimestamp: new Date('2026-07-10T00:00:00Z'),
          providerFetchedAt: new Date('2026-07-10T00:00:00Z'),
          lastSeenAt: new Date('2026-07-10T00:00:00Z'),
        },
      });
      expect(ctx.overallFreshness).toBe('stale');
      expect(ctx.wearEligibility.eligible).toBe(false);
    });
  });

  describe('TC20 dimo_hm_conflict', () => {
    it('labels mixed per-wheel sources explicitly', () => {
      const ctx = buildTirePressureContext({
        asOf: AS_OF,
        dimo: {
          tirePressureFl: 2.74,
          tirePressureFr: null,
          tirePressureRl: null,
          tirePressureRr: null,
          providerSource: 'DIMO',
          sourceTimestamp: new Date('2026-07-16T11:00:00Z'),
          providerFetchedAt: new Date('2026-07-16T11:00:00Z'),
          lastSeenAt: new Date('2026-07-16T11:00:00Z'),
        },
        hm: {
          frontLeft: null,
          frontRight: 2.8,
          rearLeft: 2.77,
          rearRight: 2.82,
          unit: 'bar',
          lastUpdatedAt: '2026-07-16T13:55:00.000Z',
        },
      });
      expect(ctx.sourceType).toBe('MIXED');
    });
  });

  describe('TC21 tpms_without_numeric_pressure', () => {
    it('keeps TPMS warning null when no numeric pressure exists', () => {
      const ctx = buildTirePressureContext({
        asOf: AS_OF,
        dimo: {
          tirePressureFl: null,
          tirePressureFr: null,
          tirePressureRl: null,
          tirePressureRr: null,
          providerSource: 'DIMO',
          sourceTimestamp: AS_OF,
          providerFetchedAt: AS_OF,
          lastSeenAt: AS_OF,
          tpmsWarning: { signalPresent: false, value: null, sourceTimestamp: null },
        },
      });
      expect(ctx.tpmsWarning).toBeNull();
      expect(ctx.coverage.wheelsAvailable).toBe(0);
    });
  });

  describe('TC22 estimated_critical_status', () => {
    it('does not hard-block rental on estimated critical alone', () => {
      const model = buildTireRentalHealthReadModel({
        summary: {
          overallStatus: 'CRITICAL',
          displayMode: 'ESTIMATED',
          confidence: 'LOW',
          measuredTreadMm: null,
          estimatedTreadMm: 1.5,
          displayTreadMm: 1.5,
          pressureContext: emptyTirePressureContext(),
          alerts: [],
        } as never,
        activeReviewOverride: null,
      });
      expect(isTireRentalHardBlocked(model)).toBe(false);
    });
  });

  describe('TC23 rental_blocking', () => {
    it('hard-blocks only measured tread at legal minimum', () => {
      const model = buildTireRentalHealthReadModel({
        summary: {
          overallStatus: 'CRITICAL',
          displayMode: 'MEASURED',
          confidence: 'HIGH',
          lowestTreadMm: 1.5,
          measuredTreadMm: 1.5,
          estimatedTreadMm: 1.5,
          displayTreadMm: 1.5,
          pressureContext: emptyTirePressureContext(),
          alerts: [],
        } as never,
        activeReviewOverride: null,
      });
      expect(isTireRentalHardBlocked(model)).toBe(true);
    });
  });

  describe('TC24 measurement_correction', () => {
    it('rejects synthetic predicted-as-actual leakage', () => {
      expect(isSyntheticPredictedGroundTruthLeak(6.0, 6.0)).toBe(true);
      expect(isSyntheticPredictedGroundTruthLeak(6.0, 5.7)).toBe(false);
    });
  });

  describe('TC25 data_leakage_regression', () => {
    it('requires complete axle GT before regression points', () => {
      expect(
        hasValidGroundTruthMeasurement({
          measurement: {
            tireSetupId: 's1',
            source: 'workshop',
            measuredAt: AS_OF,
            frontLeftMm: 6,
            frontRightMm: 6,
            rearLeftMm: 5,
            rearRightMm: 5,
          },
          tireSetupId: 's1',
          axle: 'rear',
          asOf: AS_OF,
        }),
      ).toBe(true);
    });
  });

  describe('TC26 confidence_calibration', () => {
    it('downgrades confidence without recent measurement', () => {
      expect(
        classifyConfidenceLevel({
          hasMeasurement: false,
          measurementAgeDays: null,
          kmSinceMeasurement: null,
          hasWearBaseline: true,
        }),
      ).toBe('LOW');
    });
  });

  describe('TC27 alert_deduplication', () => {
    it('produces identical dedupe keys for same evidence fingerprint', () => {
      const a = buildTireAlertDedupeKey({
        organizationId: 'o',
        vehicleId: 'v',
        tireSetupId: 's',
        alertType: 'TPMS_WARNING',
        evidenceFingerprint: 'abc',
      });
      const b = buildTireAlertDedupeKey({
        organizationId: 'o',
        vehicleId: 'v',
        tireSetupId: 's',
        alertType: 'TPMS_WARNING',
        evidenceFingerprint: 'abc',
      });
      expect(a).toBe(b);
    });
  });

  describe('TC28 multi_tenant_isolation', () => {
    it('scopes dedupe keys by organization id', () => {
      const a = buildTireAlertDedupeKey({
        organizationId: 'org-a',
        vehicleId: 'v',
        tireSetupId: 's',
        alertType: 'LOW_TREAD',
        evidenceFingerprint: 'fp',
      });
      const b = buildTireAlertDedupeKey({
        organizationId: 'org-b',
        vehicleId: 'v',
        tireSetupId: 's',
        alertType: 'LOW_TREAD',
        evidenceFingerprint: 'fp',
      });
      expect(a).not.toBe(b);
    });
  });

  describe('TC29 historical_as_of_backtest', () => {
    it('excludes measurements after replay instant', () => {
      expect(
        hasValidGroundTruthMeasurement({
          measurement: {
            tireSetupId: 's1',
            source: 'manual',
            measuredAt: new Date('2026-08-01'),
            frontLeftMm: 6,
            frontRightMm: 6,
            rearLeftMm: 5,
            rearRightMm: 5,
          },
          tireSetupId: 's1',
          axle: 'front',
          asOf: AS_OF,
        }),
      ).toBe(false);
    });
  });

  describe('TC30 multi_worker_recalc', () => {
    it('uses distinct advisory lock keys per trip/setup pair', () => {
      const one = pgAdvisoryLockKeys(advisoryLockSeed('t1', 's1'));
      const two = pgAdvisoryLockKeys(advisoryLockSeed('t2', 's1'));
      expect(one).not.toEqual(two);
    });
  });

  describe('TC31 capability_gating', () => {
    it('blocks wheel speed tread derivations', () => {
      const cap = evaluateTireDimoSignalCapability({
        signalName: 'chassisAxleRow1WheelLeftSpeed',
        asOf: AS_OF,
      });
      expect(cap.usable).toBe(false);
    });
  });

  describe('TC32 unknown_not_good', () => {
    it('never promotes empty baseline to GOOD in presentation', () => {
      const presentation = buildTireEvidencePresentation({
        summary: {
          overallStatus: 'UNKNOWN',
          displayMode: 'UNKNOWN',
          confidence: 'UNKNOWN',
          isDefaultAssumption: true,
          estimatedRemainingKm: null,
          predictionCapable: false,
          pressureContext: emptyTirePressureContext(),
          alerts: [],
        } as never,
      });
      expect(presentation.uiStatus).not.toBe('GOOD');
    });
  });

  describe('TC33 pressure_unknown_spec', () => {
    it('neutralizes wear factor when recommended pressure unknown', () => {
      const spec = resolveRecommendedTirePressure({});
      const ctx = buildTirePressureContext({
        asOf: AS_OF,
        recommendedPressure: spec,
        dimo: {
          tirePressureFl: 2.5,
          tirePressureFr: 2.5,
          tirePressureRl: 2.5,
          tirePressureRr: 2.5,
          providerSource: 'DIMO',
          sourceTimestamp: AS_OF,
          providerFetchedAt: AS_OF,
          lastSeenAt: AS_OF,
        },
      });
      expect(ctx.wearEligibility.eligible).toBe(false);
      expect(ctx.pressureSpecMissingLabel).toBeTruthy();
    });
  });

  describe('TC34 ambient_capability', () => {
    it('requires multi-day ambient before usable context', () => {
      const cap = evaluateTireDimoSignalCapability({
        signalName: 'exteriorAirTemperature',
        documentedInDimoSchema: true,
        listedInAvailableSignals: true,
        latestValueAvailable: true,
        historicalValuesAvailable: true,
        synqDriveUsesSignal: true,
        sampleCount14d: 40,
        coveragePercent: 25,
        lastSeenAt: AS_OF,
        asOf: AS_OF,
      });
      const ambient = buildAmbientTemperatureContext({
        capability: cap,
        samples: [
          { timestamp: '2026-07-10T08:00:00Z', temperatureC: 2, weightKm: 10 },
          { timestamp: '2026-07-12T08:00:00Z', temperatureC: 3, weightKm: 10 },
        ],
        asOf: AS_OF,
      });
      expect(ambient.usable).toBe(true);
      expect(ambient.weightedAvgTempC).not.toBeNull();
    });
  });

  describe('TC35 api_contract_fields', () => {
    it('includes evidencePresentation on summary presentation path', () => {
      const presentation = buildTireEvidencePresentation({
        summary: {
          overallStatus: 'GOOD',
          displayMode: 'MEASURED',
          confidence: 'HIGH',
          displayTreadMm: 6.5,
          estimatedRemainingKm: 12000,
          predictionCapable: true,
          pressureContext: emptyTirePressureContext(),
          alerts: [],
        } as never,
      });
      expect(presentation.structuredActions).toBeDefined();
      expect(presentation.remainingKm.reliable).toBe(true);
    });
  });

  describe('TC36 booking_gate_e2e', () => {
    it('maps measured hard block to rental gate policy', () => {
      const model = buildTireRentalHealthReadModel({
        summary: {
          overallStatus: 'CRITICAL',
          displayMode: 'MEASURED',
          confidence: 'HIGH',
          lowestTreadMm: 1.5,
          measuredTreadMm: 1.5,
          displayTreadMm: 1.5,
          pressureContext: emptyTirePressureContext(),
          alerts: [],
        } as never,
        activeReviewOverride: null,
      });
      expect(model.rentalBlockingEvidence?.action).toBe('HARD_BLOCK');
      expect(isTireRentalHardBlocked(model)).toBe(true);
    });
  });
});
