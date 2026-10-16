#!/usr/bin/env ts-node
/**
 * EXP021 POSITION_GAP root-cause forensics (read-only DB).
 * Run from /tmp — do not copy into /opt/synqdrive/current release tree.
 */
import * as fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { DI_V0_SPEED_QC_POLICY_V2 } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-policy.version';
import { DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-trip-speed-quality-projection.version';
import { buildDiV0TripSpeedQualityProjectionV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/build-di-v0-trip-speed-quality-projection.v1';
import { analyzePositionGapForensic } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-exp021-position-gap-forensic';
import {
  buildBucketIntervalAlignmentReport,
  countPinPositionStatesInWindow,
  EXP021_ROW_ABSENT_CREATION_RULE,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-exp021-bucket-interval-alignment';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import { evaluateExp021PersistedAggregateReplayMatch } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/exp021-persisted-aggregate-replay-match';
import { verifyAndParseDiV0PinnedEvidenceSnapshot } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4d-replay/di-v0-s4d-verified-snapshot';
import { parseDiV0PositionSnapshot } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-snapshot-parse';
import { DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-acquisition.versions';
import type { DiV0S4SourceFamily } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-trip-speed-quality-projection.types';

const ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';

/** Fixed before any per-case compute. */
export const EXP021_POSITION_GAP_FORENSIC_CASES_V1 = [
  {
    label: 'LONGEST_POSITION_GAP_RUN',
    tripId: '533b2bf8-fa07-4f0b-bc40-d540447a1542',
    workItemId: '339856c6-a4af-43f8-aecd-07baacec3d22',
    vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
    longestGapWindowInclusive: {
      start: '2026-10-14T14:55:43Z',
      end: '2026-10-14T15:21:52Z',
    },
  },
  {
    label: 'LONG_MIXED_UNASSESSABLE_RUN',
    tripId: '6bb3ddf2-48ca-4a9f-8d29-141f760f78e3',
    workItemId: '5d19a836-634e-4a67-9201-b2e54a3834e5',
    vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
    longestGapWindowInclusive: null,
  },
  {
    label: 'REFERENCE_LOW_GAP',
    tripId: '9ead317c-8725-4373-b9ac-8bb84d5549be',
    workItemId: 'f9a2801f-a623-48ee-9337-33fe5e6cc155',
    vehicleId: '8c850ff1-4201-432b-af2e-2711dbc7ca48',
    longestGapWindowInclusive: null,
  },
] as const;

async function loadPersistedRow(
  prisma: PrismaClient,
  organizationId: string,
  tripId: string,
  workItemId: string,
) {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      qc_policy_version: string;
      projection_version: string;
      lifecycle_status: string;
      created_at: Date;
      content_fingerprint: string;
      projection_json: unknown;
    }>
  >`
    SELECT id, qc_policy_version, projection_version, lifecycle_status, created_at, content_fingerprint, projection_json
    FROM di_v0_trip_speed_quality_projections_v1
    WHERE organization_id = ${organizationId}
      AND trip_id = ${tripId}
      AND work_item_id = ${workItemId}
      AND lifecycle_status = 'CURRENT'
      AND qc_policy_version = ${DI_V0_SPEED_QC_POLICY_V2}
      AND projection_version = ${DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1}
    LIMIT 1`;
  return rows[0] ?? null;
}

async function loadPositionChannelMetadata(
  prisma: PrismaClient,
  organizationId: string,
  tripId: string,
  pinnedSnapshotHash: string,
  sourceFamily: DiV0S4SourceFamily,
  boundaryFingerprint: string,
  vehicleId: string,
) {
  const snapshotRows = await prisma.$queryRaw<
    Array<{
      acquisition_window_start: Date;
      acquisition_window_end: Date;
      channel_manifest: unknown;
      payload_gzip: Buffer;
    }>
  >`
    SELECT acquisition_window_start, acquisition_window_end, channel_manifest, payload_gzip
    FROM di_v0_s4_evidence_snapshots
    WHERE organization_id = ${organizationId}
      AND trip_id = ${tripId}
      AND snapshot_hash = ${pinnedSnapshotHash}
    LIMIT 1`;
  const snapshot = snapshotRows[0];
  if (!snapshot) return null;
  const verified = verifyAndParseDiV0PinnedEvidenceSnapshot(
    {
      organization_id: organizationId,
      vehicle_id: vehicleId,
      trip_id: tripId,
      boundary_fingerprint: boundaryFingerprint,
      acquisition_window_start: snapshot.acquisition_window_start,
      acquisition_window_end: snapshot.acquisition_window_end,
      channel_manifest: snapshot.channel_manifest,
      payload_gzip: snapshot.payload_gzip,
      uncompressed_bytes: 0,
    },
    {
      organizationId,
      vehicleId,
      tripId,
      boundaryFingerprint,
      snapshotHash: pinnedSnapshotHash,
      sourceFamily,
    },
  );
  if (!verified.ok) return { error: verified.code };
  const positionEntry = verified.parsed.channelManifest.find((c) => c.channel === 'POSITION');
  if (positionEntry?.formatVersion !== DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1 || !verified.parsed.channelPayloads.POSITION) {
    return { positionChannel: positionEntry ?? null };
  }
  const material = parseDiV0PositionSnapshot(verified.parsed.channelPayloads.POSITION);
  let rowAbsent = 0;
  let present = 0;
  let signalNull = 0;
  for (const b of material.buckets) {
    if (b.availability === 'ROW_ABSENT') rowAbsent += 1;
    else if (b.availability === 'SIGNAL_NULL') signalNull += 1;
    else present += 1;
  }
  return {
    positionQuerySpec: material.window,
    providerSignalsNull: material.providerSignalsNull,
    rejectedProviderRowCount: material.rejectedProviderRows.length,
    bucketTotalsInPin: {
      expectedBuckets: material.buckets.length,
      rowAbsent,
      signalNull,
      presentOrOther: present,
    },
    rowAbsentCreationRule: EXP021_ROW_ABSENT_CREATION_RULE,
  };
}

async function main(): Promise<void> {
  const outPath = process.env.EXP021_POSITION_GAP_OUT ?? '/tmp/exp021-position-gap-forensic.json';
  const analysisSha = process.env.EXP021_ANALYSIS_GIT_SHA ?? 'unknown';
  const runtimeSha = process.env.EXP021_RUNTIME_GIT_SHA ?? 'unknown';
  const prisma = new PrismaClient();
  const cases: unknown[] = [];
  try {
    for (const c of EXP021_POSITION_GAP_FORENSIC_CASES_V1) {
      const ctx = await loadP21ForensicContextInReadOnlyTransaction(prisma, {
        organizationId: ORG,
        tripId: c.tripId,
        workItemId: c.workItemId,
      });
      const forensic = analyzePositionGapForensic({
        shadowIntervals: ctx.shadowIntervals,
        positions: ctx.evidence.positions,
        r1Obd: ctx.evidence.r1Obd,
        pinnedSnapshotHash: ctx.pinnedSnapshotHash,
        acquisitionWindow: ctx.acquisitionWindow,
      });
      const alignment = buildBucketIntervalAlignmentReport({
        shadowIntervals: ctx.shadowIntervals,
        positions: ctx.evidence.positions,
        r1Obd: ctx.evidence.r1Obd,
        pinnedSnapshotHash: ctx.pinnedSnapshotHash,
        acquisitionWindow: ctx.acquisitionWindow,
      });
      const replay = buildDiV0TripSpeedQualityProjectionV1({
        organizationId: ORG,
        vehicleId: c.vehicleId,
        tripId: c.tripId,
        workItemId: c.workItemId,
        shadowRunId: ctx.shadowRun.id,
        pinnedSnapshotHash: ctx.pinnedSnapshotHash,
        boundaryFingerprint: ctx.workItem!.boundary_fingerprint,
        sourceFamily: ctx.workItem!.source_family as never,
        combinedInputIdentity: ctx.workItem!.combined_input_identity,
        shadowInputEvidenceVersion: ctx.shadowRun.inputEvidenceVersion,
        workItemCompletedAt: ctx.workItem!.completed_at,
        snapshotVerified: true,
        evidence: ctx.evidence,
        shadowIntervals: ctx.shadowIntervals,
        qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
      });
      const persisted = await loadPersistedRow(prisma, ORG, c.tripId, c.workItemId);
      const persistedMatch = evaluateExp021PersistedAggregateReplayMatch({
        persisted,
        replay: {
          trustedNumericCoveragePercent: replay.quality.trustedNumericCoveragePercent,
          numericCoveragePercent: replay.quality.numericCoveragePercent,
          trustedLimitedStationaryCount: replay.quality.trustedLimitedStationaryCount,
          qcTrustedMaxKmh: replay.speed.qcTrustedMaxKmh,
        },
      });
      const positionPinMeta = await loadPositionChannelMetadata(
        prisma,
        ORG,
        c.tripId,
        ctx.pinnedSnapshotHash,
        ctx.workItem!.source_family as DiV0S4SourceFamily,
        ctx.workItem!.boundary_fingerprint,
        c.vehicleId,
      );
      const longestPinCounts =
        c.longestGapWindowInclusive != null
          ? countPinPositionStatesInWindow(
              ctx.evidence.positions,
              c.longestGapWindowInclusive.start,
              c.longestGapWindowInclusive.end,
              ctx.acquisitionWindow,
            )
          : null;

      cases.push({
        ...c,
        sourceFamilyS4: ctx.workItem!.source_family,
        pinnedSnapshotHash: ctx.pinnedSnapshotHash,
        shadowRunId: ctx.shadowRun.id,
        shadowInputEvidenceVersion: ctx.shadowRun.inputEvidenceVersion,
        acquisitionWindow: ctx.acquisitionWindow,
        intervalCount: ctx.shadowIntervals.length,
        positionGapForensic: forensic,
        bucketIntervalAlignment: {
          shadowGrid: alignment.shadowGrid,
          reconciliation: alignment.reconciliation,
          intervalUniqueness: alignment.intervalUniqueness,
          positionGapIntervalExports: alignment.positionGapIntervalExports,
        },
        positionPinChannel: positionPinMeta,
        longestGapWindowPinCounts: longestPinCounts,
        replayQuality: replay.quality,
        persistedAggregateReplayMatch: persistedMatch,
      });
    }
    const report = {
      kind: 'EXP021_POSITION_GAP_FORENSIC_V2',
      organizationId: ORG,
      executedRuntimeGitSha: runtimeSha,
      executedAnalysisGitSha: analysisSha,
      persistedMatchClaimCorrection: {
        analyzedTripsInCoverageSample: 20,
        withPersistedCurrentV2AggregateComparison: 2,
        note: 'Missing persisted row yields status N/A, never PASS.',
      },
      cases,
      dbMutations: 'NONE',
      releaseTreeModifications: 'NONE',
    };
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: true, outPath, caseCount: cases.length }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
