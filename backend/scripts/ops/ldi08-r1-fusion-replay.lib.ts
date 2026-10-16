/**
 * LDI-08 — R1 multi-stream fusion replay (fixed trip binding).
 */
import { bucketLabelToMs } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import type { Ldi03CombinedRow, Ldi03NativeRow } from './ldi03-ruptela-combined-pin.lib';

export const LDI08_ORG_ID = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
export const LDI08_VEHICLE_ID = '8c850ff1-4201-432b-af2e-2711dbc7ca48';
export const LDI08_TRIP_ID = 'f3e1fa83-d1e3-46b9-9ab8-14b4676ec5c9';
/** LDI-06 fusion-capable alternate pin */
export const LDI08_EXPECTED_PINNED_HASH =
  'DI_V0_S4_EVIDENCE_V1:sha256:79635496216a2588666db3f1be87609f803d073421db6ebc64e65f7c88b264fa';
export const LDI08_EXPECTED_L3_TRUSTED_FRACTION = 0.8121546961325967;

export type L3KinematicCandidate = {
  id: string;
  kind: 'ACCELERATION' | 'DECELERATION';
  startUtc: string;
  endUtc: string;
  speedStartKmh: number;
  speedEndKmh: number;
  deltaKmh: number;
  bothEndsTrustedL3: boolean;
  qcTrustStart: string;
  qcTrustEnd: string;
};

function isTrustedL3(level: string): boolean {
  return level === 'TRUSTED' || level === 'TRUSTED_LIMITED';
}

/** Same consecutive-bucket delta gates as LDI-03 `l3DecelWindows` (±3 km/h). */
export function buildL3AccelDecelCandidates(rows: Ldi03CombinedRow[]): L3KinematicCandidate[] {
  const out: L3KinematicCandidate[] = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const cur = rows[i];
    const v0 = prev.l3.speedKmh;
    const v1 = cur.l3.speedKmh;
    if (v0 == null || v1 == null) continue;
    const delta = v1 - v0;
    const bothTrusted = isTrustedL3(prev.l3.qcTrustLevel) && isTrustedL3(cur.l3.qcTrustLevel);
    if (delta <= -3) {
      out.push({
        id: `L3_DECEL_${out.filter((c) => c.kind === 'DECELERATION').length + 1}`,
        kind: 'DECELERATION',
        startUtc: prev.evaluationIndexUtc,
        endUtc: cur.evaluationIndexUtc,
        speedStartKmh: v0,
        speedEndKmh: v1,
        deltaKmh: delta,
        bothEndsTrustedL3: bothTrusted,
        qcTrustStart: prev.l3.qcTrustLevel,
        qcTrustEnd: cur.l3.qcTrustLevel,
      });
    } else if (delta >= 3) {
      out.push({
        id: `L3_ACCEL_${out.filter((c) => c.kind === 'ACCELERATION').length + 1}`,
        kind: 'ACCELERATION',
        startUtc: prev.evaluationIndexUtc,
        endUtc: cur.evaluationIndexUtc,
        speedStartKmh: v0,
        speedEndKmh: v1,
        deltaKmh: delta,
        bothEndsTrustedL3: bothTrusted,
        qcTrustStart: prev.l3.qcTrustLevel,
        qcTrustEnd: cur.l3.qcTrustLevel,
      });
    }
  }
  return out;
}

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function bearingDeltaDeg(a: number, b: number): number {
  const d = Math.abs(b - a) % 360;
  return d > 180 ? 360 - d : d;
}

export function buildNativeCorneringOverlap(
  rows: Ldi03CombinedRow[],
  natives: Ldi03NativeRow[],
): Array<Record<string, unknown>> {
  const corners = natives.filter((n) => /CORNERING/i.test(n.eventType));
  const byLabel = new Map(rows.map((r) => [r.evaluationIndexUtc, r]));

  return corners.map((n, idx) => {
    const label = n.normalizedBucketUtc;
    const center = byLabel.get(label);
    const tMs = Date.parse(n.recordedAtUtc);
    const bucketMs = bucketLabelToMs(label);
    const temporalUncertaintyMs = Math.abs(tMs - bucketMs);

    let bearingChangeDeg: number | null = null;
    let gpsWitnessNote = 'insufficient_adjacent_present_gps';
    const centerIdx = rows.findIndex((r) => r.evaluationIndexUtc === label);
    if (
      centerIdx >= 0 &&
      center?.gps.latitude != null &&
      center.gps.longitude != null
    ) {
      let prevLabel: Ldi03CombinedRow | undefined;
      for (let j = centerIdx - 1; j >= 0; j--) {
        if (rows[j].gps.availability === 'PRESENT') {
          prevLabel = rows[j];
          break;
        }
      }
      let nextLabel: Ldi03CombinedRow | undefined;
      for (let j = centerIdx + 1; j < rows.length; j++) {
        if (rows[j].gps.availability === 'PRESENT') {
          nextLabel = rows[j];
          break;
        }
      }
      if (
        prevLabel?.gps.latitude != null &&
        prevLabel.gps.longitude != null &&
        nextLabel?.gps.latitude != null &&
        nextLabel.gps.longitude != null
      ) {
        const b1 = bearingDeg(
          prevLabel.gps.latitude,
          prevLabel.gps.longitude,
          center.gps.latitude!,
          center.gps.longitude!,
        );
        const b2 = bearingDeg(
          center.gps.latitude!,
          center.gps.longitude!,
          nextLabel.gps.latitude,
          nextLabel.gps.longitude,
        );
        bearingChangeDeg = bearingDeltaDeg(b1, b2);
        gpsWitnessNote = 'bearing_change_between_prev_center_next_present_gps_not_independent_gt';
      }
    }

    return {
      overlapId: `CORNER_NATIVE_${idx + 1}`,
      nativeEventId: n.id,
      eventType: n.eventType,
      providerEventName: n.providerEventName,
      source: n.source,
      provenance: 'DrivingEvent TELEMETRY_EVENTS — provider-reported not physically validated',
      recordedAtUtc: n.recordedAtUtc,
      normalizedBucketUtc: label,
      temporalUncertaintyMs,
      nativeSpeedKmh: n.speedKmh,
      nativeDeltaKmh: n.deltaKmh,
      onBucketExact: center?.nativeEventsAtIndex.some((e) => e.providerTimestampUtc === n.recordedAtUtc) ?? false,
      l3AtBucket: center
        ? {
            speedKmh: center.l3.speedKmh,
            qcTrustLevel: center.l3.qcTrustLevel,
            reasonCodes: center.l3.qcReasonCodes,
          }
        : null,
      gpsTrajectoryWitness: {
        bearingChangeDeg,
        note: gpsWitnessNote,
      },
      curvatureCoincidence:
        bearingChangeDeg != null
          ? bearingChangeDeg >= 15
            ? 'DESCRIPTIVE_elevated_bearing_change_at_bucket'
            : 'DESCRIPTIVE_moderate_or_low_bearing_change'
          : 'NOT_ASSESSABLE',
    };
  });
}

export function exportHfObdObservations(rows: Ldi03CombinedRow[]): {
  hf: Array<Record<string, unknown>>;
  obd: Array<Record<string, unknown>>;
} {
  const hf: Array<Record<string, unknown>> = [];
  const obd: Array<Record<string, unknown>> = [];
  for (const r of rows) {
    if (r.hf.speedKmh != null || r.hf.rpm != null || r.hf.throttlePct != null) {
      hf.push({
        bucketUtc: r.evaluationIndexUtc,
        speedKmh: r.hf.speedKmh,
        rpm: r.hf.rpm,
        throttlePct: r.hf.throttlePct,
        engineLoadPct: r.hf.engineLoadPct,
        provenance: r.hf.provenance,
        originalBucketLabelUtc: r.hf.originalBucketLabelUtc,
        temporalSemantics: r.hf.temporalSemantics,
      });
    }
    if (r.obd.speedKmh != null) {
      obd.push({
        bucketUtc: r.evaluationIndexUtc,
        speedKmh: r.obd.speedKmh,
        provenance: r.obd.provenance,
        originalBucketLabelUtc: r.obd.originalBucketLabelUtc,
        temporalSemantics: 'INTERVAL_ONLY',
      });
    }
  }
  return { hf, obd };
}

export function buildLdi08ResultLines(input: {
  pinVerified: boolean;
  gpsL3TrustedPct: number;
  hfPct: number;
  obdPct: number;
  nativeCount: number;
  accelCandidates: number;
  decelCandidates: number;
  nativeOverlapCount: number;
  signalConflicts: number;
  fusionAssessableSeconds: number;
  independentValidation: string;
  nextSafeAction: string;
}): string[] {
  return [
    `LDI08_RESULT=${input.pinVerified ? 'FUSION_REPLAY_COMPLETE' : 'FUSION_REPLAY_PIN_MISMATCH'}`,
    `TRIP_PIN_VERIFIED=${input.pinVerified ? 'YES' : 'NO'}`,
    `GPS_L3_TRUSTED_COVERAGE=${input.gpsL3TrustedPct.toFixed(1)}pct`,
    `HF_NUMERIC_COVERAGE=${input.hfPct.toFixed(1)}pct`,
    `OBD_NUMERIC_COVERAGE=${input.obdPct.toFixed(1)}pct`,
    `NATIVE_EVENT_COUNT=${input.nativeCount}`,
    `ACCEL_CANDIDATE_COUNT=${input.accelCandidates}`,
    `DECEL_CANDIDATE_COUNT=${input.decelCandidates}`,
    `NATIVE_OVERLAP_COUNT=${input.nativeOverlapCount}`,
    `SIGNAL_CONFLICTS=${input.signalConflicts}`,
    `FUSION_ASSESSABLE_SECONDS=${input.fusionAssessableSeconds}`,
    `INDEPENDENT_VALIDATION_STATUS=${input.independentValidation}`,
    'PRODUCTION_MUTATIONS=NONE',
    `NEXT_SAFE_ACTION=${input.nextSafeAction}`,
  ];
}
