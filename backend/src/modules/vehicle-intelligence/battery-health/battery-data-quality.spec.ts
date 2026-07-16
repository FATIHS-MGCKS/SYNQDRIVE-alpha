import {
  aggregateBatteryDataQuality,
  normalizeBatteryDataQualityStatus,
  presentBatteryDataQuality,
  resolveCrankDataQuality,
  resolveHvLegacyCapacityDataQuality,
  resolveHvSohDataQuality,
  resolveLvEstimatedHealthDataQuality,
  resolveRestingVoltageDataQuality,
} from './battery-data-quality';
import { presentLegacyCrankFeatures } from './battery-crank-policy';
import { presentLegacyHvCapacity } from './hv-capacity-policy';
import { evaluateLegacyPublicationSafety } from './battery-legacy-publication-safety';

const fresh: { observedAt: string; ageMs: number; isFresh: true } = {
  observedAt: new Date().toISOString(),
  ageMs: 60_000,
  isFresh: true,
};

const stale: { observedAt: string; ageMs: number; isFresh: false } = {
  observedAt: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
  ageMs: 72 * 60 * 60 * 1000,
  isFresh: false,
};

const safePublication = evaluateLegacyPublicationSafety({
  publicationState: 'STABLE',
  publishedSohPct: 82,
  maturityConfidence: 'high',
  batteryTypeRaw: 'AGM',
  scoredAt: new Date(),
  lastPublishedAt: new Date(),
});

describe('normalizeBatteryDataQualityStatus', () => {
  it('accepts known statuses', () => {
    expect(normalizeBatteryDataQualityStatus('verified')).toBe('VERIFIED');
    expect(normalizeBatteryDataQualityStatus('LEGACY_UNVERIFIED')).toBe(
      'LEGACY_UNVERIFIED',
    );
  });

  it('returns null for unknown values instead of defaulting to VERIFIED', () => {
    expect(normalizeBatteryDataQualityStatus('TRUST_ME')).toBeNull();
    expect(normalizeBatteryDataQualityStatus(null)).toBeNull();
  });
});

describe('presentBatteryDataQuality', () => {
  it('marks only VERIFIED and ESTIMATED as decision capable', () => {
    expect(presentBatteryDataQuality('VERIFIED').decisionCapable).toBe(true);
    expect(presentBatteryDataQuality('ESTIMATED').decisionCapable).toBe(true);
    expect(presentBatteryDataQuality('PROXY').decisionCapable).toBe(false);
    expect(presentBatteryDataQuality('LEGACY_UNVERIFIED').decisionCapable).toBe(
      false,
    );
  });

  it('exposes i18n label keys', () => {
    expect(presentBatteryDataQuality('STALE').labelKey).toBe(
      'health.battery.dataQuality.STALE',
    );
  });
});

describe('resolveLvEstimatedHealthDataQuality', () => {
  it('returns LEGACY_UNVERIFIED when publication safety blocks decisions', () => {
    const unsafe = evaluateLegacyPublicationSafety({
      publicationState: 'STABLE',
      publishedSohPct: 82,
      maturityConfidence: 'high',
      vOff60m: 13.5,
      batteryTypeRaw: 'AGM',
      scoredAt: new Date(),
      lastPublishedAt: new Date(),
    });
    expect(
      resolveLvEstimatedHealthDataQuality({
        runtimeStatus: 'ready',
        hasScore: true,
        freshness: fresh,
        legacyPublicationSafety: unsafe,
        isCalibrating: false,
        isStabilizing: false,
      }),
    ).toBe('LEGACY_UNVERIFIED');
  });

  it('returns STALE from observed value age, not poll freshness alone', () => {
    expect(
      resolveLvEstimatedHealthDataQuality({
        runtimeStatus: 'ready',
        hasScore: true,
        freshness: stale,
        legacyPublicationSafety: safePublication,
        isCalibrating: false,
        isStabilizing: false,
      }),
    ).toBe('STALE');
  });

  it('returns MISSED when stabilizing without score', () => {
    expect(
      resolveLvEstimatedHealthDataQuality({
        runtimeStatus: 'stabilizing',
        hasScore: false,
        freshness: fresh,
        legacyPublicationSafety: safePublication,
        isCalibrating: false,
        isStabilizing: true,
      }),
    ).toBe('MISSED');
  });
});

describe('resolveRestingVoltageDataQuality', () => {
  it('returns UNSUPPORTED for unsupported chemistry', () => {
    expect(
      resolveRestingVoltageDataQuality({
        valueV: null,
        restingStatus: 'UNSUPPORTED',
        freshness: fresh,
        runtimeStatus: 'ready',
        isCalibrating: false,
      }),
    ).toBe('UNSUPPORTED');
  });

  it('returns STALE when resting value exists but observed value is old', () => {
    expect(
      resolveRestingVoltageDataQuality({
        valueV: 12.4,
        restingStatus: 'GOOD',
        freshness: stale,
        runtimeStatus: 'ready',
        isCalibrating: false,
      }),
    ).toBe('STALE');
  });
});

describe('resolveHvSohDataQuality', () => {
  it('returns VERIFIED for fresh provider SOH', () => {
    expect(
      resolveHvSohDataQuality({
        isEv: true,
        sohSource: 'PROVIDER',
        hasSoh: true,
        freshness: fresh,
        runtimeStatus: 'ready',
      }),
    ).toBe('VERIFIED');
  });

  it('returns UNSUPPORTED for non-EV', () => {
    expect(
      resolveHvSohDataQuality({
        isEv: false,
        sohSource: null,
        hasSoh: false,
        freshness: fresh,
        runtimeStatus: 'unsupported',
      }),
    ).toBe('UNSUPPORTED');
  });

  it('returns LEGACY_UNVERIFIED when only legacy capacity exists', () => {
    const legacy = presentLegacyHvCapacity({
      estimatedCapacityKwh: 70,
      sohPercent: 88,
      publicationMethod: 'capacity_measurement',
      publishedSohPct: 88,
    });
    expect(
      resolveHvSohDataQuality({
        isEv: true,
        sohSource: null,
        hasSoh: false,
        freshness: fresh,
        runtimeStatus: 'ready',
        legacyCapacity: legacy,
      }),
    ).toBe('LEGACY_UNVERIFIED');
  });
});

describe('resolveCrankDataQuality', () => {
  it('marks legacy crank as LEGACY_UNVERIFIED', () => {
    const crank = presentLegacyCrankFeatures({
      crankDrop: 1.2,
      crankObservationCount: 3,
    });
    expect(resolveCrankDataQuality(crank)).toBe('LEGACY_UNVERIFIED');
  });
});

describe('resolveHvLegacyCapacityDataQuality', () => {
  it('keeps legacy pairwise readable as LEGACY_UNVERIFIED', () => {
    const legacy = presentLegacyHvCapacity({
      estimatedCapacityKwh: 68,
      sohPercent: 85,
      publicationMethod: 'energy_throughput',
      publishedSohPct: 85,
    });
    expect(resolveHvLegacyCapacityDataQuality(legacy)).toBe('LEGACY_UNVERIFIED');
  });
});

describe('aggregateBatteryDataQuality', () => {
  it('picks the least trustworthy status', () => {
    expect(
      aggregateBatteryDataQuality(['VERIFIED', 'LEGACY_UNVERIFIED', 'ESTIMATED']),
    ).toBe('LEGACY_UNVERIFIED');
  });
});
