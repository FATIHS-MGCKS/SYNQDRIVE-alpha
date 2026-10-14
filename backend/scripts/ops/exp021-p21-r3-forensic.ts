#!/usr/bin/env ts-node
/**
 * EXP021 P2.1 R3/R3A — one-trip forensic (read-only DB). Aggregates only; no GPS dumps.
 */
import { PrismaClient } from '@prisma/client';
import { buildP21R3ForensicReport } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-analyze';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import { evaluateDiV0SpeedQcInterval } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/evaluate-di-v0-speed-qc-interval';
import { DI_V0_SPEED_QC_REASON } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-reason-codes';
import { dateToBucketLabel } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-classify';

const ORG = process.env.EXP021_P21_ORG_ID;
const TRIP = process.env.EXP021_P21_TRIP_ID;
const WI = process.env.EXP021_P21_WORK_ITEM_ID;

function req(name: string, v: string | undefined): string {
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

async function main(): Promise<void> {
  const organizationId = req('EXP021_P21_ORG_ID', ORG);
  const tripId = req('EXP021_P21_TRIP_ID', TRIP);
  const workItemId = req('EXP021_P21_WORK_ITEM_ID', WI);

  const prisma = new PrismaClient();
  try {
    const ctx = await loadP21ForensicContextInReadOnlyTransaction(prisma, {
      organizationId,
      tripId,
      workItemId,
    });

    let qcCrossSourceConflictCount = 0;
    let shadowConflictMarkedNumeric = 0;
    let shadowConflictMarkedNonNumeric = 0;
    for (const r of ctx.shadowIntervals) {
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
        positions: ctx.evidence.positions,
        r1Obd: ctx.evidence.r1Obd,
        evidenceIdentity: { pinnedSnapshotHash: ctx.pinnedSnapshotHash },
      });
      if (verdict.reasonCodes.includes(DI_V0_SPEED_QC_REASON.CROSS_SOURCE_CONFLICT)) {
        qcCrossSourceConflictCount += 1;
      }
    }

    const report = buildP21R3ForensicReport({
      replayMode: ctx.replayMode,
      workItemStatus: ctx.workItem!.status,
      activePrimaryWorkItemId: ctx.activePrimaryWorkItemId,
      requestedWorkItemId: workItemId,
      shadowRun: ctx.shadowRun,
      acquisitionWindow: ctx.acquisitionWindow,
      evidence: ctx.evidence,
      shadowIntervals: ctx.shadowIntervals,
      projection: ctx.projection,
      pinnedSnapshotHash: ctx.pinnedSnapshotHash,
    });

    const out = {
      ...report,
      consistentReadOnlyTransaction: true,
      actualSnapshotMetadataVerified: true,
      shadowRunCalibrationVerified: true,
      qcCrossSourceConflictCount,
      shadowConflictMarkedNumeric,
      shadowConflictMarkedNonNumeric,
      vehicleId: ctx.workItem!.vehicle_id,
      boundaryFingerprint: ctx.workItem!.boundary_fingerprint,
      combinedInputIdentity: ctx.workItem!.combined_input_identity,
      workItemCompletedAt: ctx.workItem!.completed_at?.toISOString() ?? null,
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
