import { analyzeEngineRpmCadence } from './vsi-profile-cadence-stats.util';
import { enrichVsiProfileWithCadenceIntelligence } from './vsi-profile-cadence.enricher';
import { fingerprintVsiProfileSemanticEvaluation } from './vsi-profile-fingerprint.util';
import type { VsiRpmCadenceEvidenceInput, VsiRpmCadenceTripWindow } from './vsi-profile-cadence.types';
import {
  buildActiveRpmProfileSemanticFingerprint,
  mergeActiveRpmProfileOntoEngineRpmCadence,
  resolveActiveRpmProfileV1,
  selectRollingCadenceTripWindows,
} from './vsi-active-rpm-profile-resolver.util';
import type { VsiProfileEvaluationResult } from './vsi-profile.types';

function trip(id: string, startMs: number, durationSec: number): VsiRpmCadenceTripWindow {
  return { tripId: id, startMs, endMs: startMs + durationSec * 1000 };
}

function rpmPoints(
  trip: VsiRpmCadenceTripWindow,
  intervalSec: number,
  count: number,
  value = 1800,
): { recordedAtMs: number; value: number }[] {
  const out: { recordedAtMs: number; value: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({ recordedAtMs: trip.startMs + i * intervalSec * 1000, value });
  }
  return out;
}

function evidenceForTrips(
  trips: VsiRpmCadenceTripWindow[],
  specs: { tripId: string; intervalSec: number; count: number }[],
): VsiRpmCadenceEvidenceInput {
  const points = specs.flatMap((s) => {
    const t = trips.find((x) => x.tripId === s.tripId)!;
    return rpmPoints(t, s.intervalSec, s.count);
  });
  return {
    iceRpmApplicability: 'APPLICABLE',
    tripWindows: trips,
    points,
    provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
    hfReadStatus: 'SUCCESS',
  };
}

describe('vsi-active-rpm-profile-resolver', () => {
  it('uses only the last 5 chronological trips (no 14d pooling)', () => {
    const trips = Array.from({ length: 8 }, (_, i) =>
      trip(`t${i}`, Date.parse('2026-10-10T00:00:00Z') + i * 86400000, 600),
    );
    const selected = selectRollingCadenceTripWindows(trips, 5);
    expect(selected.map((t) => t.tripId)).toEqual(['t3', 't4', 't5', 't6', 't7']);
  });

  it('median≈2s with sparse P95 gaps is not RPM_1HZ (Tiguan-like)', () => {
    const t = trip('sparse-m2', 0, 1200);
    const points: { recordedAtMs: number; value: number }[] = [];
    let ts = t.startMs;
    for (let i = 0; i < 45; i += 1) {
      points.push({ recordedAtMs: ts, value: 1800 });
      ts += (i % 5 === 0 ? 20 : 2) * 1000;
    }
    const resolution = resolveActiveRpmProfileV1({
      iceRpmApplicability: 'APPLICABLE',
      tripWindows: [t],
      points,
      provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
      hfReadStatus: 'SUCCESS',
    });
    expect(resolution?.tripClassifications[0]?.profile).toBe('RPM_STANDARD');
    expect(resolution?.tripClassifications[0]?.profile).not.toBe('RPM_1HZ');
  });

  it('two classifiable trips in a five-trip window → UNKNOWN (insufficient known coverage)', () => {
    const base = Date.parse('2026-10-24T08:00:00Z');
    const trips = [0, 1, 2, 3, 4].map((i) => trip(`thin-${i}`, base + i * 3600000, 120));
    const evidence = evidenceForTrips(trips, [
      { tripId: 'thin-0', intervalSec: 6, count: 40 },
      { tripId: 'thin-1', intervalSec: 6, count: 40 },
      { tripId: 'thin-2', intervalSec: 6, count: 5 },
      { tripId: 'thin-3', intervalSec: 6, count: 5 },
      { tripId: 'thin-4', intervalSec: 6, count: 5 },
    ]);
    const resolution = resolveActiveRpmProfileV1(evidence);
    expect(resolution?.activeProfile).toBe('UNKNOWN');
    expect(resolution?.classificationDecisionCode).toBe('INSUFFICIENT_KNOWN_TRIPS_IN_WINDOW');
  });

  it('rolling window shift with stable RPM_1HZ keeps semantic profile fingerprint', () => {
    const base = Date.parse('2026-10-27T00:00:00Z');
    const buildTrips = (n: number) =>
      Array.from({ length: n }, (_, i) => trip(`roll-${i}`, base + i * 3600000, 400));
    const specs = (ids: string[]) =>
      ids.map((id) => ({ tripId: id, intervalSec: 1, count: 50 }));
    const trips5 = buildTrips(5);
    const ev5 = evidenceForTrips(trips5, specs(trips5.map((t) => t.tripId)));
    const trips6 = buildTrips(6);
    const ev6 = evidenceForTrips(trips6, specs(trips6.map((t) => t.tripId)));
    const cadence5 = mergeActiveRpmProfileOntoEngineRpmCadence(
      analyzeEngineRpmCadence(ev5),
      ev5,
    );
    const cadence6 = mergeActiveRpmProfileOntoEngineRpmCadence(
      analyzeEngineRpmCadence(ev6),
      ev6,
    );
    expect(cadence5.activeRpmProfile?.activeProfile).toBe('RPM_1HZ');
    expect(cadence6.activeRpmProfile?.activeProfile).toBe('RPM_1HZ');
    expect(cadence5.activeRpmProfile?.profileSemanticFingerprint).toBe(
      cadence6.activeRpmProfile?.profileSemanticFingerprint,
    );
    expect(cadence5.activeRpmProfile?.profileSemanticFingerprint).toBe(
      buildActiveRpmProfileSemanticFingerprint({ activeProfile: 'RPM_1HZ' }),
    );
    expect(cadence5.activeRpmProfile?.evaluatedTripIds).not.toEqual(
      cadence6.activeRpmProfile?.evaluatedTripIds,
    );
  });

  it('Tiguan 13–22 Oct historical: sparse multi-second → RPM_STANDARD', () => {
    const base = Date.parse('2026-10-13T08:00:00Z');
    const trips = [0, 1, 2, 3, 4].map((i) => trip(`hist-${i}`, base + i * 3600000, 900));
    const evidence = evidenceForTrips(
      trips,
      trips.map((t) => ({ tripId: t.tripId, intervalSec: 5, count: 40 })),
    );
    const resolution = resolveActiveRpmProfileV1(evidence);
    expect(resolution?.activeProfile).toBe('RPM_STANDARD');
    expect(resolution?.classificationDecisionCode).toBe('ROLLING_SUPERMAJORITY');
  });

  it('Tiguan 23–26 Oct transition: contradictory mix → UNKNOWN', () => {
    const base = Date.parse('2026-10-23T08:00:00Z');
    const trips = [0, 1, 2, 3, 4].map((i) => trip(`mix-${i}`, base + i * 3600000, 600));
    const evidence = evidenceForTrips(trips, [
      { tripId: 'mix-0', intervalSec: 5, count: 35 },
      { tripId: 'mix-1', intervalSec: 1, count: 40 },
      { tripId: 'mix-2', intervalSec: 5, count: 35 },
      { tripId: 'mix-3', intervalSec: 1, count: 40 },
      { tripId: 'mix-4', intervalSec: 5, count: 35 },
    ]);
    const resolution = resolveActiveRpmProfileV1(evidence);
    expect(resolution?.activeProfile).toBe('UNKNOWN');
    expect(resolution?.classificationDecisionCode).toBe('CONTRADICTORY_TRIP_EVIDENCE');
  });

  it('Tiguan 27 Oct: three dense 1 s trips → RPM_1HZ', () => {
    const base = Date.parse('2026-10-27T03:00:00Z');
    const trips = [0, 1, 2].map((i) => trip(`fast-${i}`, base + i * 7200000, 300));
    const evidence = evidenceForTrips(
      trips,
      trips.map((t) => ({ tripId: t.tripId, intervalSec: 1, count: 50 })),
    );
    const resolution = resolveActiveRpmProfileV1(evidence);
    expect(resolution?.activeProfile).toBe('RPM_1HZ');
    expect(resolution?.evaluatedTripIds).toHaveLength(3);
  });

  it('Audi reference: stable sparse ~6 s → RPM_STANDARD', () => {
    const base = Date.parse('2026-10-14T06:00:00Z');
    const trips = [0, 1, 2, 3, 4].map((i) => trip(`audi-${i}`, base + i * 86400000, 1200));
    const evidence = evidenceForTrips(
      trips,
      trips.map((t) => ({ tripId: t.tripId, intervalSec: 6, count: 45 })),
    );
    const resolution = resolveActiveRpmProfileV1(evidence);
    expect(resolution?.activeProfile).toBe('RPM_STANDARD');
    expect(resolution?.tripClassifications.every((c) => c.profile === 'RPM_STANDARD')).toBe(true);
  });

  it('single outlier trip does not force profile flip (4 sparse + 1 dense)', () => {
    const base = Date.parse('2026-10-20T08:00:00Z');
    const trips = [0, 1, 2, 3, 4].map((i) => trip(`out-${i}`, base + i * 3600000, 600));
    const evidence = evidenceForTrips(trips, [
      { tripId: 'out-0', intervalSec: 6, count: 40 },
      { tripId: 'out-1', intervalSec: 6, count: 40 },
      { tripId: 'out-2', intervalSec: 6, count: 40 },
      { tripId: 'out-3', intervalSec: 6, count: 40 },
      { tripId: 'out-4', intervalSec: 1, count: 50 },
    ]);
    const resolution = resolveActiveRpmProfileV1(evidence);
    expect(resolution?.activeProfile).toBe('RPM_STANDARD');
    expect(resolution?.agreementRatio).toBeGreaterThanOrEqual(2 / 3);
  });

  it('missing RPM evidence → UNKNOWN (no unearned upgrade)', () => {
    const resolution = resolveActiveRpmProfileV1({
      iceRpmApplicability: 'APPLICABLE',
      tripWindows: [trip('empty-1', 0, 100)],
      points: [],
      provenance: [],
      hfReadStatus: 'EMPTY',
    });
    expect(resolution?.activeProfile).toBe('UNKNOWN');
    expect(resolution?.classificationDecisionCode).toBe('HF_EVIDENCE_UNAVAILABLE');
  });

  it('source-link isolation: resolver only classifies trips present in evidence window', () => {
    const base = Date.parse('2026-10-20T08:00:00Z');
    const linkTrips = [0, 1, 2, 3, 4].map((i) => trip(`link-${i}`, base + i * 7_200_000, 600));
    const evidence = evidenceForTrips(
      [...linkTrips, trip('other-link', base + 5 * 7_200_000, 600)],
      [
        ...linkTrips.map((t) => ({ tripId: t.tripId, intervalSec: 6, count: 40 })),
        { tripId: 'other-link', intervalSec: 1, count: 50 },
      ],
    );
    evidence.tripWindows = linkTrips;
    evidence.points = evidence.points.filter((p) =>
      linkTrips.some((t) => p.recordedAtMs >= t.startMs && p.recordedAtMs <= t.endMs),
    );
    const resolution = resolveActiveRpmProfileV1(evidence);
    expect(resolution?.tripClassifications.map((c) => c.profile)).toEqual([
      'RPM_STANDARD',
      'RPM_STANDARD',
      'RPM_STANDARD',
      'RPM_STANDARD',
      'RPM_STANDARD',
    ]);
    expect(resolution?.activeProfile).toBe('RPM_STANDARD');
    expect(resolution?.evaluatedTripIds).not.toContain('other-link');
  });

  it('identical evidence yields stable active-profile semantic fingerprint', () => {
    const base = Date.parse('2026-10-27T03:00:00Z');
    const trips = [0, 1, 2].map((i) => trip(`idem-${i}`, base + i * 3600000, 300));
    const evidence = evidenceForTrips(
      trips,
      trips.map((t) => ({ tripId: t.tripId, intervalSec: 1, count: 50 })),
    );
    const a = mergeActiveRpmProfileOntoEngineRpmCadence(
      analyzeEngineRpmCadence(evidence),
      evidence,
    );
    const b = mergeActiveRpmProfileOntoEngineRpmCadence(
      analyzeEngineRpmCadence(evidence),
      evidence,
    );
    expect(a.activeRpmProfile?.profileSemanticFingerprint).toBe(
      b.activeRpmProfile?.profileSemanticFingerprint,
    );
    expect(a.cadenceSemanticFingerprint).toBe(b.cadenceSemanticFingerprint);
  });

  it('enricher attaches activeRpmProfile on engine_rpm', () => {
    const evaluation: VsiProfileEvaluationResult = {
      contractVersion: 'vsi-signal-profile-v2',
      organizationId: 'o',
      vehicleId: 'v',
      providerSourceLinkId: 'l',
      providerIdentity: 'DIMO',
      verifiedModality: 'LTE_R1',
      telemetrySourceFamily: 'DIMO',
      evaluatedAt: new Date('2026-10-27T08:00:00.000Z'),
      declaredCatalogCheckedAt: null,
      lastMaterializedSourceTimestamp: null,
      lastMaterializedProviderFetchAt: null,
      lastProvenStrictSourceAdvanceAt: null,
      profileLimitations: [],
      signals: [
        {
          canonicalSignalKey: 'engine_rpm',
          providerNativeSignalName: 'powertrainCombustionEngineSpeed',
          declaredSupport: 'UNKNOWN',
          empiricalObservation: 'NEVER_OBSERVED',
          lastValidObservationAt: null,
          lastSourceTimestamp: null,
          lastProviderFetchAt: null,
          lastProvenStrictSourceAdvanceAt: null,
          strictSourceAdvanced: 'UNKNOWN',
          freshnessClassification: 'UNKNOWN',
          evidenceProvenance: [],
          limitations: [],
          signalFingerprintContractVersion: 'vsi-signal-fingerprint-v1',
          qualityClassification: 'UNKNOWN',
          confidenceLevel: 'UNKNOWN',
          observedSamples: null,
          provenSourceAdvances: null,
          observedCadenceMedianSeconds: null,
          observedCadenceSampleCount: null,
          maxStaleIntervalSeconds: null,
          contentFingerprint: 'x',
        },
      ],
    };
    const base = Date.parse('2026-10-27T08:00:00Z');
    const trips = [0, 1, 2].map((i) => trip(`enr-${i}`, base + i * 3600000, 400));
    const rpmEvidence = evidenceForTrips(
      trips,
      trips.map((t) => ({ tripId: t.tripId, intervalSec: 1, count: 45 })),
    );
    const result = enrichVsiProfileWithCadenceIntelligence(evaluation, {
      rpmEvidence,
      lvEvidence: null,
    });
    const rpm = result.signals.find((s) => s.canonicalSignalKey === 'engine_rpm');
    expect(rpm?.cadenceIntelligence?.activeRpmProfile?.activeProfile).toBe('RPM_1HZ');
    expect(rpm?.cadenceIntelligence?.observedSampleCount).toBeGreaterThan(0);
  });

  it('VSI semantic fingerprint stable when only rolling trip ids change but active RPM profile unchanged', () => {
    const base = Date.parse('2026-10-27T00:00:00Z');
    const mkEval = (): VsiProfileEvaluationResult => ({
      contractVersion: 'vsi-signal-profile-v2',
      organizationId: 'o',
      vehicleId: 'v',
      providerSourceLinkId: 'l',
      providerIdentity: 'DIMO',
      verifiedModality: 'LTE_R1',
      telemetrySourceFamily: 'DIMO',
      evaluatedAt: new Date('2026-10-27T08:00:00.000Z'),
      declaredCatalogCheckedAt: null,
      lastMaterializedSourceTimestamp: null,
      lastMaterializedProviderFetchAt: null,
      lastProvenStrictSourceAdvanceAt: null,
      profileLimitations: [],
      signals: [
        {
          canonicalSignalKey: 'engine_rpm',
          providerNativeSignalName: 'powertrainCombustionEngineSpeed',
          declaredSupport: 'UNKNOWN',
          empiricalObservation: 'NEVER_OBSERVED',
          lastValidObservationAt: null,
          lastSourceTimestamp: null,
          lastProviderFetchAt: null,
          lastProvenStrictSourceAdvanceAt: null,
          strictSourceAdvanced: 'UNKNOWN',
          freshnessClassification: 'UNKNOWN',
          evidenceProvenance: [],
          limitations: [],
          signalFingerprintContractVersion: 'vsi-signal-fingerprint-v1',
          qualityClassification: 'UNKNOWN',
          confidenceLevel: 'UNKNOWN',
          observedSamples: null,
          provenSourceAdvances: null,
          observedCadenceMedianSeconds: null,
          observedCadenceSampleCount: null,
          maxStaleIntervalSeconds: null,
          contentFingerprint: 'x',
        },
      ],
    });
    const buildTrips = (n: number) =>
      Array.from({ length: n }, (_, i) => trip(`fp-${i}`, base + i * 3600000, 400));
    const specs = (trips: VsiRpmCadenceTripWindow[]) =>
      trips.map((t) => ({ tripId: t.tripId, intervalSec: 1, count: 50 }));
    const ev5 = evidenceForTrips(buildTrips(5), specs(buildTrips(5)));
    const ev6 = evidenceForTrips(buildTrips(6), specs(buildTrips(6)));
    const eval5 = enrichVsiProfileWithCadenceIntelligence(mkEval(), {
      rpmEvidence: ev5,
      lvEvidence: null,
    });
    const eval6 = enrichVsiProfileWithCadenceIntelligence(mkEval(), {
      rpmEvidence: ev6,
      lvEvidence: null,
    });
    expect(
      eval5.signals[0]?.cadenceIntelligence?.activeRpmProfile?.activeProfile,
    ).toBe('RPM_1HZ');
    expect(
      eval6.signals[0]?.cadenceIntelligence?.activeRpmProfile?.activeProfile,
    ).toBe('RPM_1HZ');
    expect(fingerprintVsiProfileSemanticEvaluation(eval5)).toBe(
      fingerprintVsiProfileSemanticEvaluation(eval6),
    );
  });
});
