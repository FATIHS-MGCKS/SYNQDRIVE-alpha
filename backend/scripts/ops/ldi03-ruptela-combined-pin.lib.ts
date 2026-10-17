/**
 * LDI-03 — Ruptela combined multi-stream evidence pin (read-only).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { evaluateDiV0SpeedQcInterval } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/evaluate-di-v0-speed-qc-interval';
import { DI_V0_SPEED_QC_POLICY_V2 } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-policy.version';
import { bucketLabelToMs, haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import type { DiV0SpeedQcPositionSample } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc.types';
import { dateToBucketLabel } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-classify';
import type { P21ForensicLoadedContext } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import type { DiV0TripSpeedQualityShadowRow } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/build-di-v0-trip-speed-quality-projection.v1';
import { parseDiV0R1ObdSnapshot, diV0R1SnapshotToS1Observations } from '../../src/modules/vehicle-intelligence/driving-intelligence/r1-obd-acquisition/di-v0-r1-obd-snapshot-parse';
import { detectBrakingEvents } from '../../src/modules/vehicle-intelligence/trips/hf-braking';
import { detectAccelerationEvents } from '../../src/modules/vehicle-intelligence/trips/hf-acceleration';
import type { CleanHfPoint } from '../../src/modules/vehicle-intelligence/trips/hf-preprocessing';

export type Ldi03ManifestTrip = {
  tripId: string;
  vehicleId: string;
  workItemId: string;
  pinnedSnapshotHash: string;
};

export type Ldi03TransferReport = {
  binding: { tripId: string; vehicleId: string; workItemId: string };
  dataCoverage: {
    shadowIntervalCount: number;
    positionPresentBuckets: number;
    positionAbsentBuckets: number;
    presentFraction: number;
    r1ObdNumericBuckets: number;
    gapRunsTotal: number;
    gapEventsGte3s: number;
  };
};

export const LDI03_ORG_ID = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';

export type Ldi03NativeRow = {
  id: string;
  eventType: string;
  providerEventName: string | null;
  recordedAtUtc: string;
  normalizedBucketUtc: string;
  speedKmh: number | null;
  deltaKmh: number | null;
  source: string;
};

export type Ldi03CombinedRow = {
  evaluationIndexUtc: string;
  gps: {
    availability: string | null;
    latitude: number | null;
    longitude: number | null;
    positionState: string | null;
    provenance: string;
    originalSourceTimestampUtc: string | null;
    missingReason: string | null;
  };
  l3: {
    speedKmh: number | null;
    qcTrustLevel: string;
    qcReasonCodes: string[];
    motionState: string | null;
    sourceRelation: string | null;
    confidence: string | null;
    provenance: string;
  };
  hf: {
    speedKmh: number | null;
    rpm: number | null;
    throttlePct: number | null;
    engineLoadPct: number | null;
    provenance: string;
    originalBucketLabelUtc: string | null;
    temporalSemantics: 'INTERVAL_ONLY';
    missingReason: string | null;
  };
  obd: {
    speedKmh: number | null;
    provenance: string;
    originalBucketLabelUtc: string | null;
    missingReason: string | null;
  };
  nativeEventsAtIndex: Array<{
    eventType: string;
    providerEventName: string | null;
    providerTimestampUtc: string;
    overlapClass: 'EXACT_BUCKET' | 'WITHIN_SAME_SECOND';
  }>;
};

export type Ldi03OverlapVerdict =
  | 'AGREEMENT'
  | 'PARTIAL_AGREEMENT'
  | 'TEMPORAL_MISMATCH'
  | 'SIGNAL_CONFLICT'
  | 'INSUFFICIENT_EVIDENCE';

export const LDI03_RUPTELA_VEHICLE_IDS = [
  '19fedd4b-c4e8-4de8-a125-dab293326e7e',
  'c10351f8-b6a2-4258-947f-631aeaa6d359',
  '8c850ff1-4201-432b-af2e-2711dbc7ca48',
] as const;

export function loadFrozenManifestRuptelaTrips(repoRoot: string): Ldi03ManifestTrip[] {
  const p = path.join(repoRoot, 'architecture/drivingintelligence/evidence/data/EXP021_P1_V2_MULTI_TRIP_MANIFEST_FROZEN_V1.json');
  const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as {
    selected: Ldi03ManifestTrip[];
  };
  return raw.selected.filter((s) => (LDI03_RUPTELA_VEHICLE_IDS as readonly string[]).includes(s.vehicleId));
}

export function scoreRuptelaCandidateFromContext(
  ctx: P21ForensicLoadedContext,
  nativeEventCount: number,
): { score: number; rationale: string[] } {
  const shadowCount = ctx.shadowIntervals.length;
  const posPresent = ctx.evidence.positions.filter((p) => p.availability === 'PRESENT').length;
  const r1Numeric = ctx.evidence.r1Obd.filter((r) => r.speedKmh != null && Number.isFinite(r.speedKmh)).length;
  const pos = shadowCount > 0 ? posPresent / shadowCount : 0;
  const obdFrac = shadowCount > 0 ? r1Numeric / shadowCount : 0;
  const nativeFrac = nativeEventCount > 0 ? Math.min(1, nativeEventCount / 20) : 0;
  let gapRunsGte3 = 0;
  const labels = [...ctx.evidence.positions].sort((a, b) => a.bucketLabel.localeCompare(b.bucketLabel));
  let run = 0;
  for (const p of labels) {
    if (p.availability !== 'PRESENT') {
      run += 1;
    } else if (run >= 3) {
      gapRunsGte3 += 1;
      run = 0;
    } else {
      run = 0;
    }
  }
  const gapPenalty = gapRunsGte3 * 0.05;
  const score = pos * 0.45 + obdFrac * 0.35 + nativeFrac * 0.2 - gapPenalty;
  return {
    score,
    rationale: [
      `positionPresentFraction=${pos.toFixed(4)} (${posPresent}/${shadowCount})`,
      `r1ObdNumericBuckets=${r1Numeric}/${shadowCount}`,
      `nativeDrivingEvents=${nativeEventCount}`,
      `positionGapRunsGte3s=${gapRunsGte3}`,
    ],
  };
}

function r1MapsFromParsedPayload(r1Payload: string | undefined) {
  const byLabel = new Map<
    string,
    { speedKmh: number | null; rpm: number | null; throttle: number | null; load: number | null }
  >();
  if (!r1Payload) return byLabel;
  const obs = diV0R1SnapshotToS1Observations(parseDiV0R1ObdSnapshot(r1Payload));
  for (const o of obs) {
    byLabel.set(o.bucketLabel, {
      speedKmh: o.speedKmh ?? null,
      rpm: o.rpm ?? null,
      throttle: o.throttlePct ?? null,
      load: o.loadPct ?? null,
    });
  }
  return byLabel;
}

function shadowMap(intervals: DiV0TripSpeedQualityShadowRow[]): Map<string, DiV0TripSpeedQualityShadowRow> {
  const m = new Map<string, DiV0TripSpeedQualityShadowRow>();
  for (const r of intervals) m.set(dateToBucketLabel(r.referenceTime), r);
  return m;
}

function posMap(positions: DiV0SpeedQcPositionSample[]): Map<string, DiV0SpeedQcPositionSample> {
  return new Map(positions.map((p) => [p.bucketLabel, p]));
}

function mergeR1EvidenceIntoMap(
  map: Map<string, { speedKmh: number | null; rpm: number | null; throttle: number | null; load: number | null }>,
  ctx: P21ForensicLoadedContext,
): void {
  for (const r of ctx.evidence.r1Obd) {
    if (!map.has(r.bucketLabel)) {
      map.set(r.bucketLabel, {
        speedKmh: r.speedKmh ?? null,
        rpm: null,
        throttle: null,
        load: null,
      });
    }
  }
}

export function buildCombinedSnapshotRows(
  ctx: P21ForensicLoadedContext,
  natives: Ldi03NativeRow[],
  r1Payload: string | undefined,
): Ldi03CombinedRow[] {
  const r1ByLabel = r1MapsFromParsedPayload(r1Payload);
  mergeR1EvidenceIntoMap(r1ByLabel, ctx);
  const shadows = shadowMap(ctx.shadowIntervals);
  const positions = posMap(ctx.evidence.positions);
  const labels = [...shadows.keys()].sort();
  const nativeByBucket = new Map<string, Ldi03NativeRow[]>();
  for (const n of natives) {
    const list = nativeByBucket.get(n.normalizedBucketUtc) ?? [];
    list.push(n);
    nativeByBucket.set(n.normalizedBucketUtc, list);
  }

  return labels.map((label) => {
    const shadow = shadows.get(label)!;
    const pos = positions.get(label);
    const verdict = evaluateDiV0SpeedQcInterval({
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
      centerBucketLabel: label,
      shadow: {
        intervalStart: label,
        intervalEnd: label,
        referenceTime: label,
        estimatedSpeedKmh: shadow.estimatedSpeedKmh,
        speedEvidenceState: (shadow.speedEvidenceState ?? 'NONE') as 'NONE',
        valueConfidence: shadow.valueConfidence as 'HIGH',
        sourceRelation: shadow.sourceRelation as never,
        motionState: shadow.motionState as never,
        positionState: shadow.positionState as never,
        abstentionReason: shadow.abstentionReason as never,
        sourceQualityFlags: Array.isArray(shadow.sourceQualityFlags)
          ? shadow.sourceQualityFlags.map(String)
          : [],
        evidenceSources: [],
      },
      positions: ctx.evidence.positions,
      r1Obd: ctx.evidence.r1Obd,
      evidenceIdentity: { pinnedSnapshotHash: ctx.pinnedSnapshotHash },
    });
    const l3Speed =
      shadow.estimatedSpeedKmh != null && Number.isFinite(shadow.estimatedSpeedKmh)
        ? shadow.estimatedSpeedKmh
        : null;
    const r1 = r1ByLabel.get(label);
    const nativesHere = nativeByBucket.get(label) ?? [];

    return {
      evaluationIndexUtc: label,
      gps: {
        availability: pos?.availability ?? null,
        latitude: pos?.latitude ?? null,
        longitude: pos?.longitude ?? null,
        positionState: pos?.positionState ?? null,
        provenance: 'S4_POSITION_PIN_DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1',
        originalSourceTimestampUtc: pos?.availability === 'PRESENT' ? label : null,
        missingReason: pos?.availability !== 'PRESENT' ? 'ROW_ABSENT' : null,
      },
      l3: {
        speedKmh: l3Speed,
        qcTrustLevel: verdict.trustLevel,
        qcReasonCodes: [...verdict.reasonCodes],
        motionState: shadow.motionState != null ? String(shadow.motionState) : null,
        sourceRelation: shadow.sourceRelation != null ? String(shadow.sourceRelation) : null,
        confidence: shadow.valueConfidence != null ? String(shadow.valueConfidence) : null,
        provenance: 'SHADOW_RUN_L3_RECONSTRUCTION_PINNED',
      },
      hf: {
        speedKmh: r1?.speedKmh ?? null,
        rpm: r1?.rpm ?? null,
        throttlePct: r1?.throttle ?? null,
        engineLoadPct: r1?.load ?? null,
        provenance: 'S4_R1_OBD_DI_V0_R1_OBD_QUERY_V0_3_HIGH_FREQUENCY_SUBSET_1S',
        originalBucketLabelUtc: r1 ? label : null,
        temporalSemantics: 'INTERVAL_ONLY',
        missingReason: r1 ? null : 'ROW_ABSENT_OR_SIGNAL_NULL',
      },
      obd: {
        speedKmh: r1?.speedKmh ?? null,
        provenance: 'S4_R1_OBD_speed_FIELD_INTERVAL_ONLY',
        originalBucketLabelUtc: r1 ? label : null,
        missingReason: r1?.speedKmh == null ? 'ROW_ABSENT_OR_SIGNAL_NULL' : null,
      },
      nativeEventsAtIndex: nativesHere.map((n) => ({
        eventType: n.eventType,
        providerEventName: n.providerEventName,
        providerTimestampUtc: n.recordedAtUtc,
        overlapClass: n.normalizedBucketUtc === label ? 'EXACT_BUCKET' : 'WITHIN_SAME_SECOND',
      })),
    };
  });
}

function r1ToHfCleanPoints(
  r1ByLabel: Map<string, { speedKmh: number | null; rpm: number | null; throttle: number | null; load: number | null }>,
): CleanHfPoint[] {
  const labels = [...r1ByLabel.keys()].sort();
  const out: CleanHfPoint[] = [];
  for (const label of labels) {
    const v = r1ByLabel.get(label)!;
    if (v.speedKmh == null || !Number.isFinite(v.speedKmh)) continue;
    const ms = bucketLabelToMs(label);
    out.push({
      ts: ms,
      speedKmh: v.speedKmh,
      speedMs: v.speedKmh / 3.6,
      coolantC: null,
      rpm: v.rpm,
      throttlePct: v.throttle,
      loadPct: v.load,
      tractionBatteryPowerKw: null,
    });
  }
  return out;
}

function l3DecelWindows(
  rows: Ldi03CombinedRow[],
): Array<{ id: string; startUtc: string; endUtc: string; deltaKmh: number; trusted: boolean }> {
  const wins: Array<{ id: string; startUtc: string; endUtc: string; deltaKmh: number; trusted: boolean }> = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const cur = rows[i];
    const v0 = prev.l3.speedKmh;
    const v1 = cur.l3.speedKmh;
    if (v0 == null || v1 == null) continue;
    const delta = v1 - v0;
    if (delta >= -3) continue;
    const trusted =
      (prev.l3.qcTrustLevel === 'TRUSTED' || prev.l3.qcTrustLevel === 'TRUSTED_LIMITED') &&
      (cur.l3.qcTrustLevel === 'TRUSTED' || cur.l3.qcTrustLevel === 'TRUSTED_LIMITED');
    wins.push({
      id: `L3_DECEL_${wins.length + 1}`,
      startUtc: prev.evaluationIndexUtc,
      endUtc: cur.evaluationIndexUtc,
      deltaKmh: delta,
      trusted,
    });
  }
  return wins;
}

function overlapsWindow(eventUtc: string, startUtc: string, endUtc: string, padSec = 2): boolean {
  const t = Date.parse(eventUtc);
  const a = bucketLabelToMs(startUtc) - padSec * 1000;
  const b = bucketLabelToMs(endUtc) + padSec * 1000;
  return t >= a && t <= b;
}

export function buildEventOverlapTable(
  rows: Ldi03CombinedRow[],
  natives: Ldi03NativeRow[],
  r1Payload: string | undefined,
  ctx?: P21ForensicLoadedContext,
): Array<{
  overlapId: string;
  nativeEventId: string | null;
  nativeType: string | null;
  hfBrakeId: string | null;
  l3DecelId: string | null;
  verdict: Ldi03OverlapVerdict;
  notes: string[];
}> {
  const r1ByLabel = r1MapsFromParsedPayload(r1Payload);
  if (ctx) mergeR1EvidenceIntoMap(r1ByLabel, ctx);
  const hfPoints = r1ToHfCleanPoints(r1ByLabel);
  const hfBrakes = detectBrakingEvents(hfPoints).map((e, i) => ({ id: `HF_BRAKE_${i + 1}`, ...e }));
  const hfAccels = detectAccelerationEvents(hfPoints).map((e, i) => ({ id: `HF_ACCEL_${i + 1}`, ...e }));
  const l3Decels = l3DecelWindows(rows);

  const nativeBrake = natives.filter((n) =>
    /braking|BRAKING|HARSH_BRAKE|EXTREME_BRAKE/i.test(n.eventType + (n.providerEventName ?? '')),
  );
  const nativeAccel = natives.filter((n) =>
    /acceleration|ACCELERATION|HARSH_ACCEL/i.test(n.eventType + (n.providerEventName ?? '')),
  );

  const table: Array<{
    overlapId: string;
    nativeEventId: string | null;
    nativeType: string | null;
    hfBrakeId: string | null;
    l3DecelId: string | null;
    verdict: Ldi03OverlapVerdict;
    notes: string[];
  }> = [];

  for (const n of nativeBrake) {
    const hf = hfBrakes.find((h) => overlapsWindow(n.recordedAtUtc, h.startedAt.toISOString(), h.endedAt.toISOString()));
    const l3 = l3Decels.find((d) => overlapsWindow(n.recordedAtUtc, d.startUtc, d.endUtc));
    let verdict: Ldi03OverlapVerdict = 'INSUFFICIENT_EVIDENCE';
    const notes: string[] = ['Native event is not physical ground truth'];
    if (hf && l3 && l3.trusted) {
      verdict = 'AGREEMENT';
      notes.push('Native timestamp overlaps HF braking segment and trusted L3 decel window');
    } else if (hf || l3) {
      verdict = 'PARTIAL_AGREEMENT';
      notes.push(hf ? 'HF overlap only' : 'L3 overlap only');
      if (l3 && !l3.trusted) notes.push('L3 window not QC-trusted');
    } else {
      verdict = 'TEMPORAL_MISMATCH';
      notes.push('No HF/L3 kinematic overlap within ±2s');
    }
    table.push({
      overlapId: `OVL_NATIVE_BRAKE_${table.length + 1}`,
      nativeEventId: n.id,
      nativeType: n.providerEventName ?? n.eventType,
      hfBrakeId: hf?.id ?? null,
      l3DecelId: l3?.id ?? null,
      verdict,
      notes,
    });
  }

  for (const n of nativeAccel) {
    const hf = hfAccels.find((h) => overlapsWindow(n.recordedAtUtc, h.startedAt.toISOString(), h.endedAt.toISOString()));
    let verdict: Ldi03OverlapVerdict = hf ? 'PARTIAL_AGREEMENT' : 'TEMPORAL_MISMATCH';
    table.push({
      overlapId: `OVL_NATIVE_ACCEL_${table.length + 1}`,
      nativeEventId: n.id,
      nativeType: n.providerEventName ?? n.eventType,
      hfBrakeId: hf?.id ?? null,
      l3DecelId: null,
      verdict,
      notes: ['Acceleration overlap uses HF detector only; native not GT'],
    });
  }

  if (table.length === 0) {
    table.push({
      overlapId: 'OVL_NONE',
      nativeEventId: null,
      nativeType: null,
      hfBrakeId: hfBrakes[0]?.id ?? null,
      l3DecelId: l3Decels[0]?.id ?? null,
      verdict: 'INSUFFICIENT_EVIDENCE',
      notes: [
        `No native harsh events on trip; hfBrakeSegments=${hfBrakes.length}; l3DecelWindows=${l3Decels.length}`,
      ],
    });
  }

  return table;
}

export function buildTemporalAlignment(
  rows: Ldi03CombinedRow[],
  natives: Ldi03NativeRow[],
): Record<string, unknown> {
  const hfPresent = rows.filter((r) => r.hf.speedKmh != null);
  const obdPresent = rows.filter((r) => r.obd.speedKmh != null);
  const l3Present = rows.filter((r) => r.l3.speedKmh != null);
  const l3Trusted = rows.filter((r) => r.l3.qcTrustLevel === 'TRUSTED' || r.l3.qcTrustLevel === 'TRUSTED_LIMITED');

  const hfCadenceMs: number[] = [];
  for (let i = 1; i < hfPresent.length; i++) {
    hfCadenceMs.push(
      bucketLabelToMs(hfPresent[i].evaluationIndexUtc) - bucketLabelToMs(hfPresent[i - 1].evaluationIndexUtc),
    );
  }

  const conflicts: Array<{ indexUtc: string; l3Kmh: number; obdKmh: number; deltaKmh: number }> = [];
  for (const r of rows) {
    if (r.l3.speedKmh != null && r.obd.speedKmh != null) {
      const d = Math.abs(r.l3.speedKmh - r.obd.speedKmh);
      if (d >= Math.max(5, r.l3.speedKmh * 0.25)) {
        conflicts.push({
          indexUtc: r.evaluationIndexUtc,
          l3Kmh: r.l3.speedKmh,
          obdKmh: r.obd.speedKmh,
          deltaKmh: d,
        });
      }
    }
  }

  const duplicateNatives = natives.filter((n, i, arr) =>
    arr.findIndex((x) => x.providerEventName === n.providerEventName && x.recordedAtUtc === n.recordedAtUtc) !== i,
  );

  return {
    schema: 'LDI03_TEMPORAL_ALIGNMENT_V1',
    evaluationGrid: 'UTC calendar 1s bucket labels (index only; original timestamps preserved per row)',
    hfCadence: {
      sampleCount: hfPresent.length,
      medianDeltaMs: hfCadenceMs.length ? hfCadenceMs.sort((a, b) => a - b)[Math.floor(hfCadenceMs.length / 2)] : null,
      minDeltaMs: hfCadenceMs.length ? Math.min(...hfCadenceMs) : null,
      maxDeltaMs: hfCadenceMs.length ? Math.max(...hfCadenceMs) : null,
      note: 'R1 HF subset buckets are sparse vs shadow grid — gaps are not interpolated',
    },
    obdSampling: {
      numericSpeedBuckets: obdPresent.length,
      temporalSemantics: 'INTERVAL_ONLY',
    },
    l3Sampling: {
      numericBuckets: l3Present.length,
      trustedBuckets: l3Trusted.length,
    },
    nativeEventTiming: {
      count: natives.length,
      minRecordedAtUtc: natives.length ? natives.map((n) => n.recordedAtUtc).sort()[0] : null,
      maxRecordedAtUtc: natives.length ? natives.map((n) => n.recordedAtUtc).sort().slice(-1)[0] : null,
    },
    missingBuckets: {
      positionAbsent: rows.filter((r) => r.gps.availability !== 'PRESENT').length,
      hfAbsent: rows.filter((r) => r.hf.speedKmh == null).length,
      obdAbsent: rows.filter((r) => r.obd.speedKmh == null).length,
    },
    gpsObdSpeedConflicts: conflicts.slice(0, 50),
    gpsObdSpeedConflictCount: conflicts.length,
    duplicateNativeEvents: duplicateNatives.map((d) => d.id),
    clockOffsetAnalysis: {
      status: 'NOT_COMPUTED',
      reason: 'No independent UTC anchor on this trip pin — use providerTimestamp vs bucket label only',
    },
    outOfOrderData: {
      status: 'NOT_DETECTED_IN_BUCKET_ORDER',
      method: 'Rows sorted by evaluationIndexUtc ascending',
    },
  };
}

export function buildCoverageReport(
  rows: Ldi03CombinedRow[],
  natives: Ldi03NativeRow[],
  overlapTable: ReturnType<typeof buildEventOverlapTable>,
): Record<string, unknown> {
  const total = rows.length;
  const l3Trusted = rows.filter((r) => r.l3.qcTrustLevel === 'TRUSTED' || r.l3.qcTrustLevel === 'TRUSTED_LIMITED');
  const hfNumeric = rows.filter((r) => r.hf.speedKmh != null);
  const obdNumeric = rows.filter((r) => r.obd.speedKmh != null);
  const posPresent = rows.filter((r) => r.gps.availability === 'PRESENT');
  const multiStreamNumeric = rows.filter(
    (r) =>
      r.gps.availability === 'PRESENT' &&
      r.l3.speedKmh != null &&
      (r.l3.qcTrustLevel === 'TRUSTED' || r.l3.qcTrustLevel === 'TRUSTED_LIMITED') &&
      r.obd.speedKmh != null &&
      r.hf.speedKmh != null,
  );
  const multiStreamFourWay = rows.filter(
    (r) =>
      r.gps.availability === 'PRESENT' &&
      r.l3.speedKmh != null &&
      (r.l3.qcTrustLevel === 'TRUSTED' || r.l3.qcTrustLevel === 'TRUSTED_LIMITED') &&
      r.obd.speedKmh != null &&
      r.hf.speedKmh != null &&
      r.nativeEventsAtIndex.length > 0,
  );

  const assessableBrake = overlapTable.filter((o) => o.verdict !== 'INSUFFICIENT_EVIDENCE' && o.nativeType != null);
  const assessableAccel = overlapTable.filter((o) => o.overlapId.startsWith('OVL_NATIVE_ACCEL'));

  return {
    schema: 'LDI03_COVERAGE_V1',
    shadowIntervalCount: total,
    gpsL3TrustedCoverage: {
      trustedOrLimitedBuckets: l3Trusted.length,
      fractionOfShadowGrid: total > 0 ? l3Trusted.length / total : 0,
    },
    hfCoverage: {
      numericSpeedBuckets: hfNumeric.length,
      fractionOfShadowGrid: total > 0 ? hfNumeric.length / total : 0,
    },
    obdCoverage: {
      numericSpeedBuckets: obdNumeric.length,
      fractionOfShadowGrid: total > 0 ? obdNumeric.length / total : 0,
    },
    nativeEventAvailability: {
      drivingEventCount: natives.length,
      harshBrakeRelated: natives.filter((n) => /braking/i.test((n.providerEventName ?? '') + n.eventType)).length,
      harshAccelRelated: natives.filter((n) => /acceleration/i.test((n.providerEventName ?? '') + n.eventType)).length,
    },
    multiStreamOverlap: {
      numericThreeWayPlusGps: {
        buckets: multiStreamNumeric.length,
        fractionOfShadowGrid: total > 0 ? multiStreamNumeric.length / total : 0,
      },
      fourWayIncludingNativeEventOnBucket: {
        buckets: multiStreamFourWay.length,
        fractionOfShadowGrid: total > 0 ? multiStreamFourWay.length / total : 0,
      },
      note: 'Not summed across sources — single-bucket conjunction only; native requires event on same bucket',
    },
    eventAssessability: {
      nativeBrakeOverlapRows: assessableBrake.length,
      nativeAccelOverlapRows: assessableAccel.length,
      insufficientEvidenceRows: overlapTable.filter((o) => o.verdict === 'INSUFFICIENT_EVIDENCE').length,
    },
    positionPresentCoverage: {
      buckets: posPresent.length,
      fractionOfShadowGrid: total > 0 ? posPresent.length / total : 0,
    },
  };
}

export function buildLdi03ResultLines(input: {
  vehicleId: string;
  tripId: string;
  utcFrom: string;
  utcTo: string;
  coverage: Record<string, unknown>;
  overlap: ReturnType<typeof buildEventOverlapTable>;
  temporal: Record<string, unknown>;
}): string[] {
  const cov = input.coverage as {
    gpsL3TrustedCoverage: { fractionOfShadowGrid: number };
    hfCoverage: { fractionOfShadowGrid: number };
    obdCoverage: { fractionOfShadowGrid: number };
    nativeEventAvailability: { drivingEventCount: number };
    multiStreamOverlap: {
      numericThreeWayPlusGps: { fractionOfShadowGrid: number };
      fourWayIncludingNativeEventOnBucket: { fractionOfShadowGrid: number };
    };
    eventAssessability: { nativeBrakeOverlapRows: number; nativeAccelOverlapRows: number };
  };
  const conflicts = (input.temporal.gpsObdSpeedConflictCount as number) ?? 0;
  return [
    'LDI03_RESULT=PINNED_READ_ONLY_EXPORT_COMPLETE',
    `SELECTED_VEHICLE=${input.vehicleId}`,
    `SELECTED_TRIP=${input.tripId}`,
    `UTC_WINDOW=${input.utcFrom}..${input.utcTo}`,
    `GPS_L3_COVERAGE=${(cov.gpsL3TrustedCoverage.fractionOfShadowGrid * 100).toFixed(1)}pct_trusted_or_limited`,
    `HF_COVERAGE=${(cov.hfCoverage.fractionOfShadowGrid * 100).toFixed(1)}pct_numeric_speed_buckets`,
    `OBD_COVERAGE=${(cov.obdCoverage.fractionOfShadowGrid * 100).toFixed(1)}pct_numeric_speed_buckets`,
    `NATIVE_EVENT_COUNT=${cov.nativeEventAvailability.drivingEventCount}`,
    `MULTISTREAM_OVERLAP=${(cov.multiStreamOverlap.fourWayIncludingNativeEventOnBucket.fractionOfShadowGrid * 100).toFixed(1)}pct_four_way_native_on_bucket_${(cov.multiStreamOverlap.numericThreeWayPlusGps.fractionOfShadowGrid * 100).toFixed(1)}pct_numeric_gps_l3_hf_obd`,
    `ACCEL_EVENTS_ASSESSABLE=${cov.eventAssessability.nativeAccelOverlapRows}`,
    `BRAKE_EVENTS_ASSESSABLE=${cov.eventAssessability.nativeBrakeOverlapRows}`,
    `SIGNAL_CONFLICTS=${conflicts}`,
    'TEMPORAL_ALIGNMENT_CONFIDENCE=MEDIUM_sparse_HF_grid_INTERVAL_ONLY_OBD',
    'FUSION_READY=CONDITIONAL_offline_pin_complete_threshold_tuning_still_forbidden',
    'PRODUCTION_MUTATIONS=NONE',
    'NEXT_SAFE_ACTION=Owner_review_overlap_table_then_LDI04_threshold_free_fusion_policy_draft',
  ];
}

export function normalizeNativeRecordedAt(recordedAt: Date): string {
  return recordedAt.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function bucketForNativeTimestamp(iso: string): string {
  const ms = Date.parse(iso);
  const d = new Date(ms);
  d.setUTCSeconds(d.getUTCSeconds(), 0);
  d.setUTCMilliseconds(0);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
