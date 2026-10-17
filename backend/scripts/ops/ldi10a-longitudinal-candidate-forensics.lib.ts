/**
 * LDI-10A — longitudinal candidate forensics (offline LDI-08/09).
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DI_V0_SPEED_QC_CALIBRATION_PROVISIONAL_V1 as CAL } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-calibration';
import { buildL3AccelDecelCandidates } from './ldi08-r1-fusion-replay.lib';
import { LDI08_EXPECTED_PINNED_HASH, LDI08_TRIP_ID, LDI08_VEHICLE_ID } from './ldi08-r1-fusion-replay.lib';
import type { Ldi03CombinedRow } from './ldi03-ruptela-combined-pin.lib';
import {
  analyzeAccelDecelForensics,
  computeCoverageIntegrity,
  loadLdi08Artifacts,
  type Ldi08Row,
} from './ldi09-accel-decel-signal-forensics.lib';

export { LDI08_TRIP_ID, LDI08_VEHICLE_ID, LDI08_EXPECTED_PINNED_HASH };

export function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function verifyArtifactProvenance(repoRoot: string) {
  const base8 = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-08');
  const base9 = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-09');
  const snapPath = path.join(base8, 'LDI08_COMBINED_SNAPSHOT.json');
  const candPath = path.join(base8, 'LDI08_ACCEL_DECEL_CANDIDATES.json');
  const forensicsPath = path.join(base9, 'LDI09_ACCEL_DECEL_FORENSICS.json');

  const snapRaw = JSON.parse(fs.readFileSync(snapPath, 'utf8')) as Record<string, unknown>;
  const pinned = String(snapRaw.pinnedSnapshotHash ?? '');
  const recomputed = buildL3AccelDecelCandidates(snapRaw.rows as Ldi03CombinedRow[]);
  const frozen = JSON.parse(fs.readFileSync(candPath, 'utf8')) as {
    candidates: Array<{ id: string; kind: string; startUtc: string; endUtc: string; deltaKmh: number }>;
  };

  const match =
    recomputed.length === frozen.candidates.length &&
    recomputed.every((r, i) => {
      const f = frozen.candidates[i];
      return (
        r.kind === f.kind &&
        r.startUtc === f.startUtc &&
        r.endUtc === f.endUtc &&
        Math.abs(r.deltaKmh - f.deltaKmh) < 1e-6
      );
    });

  return {
    ldi08CombinedSnapshotSha256: sha256File(snapPath),
    ldi08AccelDecelCandidatesSha256: sha256File(candPath),
    ldi09ForensicsSha256: fs.existsSync(forensicsPath) ? sha256File(forensicsPath) : null,
    pinnedSnapshotHash: pinned,
    pinHashMatchesLdi06Expected: pinned === LDI08_EXPECTED_PINNED_HASH,
    schema: snapRaw.schema,
    exportMode: snapRaw.exportMode,
    rowCount: snapRaw.rowCount,
    reproducibility: {
      recomputedCandidateCount: recomputed.length,
      frozenCandidateCount: frozen.candidates.length,
      recomputedAccel: recomputed.filter((c) => c.kind === 'ACCELERATION').length,
      recomputedDecel: recomputed.filter((c) => c.kind === 'DECELERATION').length,
      byteIdenticalSequence: match,
    },
  };
}

function corroborationBand(l3Kmh: number): number {
  return Math.max(CAL.r1CorroborationAbsKmh, l3Kmh * CAL.r1CorroborationRelPct);
}

function obdCorroboratesL3(l3: number | null, obd: number | null): boolean {
  if (l3 == null || obd == null || !Number.isFinite(l3) || !Number.isFinite(obd)) return false;
  return Math.abs(obd - l3) <= corroborationBand(l3);
}

export type CandidateAuditRow = {
  candidateId: string;
  kind: 'ACCELERATION' | 'DECELERATION';
  startUtc: string;
  endUtc: string;
  sourceBuckets: { before: string; after: string };
  speedBeforeKmh: number;
  speedAfterKmh: number;
  deltaVKmh: number;
  deltaTMs: number;
  accelMs2: number | null;
  qcClassStart: string;
  qcClassEnd: string;
  confidenceTier: string;
  confidenceRationale: string[];
  hfAvailableStart: boolean;
  hfAvailableEnd: boolean;
  obdAvailableStart: boolean;
  obdAvailableEnd: boolean;
  obdCorroboratedBothEnds: boolean;
  hfCorroboratedBothEnds: boolean;
  crossSourceNote: string;
  temporalOffsetObdStartMs: number | null;
  temporalOffsetObdEndMs: number | null;
  conflictAtStart: boolean;
  conflictAtEnd: boolean;
  gpsJumpSuspected: boolean;
  quantizedObdOrHf: boolean;
  unrealisticAccelSpike: boolean;
  decelerationNotBrakePedal: true;
  decelerationNotRegen: true;
};

export function buildCandidateAuditTable(
  rows: Ldi08Row[],
  forensicsCandidates: ReturnType<typeof analyzeAccelDecelForensics>['candidates'],
): CandidateAuditRow[] {
  const byIndex = new Map(rows.map((r) => [r.evaluationIndexUtc, r]));

  return forensicsCandidates.map((c) => {
    const start = byIndex.get(c.startUtc);
    const end = byIndex.get(c.endUtc);
    const conflictAtStart =
      start?.l3.speedKmh != null &&
      start?.obd.speedKmh != null &&
      Math.abs(start.obd.speedKmh - start.l3.speedKmh) >= Math.max(5, start.l3.speedKmh * 0.25);
    const conflictAtEnd =
      end?.l3.speedKmh != null &&
      end?.obd.speedKmh != null &&
      Math.abs(end.obd.speedKmh - end.l3.speedKmh) >= Math.max(5, end.l3.speedKmh * 0.25);

    const obdCorr =
      obdCorroboratesL3(start?.l3.speedKmh ?? null, start?.obd.speedKmh ?? null) &&
      obdCorroboratesL3(end?.l3.speedKmh ?? null, end?.obd.speedKmh ?? null);
    const hfCorr =
      obdCorroboratesL3(start?.l3.speedKmh ?? null, start?.hf.speedKmh ?? null) &&
      obdCorroboratesL3(end?.l3.speedKmh ?? null, end?.hf.speedKmh ?? null);

    const quantized =
      [start?.obd.speedKmh, end?.obd.speedKmh, start?.hf.speedKmh, end?.hf.speedKmh].some(
        (v) => v != null && Number.isInteger(v),
      ) ?? false;

    const a = c.kinematics.longitudinalAccelMs2;
    const unrealistic = a != null && Math.abs(a) > 6;

    let crossSource = 'L3_PRIMARY_ONLY';
    if (obdCorr && hfCorr) crossSource = 'OBD_AND_HF_SPEED_AGREE_L3_BOTH_ENDS_shared_DIMO_lineage';
    else if (obdCorr) crossSource = 'OBD_WITNESS_BOTH_ENDS_not_independent_provider';
    else if (hfCorr) crossSource = 'HF_WITNESS_BOTH_ENDS_not_independent_provider';

    return {
      candidateId: c.id,
      kind: c.kind,
      startUtc: c.startUtc,
      endUtc: c.endUtc,
      sourceBuckets: { before: c.startUtc, after: c.endUtc },
      speedBeforeKmh: c.speedStartKmh,
      speedAfterKmh: c.speedEndKmh,
      deltaVKmh: c.deltaKmh,
      deltaTMs: c.kinematics.deltaTMs,
      accelMs2: a,
      qcClassStart: c.qcTrustStart,
      qcClassEnd: c.qcTrustEnd,
      confidenceTier: c.confidenceTier,
      confidenceRationale: c.confidenceRationale,
      hfAvailableStart: start?.hf.speedKmh != null,
      hfAvailableEnd: end?.hf.speedKmh != null,
      obdAvailableStart: start?.obd.speedKmh != null,
      obdAvailableEnd: end?.obd.speedKmh != null,
      obdCorroboratedBothEnds: obdCorr,
      hfCorroboratedBothEnds: hfCorr,
      crossSourceNote: crossSource,
      temporalOffsetObdStartMs:
        start?.obd.originalBucketLabelUtc != null
          ? Date.parse(start.obd.originalBucketLabelUtc) - Date.parse(c.startUtc)
          : null,
      temporalOffsetObdEndMs:
        end?.obd.originalBucketLabelUtc != null
          ? Date.parse(end.obd.originalBucketLabelUtc) - Date.parse(c.endUtc)
          : null,
      conflictAtStart: Boolean(conflictAtStart),
      conflictAtEnd: Boolean(conflictAtEnd),
      gpsJumpSuspected: c.gpsJumpScreening.suspected,
      quantizedObdOrHf: quantized,
      unrealisticAccelSpike: unrealistic,
      decelerationNotBrakePedal: true,
      decelerationNotRegen: true,
    };
  });
}

export function groupManeuvers(
  candidates: Array<{ id: string; kind: string; startUtc: string; endUtc: string }>,
): {
  independentCandidateCount: number;
  groupedManeuverCount: number;
  groups: Array<{ groupId: string; kind: string; candidateIds: string[]; startUtc: string; endUtc: string }>;
} {
  const byKind = new Map<string, typeof candidates>();
  for (const c of candidates) {
    const list = byKind.get(c.kind) ?? [];
    list.push(c);
    byKind.set(c.kind, list);
  }

  const groups: Array<{ groupId: string; kind: string; candidateIds: string[]; startUtc: string; endUtc: string }> =
    [];

  for (const [kind, list] of byKind) {
    const sorted = [...list].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
    let current: string[] = [];
    let groupStart = '';
    let groupEnd = '';
    for (const c of sorted) {
      if (current.length === 0) {
        current = [c.id];
        groupStart = c.startUtc;
        groupEnd = c.endUtc;
      } else if (c.startUtc === groupEnd) {
        current.push(c.id);
        groupEnd = c.endUtc;
      } else {
        groups.push({
          groupId: `MANEUVER_${kind}_${groups.length + 1}`,
          kind,
          candidateIds: current,
          startUtc: groupStart,
          endUtc: groupEnd,
        });
        current = [c.id];
        groupStart = c.startUtc;
        groupEnd = c.endUtc;
      }
    }
    if (current.length) {
      groups.push({
        groupId: `MANEUVER_${kind}_${groups.length + 1}`,
        kind,
        candidateIds: current,
        startUtc: groupStart,
        endUtc: groupEnd,
      });
    }
  }

  return {
    independentCandidateCount: candidates.length,
    groupedManeuverCount: groups.length,
    groups,
  };
}

export function loadLdi09Conflicts(repoRoot: string): Record<string, unknown> {
  const p = path.join(
    repoRoot,
    'architecture/drivingintelligence/evidence/ldi-09/LDI09_CONFLICT_CLASSIFICATION.json',
  );
  return JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
}

export function runLdi10aAudit(repoRoot: string) {
  const provenance = verifyArtifactProvenance(repoRoot);
  const { snapshot, candidates: frozenCandidates } = loadLdi08Artifacts(repoRoot);
  const rows = snapshot.rows;
  const coverage = computeCoverageIntegrity(rows);
  const forensics = analyzeAccelDecelForensics(rows, frozenCandidates);
  const auditTable = buildCandidateAuditTable(rows, forensics.candidates);
  const maneuver = groupManeuvers(frozenCandidates);
  const conflicts = loadLdi09Conflicts(repoRoot);

  const tierCounts = {
    HIGH_CONFIDENCE: auditTable.filter((r) => r.confidenceTier === 'HIGH_CONFIDENCE').length,
    LIMITED: auditTable.filter((r) => r.confidenceTier === 'LIMITED').length,
    CONFLICTED: auditTable.filter((r) => r.confidenceTier === 'CONFLICTED').length,
    UNKNOWN: auditTable.filter((r) => r.confidenceTier === 'UNKNOWN').length,
  };

  const l3Only = auditTable.filter((r) => r.crossSourceNote === 'L3_PRIMARY_ONLY').length;
  const obdWitness = auditTable.filter((r) => r.obdCorroboratedBothEnds).length;
  const hfWitness = auditTable.filter((r) => r.hfCorroboratedBothEnds).length;

  const highAccel = auditTable.filter((r) => r.kind === 'ACCELERATION' && r.confidenceTier === 'HIGH_CONFIDENCE');
  const highDecel = auditTable.filter((r) => r.kind === 'DECELERATION' && r.confidenceTier === 'HIGH_CONFIDENCE');

  return {
    provenance,
    coverage,
    forensicsSummary: {
      accelerationCount: forensics.accelerationCount,
      decelerationCount: forensics.decelerationCount,
      highConfidenceAcceleration: forensics.highConfidenceAcceleration,
      highConfidenceDeceleration: forensics.highConfidenceDeceleration,
    },
    candidateAudit: auditTable,
    maneuver,
    conflicts,
    analytics: {
      tierCounts,
      crossSource: { l3PrimaryOnly: l3Only, obdWitnessBothEnds: obdWitness, hfWitnessBothEnds: hfWitness },
      gpsJumpFlagged: auditTable.filter((r) => r.gpsJumpSuspected).length,
      unrealisticAccelSpike: auditTable.filter((r) => r.unrealisticAccelSpike).length,
      highConfidenceAccelReview: {
        count: highAccel.length,
        notIndependentGroundTruth: true,
        obdCorroborated: highAccel.filter((r) => r.obdCorroboratedBothEnds).length,
        l3Only: highAccel.filter((r) => r.crossSourceNote === 'L3_PRIMARY_ONLY').length,
      },
      highConfidenceDecelReview: {
        count: highDecel.length,
        notBrakePedalConfirmed: true,
        obdCorroborated: highDecel.filter((r) => r.obdCorroboratedBothEnds).length,
        l3Only: highDecel.filter((r) => r.crossSourceNote === 'L3_PRIMARY_ONLY').length,
      },
    },
  };
}
