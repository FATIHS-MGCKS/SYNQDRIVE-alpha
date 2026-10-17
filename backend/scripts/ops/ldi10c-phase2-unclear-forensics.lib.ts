/**
 * LDI-10C Phase 2 — UNCLEAR maneuver forensics (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import { LDI08_TRIP_ID, LDI08_VEHICLE_ID } from './ldi08-r1-fusion-replay.lib';
import {
  runLdi10aAudit,
  sha256File,
  type CandidateAuditRow,
  verifyArtifactProvenance,
} from './ldi10a-longitudinal-candidate-forensics.lib';
import {
  analyzeAccelDecelForensics,
  loadLdi08Artifacts,
  type Ldi08Row,
} from './ldi09-accel-decel-signal-forensics.lib';
import {
  bearingDeg,
  bucketMs,
  loadLdi10bGroups,
  matchManeuverTrajectory,
  rowsInInclusiveWindow,
  type Ldi10bGroup,
  verifyLdi10cProvenance,
} from './ldi10c-spatial-trip-reconstruction.lib';

export type UncertaintyClass =
  | 'DATA_GAP'
  | 'GPS_QC_FAILURE'
  | 'TEMPORAL_ALIGNMENT'
  | 'SIGNAL_CONFLICT'
  | 'SEGMENTATION_ARTIFACT'
  | 'MULTIPLE_CAUSES'
  | 'UNRESOLVED';

export function verifyPhase2Provenance(repoRoot: string) {
  const base8 = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-08');
  const base9 = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-09');
  const base10 = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10');
  const base10c = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10c');

  const files = {
    ldi08Snapshot: path.join(base8, 'LDI08_COMBINED_SNAPSHOT.json'),
    ldi08Candidates: path.join(base8, 'LDI08_ACCEL_DECEL_CANDIDATES.json'),
    ldi09Forensics: path.join(base9, 'LDI09_ACCEL_DECEL_FORENSICS.json'),
    ldi09Conflict: path.join(base9, 'LDI09_CONFLICT_CLASSIFICATION.json'),
    ldi10aAudit: path.join(base10, 'LDI10A_CANDIDATE_AUDIT.json'),
    ldi10bPhysics: path.join(base10, 'LDI10B_MANEUVER_PHYSICS.json'),
    ldi10cTimeline: path.join(base10c, 'LDI10C_MANEUVER_TIMELINE.json'),
    ldi10cRoute: path.join(base10c, 'LDI10C_ROUTE.geojson'),
  };

  const hashes: Record<string, string | null> = {};
  const errors: string[] = [];
  for (const [k, p] of Object.entries(files)) {
    if (!fs.existsSync(p)) {
      errors.push(`Missing ${k}: ${p}`);
      hashes[k] = null;
    } else {
      hashes[k] = sha256File(p);
    }
  }

  const phase1 = verifyLdi10cProvenance(repoRoot);
  if (!phase1.ok) errors.push(...phase1.errors);

  const prov10a = verifyArtifactProvenance(repoRoot);
  if (!prov10a.reproducibility.byteIdenticalSequence) {
    errors.push('LDI08 candidate sequence reproducibility FAIL');
  }

  const physics = JSON.parse(fs.readFileSync(files.ldi10bPhysics, 'utf8')) as {
    groups: Ldi10bGroup[];
    reproduction: { candidateCount: number; groupCount: number };
  };
  if (physics.reproduction.groupCount !== 32) errors.push('groupCount != 32');
  if (physics.reproduction.candidateCount !== 75) errors.push('candidateCount != 75');

  const timeline = fs.existsSync(files.ldi10cTimeline)
    ? (JSON.parse(fs.readFileSync(files.ldi10cTimeline, 'utf8')) as { maneuvers: unknown[] })
    : null;
  if (timeline && timeline.maneuvers.length !== 32) errors.push('LDI10C timeline maneuver count != 32');

  return {
    ok: errors.length === 0,
    errors,
    hashes,
    pinnedSnapshotHash: prov10a.pinnedSnapshotHash,
    ldi08SnapshotSha256: prov10a.ldi08CombinedSnapshotSha256,
  };
}

function headingDeltaDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function impliedPathSpeedKmh(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  deltaMs: number,
): number | null {
  if (deltaMs <= 0) return null;
  const m = haversineMeters(lat1, lon1, lat2, lon2);
  return (m / (deltaMs / 1000)) * 3.6;
}

export function buildSecondBySecondWindow(
  rows: Ldi08Row[],
  startUtc: string,
  endUtc: string,
): Array<{
  evaluationIndexUtc: string;
  gps: {
    availability: string;
    latitude: number | null;
    longitude: number | null;
    missingReason: string | null;
  };
  l3: { speedKmh: number | null; qcTrustLevel: string; qcReasonCodes: string[] };
  obd: { speedKmh: number | null; originalBucketLabelUtc: string | null };
  hf: { speedKmh: number | null; originalBucketLabelUtc: string | null };
  bearingFromPrevDeg: number | null;
  headingChangeFromPrevDeg: number | null;
  gpsJumpScreen: { suspected: boolean; impliedPathSpeedKmh: number | null; l3SpeedKmh: number | null };
  nativeEvents: unknown[];
}> {
  const windowRows = rowsInInclusiveWindow(rows, startUtc, endUtc);
  const out: Array<ReturnType<typeof buildSecondBySecondWindow>[number]> = [];
  let prevGps: { lat: number; lon: number; utc: string } | null = null;
  let prevBearing: number | null = null;

  for (const r of windowRows) {
    const lat = r.gps.latitude;
    const lon = r.gps.longitude;
    let bearingFromPrev: number | null = null;
    let headingChange: number | null = null;
    if (prevGps && lat != null && lon != null) {
      bearingFromPrev = bearingDeg(prevGps.lat, prevGps.lon, lat, lon);
      if (prevBearing != null) headingChange = headingDeltaDeg(prevBearing, bearingFromPrev);
      prevBearing = bearingFromPrev;
    }
    if (lat != null && lon != null) prevGps = { lat, lon, utc: r.evaluationIndexUtc };

    let jumpSuspected = false;
    let implied: number | null = null;
    if (prevGps && lat != null && lon != null && prevGps.utc !== r.evaluationIndexUtc) {
      const dt = bucketMs(r.evaluationIndexUtc) - bucketMs(prevGps.utc);
      implied = impliedPathSpeedKmh(prevGps.lat, prevGps.lon, lat, lon, dt);
      const l3 = r.l3.speedKmh;
      if (implied != null && l3 != null && (implied > l3 * 2.5 + 20 || implied < 0)) jumpSuspected = true;
    }

    out.push({
      evaluationIndexUtc: r.evaluationIndexUtc,
      gps: {
        availability: String(r.gps.availability ?? 'UNKNOWN'),
        latitude: lat ?? null,
        longitude: lon ?? null,
        missingReason: (r.gps as { missingReason?: string }).missingReason ?? null,
      },
      l3: {
        speedKmh: r.l3.speedKmh,
        qcTrustLevel: r.l3.qcTrustLevel,
        qcReasonCodes: r.l3.qcReasonCodes ?? [],
      },
      obd: {
        speedKmh: r.obd.speedKmh,
        originalBucketLabelUtc: r.obd.originalBucketLabelUtc ?? null,
      },
      hf: {
        speedKmh: r.hf.speedKmh,
        originalBucketLabelUtc: r.hf.originalBucketLabelUtc ?? null,
      },
      bearingFromPrevDeg: bearingFromPrev,
      headingChangeFromPrevDeg: headingChange,
      gpsJumpScreen: {
        suspected: jumpSuspected,
        impliedPathSpeedKmh: implied,
        l3SpeedKmh: r.l3.speedKmh,
      },
      nativeEvents: (r.nativeEventsAtIndex as unknown[]) ?? [],
    });
  }
  return out;
}

export function classifyUncertainties(input: {
  group: Ldi10bGroup;
  candidates: CandidateAuditRow[];
  secondBySecond: ReturnType<typeof buildSecondBySecondWindow>;
  adjacentSameKindGap0: boolean;
}): { classes: UncertaintyClass[]; evidence: string[] } {
  const classes = new Set<UncertaintyClass>();
  const evidence: string[] = [];

  const rowAbsent = input.group.qcInWindow.rowAbsentGps;
  const untrusted = input.group.qcInWindow.untrusted;
  if (rowAbsent > 0) {
    classes.add('DATA_GAP');
    evidence.push(`${rowAbsent} ROW_ABSENT GPS bucket(s) in maneuver window (LDI10B qcInWindow)`);
  }
  if (untrusted > 0) {
    classes.add('GPS_QC_FAILURE');
    evidence.push(`${untrusted} UNTRUSTED L3 QC bucket(s) with GPS present in window`);
  }

  const conflicted = input.candidates.filter((c) => c.confidenceTier === 'CONFLICTED');
  if (conflicted.length > 0) {
    classes.add('SIGNAL_CONFLICT');
    evidence.push(
      `CONFLICTED candidate steps: ${conflicted.map((c) => c.candidateId).join(', ')} (L3 vs OBD threshold LDI-10A)`,
    );
  }
  const temporalOffsets = input.candidates.flatMap((c) =>
    [c.temporalOffsetObdStartMs, c.temporalOffsetObdEndMs].filter((v) => v != null && v !== 0) as number[],
  );
  if (temporalOffsets.length > 0) {
    classes.add('TEMPORAL_ALIGNMENT');
    evidence.push(`Non-zero OBD bucket label offsets (ms): ${temporalOffsets.join(', ')}`);
  }

  const jumps = input.candidates.filter((c) => c.gpsJumpSuspected);
  if (jumps.length > 0) {
    classes.add('GPS_QC_FAILURE');
    evidence.push(`GPS jump suspected on candidate step(s): ${jumps.map((c) => c.candidateId).join(', ')}`);
  }
  const bucketJumps = input.secondBySecond.filter((s) => s.gpsJumpScreen.suspected);
  if (bucketJumps.length > 0) {
    classes.add('GPS_QC_FAILURE');
    evidence.push(`In-window path/L3 inconsistency flags at: ${bucketJumps.map((s) => s.evaluationIndexUtc).join(', ')}`);
  }

  const oversplit = (input.group as Ldi10bGroup & { integrityFlags?: { oversplitRisk?: boolean } }).integrityFlags
    ?.oversplitRisk;
  if (oversplit || input.adjacentSameKindGap0) {
    classes.add('SEGMENTATION_ARTIFACT');
    if (input.adjacentSameKindGap0) evidence.push('Zero-gap adjacent same-kind group — possible continuous maneuver split');
  }

  const quantized = input.candidates.filter((c) => c.quantizedObdOrHf);
  if (quantized.length > 0) {
    evidence.push(`Integer-quantized OBD/HF at step(s): ${quantized.map((c) => c.candidateId).join(', ')} (artifact screen)`);
  }

  let finalClasses: UncertaintyClass[];
  if (classes.size === 0) finalClasses = ['UNRESOLVED'];
  else if (classes.size > 1) finalClasses = ['MULTIPLE_CAUSES', ...Array.from(classes)];
  else finalClasses = Array.from(classes);

  return { classes: finalClasses, evidence };
}

export function evaluateContinuousManeuverHypothesis(
  group: Ldi10bGroup,
  prev: Ldi10bGroup | null,
  next: Ldi10bGroup | null,
): {
  couldBeContinuousWithPrevious: boolean;
  couldBeContinuousWithNext: boolean;
  note: string;
  groupingUnchanged: true;
} {
  const gapPrev = prev ? bucketMs(group.windowUtc.start) - bucketMs(prev.windowUtc.end) : null;
  const gapNext = next ? bucketMs(next.windowUtc.start) - bucketMs(group.windowUtc.end) : null;
  const withPrev = prev != null && prev.kind === group.kind && gapPrev === 0;
  const withNext = next != null && next.kind === group.kind && gapNext === 0;
  return {
    couldBeContinuousWithPrevious: withPrev,
    couldBeContinuousWithNext: withNext,
    note:
      withPrev || withNext
        ? 'Adjacent same-sign groups share bucket boundary with 0 ms gap — kinematically may be one maneuver; original LDI-10A grouping not modified.'
        : 'No zero-gap same-kind neighbor — split likely reflects ±3 km/h gate pause or kind change.',
    groupingUnchanged: true,
  };
}

export function evidenceRequiredToResolve(group: Ldi10bGroup, classes: UncertaintyClass[]): string[] {
  const req: string[] = [];
  if (classes.includes('GPS_QC_FAILURE') || classes.includes('DATA_GAP')) {
    req.push('Dense GPS (≤1 Hz) with TRUSTED L3 QC on same calendar buckets');
  }
  if (classes.includes('SIGNAL_CONFLICT') || classes.includes('TEMPORAL_ALIGNMENT')) {
    req.push('Independent speed reference (video overlay, wheel ticks, or non-DIMO CAN log) aligned to UTC');
  }
  if (classes.includes('SEGMENTATION_ARTIFACT')) {
    req.push('Higher-rate speed series or human review video to validate single vs multi maneuver');
  }
  req.push('Optional: brake/regen channels — not inferable from current pin');
  return [...new Set(req)];
}

export function runPhase2UnclearForensics(repoRoot: string) {
  const provenance = verifyPhase2Provenance(repoRoot);
  const groups10b = loadLdi10bGroups(repoRoot);
  const unclearGroups = groups10b.filter((g) => g.plausibilityVerdict === 'UNCLEAR_QC_OR_GAPS');
  const untrustedTouching = groups10b.filter((g) => g.qcInWindow.untrusted > 0);
  const unclearIds = unclearGroups.map((g) => g.groupId);
  const untrustedIds = untrustedTouching.map((g) => g.groupId);
  const intersection = unclearIds.filter((id) => untrustedIds.includes(id));
  const unclearOnly = unclearIds.filter((id) => !untrustedIds.includes(id));
  const untrustedOnly = untrustedIds.filter((id) => !unclearIds.includes(id));

  const { snapshot, candidates: frozenCandidates } = loadLdi08Artifacts(repoRoot);
  const rows = snapshot.rows;
  const audit10a = runLdi10aAudit(repoRoot);
  const candById = new Map(audit10a.candidateAudit.map((c) => [c.candidateId, c]));

  const forensicsPath = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-09/LDI09_ACCEL_DECEL_FORENSICS.json');
  const forensicsFrozen = JSON.parse(fs.readFileSync(forensicsPath, 'utf8')) as {
    candidates: Array<{ id: string }>;
  };
  const liveForensics = analyzeAccelDecelForensics(rows, frozenCandidates);
  const frozenIds = forensicsFrozen.candidates.map((c) => c.id).join(',');
  const liveIds = liveForensics.candidates.map((c) => c.id).join(',');
  const ldi09CandidatesMatch = frozenIds === liveIds;

  const sorted = [...groups10b].sort((a, b) => a.windowUtc.start.localeCompare(b.windowUtc.start));
  const indexById = new Map(sorted.map((g, i) => [g.groupId, i]));

  const caseAudits = unclearGroups.map((group) => {
    const idx = indexById.get(group.groupId)!;
    const prev = idx > 0 ? sorted[idx - 1] : null;
    const next = idx < sorted.length - 1 ? sorted[idx + 1] : null;
    const candidates = group.candidateIds.map((id) => candById.get(id)).filter(Boolean) as CandidateAuditRow[];
    const secondBySecond = buildSecondBySecondWindow(rows, group.windowUtc.start, group.windowUtc.end);
    const spatial = matchManeuverTrajectory(group, rows);
    const continuity = evaluateContinuousManeuverHypothesis(group, prev, next);
    const adjacentSameKindGap0 = continuity.couldBeContinuousWithPrevious || continuity.couldBeContinuousWithNext;
    const uncertainty = classifyUncertainties({
      group,
      candidates,
      secondBySecond,
      adjacentSameKindGap0,
    });

    const obdWitness = candidates.filter((c) => c.obdCorroboratedBothEnds);
    const hfWitness = candidates.filter((c) => c.hfCorroboratedBothEnds);

    return {
      groupId: group.groupId,
      kind: group.kind,
      taxonomy: group.taxonomy,
      plausibilityVerdictPreserved: group.plausibilityVerdict,
      windowUtc: group.windowUtc,
      candidateIds: group.candidateIds,
      ldi10bQcInWindow: group.qcInWindow,
      secondBySecond,
      candidatesForensics: candidates,
      spatialSummary: {
        gpsPresentInWindow: spatial.gpsPresentInWindow,
        gpsAbsentInWindow: spatial.gpsAbsentInWindow,
        pathLengthM: spatial.pathLengthM,
        bearingStartDeg: spatial.bearingStartDeg,
        bearingEndDeg: spatial.bearingEndDeg,
        centroid: spatial.centroid,
      },
      crossSource: {
        sharedLineageNotIndependentGroundTruth: true,
        obdWitnessStepIds: obdWitness.map((c) => c.candidateId),
        hfWitnessStepIds: hfWitness.map((c) => c.candidateId),
        notBrakePedalNotRegenNotIntent: true,
      },
      continuityHypothesis: continuity,
      uncertaintyClassification: uncertainty,
      evidenceRequiredToResolve: evidenceRequiredToResolve(group, uncertainty.classes),
      futureValidation: {
        confidenceUpgradeAllowed: false,
        proposed: 'Re-run LDI-10A/B only after new independent capture; no automatic upgrade from Phase 2',
      },
    };
  });

  const comparison = caseAudits.map((c) => ({
    groupId: c.groupId,
    window: c.windowUtc,
    stepCount: c.candidateIds.length,
    conflictedSteps: c.candidatesForensics.filter((x) => x.confidenceTier === 'CONFLICTED').length,
    untrustedBuckets: c.ldi10bQcInWindow.untrusted,
    uncertaintyClasses: c.uncertaintyClassification.classes,
    continuousWithNeighbor: c.continuityHypothesis.couldBeContinuousWithPrevious || c.continuityHypothesis.couldBeContinuousWithNext,
    plausibilityPreserved: c.plausibilityVerdictPreserved,
  }));

  return {
    provenance,
    ldi09CandidatesFrozenMatch: ldi09CandidatesMatch,
    setAnalysis: {
      unclearGroupIds: unclearIds,
      untrustedTouchingGroupIds: untrustedIds,
      intersectionGroupIds: intersection,
      unclearOnlyGroupIds: unclearOnly,
      untrustedOnlyGroupIds: untrustedOnly,
      intersectionSize: intersection.length,
      unclearCount: unclearIds.length,
      untrustedTouchingCount: untrustedIds.length,
    },
    caseAudits,
    comparison,
    summary: {
      unclearAudited: caseAudits.length,
      expectedUnclear: 8,
      groupingUnchanged: { groups: 32, candidates: 75 },
    },
    tripId: LDI08_TRIP_ID,
    vehicleId: LDI08_VEHICLE_ID,
  };
}
