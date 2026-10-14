#!/usr/bin/env ts-node
/**
 * EXP021 P2.1 — V1 vs V2 speed QC on one pinned trip (read-only DB, in-memory only).
 */
import { PrismaClient } from '@prisma/client';
import { DI_V0_SPEED_QC_POLICY_V1, DI_V0_SPEED_QC_POLICY_V2 } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-policy.version';
import { evaluateDiV0SpeedQcInterval } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/evaluate-di-v0-speed-qc-interval';
import { buildDiV0TripSpeedQualityProjectionV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/build-di-v0-trip-speed-quality-projection.v1';
import { dateToBucketLabel } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-classify';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import type { DiV0TripSpeedQualityShadowRow } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/build-di-v0-trip-speed-quality-projection.v1';

const ORG = process.env.EXP021_P21_ORG_ID;
const TRIP = process.env.EXP021_P21_TRIP_ID;
const WI = process.env.EXP021_P21_WORK_ITEM_ID;

function req(name: string, v: string | undefined): string {
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

function shadowToQc(row: DiV0TripSpeedQualityShadowRow, center: string) {
  return {
    intervalStart: center,
    intervalEnd: center,
    referenceTime: center,
    estimatedSpeedKmh: row.estimatedSpeedKmh,
    speedEvidenceState: (row.speedEvidenceState ?? 'NONE') as 'NONE',
    valueConfidence: row.valueConfidence as 'HIGH',
    sourceRelation: row.sourceRelation as never,
    motionState: row.motionState as never,
    positionState: row.positionState as never,
    abstentionReason: row.abstentionReason as never,
    sourceQualityFlags: Array.isArray(row.sourceQualityFlags) ? row.sourceQualityFlags.map(String) : [],
    evidenceSources: [],
  };
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

    const buildInput = () => ({
      organizationId: ctx.workItem!.organization_id,
      vehicleId: ctx.workItem!.vehicle_id,
      tripId: ctx.workItem!.trip_id,
      workItemId: ctx.workItem!.id,
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
    });

    const projectionV1 = buildDiV0TripSpeedQualityProjectionV1(buildInput());
    const projectionV2 = buildDiV0TripSpeedQualityProjectionV1({
      ...buildInput(),
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
    });

    const stationaryCandidates: Array<Record<string, unknown>> = [];
    const changedOutsideStationary: Array<Record<string, unknown>> = [];

    for (const row of ctx.shadowIntervals) {
      const center = dateToBucketLabel(row.referenceTime);
      const isCandidate =
        row.motionState === 'STATIONARY_SUPPORTED' && row.speedEvidenceState === 'STATIONARY_BAND';
      const v1 = evaluateDiV0SpeedQcInterval({
        centerBucketLabel: center,
        shadow: shadowToQc(row, center),
        positions: ctx.evidence.positions,
        r1Obd: ctx.evidence.r1Obd,
        evidenceIdentity: { pinnedSnapshotHash: ctx.pinnedSnapshotHash },
        qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V1,
      });
      const v2 = evaluateDiV0SpeedQcInterval({
        centerBucketLabel: center,
        shadow: shadowToQc(row, center),
        positions: ctx.evidence.positions,
        r1Obd: ctx.evidence.r1Obd,
        evidenceIdentity: { pinnedSnapshotHash: ctx.pinnedSnapshotHash },
        qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
      });
      const changed =
        v1.trustLevel !== v2.trustLevel ||
        v1.qcTrustedSpeedKmh !== v2.qcTrustedSpeedKmh ||
        JSON.stringify(v1.reasonCodes) !== JSON.stringify(v2.reasonCodes);
      if (isCandidate) {
        stationaryCandidates.push({
          referenceTime: center,
          v1Trust: v1.trustLevel,
          v1Reasons: v1.reasonCodes,
          v2Trust: v2.trustLevel,
          v2Reasons: v2.reasonCodes,
          positionState: row.positionState,
          acceptedV2: v2.reasonCodes.includes('OK_STATIONARY_NULL_SPEED'),
        });
      } else if (changed) {
        changedOutsideStationary.push({
          referenceTime: center,
          motionState: row.motionState,
          v1Reasons: v1.reasonCodes,
          v2Reasons: v2.reasonCodes,
        });
      }
    }

    const withheldReasons: Record<string, number> = {};
    let accepted = 0;
    let withheld = 0;
    for (const s of stationaryCandidates) {
      if (s.acceptedV2) accepted += 1;
      else {
        withheld += 1;
        const primary = (s.v2Reasons as string[])[0] ?? 'UNKNOWN';
        withheldReasons[primary] = (withheldReasons[primary] ?? 0) + 1;
      }
    }

    const out = {
      schema: 'EXP021_P21_P1_V2_POLICY_COMPARE_V1',
      diagnosisBaseSha: process.env.EXP021_DIAGNOSIS_BASE_SHA ?? null,
      executionMode: 'LIVE_READONLY_DB',
      dbSession: {
        transactionReadOnly: ctx.dbTransactionReadOnly,
        transactionIsolation: ctx.dbTransactionIsolation,
      },
      projectionV1: {
        qcPolicyVersion: projectionV1.identity.qcPolicyVersion,
        quality: projectionV1.quality,
        shadowRawMaxKmh: projectionV1.speed.shadowRawMaxKmh,
        qcTrustedMaxKmh: projectionV1.speed.qcTrustedMaxKmh,
        qcTrustedMeanKmh: projectionV1.speed.qcTrustedMeanKmh,
      },
      projectionV2: {
        qcPolicyVersion: projectionV2.identity.qcPolicyVersion,
        quality: projectionV2.quality,
        shadowRawMaxKmh: projectionV2.speed.shadowRawMaxKmh,
        qcTrustedMaxKmh: projectionV2.speed.qcTrustedMaxKmh,
        qcTrustedMeanKmh: projectionV2.speed.qcTrustedMeanKmh,
      },
      stationaryCandidatesTotal: stationaryCandidates.length,
      v2StationaryAccepted: accepted,
      v2StationaryWithheld: withheld,
      withheldReasonBreakdown: withheldReasons,
      changedIntervalsOutsideStationaryCandidates: changedOutsideStationary.length,
      changedOutsideStationarySample: changedOutsideStationary.slice(0, 10),
      stationaryCandidateSample: stationaryCandidates.slice(0, 5),
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
