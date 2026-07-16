import { describe, expect, it } from '@jest/globals';
import {
  evaluateShadowValidationGates,
  resolveObservationPeriod,
  resolveOverallRecommendation,
  SHADOW_OBSERVATION_MIN_DAYS,
} from './battery-shadow-validation.policy';
import type {
  BatteryShadowValidationFlagsSnapshot,
  BatteryShadowValidationHvMetrics,
  BatteryShadowValidationLvMetrics,
} from './battery-shadow-validation.types';

function emptyLv(): BatteryShadowValidationLvMetrics {
  return {
    vehiclesWithRestWindows: 0,
    restWindowCount: 0,
    rest60m: { scheduled: 0, captured: 0, missed: 0, captureRatePct: null },
    rest6h: { scheduled: 0, captured: 0, missed: 0, captureRatePct: null },
    wakeContaminationCount: 0,
    wakeContaminationRatePct: null,
    chargingContaminationCount: 0,
    missedTotal: 0,
    profileDistribution: [],
    startProxySessions: 0,
    startProxyMeasurements: 0,
    startProxyInsufficientCoverage: 0,
    shadowLvAssessmentCount: 0,
    shadowLvScoreStdDevMedian: null,
    shadowLvScoreRange: { min: null, max: null },
    falsePositiveCandidates: 0,
    rentalBlockedFromBatteryInPeriod: 0,
  };
}

function emptyHv(): BatteryShadowValidationHvMetrics {
  return {
    vehiclesWithRechargeSessions: 0,
    rechargeSessionCount: 0,
    rechargeSegmentCoveragePct: null,
    sessionQualityDistribution: [],
    qualifiedSessionCount: 0,
    m2ObservationCount: 0,
    m2SessionsWithSamples: 0,
    m2SessionCvP95: null,
    m2SessionCvMedian: null,
    crossSessionAssessmentCount: 0,
    crossSessionScatterPct: null,
    m3ValidationCount: 0,
    m3AgreementCount: 0,
    m3ConflictCount: 0,
    m3AgreementRatePct: null,
    capabilityStableCount: 0,
    capabilityChangedCount: 0,
    capabilityUnavailableCount: 0,
    referenceCapacityActiveCount: 0,
    referenceCapacityUnverifiedCount: 0,
    storageGrowth: {
      batteryMeasurements: 0,
      batteryMeasurementSessions: 0,
      hvChargeSessions: 0,
      hvCapacityObservations: 0,
      batteryAssessments: 0,
    },
  };
}

const safeFlags: BatteryShadowValidationFlagsSnapshot = {
  restShadowEnabled: true,
  startProxyEnabled: true,
  hvRechargeSessionEnabled: true,
  hvFallbackChargeSessionEnabled: false,
  hvCapacityShadowEnabled: true,
  publicationEnabled: false,
  hvSohPublicationEnabled: false,
  readinessEnabled: false,
};

describe('battery-shadow-validation.policy', () => {
  it('requires at least 28 days observation window', () => {
    const period = resolveObservationPeriod({
      referenceNow: new Date('2026-07-16T12:00:00.000Z'),
      observationDays: 14,
    });
    expect(period.durationDays).toBe(14);
    expect(period.meetsMinimumPeriod).toBe(false);
    expect(SHADOW_OBSERVATION_MIN_DAYS).toBe(28);
  });

  it('fails safety gate when publication flags are on', () => {
    const gates = evaluateShadowValidationGates({
      observationPeriod: resolveObservationPeriod({
        referenceNow: new Date('2026-08-15T12:00:00.000Z'),
        observationDays: 30,
      }),
      flags: { ...safeFlags, publicationEnabled: true },
      lv: emptyLv(),
      hv: emptyHv(),
    });

    expect(gates.find((g) => g.id === 'safety_publication_disabled')?.status).toBe('fail');
  });

  it('recommends manual review when observation period is too short', () => {
    const period = resolveObservationPeriod({
      referenceNow: new Date('2026-07-16T12:00:00.000Z'),
      observationDays: 10,
    });
    const gates = evaluateShadowValidationGates({
      observationPeriod: period,
      flags: safeFlags,
      lv: emptyLv(),
      hv: emptyHv(),
    });

    expect(resolveOverallRecommendation({ observationPeriod: period, gates })).toBe(
      'insufficient_data',
    );
  });

  it('warns on high wake contamination rate', () => {
    const lv = {
      ...emptyLv(),
      rest60m: { scheduled: 100, captured: 60, missed: 40, captureRatePct: 60 },
      wakeContaminationCount: 50,
      wakeContaminationRatePct: 50,
    };

    const gates = evaluateShadowValidationGates({
      observationPeriod: resolveObservationPeriod({
        referenceNow: new Date('2026-08-15T12:00:00.000Z'),
        observationDays: 35,
      }),
      flags: safeFlags,
      lv,
      hv: emptyHv(),
    });

    expect(gates.find((g) => g.id === 'lv_wake_contamination')?.status).toBe('warn');
  });
});
