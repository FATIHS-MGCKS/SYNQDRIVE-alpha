import {
  evaluateLvStandbyTransmissionPair,
  mergeLvStandbyTransmissionProfileOntoLvCadence,
  resolveLvStandbyTransmissionProfileV1,
  VSI_LV_STANDBY_8H_GAP_MIN_SECONDS,
  buildLvStandbyTransmissionProfileSemanticFingerprint,
} from './vsi-lv-standby-transmission-profile-resolver.util';
import { analyzeLvVoltageCadence } from './vsi-profile-cadence-stats.util';
import type {
  VsiLvStandbyTransmissionEvidenceInput,
  VsiRpmCadenceTripWindow,
} from './vsi-profile-cadence.types';

const BASE_MS = Date.parse('2026-10-01T00:00:00.000Z');

function point(
  offsetHours: number,
  outcome: string | null = 'NEW_OBSERVATION',
): VsiLvStandbyTransmissionEvidenceInput['points'][number] {
  const providerTimestampMs = BASE_MS + offsetHours * 3600 * 1000;
  return {
    observedAtMs: providerTimestampMs,
    providerTimestampMs,
    providerObservationOutcome: outcome,
  };
}

function evidence(
  points: VsiLvStandbyTransmissionEvidenceInput['points'],
  trips: VsiRpmCadenceTripWindow[] = [],
): VsiLvStandbyTransmissionEvidenceInput {
  return {
    contractVersion: 'vsi-lv-standby-transmission-evidence-v1',
    points,
    tripWindows: trips,
    linkActivatedAtMs: BASE_MS - 86400000,
    linkDeactivatedAtMs: null,
    evidenceWindowDays: 30,
    windowStartMs: BASE_MS - 30 * 86400000,
    windowEndMs: BASE_MS + 30 * 24 * 3600 * 1000,
    provenance: ['POSTGRES_BATTERY_MEASUREMENTS'],
  };
}

function eightHourSeries(
  count: number,
  startHour = 0,
): VsiLvStandbyTransmissionEvidenceInput['points'][number][] {
  const out: VsiLvStandbyTransmissionEvidenceInput['points'][number][] = [];
  for (let i = 0; i < count; i++) {
    out.push(point(startHour + i * 8));
  }
  return out;
}

describe('vsi-lv-standby-transmission-profile-resolver', () => {
  it('rejects provider times during a completed trip', () => {
    const trips: VsiRpmCadenceTripWindow[] = [
      { tripId: 't1', startMs: BASE_MS, endMs: BASE_MS + 2 * 3600 * 1000 },
    ];
    const result = evaluateLvStandbyTransmissionPair({
      earlierProviderTimestampMs: BASE_MS + 3600 * 1000,
      laterProviderTimestampMs: BASE_MS + 9 * 3600 * 1000,
      earlierOutcome: 'NEW_OBSERVATION',
      laterOutcome: 'NEW_OBSERVATION',
      trips,
    });
    expect(result.eligible).toBe(false);
    expect(result.rejectionCode).toBe('PROVIDER_TIME_DURING_TRIP');
  });

  it('rejects intervals crossed by an intermediate trip', () => {
    const trips: VsiRpmCadenceTripWindow[] = [
      {
        tripId: 't1',
        startMs: BASE_MS + 4 * 3600 * 1000,
        endMs: BASE_MS + 5 * 3600 * 1000,
      },
    ];
    const result = evaluateLvStandbyTransmissionPair({
      earlierProviderTimestampMs: BASE_MS,
      laterProviderTimestampMs: BASE_MS + 8 * 3600 * 1000,
      earlierOutcome: 'NEW_OBSERVATION',
      laterOutcome: 'NEW_OBSERVATION',
      trips,
    });
    expect(result.eligible).toBe(false);
    expect(result.rejectionCode).toBe('TRIP_CROSSES_INTERVAL');
  });

  it('rejects stale replay outcomes', () => {
    const result = evaluateLvStandbyTransmissionPair({
      earlierProviderTimestampMs: BASE_MS,
      laterProviderTimestampMs: BASE_MS + 8 * 3600 * 1000,
      earlierOutcome: 'STALE_REPLAY',
      laterOutcome: 'NEW_OBSERVATION',
      trips: [],
    });
    expect(result.eligible).toBe(false);
    expect(result.rejectionCode).toBe('SOURCE_ADVANCE_NOT_VERIFIED');
  });

  it('does not promote LV_8H from a single 8h pair', () => {
    const resolution = resolveLvStandbyTransmissionProfileV1(
      evidence([point(0), point(8)]),
    );
    expect(resolution.profile).toBe('UNKNOWN');
    expect(resolution.classificationDecisionCode).toBe(
      'STANDBY_PAIRS_BELOW_STABILITY_THRESHOLD',
    );
  });

  it('classifies Arteon-like repeated 8h standby advances across rest periods', () => {
    const points = [
      ...eightHourSeries(5, 0),
      ...eightHourSeries(5, 90),
      ...eightHourSeries(5, 180),
    ];
    const resolution = resolveLvStandbyTransmissionProfileV1(evidence(points));
    expect(resolution.profile).toBe('LV_8H_OBSERVED');
    expect(resolution.classificationDecisionCode).toBe(
      'REPEATED_8H_STANDBY_SOURCE_ADVANCES',
    );
    expect(resolution.independentRestPeriodCount).toBeGreaterThanOrEqual(3);
    expect(resolution.qualifyingPairCount).toBeGreaterThanOrEqual(4);
  });

  it('does not infer 24h profile from a lone long gap without repeated 24h pairs', () => {
    const resolution = resolveLvStandbyTransmissionProfileV1(
      evidence([point(0), point(24)]),
    );
    expect(resolution.profile).toBe('UNKNOWN');
    expect(resolution.profile).not.toBe('LV_24H_OBSERVED');
  });

  it('classifies repeated 24h advances when dominant over 8h pairs', () => {
    const points = [
      point(0),
      point(24),
      point(48),
      point(120),
      point(144),
      point(168),
      point(240),
      point(264),
      point(288),
    ];
    const resolution = resolveLvStandbyTransmissionProfileV1(evidence(points));
    expect(resolution.profile).toBe('LV_24H_OBSERVED');
  });

  it('returns UNKNOWN when 8h and 24h evidence conflict at threshold', () => {
    const points = [
      ...eightHourSeries(5, 0),
      point(24),
      point(48),
      point(72),
    ];
    const resolution = resolveLvStandbyTransmissionProfileV1(evidence(points));
    if (resolution.profile === 'UNKNOWN') {
      expect(['CONTRADICTORY_8H_AND_24H_EVIDENCE', 'STANDBY_PAIRS_BELOW_STABILITY_THRESHOLD']).toContain(
        resolution.classificationDecisionCode,
      );
    }
  });

  it('keeps cadence semantic fingerprint stable when standby profile label unchanged', () => {
    const lv = analyzeLvVoltageCadence({
      points: [
        { observedAtMs: BASE_MS, providerTimestampMs: BASE_MS },
        { observedAtMs: BASE_MS + 60_000, providerTimestampMs: BASE_MS + 60_000 },
        { observedAtMs: BASE_MS + 120_000, providerTimestampMs: BASE_MS + 120_000 },
      ],
      provenance: ['POSTGRES_BATTERY_MEASUREMENTS'],
      linkActivatedAtMs: BASE_MS - 1000,
      linkDeactivatedAtMs: null,
    });
    const standby = resolveLvStandbyTransmissionProfileV1(
      evidence([
        ...eightHourSeries(5, 0),
        ...eightHourSeries(5, 80),
        ...eightHourSeries(5, 160),
      ]),
    );
    const mergedA = mergeLvStandbyTransmissionProfileOntoLvCadence(lv, standby);
    const mergedB = mergeLvStandbyTransmissionProfileOntoLvCadence(lv, {
      ...standby,
      qualifyingPairCount: standby.qualifyingPairCount + 1,
      classificationDecisionCode: 'REPEATED_8H_STANDBY_SOURCE_ADVANCES',
    });
    expect(mergedA.cadenceSemanticFingerprint).toBe(mergedB.cadenceSemanticFingerprint);
    expect(mergedA.lvStandbyTransmissionProfile?.profileSemanticFingerprint).toBe(
      buildLvStandbyTransmissionProfileSemanticFingerprint({
        profile: mergedA.lvStandbyTransmissionProfile!.profile,
      }),
    );
  });

  it('Tiguan replay shape: sparse qualifying pairs stay UNKNOWN without forced promotion', () => {
    const points = eightHourSeries(2, 0);
    const resolution = resolveLvStandbyTransmissionProfileV1(evidence(points));
    expect(resolution.profile).toBe('UNKNOWN');
  });

  it('Audi replay shape: twelve pair-equivalent series still needs stability', () => {
    const points = eightHourSeries(3, 0);
    const resolution = resolveLvStandbyTransmissionProfileV1(evidence(points));
    expect(resolution.profile).toBe('UNKNOWN');
  });

  it('accepts 8h gap at lower research bound', () => {
    const gap = VSI_LV_STANDBY_8H_GAP_MIN_SECONDS;
    const result = evaluateLvStandbyTransmissionPair({
      earlierProviderTimestampMs: BASE_MS,
      laterProviderTimestampMs: BASE_MS + gap * 1000,
      earlierOutcome: 'NEW_OBSERVATION',
      laterOutcome: 'NEW_OBSERVATION',
      trips: [],
    });
    expect(result.eligible).toBe(true);
    expect(result.gapBand).toBe('8H');
  });
});
