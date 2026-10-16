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
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';

const ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';

/** Fixed before any per-case compute. */
export const EXP021_POSITION_GAP_FORENSIC_CASES_V1 = [
  {
    label: 'LONGEST_POSITION_GAP_RUN',
    tripId: '533b2bf8-fa07-4f0b-bc40-d540447a1542',
    workItemId: '339856c6-a4af-43f8-aecd-07baacec3d22',
    vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
  },
  {
    label: 'LONG_MIXED_UNASSESSABLE_RUN',
    tripId: '6bb3ddf2-48ca-4a9f-8d29-141f760f78e3',
    workItemId: '5d19a836-634e-4a67-9201-b2e54a3834e5',
    vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
  },
  {
    label: 'REFERENCE_LOW_GAP',
    tripId: '9ead317c-8725-4373-b9ac-8bb84d5549be',
    workItemId: 'f9a2801f-a623-48ee-9337-33fe5e6cc155',
    vehicleId: '8c850ff1-4201-432b-af2e-2711dbc7ca48',
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
      const pq = (persisted?.projection_json as { quality?: Record<string, unknown> })?.quality;
      cases.push({
        ...c,
        sourceFamilyS4: ctx.workItem!.source_family,
        pinnedSnapshotHash: ctx.pinnedSnapshotHash,
        shadowRunId: ctx.shadowRun.id,
        shadowInputEvidenceVersion: ctx.shadowRun.inputEvidenceVersion,
        acquisitionWindow: ctx.acquisitionWindow,
        intervalCount: ctx.shadowIntervals.length,
        positionGapForensic: forensic,
        replayQuality: replay.quality,
        persistedCurrentV2: persisted
          ? {
              projectionId: persisted.id,
              qcPolicyVersion: persisted.qc_policy_version,
              projectionVersion: persisted.projection_version,
              lifecycleStatus: persisted.lifecycle_status,
              createdAtUtc: persisted.created_at.toISOString(),
              contentFingerprint: persisted.content_fingerprint,
              aggregateMatch: {
                trustedNumericCoveragePercent:
                  pq?.trustedNumericCoveragePercent === replay.quality.trustedNumericCoveragePercent,
                numericCoveragePercent: pq?.numericCoveragePercent === replay.quality.numericCoveragePercent,
              },
            }
          : null,
      });
    }
    const report = {
      kind: 'EXP021_POSITION_GAP_FORENSIC_V1',
      organizationId: ORG,
      executedRuntimeGitSha: runtimeSha,
      executedAnalysisGitSha: analysisSha,
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
