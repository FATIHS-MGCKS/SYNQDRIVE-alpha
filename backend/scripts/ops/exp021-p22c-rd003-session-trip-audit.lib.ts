/**
 * EXP021 P22C — RD003 session-to-trip alignment audit (read-only).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { buildFreezeManifest } from './exp021-retrospective-halt-v0_2-freeze-review.lib';

export const P22C_SCHEMA = 'EXP021_P22C_RD003_SESSION_TRIP_AUDIT_V1';
export const RD003_SESSION_ID = '0fa040aa-6105-4872-9b2c-f8ad477009b8';
export const RD003_VEHICLE_ID = '19fedd4b-c4e8-4de8-a125-dab293326e7e';

export type GateStatus = 'VALIDATED' | 'PARTIAL' | 'UNKNOWN' | 'BLOCKED';

export type ClipSyncRow = {
  clipId: string;
  fileName: string;
  videoDurationSeconds: number;
  candidateStartUtc: string | null;
  candidateUncertaintySeconds: number | null;
  alignedClipStartUtcHfHistorical: string | null;
  alignmentResidualSeconds: number | null;
  alignmentStatus: string;
  matchCoverageRatio: number | null;
  speedMaeKmh: number | null;
  utcGate: GateStatus;
  videoEvidence: string;
};

export async function queryTripCandidates(
  prisma: PrismaClient,
  sessionStartedAt: Date,
  sessionStoppedAt: Date,
): Promise<
  Array<{
    id: string;
    start_time: Date;
    end_time: Date | null;
    trip_status: string;
    dimo_segment_id: string | null;
    containsSession: boolean;
  }>
> {
  const padMs = 5 * 60 * 1000;
  const from = new Date(sessionStartedAt.getTime() - padMs);
  const to = new Date(sessionStoppedAt.getTime() + padMs);
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      start_time: Date;
      end_time: Date | null;
      trip_status: string;
      dimo_segment_id: string | null;
    }>
  >(
    `SELECT id, start_time, end_time, trip_status, dimo_segment_id
     FROM vehicle_trips
     WHERE vehicle_id = $1
       AND start_time < $2
       AND (end_time IS NULL OR end_time > $3)
     ORDER BY start_time ASC`,
    RD003_VEHICLE_ID,
    to,
    from,
  );
  return rows.map((r) => ({
    ...r,
    containsSession:
      r.start_time <= sessionStartedAt && (r.end_time == null || r.end_time >= sessionStoppedAt),
  }));
}

export function loadClipSyncRows(repoRoot: string): ClipSyncRow[] {
  const gtPath = path.join(repoRoot, 'docs/audits/data/rd003-video-ground-truth-observations.json');
  const alignPath = path.join(repoRoot, 'docs/audits/data/rd003-video-gt-alignment/clip-alignments.json');
  const gt = JSON.parse(fs.readFileSync(gtPath, 'utf8')) as {
    clips: Array<{
      clipId: string;
      fileName: string;
      videoDurationSeconds: number;
      behavioralSummary: string;
      candidateAbsoluteTime?: { candidateStartUtc?: string; uncertaintySeconds?: number | null };
      observations?: Array<{ observationType: string; value: number }>;
    }>;
  };
  const aligns = JSON.parse(fs.readFileSync(alignPath, 'utf8')) as Array<{
    clipId: string;
    alignmentStatus: string;
    speedAlignmentBySurface?: {
      HF_HISTORICAL?: {
        bestCandidate?: {
          alignedClipStartUtc?: string;
          candidateStartResidualSeconds?: number;
          maeKmh?: number;
        };
        metrics?: { MATCH_COVERAGE_RATIO?: number };
      };
    };
  }>;
  const byId = new Map(aligns.map((a) => [a.clipId, a]));

  return gt.clips.map((c) => {
    const al = byId.get(c.clipId);
    const hf = al?.speedAlignmentBySurface?.HF_HISTORICAL;
    const best = hf?.bestCandidate;
    const speeds = (c.observations ?? []).filter((o) => o.observationType === 'SPEED');
    const zero = speeds.filter((s) => s.value === 0).length;
    const utcGate: GateStatus =
      al?.alignmentStatus === 'VALIDATED' ? 'VALIDATED' : best?.alignedClipStartUtc ? 'PARTIAL' : 'UNKNOWN';
    return {
      clipId: c.clipId,
      fileName: c.fileName,
      videoDurationSeconds: c.videoDurationSeconds,
      candidateStartUtc: c.candidateAbsoluteTime?.candidateStartUtc ?? null,
      candidateUncertaintySeconds: c.candidateAbsoluteTime?.uncertaintySeconds ?? null,
      alignedClipStartUtcHfHistorical: best?.alignedClipStartUtc ?? null,
      alignmentResidualSeconds: best?.candidateStartResidualSeconds ?? null,
      alignmentStatus: al?.alignmentStatus ?? 'MISSING',
      matchCoverageRatio: hf?.metrics?.MATCH_COVERAGE_RATIO ?? null,
      speedMaeKmh: best?.maeKmh ?? null,
      utcGate,
      videoEvidence: `${c.behavioralSummary}; speedSamples=${speeds.length}; labeled0km/h=${zero}`,
    };
  });
}

export function caseRecoveryGates(clips: ClipSyncRow[]): Array<{
  caseType: string;
  gate: GateStatus;
  videoEvidence: string;
  utcAssignment: string;
  telemetryCoverage: string;
  tripBinding: string;
  remainingUncertainty: string[];
}> {
  return [
    {
      caseType: 'HALT_WITHOUT_SIGNAL',
      gate: 'PARTIAL',
      videoEvidence: 'Clips 001/005/006/009 include labeled 0 km/h seconds (sparse); no signal-context annotation in GT file.',
      utcAssignment: 'Fit-derived alignedClipStartUtc only; GROUND_TRUTH_VALIDATED=NO; cross-clip clock model eligibleClipCount=0.',
      telemetryCoverage: 'RC session HF speed in DB; GPS currentLocationCoordinates ~62 provider points across session (sparse).',
      tripBinding: 'Administrative: session ⊂ single overlapping vehicle_trip fe40356a… (temporal, not spatial).',
      remainingUncertainty: [
        'Cannot prove halt without traffic signal from video labels alone.',
        'No P21 pin / DI shadow replay for this trip.',
      ],
    },
    {
      caseType: 'STOP_AND_GO',
      gate: 'PARTIAL',
      videoEvidence: 'Clips 001, 005, 006 behavioral summaries include STOP→LAUNCH patterns; sparse integer-second speed labels.',
      utcAssignment: 'Per-clip alignment residuals −28s…+23s; high MAE (15–68 km/h) → not independent UTC proof.',
      telemetryCoverage: 'Full RC observation stream (6251 rows) for session window.',
      tripBinding: 'Same trip candidate fe40356a…',
      remainingUncertainty: ['Stop/go state transitions not labeled at per-second GT for full clip duration.'],
    },
    {
      caseType: 'MOVEMENT_DURING_GAP',
      gate: 'BLOCKED',
      videoEvidence: 'No clip documents continued motion through a POSITION_ROW_ABSENT-style gap with synchronized video proof.',
      utcAssignment: 'N/A for dedicated case window.',
      telemetryCoverage: 'Sparse GPS (62 coords); HF ~2s cadence — gap semantics require dedicated forensic pin, not inferred here.',
      tripBinding: 'Trip candidate exists; case window not identified in video GT.',
      remainingUncertainty: [
        'Do not treat RD004 late-bucket artifacts as this case.',
        'Need explicit video segment showing speed>0 while position stream absent in same UTC window.',
      ],
    },
    {
      caseType: 'MANEUVER_RETURN_SAME_POINT',
      gate: 'PARTIAL',
      videoEvidence: 'Clip 009: FORWARD→DECELERATION→NEAR_STOP→REVERSE→STOP→FORWARD_LAUNCH (behavioral summary + 25 speed samples).',
      utcAssignment: 'Clip 009 aligned start 2026-09-02T19:24:32Z (fit); MAE ~35 km/h.',
      telemetryCoverage: 'Gear/heading in RC stream; return-to-same-point not geometrically validated in this audit.',
      tripBinding: 'Same trip candidate.',
      remainingUncertainty: [
        'Chord/back-and-forth not verified against GPS path.',
        'Video proves maneuver class only at sparse label times.',
      ],
    },
  ];
}

export function buildP22CPayload(
  repoRoot: string,
  headSha: string,
  prNumber: number,
  dbEvidence: {
    rcSessionFound: boolean;
    sessionStartedAt: string | null;
    sessionStoppedAt: string | null;
    candidateTrips: Array<{
      id: string;
      start_time: string;
      end_time: string | null;
      containsSession: boolean;
      dimo_segment_id: string | null;
    }>;
    uniqueTripId: string | null;
    p21WorkItemCount: number;
    rcObservationCount: number;
    gpsObservationCount: number;
  },
) {
  const freeze = buildFreezeManifest(repoRoot);
  const clips = loadClipSyncRows(repoRoot);
  const cases = caseRecoveryGates(clips);
  const validatedUtcClips = clips.filter((c) => c.utcGate === 'VALIDATED').length;
  const overlapCount = dbEvidence.candidateTrips.length;
  const unique =
    dbEvidence.uniqueTripId != null &&
    dbEvidence.candidateTrips.filter((t) => t.containsSession).length === 1;

  return {
    schema: P22C_SCHEMA,
    observedAtUtc: new Date().toISOString(),
    prNumber,
    headSha,
    p22cResult: unique && validatedUtcClips === 0 ? 'TRIP_BINDING_UNIQUE_UTC_VALIDATION_BLOCKED' : 'INCONCLUSIVE',
    v0_2: {
      parameterSnapshotHash: freeze.parameterSnapshotHash,
      unchangedInP22C: true,
    },
    rd003Provenance: {
      referenceDriveId: 'DIMO_LTE_R1_REFERENCE_DRIVE_003',
      sessionId: RD003_SESSION_ID,
      vehicleId: RD003_VEHICLE_ID,
      evidenceChain: ['DI-EV-0027 capture report', 'DI-EV-0034B sparse video GT', 'reference_capture_sessions row (read-only DB)'],
      sessionIdDocTypos: 'Some docs cite 4879 in UUID segment; canonical DB/JSON uses 4872-9b2c-f8ad477009b8',
      usedInV02HaltDetector: false,
      contaminationClass: 'NOT_USED_IN_EXP021_V0_2_PARAMETER_PATH',
    },
    sessionToTrip: {
      rd003SessionFound: dbEvidence.rcSessionFound,
      sessionWindowUtc: {
        from: dbEvidence.sessionStartedAt,
        to: dbEvidence.sessionStoppedAt,
      },
      candidateTripCount: overlapCount,
      candidateTrips: dbEvidence.candidateTrips,
      uniqueTripBinding: unique ? dbEvidence.uniqueTripId : null,
      bindingBasis: unique
        ? 'TEMPORAL_OVERLAP_SINGLE_VEHICLE_TRIP_CONTAINS_FULL_RC_SESSION (no spatial proximity proof)'
        : 'NONE',
      dimoSegmentId:
        dbEvidence.candidateTrips.find((t) => t.containsSession)?.dimo_segment_id ?? null,
      p21ForensicPin: {
        workItemsForTrip: dbEvidence.p21WorkItemCount,
        note: 'P21 loader requires work_item pin; none found for bound trip — v0_2 gap replay not executed in P22C.',
      },
    },
    synchronization: {
      clips,
      crossClipClockModelEligibleClips: 0,
      utcOffsetConfidence: validatedUtcClips > 0 ? 'MEDIUM' : 'LOW',
      priorUncertaintySeconds: 30,
      offsetReductionPossibleWithoutNewEvidence: 'PARTIAL — alignedClipStartUtc exists per clip but MAE high and GROUND_TRUTH_VALIDATED=NO',
      clipsWithValidatedUtc: validatedUtcClips,
    },
    caseRecovery: cases,
    recoveredCounts: {
      VALIDATED: {
        HALT_WITHOUT_SIGNAL: 0,
        STOP_AND_GO: 0,
        MOVEMENT_DURING_GAP: 0,
        MANEUVER_RETURN_SAME_POINT: 0,
      },
      gateSummary: cases.map((c) => ({ caseType: c.caseType, gate: c.gate })),
    },
    independentHoldoutEligibility:
      'POTENTIAL_FUTURE_YES — RD003 not used in v0_2 development; blocked until VALIDATED UTC+labels and P21 pin exist',
    productionMutations: 'NONE',
    nextSafeAction:
      'Optional: build P21 PRIMARY pin for trip fe40356a… + export RC window; complete RD003 alignment to VALIDATED; then replay frozen v0_2 without tuning.',
  };
}
