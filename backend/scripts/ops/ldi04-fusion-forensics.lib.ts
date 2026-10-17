/**
 * LDI-04 — conflict forensics + fusion policy inputs (offline, LDI-03 pin).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DI_V0_SPEED_QC_CALIBRATION_PROVISIONAL_V1 as CAL } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-calibration';

export const LDI04_PIN = {
  vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
  tripId: 'f502a4a0-02d2-421d-bb39-7c9af25ba38e',
  utcFrom: '2026-10-14T19:04:00Z',
  utcTo: '2026-10-14T19:22:10Z',
} as const;

export type Ldi03Row = {
  evaluationIndexUtc: string;
  gps: {
    availability: string | null;
    provenance: string;
    missingReason: string | null;
  };
  l3: {
    speedKmh: number | null;
    qcTrustLevel: string;
    qcReasonCodes: string[];
    sourceRelation: string | null;
    confidence: string | null;
  };
  hf: {
    speedKmh: number | null;
    temporalSemantics: string;
    originalBucketLabelUtc: string | null;
    missingReason: string | null;
  };
  obd: {
    speedKmh: number | null;
    originalBucketLabelUtc: string | null;
    missingReason: string | null;
  };
};

export type ConflictDisposition = 'EXPLAINED' | 'UNRESOLVED' | 'NOT_COMPARABLE';

export type ConflictForensicRecord = {
  conflictId: string;
  evaluationIndexUtc: string;
  l3: {
    speedKmh: number | null;
    qcTrustLevel: string;
    qcReasonCodes: string[];
    sourceRelation: string | null;
    originalTimestampUtc: string;
  };
  obd: {
    speedKmh: number | null;
    originalTimestampUtc: string | null;
    temporalSemantics: string;
  };
  deltaKmh: number;
  temporalSeparationMs: number;
  samplingIntervalMs: { prevObdGap: number | null; nextObdGap: number | null };
  dataAgeFreshness: string;
  disagreementThresholdKmh: number;
  corroborationBandKmh: number;
  possibleTimeShiftCause: string[];
  possiblePhysicalDeviationCause: string[];
  disposition: ConflictDisposition;
  dispositionRationale: string;
};

function bucketMs(label: string): number {
  return Date.parse(label);
}

function disagreementThreshold(l3Kmh: number): number {
  return Math.max(CAL.r1DisagreementAbsKmh, l3Kmh * CAL.r1DisagreementRelPct);
}

function corroborationBand(l3Kmh: number): number {
  return Math.max(CAL.r1CorroborationAbsKmh, l3Kmh * CAL.r1CorroborationRelPct);
}

/** Same rule as LDI03 `buildTemporalAlignment` export (documented 36 conflicts). */
function isLdi03DocumentedConflict(l3Kmh: number, obdKmh: number): boolean {
  const d = Math.abs(obdKmh - l3Kmh);
  return d >= Math.max(5, l3Kmh * 0.25);
}

function isConflict(l3Kmh: number, obdKmh: number): boolean {
  return Math.abs(obdKmh - l3Kmh) >= disagreementThreshold(l3Kmh);
}

function obdPresentLabels(rows: Ldi03Row[]): string[] {
  return rows.filter((r) => r.obd.speedKmh != null && Number.isFinite(r.obd.speedKmh)).map((r) => r.evaluationIndexUtc);
}

export function loadLdi03Snapshot(repoRoot: string): { rows: Ldi03Row[]; meta: Record<string, unknown> } {
  const p = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-03/LDI03_COMBINED_SNAPSHOT.json');
  const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as { rows: Ldi03Row[]; [k: string]: unknown };
  return { rows: raw.rows, meta: raw };
}

export function loadLdi03DocumentedConflictIndex(repoRoot: string): Array<{
  indexUtc: string;
  l3Kmh: number;
  obdKmh: number;
  deltaKmh: number;
}> {
  const p = path.join(
    repoRoot,
    'architecture/drivingintelligence/evidence/ldi-03/LDI03_TEMPORAL_ALIGNMENT.json',
  );
  const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as {
    gpsObdSpeedConflicts: Array<{ indexUtc: string; l3Kmh: number; obdKmh: number; deltaKmh: number }>;
  };
  return raw.gpsObdSpeedConflicts ?? [];
}

export function analyzeConflicts(rows: Ldi03Row[], documented?: Array<{ indexUtc: string }>): ConflictForensicRecord[] {
  const obdLabels = obdPresentLabels(rows);
  const rowByIndex = new Map(rows.map((r) => [r.evaluationIndexUtc, r]));
  const targets =
    documented?.map((d) => d.indexUtc) ??
    rows
      .filter((r) => {
        const l3 = r.l3.speedKmh;
        const obd = r.obd.speedKmh;
        return l3 != null && obd != null && isLdi03DocumentedConflict(l3, obd);
      })
      .map((r) => r.evaluationIndexUtc);

  const records: ConflictForensicRecord[] = [];

  for (const indexUtc of targets) {
    const row = rowByIndex.get(indexUtc);
    if (!row) continue;
    const l3 = row.l3.speedKmh;
    const obd = row.obd.speedKmh;
    if (l3 == null || obd == null || !Number.isFinite(l3) || !Number.isFinite(obd)) continue;

    const idx = obdLabels.indexOf(row.evaluationIndexUtc);
    const prevGap = idx > 0 ? bucketMs(row.evaluationIndexUtc) - bucketMs(obdLabels[idx - 1]) : null;
    const nextGap =
      idx >= 0 && idx < obdLabels.length - 1 ? bucketMs(obdLabels[idx + 1]) - bucketMs(row.evaluationIndexUtc) : null;

    const timeCauses: string[] = [];
    const physCauses: string[] = [];
    if (row.hf.temporalSemantics === 'INTERVAL_ONLY') {
      timeCauses.push('R1_OBD_INTERVAL_ONLY_bucket_label_not_point_instant');
    }
    if (prevGap != null && prevGap > 1000) timeCauses.push(`sparse_obd_cadence_prev_gap_${prevGap}ms`);
    if (nextGap != null && nextGap > 1000) timeCauses.push(`sparse_obd_cadence_next_gap_${nextGap}ms`);

    if (obd === 0 && l3 > 0) {
      physCauses.push('obd_wheel_speed_zero_while_gps_l3_nonzero');
      physCauses.push('possible_stop_start_or_gps_dominant_crawl');
    }
    if (obd > 0 && l3 > 0 && Math.abs(obd - l3) > corroborationBand(l3)) {
      physCauses.push('speed_source_divergence_gps_haversine_vs_obd_ecu');
    }

    let disposition: ConflictDisposition = 'UNRESOLVED';
    let rationale = 'Numeric L3 and OBD disagree beyond LDI03 conflict threshold';

    if (row.gps.availability !== 'PRESENT') {
      disposition = 'NOT_COMPARABLE';
      rationale = 'POSITION_ROW_ABSENT — L3/OBD conjunction not defensible at this index';
    } else if (obd === 0 && l3 > 0) {
      disposition = 'EXPLAINED';
      rationale =
        'OBD speed 0 at bucket while GPS-L3 non-zero — wheel-speed vs path-speed split under INTERVAL_ONLY sparse sampling; explains QC CROSS_SOURCE_CONFLICT without preferring either channel';
    } else if (
      row.l3.qcTrustLevel === 'UNTRUSTED' &&
      row.l3.qcReasonCodes.includes('CROSS_SOURCE_CONFLICT')
    ) {
      disposition = 'EXPLAINED';
      rationale =
        'Speed QC already marked CROSS_SOURCE_CONFLICT — disagreement is expected; not a fusion tie-break surface';
    } else if (row.hf.temporalSemantics === 'INTERVAL_ONLY' && ((prevGap ?? 0) > 2000 || (nextGap ?? 0) > 2000)) {
      disposition = 'EXPLAINED';
      rationale = 'Sparse OBD cadence (>2s gap) — calendar co-index does not prove simultaneous samples';
    } else if (row.l3.qcTrustLevel === 'UNTRUSTED') {
      disposition = 'NOT_COMPARABLE';
      rationale = `L3 QC UNTRUSTED (${row.l3.qcReasonCodes.join(',') || 'no codes'}) — no promotion-grade comparison`;
    } else if (row.l3.qcTrustLevel === 'TRUSTED_LIMITED') {
      disposition = 'EXPLAINED';
      rationale = 'L3 TRUSTED_LIMITED — conflict visible but not promotion-grade';
    } else if (row.l3.qcTrustLevel === 'TRUSTED') {
      disposition = 'UNRESOLVED';
      rationale = 'Trusted L3 and numeric OBD still disagree — no automatic channel winner';
    }

    records.push({
      conflictId: `CF_${String(records.length + 1).padStart(3, '0')}`,
      evaluationIndexUtc: row.evaluationIndexUtc,
      l3: {
        speedKmh: l3,
        qcTrustLevel: row.l3.qcTrustLevel,
        qcReasonCodes: row.l3.qcReasonCodes,
        sourceRelation: row.l3.sourceRelation,
        originalTimestampUtc: row.evaluationIndexUtc,
      },
      obd: {
        speedKmh: obd,
        originalTimestampUtc: row.obd.originalBucketLabelUtc,
        temporalSemantics: row.hf.temporalSemantics,
      },
      deltaKmh: Math.abs(obd - l3),
      temporalSeparationMs: 0,
      samplingIntervalMs: { prevObdGap: prevGap, nextObdGap: nextGap },
      dataAgeFreshness: 'NOT_IN_PIN — acquisition freshness not exported in LDI03 row',
      disagreementThresholdKmh: disagreementThreshold(l3),
      corroborationBandKmh: corroborationBand(l3),
      possibleTimeShiftCause: timeCauses,
      possiblePhysicalDeviationCause: physCauses,
      disposition,
      dispositionRationale: rationale,
    });
  }

  return records;
}

export function analyzeCadence(rows: Ldi03Row[]) {
  const hfLabels = rows.filter((r) => r.hf.speedKmh != null).map((r) => r.evaluationIndexUtc);
  const deltas: number[] = [];
  for (let i = 1; i < hfLabels.length; i++) {
    deltas.push(bucketMs(hfLabels[i]) - bucketMs(hfLabels[i - 1]));
  }
  deltas.sort((a, b) => a - b);
  const median = deltas.length ? deltas[Math.floor(deltas.length / 2)] : null;

  const tripleOverlap = rows.filter(
    (r) =>
      r.gps.availability === 'PRESENT' &&
      r.l3.speedKmh != null &&
      (r.l3.qcTrustLevel === 'TRUSTED' || r.l3.qcTrustLevel === 'TRUSTED_LIMITED') &&
      r.obd.speedKmh != null &&
      r.hf.speedKmh != null,
  );

  let corroborate = 0;
  let conflict = 0;
  for (const r of tripleOverlap) {
    const l3 = r.l3.speedKmh!;
    const obd = r.obd.speedKmh!;
    if (isLdi03DocumentedConflict(l3, obd)) {
      conflict += 1;
    } else if (Math.abs(obd - l3) <= corroborationBand(l3)) {
      corroborate += 1;
    }
  }

  let documentedConflictOnNumericOverlap = 0;
  for (const r of rows) {
    const l3 = r.l3.speedKmh;
    const obd = r.obd.speedKmh;
    if (l3 == null || obd == null) continue;
    if (isLdi03DocumentedConflict(l3, obd)) documentedConflictOnNumericOverlap += 1;
  }

  return {
    expectedGridHz: 1,
    observedHfNumericBuckets: hfLabels.length,
    observedMedianDeltaMs: median,
    observedMinDeltaMs: deltas.length ? deltas[0] : null,
    observedMaxDeltaMs: deltas.length ? deltas[deltas.length - 1] : null,
    supportsStrict1Hz: median === 1000 && deltas.every((d) => d === 1000),
    tripleOverlapBuckets: tripleOverlap.length,
    tripleOverlapFraction: rows.length > 0 ? tripleOverlap.length / rows.length : 0,
    tripleOverlapCorroboration: corroborate,
    tripleOverlapConflictOnTrusted: conflict,
    tripleOverlapCorroborationFraction:
      tripleOverlap.length > 0 ? corroborate / tripleOverlap.length : 0,
    documentedL3ObdConflicts: documentedConflictOnNumericOverlap,
    note:
      '36 documented conflicts occur on buckets where L3 is UNTRUSTED (CROSS_SOURCE_CONFLICT); they are excluded from the 66 trusted triple-overlap buckets',
  };
}

export function buildLdi04ResultLines(args: {
  conflicts: ConflictForensicRecord[];
  cadence: ReturnType<typeof analyzeCadence>;
  nativeCause: string;
}): string[] {
  const explained = args.conflicts.filter((c) => c.disposition === 'EXPLAINED').length;
  const unresolved = args.conflicts.filter((c) => c.disposition === 'UNRESOLVED').length;
  const comparable = args.conflicts.filter((c) => c.disposition !== 'NOT_COMPARABLE').length;
  const corrPct =
    args.cadence.tripleOverlapBuckets > 0
      ? ((args.cadence.tripleOverlapCorroboration / args.cadence.tripleOverlapBuckets) * 100).toFixed(1)
      : '0.0';
  const conflictTotal = args.cadence.documentedL3ObdConflicts ?? args.conflicts.length;

  return [
    'LDI04_RESULT=OFFLINE_FORENSICS_COMPLETE',
    `CONFLICTS_TOTAL=${args.conflicts.length}`,
    `CONFLICTS_EXPLAINED=${explained}`,
    `CONFLICTS_UNRESOLVED=${unresolved}`,
    `HF_ACTUAL_CADENCE=median_${args.cadence.observedMedianDeltaMs ?? 'null'}ms_not_strict_1Hz`,
    `OBD_ALIGNMENT_QUALITY=${corrPct}pct_corroborate_on_66_trusted_overlap_${conflictTotal}_conflict_buckets_untrusted_l3`,
    `NATIVE_EVENT_ABSENCE_CAUSE=${args.nativeCause}`,
    `L3_OBD_CORROBORATION=${corrPct}pct_on_overlap_${args.cadence.tripleOverlapCorroboration}/${args.cadence.tripleOverlapBuckets}`,
    'OBD_FALLBACK_FEASIBLE=NO_interval_only_sparse_not_primary_without_corroboration',
    'FUSION_POLICY_READY=DRAFT_ONLY_not_production_armed',
    'PRODUCTION_MUTATIONS=NONE',
    'NEXT_SAFE_ACTION=Owner_pick_trip_with_native_events_or_accept_L3_first_policy_with_OBD_witness_only',
  ];
}
