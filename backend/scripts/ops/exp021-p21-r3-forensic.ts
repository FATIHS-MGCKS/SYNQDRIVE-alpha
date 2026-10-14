#!/usr/bin/env ts-node
/**
 * EXP021 P2.1 R3 — one-trip forensic (read-only DB). Aggregates only; no GPS dumps.
 */
import { PrismaClient } from '@prisma/client';
import { verifyAndParseDiV0PinnedEvidenceSnapshot } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4d-replay/di-v0-s4d-verified-snapshot';
import { buildDiV0TripSpeedQualityEvidenceFromParsedContainer } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-trip-speed-quality-evidence';
import { buildDiV0TripSpeedQualityProjectionV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/build-di-v0-trip-speed-quality-projection.v1';
import { evaluateDiV0SpeedQcInterval } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/evaluate-di-v0-speed-qc-interval';
import { DI_V0_SPEED_QC_REASON } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-reason-codes';
import { bucketLabelMinusSeconds, bucketLabelPlusSeconds } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import { isValidGeoCoordinate } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-position-index';
import { CALIBRATION_UNSET_V0_BUNDLE } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/calibration/CALIBRATION_UNSET_V0';

const ORG = process.env.EXP021_P21_ORG_ID;
const TRIP = process.env.EXP021_P21_TRIP_ID;
const WI = process.env.EXP021_P21_WORK_ITEM_ID;

function req(name: string, v: string | undefined): string {
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

function dateToBucketLabel(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

type PosRow = {
  bucketLabel: string;
  availability: string;
  latitude: number | null;
  longitude: number | null;
  positionState: string;
};

function runLengthStats(labels: string[]): {
  segmentCount: number;
  longestRun: number;
  totalSeconds: number;
} {
  if (labels.length === 0) return { segmentCount: 0, longestRun: 0, totalSeconds: 0 };
  let segments = 1;
  let longest = 1;
  let cur = 1;
  for (let i = 1; i < labels.length; i += 1) {
    if (labels[i] === labels[i - 1]) {
      cur += 1;
      longest = Math.max(longest, cur);
    } else {
      segments += 1;
      cur = 1;
    }
  }
  return { segmentCount: segments, longestRun: longest, totalSeconds: labels.length };
}

function classifyNoNumericDisjoint(
  row: {
    motionState: string;
    positionState: string;
    speedEvidenceState: string | null;
    abstentionReason: string | null;
    referenceTime: Date;
  },
  posByLabel: Map<string, { availability: string; latitude?: number | null; longitude?: number | null; positionState: string }>,
): string {
  const center = dateToBucketLabel(row.referenceTime);
  const prev = bucketLabelMinusSeconds(center, 1);
  const next = bucketLabelPlusSeconds(center, 1);
  const pPrev = posByLabel.get(prev);
  const pCenter = posByLabel.get(center);
  const pNext = posByLabel.get(next);

  const availGap = [pPrev, pCenter, pNext].some(
    (p) => !p || p.availability === 'ROW_ABSENT' || p.availability === 'SIGNAL_NULL',
  );
  if (availGap) return 'ROW_ABSENT_OR_SIGNAL_NULL_GAP';

  const invalidGeo = [pPrev, pCenter, pNext].some(
    (p) =>
      p &&
      (p.latitude == null ||
        p.longitude == null ||
        !isValidGeoCoordinate(p.latitude, p.longitude)),
  );
  if (invalidGeo) return 'INVALID_POSITION_DATA';

  if (!pPrev || !pCenter || !pNext) return 'INCOMPLETE_SUPPORT_WINDOW_EDGES';

  const frozenRelease = [pPrev, pCenter, pNext].some((p) =>
    ['FROZEN_UNRESOLVED', 'FROZEN_MOVEMENT_SUPPORTED', 'FROZEN_STOP_SUPPORTED', 'RELEASE'].includes(
      p!.positionState,
    ),
  );
  if (frozenRelease || row.positionState === 'RELEASE') {
    return 'TRANSITION_RELEASE_OR_UNRESOLVED_HOLD';
  }

  if (
    row.motionState === 'STATIONARY_SUPPORTED' &&
    row.speedEvidenceState === 'STATIONARY_BAND' &&
    pCenter.availability === 'PRESENT'
  ) {
    return 'STATIONARY_WITH_FRESH_POSITIONS';
  }

  if (
    row.positionState === 'FROZEN_STOP_SUPPORTED' ||
    (row.motionState === 'STATIONARY_SUPPORTED' && row.speedEvidenceState === 'STATIONARY_BAND')
  ) {
    return 'STATIONARY_HOLD_GEOMETRY_INDICATOR';
  }

  if (row.motionState === 'MOVING_SPEED_UNKNOWN') {
    return 'MOVEMENT_DETECTED_SPEED_NOT_ESTIMABLE';
  }

  if (row.motionState === 'TRANSITION_UNCERTAIN' || row.positionState === 'FROZEN_UNRESOLVED') {
    return 'TRANSITION_RELEASE_OR_UNRESOLVED_HOLD';
  }

  if (row.abstentionReason != null) {
    return 'MOVEMENT_DETECTED_SPEED_NOT_ESTIMABLE';
  }

  return 'OTHER_EXPLAINED';
}

async function main(): Promise<void> {
  const organizationId = req('EXP021_P21_ORG_ID', ORG);
  const tripId = req('EXP021_P21_TRIP_ID', TRIP);
  const workItemId = req('EXP021_P21_WORK_ITEM_ID', WI);

  const prisma = new PrismaClient();
  try {
    const wiRows = await prisma.$queryRaw<
      Array<{
        id: string;
        status: string;
        shadow_run_id: string;
        pinned_snapshot_hash: string;
        boundary_fingerprint: string;
        source_family: string;
        vehicle_id: string;
      }>
    >`
      SELECT id, status, shadow_run_id, pinned_snapshot_hash, boundary_fingerprint,
        source_family::text AS source_family, vehicle_id
      FROM di_v0_s4_work_items
      WHERE id = ${workItemId} AND organization_id = ${organizationId} AND trip_id = ${tripId}`;

    const wi = wiRows[0];
    if (!wi?.pinned_snapshot_hash || !wi.shadow_run_id) {
      throw new Error('work item missing pin or shadow');
    }

    const snapRows = await prisma.$queryRaw<
      Array<{
        snapshot_hash: string;
        channel_manifest: unknown;
        payload_gzip: Buffer;
        uncompressed_bytes: number;
        acquisition_window_start: Date;
        acquisition_window_end: Date;
      }>
    >`
      SELECT snapshot_hash, channel_manifest, payload_gzip, uncompressed_bytes,
        acquisition_window_start, acquisition_window_end
      FROM di_v0_s4_evidence_snapshots
      WHERE organization_id = ${organizationId} AND trip_id = ${tripId}
        AND snapshot_hash = ${wi.pinned_snapshot_hash}
      LIMIT 1`;

    const snap = snapRows[0];
    if (!snap) throw new Error('snapshot row missing');

    const verified = verifyAndParseDiV0PinnedEvidenceSnapshot(
      {
        organization_id: organizationId,
        vehicle_id: wi.vehicle_id,
        trip_id: tripId,
        boundary_fingerprint: wi.boundary_fingerprint,
        acquisition_window_start: snap.acquisition_window_start,
        acquisition_window_end: snap.acquisition_window_end,
        channel_manifest: snap.channel_manifest,
        payload_gzip: snap.payload_gzip,
        uncompressed_bytes: snap.uncompressed_bytes,
      },
      {
        organizationId,
        vehicleId: wi.vehicle_id,
        tripId,
        boundaryFingerprint: wi.boundary_fingerprint,
        snapshotHash: wi.pinned_snapshot_hash,
        sourceFamily: wi.source_family as 'RUPTELA_R1',
      },
    );
    if (!verified.ok) throw new Error(`snapshot verify failed: ${verified.code}`);

    const evidence = buildDiV0TripSpeedQualityEvidenceFromParsedContainer(
      verified.parsed,
      CALIBRATION_UNSET_V0_BUNDLE,
    );
    const posByLabel = new Map(evidence.positions.map((p) => [p.bucketLabel, p]));

    const intervals = await prisma.$queryRaw<
      Array<{
        interval_start: Date;
        interval_end: Date;
        reference_time: Date;
        motion_state: string;
        position_state: string;
        estimated_speed_kmh: number | null;
        speed_evidence_state: string | null;
        value_confidence: string;
        source_relation: string;
        abstention_reason: string | null;
        evidence_sources: unknown;
        source_quality_flags: unknown;
      }>
    >`
      SELECT interval_start, interval_end, reference_time, motion_state, position_state,
        estimated_speed_kmh, speed_evidence_state, value_confidence, source_relation,
        abstention_reason, evidence_sources, source_quality_flags
      FROM di_v0_shadow_intervals
      WHERE organization_id = ${organizationId} AND trip_id = ${tripId}
        AND shadow_run_id = ${wi.shadow_run_id}
      ORDER BY reference_time ASC`;

    const shadowRows = intervals.map((r) => ({
      intervalStart: r.interval_start,
      intervalEnd: r.interval_end,
      referenceTime: r.reference_time,
      motionState: r.motion_state,
      positionState: r.position_state,
      estimatedSpeedKmh: r.estimated_speed_kmh,
      speedEvidenceState: r.speed_evidence_state,
      valueConfidence: r.value_confidence,
      sourceRelation: r.source_relation,
      abstentionReason: r.abstention_reason,
      evidenceSources: r.evidence_sources,
      sourceQualityFlags: r.source_quality_flags,
    }));

    const projection = buildDiV0TripSpeedQualityProjectionV1({
      organizationId,
      vehicleId: wi.vehicle_id,
      tripId,
      workItemId,
      shadowRunId: wi.shadow_run_id,
      pinnedSnapshotHash: wi.pinned_snapshot_hash,
      boundaryFingerprint: wi.boundary_fingerprint,
      sourceFamily: wi.source_family as 'RUPTELA_R1',
      combinedInputIdentity: null,
      shadowInputEvidenceVersion: null,
      workItemCompletedAt: null,
      snapshotVerified: true,
      evidence,
      shadowIntervals: shadowRows,
    });

    const noNumericRows = shadowRows.filter(
      (r) => r.estimatedSpeedKmh == null || !Number.isFinite(r.estimatedSpeedKmh),
    );
    const disjoint: Record<string, number> = {};
    for (const r of noNumericRows) {
      const g = classifyNoNumericDisjoint(r, posByLabel);
      disjoint[g] = (disjoint[g] ?? 0) + 1;
    }
    const disjointSegmentStats: Record<string, ReturnType<typeof runLengthStats>> = {};
    let i = 0;
    while (i < shadowRows.length) {
      const r = shadowRows[i];
      if (r.estimatedSpeedKmh != null && Number.isFinite(r.estimatedSpeedKmh)) {
        i += 1;
        continue;
      }
      const g = classifyNoNumericDisjoint(r, posByLabel);
      if (!disjointSegmentStats[g]) {
        disjointSegmentStats[g] = { segmentCount: 0, longestRun: 0, totalSeconds: 0 };
      }
      let j = i;
      while (
        j < shadowRows.length &&
        (shadowRows[j].estimatedSpeedKmh == null || !Number.isFinite(shadowRows[j].estimatedSpeedKmh)) &&
        classifyNoNumericDisjoint(shadowRows[j], posByLabel) === g
      ) {
        j += 1;
      }
      const runLen = j - i;
      const st = disjointSegmentStats[g];
      st.segmentCount += 1;
      st.longestRun = Math.max(st.longestRun, runLen);
      st.totalSeconds += runLen;
      i = j;
    }

    const motionBreakdown: Record<string, number> = {};
    const evidenceStateBreakdown: Record<string, number> = {};
    for (const r of noNumericRows) {
      motionBreakdown[r.motionState] = (motionBreakdown[r.motionState] ?? 0) + 1;
      const k = r.speedEvidenceState ?? 'NULL';
      evidenceStateBreakdown[k] = (evidenceStateBreakdown[k] ?? 0) + 1;
    }

    let qcCrossSourceConflictCount = 0;
    let shadowConflictMarkedNumeric = 0;
    let shadowConflictMarkedNonNumeric = 0;
    for (const r of shadowRows) {
      const marked =
        r.sourceRelation === 'CONFLICTING' || r.sourceRelation === 'CONFLICT_EXPLAINED';
      if (marked && r.estimatedSpeedKmh != null && Number.isFinite(r.estimatedSpeedKmh)) {
        shadowConflictMarkedNumeric += 1;
      } else if (marked) {
        shadowConflictMarkedNonNumeric += 1;
      }
      const center = dateToBucketLabel(r.referenceTime);
      const verdict = evaluateDiV0SpeedQcInterval({
        centerBucketLabel: center,
        shadow: {
          intervalStart: center,
          intervalEnd: center,
          referenceTime: center,
          estimatedSpeedKmh: r.estimatedSpeedKmh,
          speedEvidenceState: (r.speedEvidenceState ?? 'NONE') as 'NONE',
          valueConfidence: r.valueConfidence as 'HIGH',
          sourceRelation: r.sourceRelation as never,
          motionState: r.motionState as never,
          positionState: r.positionState as never,
          abstentionReason: r.abstentionReason,
          sourceQualityFlags: Array.isArray(r.sourceQualityFlags)
            ? r.sourceQualityFlags.map(String)
            : [],
          evidenceSources: [],
        },
        positions: evidence.positions,
        r1Obd: evidence.r1Obd,
        evidenceIdentity: { pinnedSnapshotHash: wi.pinned_snapshot_hash },
      });
      if (verdict.reasonCodes.includes(DI_V0_SPEED_QC_REASON.CROSS_SOURCE_CONFLICT)) {
        qcCrossSourceConflictCount += 1;
      }
    }

    const conflicts = shadowRows.filter(
      (r) => r.sourceRelation === 'CONFLICTING' || r.sourceRelation === 'CONFLICT_EXPLAINED',
    );
    const conflictDetails = conflicts.map((r) => {
      const center = dateToBucketLabel(r.referenceTime);
      const r1 = evidence.r1Obd.find((x) => x.bucketLabel === center)?.speedKmh ?? null;
      const l3 = r.estimatedSpeedKmh;
      return {
        referenceTime: center,
        motionState: r.motionState,
        l3Kmh: l3,
        r1Kmh: r1,
        deltaKmh: l3 != null && r1 != null ? Math.round((r1 - l3) * 100) / 100 : null,
        sourceRelation: r.sourceRelation,
      };
    });

    let postGapReachableHypothetical = 0;
    for (const r of shadowRows) {
      if (r.estimatedSpeedKmh == null) continue;
      const center = dateToBucketLabel(r.referenceTime);
      const verdict = evaluateDiV0SpeedQcInterval({
        centerBucketLabel: center,
        shadow: {
          intervalStart: center,
          intervalEnd: center,
          referenceTime: center,
          estimatedSpeedKmh: r.estimatedSpeedKmh,
          speedEvidenceState: (r.speedEvidenceState ?? 'NONE') as 'NONE',
          valueConfidence: r.valueConfidence as 'HIGH',
          sourceRelation: r.sourceRelation as never,
          motionState: r.motionState as never,
          positionState: r.positionState as never,
          abstentionReason: null,
          sourceQualityFlags: Array.isArray(r.sourceQualityFlags)
            ? r.sourceQualityFlags.map(String)
            : [],
          evidenceSources: [],
        },
        positions: evidence.positions,
        r1Obd: evidence.r1Obd,
        evidenceIdentity: { pinnedSnapshotHash: wi.pinned_snapshot_hash },
      });
      if (verdict.reasonCodes.includes(DI_V0_SPEED_QC_REASON.POST_GAP_REACQUIRE)) {
        postGapReachableHypothetical += 1;
      }
    }

    const stationaryMismatch =
      noNumericRows.filter(
        (r) =>
          r.motionState === 'STATIONARY_SUPPORTED' && r.speedEvidenceState === 'STATIONARY_BAND',
      ).length;

    const sumDisjoint = Object.values(disjoint).reduce((a, b) => a + b, 0);

    const out = {
      schema: 'EXP021_P21_R3_FORENSIC_V1',
      workItemStatus: wi.status,
      snapshotVerified: true,
      intervalCount: shadowRows.length,
      reproducedQuality: projection.quality,
      reproducedSpeed: {
        shadowRawMaxKmh: projection.speed.shadowRawMaxKmh,
        qcTrustedMaxKmh: projection.speed.qcTrustedMaxKmh,
      },
      noNumericTotal: noNumericRows.length,
      noNumericDisjointBreakdown: disjoint,
      noNumericDisjointSegmentStats: disjointSegmentStats,
      noNumericDisjointSum: sumDisjoint,
      noNumericMotionBreakdown: motionBreakdown,
      noNumericSpeedEvidenceStateBreakdown: evidenceStateBreakdown,
      stationaryQcContractMismatchCount: stationaryMismatch,
      sourceConflictTotal: conflicts.length,
      shadowConflictMarkedNumeric,
      shadowConflictMarkedNonNumeric,
      qcCrossSourceConflictCount,
      sourceConflictDetails: conflictDetails,
      postGapReachableOnNumericIntervals: postGapReachableHypothetical,
      positionBucketCount: evidence.positions.length,
      r1BucketCount: evidence.r1Obd.length,
      acquisitionWindow: {
        start: snap.acquisition_window_start.toISOString(),
        end: snap.acquisition_window_end.toISOString(),
      },
    };

    process.stdout.write(JSON.stringify(out, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
