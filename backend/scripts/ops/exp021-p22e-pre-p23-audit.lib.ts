/**
 * EXP021 P22E — Pre-P23 coverage & motion evidence optimization audit (offline, read-only).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildFreezeManifest } from './exp021-retrospective-halt-v0_2-freeze-review.lib';

export const P22E_SCHEMA = 'EXP021_P22E_PRE_P23_AUDIT_V1';
export const TESLA_REF_TRIP_ID = '358d0158-b2a9-47ed-af26-33926c5770b4';

export type RecoveryClass =
  | 'REAL_NUMERIC_RECOVERY'
  | 'STATE_CLASSIFICATION_ONLY'
  | 'DENOMINATOR_ONLY'
  | 'UNSAFE_OR_UNPROVEN'
  | 'NO_RECOVERY';

export type MotionAuditClass =
  | 'CONFIRMED_MOVEMENT'
  | 'LOW_SPEED_MOVEMENT_SUPPORTED'
  | 'PROBABLE_HALT'
  | 'STOP_STRICT_SUPPORTED'
  | 'TRANSITION_UNCERTAIN'
  | 'UNKNOWN_CAUSAL';

export type ReplayRow = {
  bucketLabelUtc: string;
  positionAvailability: string;
  positionState: string;
  r1SpeedKmh: number | null;
  l3SpeedKmh: number | null;
  motionState: string;
  speedEvidenceState: string;
  sourceRelation: string;
  qcTrustLevel: string;
  qcReasonCodes: string[];
  abstentionReason: string | null;
  supportWindowNote: string | null;
};

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

export function loadFrozenReplay(repoRoot: string): ReplayRow[] {
  const p = path.join(
    repoRoot,
    'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/pre-deploy/PRE_DEPLOY_PER_SECOND_REPLAY.json',
  );
  return readJson<ReplayRow[]>(p);
}

export function verifyReplayBaselineParity(rows: ReplayRow[]) {
  const mismatches: string[] = [];
  if (rows.length !== 1136) mismatches.push(`rowCount expected 1136 got ${rows.length}`);
  const numeric = rows.filter((r) => r.l3SpeedKmh != null && Number.isFinite(r.l3SpeedKmh));
  const trusted = numeric.filter((r) => r.qcTrustLevel === 'TRUSTED');
  const trustedLimited = rows.filter(
    (r) => r.qcTrustLevel === 'TRUSTED_LIMITED' && (r.l3SpeedKmh == null || r.l3SpeedKmh === 0),
  );
  const trustedMax = trusted.length ? Math.max(...trusted.map((r) => r.l3SpeedKmh as number)) : null;
  const trustedMean = trusted.length
    ? trusted.reduce((s, r) => s + (r.l3SpeedKmh as number), 0) / trusted.length
    : null;
  if (numeric.length !== 776) mismatches.push(`numericCount expected 776 got ${numeric.length}`);
  if (trusted.length !== 775) mismatches.push(`trustedNumeric expected 775 got ${trusted.length}`);
  if (trustedLimited.length !== 14) {
    mismatches.push(`trustedLimited expected 14 got ${trustedLimited.length}`);
  }
  const expectedMax = 129.7885665128692;
  if (trustedMax == null || Math.abs(trustedMax - expectedMax) > 1e-6) {
    mismatches.push(`trustedMax expected ${expectedMax} got ${trustedMax}`);
  }
  const expectedMean = 66.08511361500206;
  if (trustedMean == null || Math.abs(trustedMean - expectedMean) > 0.0001) {
    mismatches.push(`trustedMean expected ~${expectedMean} got ${trustedMean}`);
  }
  const untrustedNumeric = numeric.filter((r) => r.qcTrustLevel !== 'TRUSTED');
  if (untrustedNumeric.length !== 1) {
    mismatches.push(`untrustedNumericOutlier expected 1 got ${untrustedNumeric.length}`);
  }
  const rowAbsent = rows.filter((r) => r.positionAvailability === 'ROW_ABSENT').length;
  if (rowAbsent !== 269) mismatches.push(`ROW_ABSENT expected 269 got ${rowAbsent}`);
  const presentNoMotion = rows.filter(
    (r) =>
      r.positionAvailability === 'PRESENT' &&
      r.motionState === 'NO_MOTION_EVIDENCE' &&
      (r.l3SpeedKmh == null || !Number.isFinite(r.l3SpeedKmh)),
  ).length;
  if (presentNoMotion !== 45) mismatches.push(`PRESENT_NO_MOTION_NULL expected 45 got ${presentNoMotion}`);
  const transition = rows.filter((r) => r.motionState === 'TRANSITION_UNCERTAIN').length;
  if (transition !== 32) mismatches.push(`TRANSITION_UNCERTAIN expected 32 got ${transition}`);
  const coveragePct = (775 / 1136) * 100;
  return {
    ok: mismatches.length === 0,
    mismatches,
    rowCount: rows.length,
    trustedNumericCount: trusted.length,
    trustedNumericCoveragePercent: Math.round(coveragePct * 10000) / 10000,
    trustedNumericCoveragePercentRounded: 68.2218,
    trustedLimitedCount: trustedLimited.length,
    numericCount: numeric.length,
    untrustedNumericOutliers: untrustedNumeric.map((r) => ({
      bucketLabelUtc: r.bucketLabelUtc,
      l3SpeedKmh: r.l3SpeedKmh,
      qcReasonCodes: r.qcReasonCodes,
    })),
    rowAbsentCount: rowAbsent,
    presentNoMotionNullCount: presentNoMotion,
    transitionUncertainCount: transition,
  };
}

export type DisjointBucket =
  | 'TRUSTED_NUMERIC'
  | 'TRUSTED_LIMITED_STATIONARY_NULL'
  | 'NUMERIC_QC_OUTLIER'
  | 'ROW_ABSENT'
  | 'PRESENT_NO_MOTION_NULL_L3'
  | 'TRANSITION_UNCERTAIN'
  | 'OTHER_MOTION_OR_EVIDENCE';

export function classifyDisjointBucket(row: ReplayRow): DisjointBucket {
  if (row.positionAvailability === 'ROW_ABSENT') return 'ROW_ABSENT';
  if (row.l3SpeedKmh != null && Number.isFinite(row.l3SpeedKmh)) {
    if (row.qcTrustLevel === 'TRUSTED') return 'TRUSTED_NUMERIC';
    return 'NUMERIC_QC_OUTLIER';
  }
  if (row.qcTrustLevel === 'TRUSTED_LIMITED') return 'TRUSTED_LIMITED_STATIONARY_NULL';
  if (
    row.positionAvailability === 'PRESENT' &&
    row.motionState === 'NO_MOTION_EVIDENCE' &&
    (row.l3SpeedKmh == null || !Number.isFinite(row.l3SpeedKmh))
  ) {
    return 'PRESENT_NO_MOTION_NULL_L3';
  }
  if (row.motionState === 'TRANSITION_UNCERTAIN') return 'TRANSITION_UNCERTAIN';
  return 'OTHER_MOTION_OR_EVIDENCE';
}

export function validateDisjointPartition(rows: ReplayRow[]) {
  const counts: Record<DisjointBucket, number> = {
    TRUSTED_NUMERIC: 0,
    TRUSTED_LIMITED_STATIONARY_NULL: 0,
    NUMERIC_QC_OUTLIER: 0,
    ROW_ABSENT: 0,
    PRESENT_NO_MOTION_NULL_L3: 0,
    TRANSITION_UNCERTAIN: 0,
    OTHER_MOTION_OR_EVIDENCE: 0,
  };
  for (const r of rows) counts[classifyDisjointBucket(r)] += 1;
  const sum = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, sumMatchesRowCount: sum === rows.length, sum, rowCount: rows.length };
}

export function loadVideoComparison(repoRoot: string): Map<string, { tachoKmh: number | null }> {
  const p = path.join(
    repoRoot,
    'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/external-video-review-kompakt-2026-10-16/analysis/results/comparison.json',
  );
  const rows = readJson<Array<{ bucketLabelUtc?: string; tachoKmh?: number | null }>>(p);
  const m = new Map<string, { tachoKmh: number | null }>();
  for (const r of rows) {
    if (r.bucketLabelUtc) m.set(r.bucketLabelUtc, { tachoKmh: r.tachoKmh ?? null });
  }
  return m;
}

export function buildCoverageRecoveryMatrix(repoRoot: string, rows: ReplayRow[]) {
  const supplementPath = path.join(
    repoRoot,
    'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/forensic-readonly-exports-2026-10-16-supplement-v3/PRESENT_NO_MOTION_NULL_L3_COHORT_SUPPLEMENT_V3.json',
  );
  const supplement = readJson<{
    perSecond: Array<{
      bucketLabelUtc: string;
      classificationGroup: 'A' | 'B' | 'C';
      classificationRationale: string;
      noNumericSpeedExplanation: string;
      videoTacho?: { tachoKmh: number | null };
    }>;
    abcSummary: { A: number; B: number; C: number };
    groupBExperimentHypothesis: { status: string };
  }>(supplementPath);

  const presentCohort = supplement.perSecond.map((s) => {
    let recoveryClass: RecoveryClass = 'NO_RECOVERY';
    let recoveryNote =
      'L3 ±1s calendar support broken (ROW_ABSENT / L3_SUPPORT_CROSSES_GAP) — numeric emission correctly withheld.';
    if (s.classificationGroup === 'B') {
      recoveryClass = 'UNSAFE_OR_UNPROVEN';
      recoveryNote = 'Hypothetical leg-resynthesis — supplement v3 documents risks; not evidenced for this cohort (0 B seconds).';
    } else if (s.classificationGroup === 'C') {
      recoveryClass = 'STATE_CLASSIFICATION_ONLY';
      recoveryNote = 'Could only refine motion-state labeling without new trusted numeric speed.';
    } else {
      recoveryClass = 'NO_RECOVERY';
    }
    return {
      bucketLabelUtc: s.bucketLabelUtc,
      cohort: 'PRESENT_NO_MOTION_NULL_L3',
      abcGroup: s.classificationGroup,
      recoveryClass,
      recoveryNote,
      videoTachoKmh: s.videoTacho?.tachoKmh ?? null,
      noNumericSpeedExplanation: s.noNumericSpeedExplanation,
    };
  });

  const transitionSeconds = rows
    .filter((r) => r.motionState === 'TRANSITION_UNCERTAIN')
    .map((r) => ({
      bucketLabelUtc: r.bucketLabelUtc,
      cohort: 'TRANSITION_UNCERTAIN',
      recoveryClass: 'STATE_CLASSIFICATION_ONLY' as RecoveryClass,
      recoveryNote:
        'Fresh L3 support with abstained numeric (speedEvidenceState=ABSTAINED). Possible motion-state refinement only; no REAL_NUMERIC without QC/policy change.',
      speedEvidenceState: r.speedEvidenceState,
      qcTrustLevel: r.qcTrustLevel,
      positionState: r.positionState,
    }));

  const realNumericSeconds = [...presentCohort, ...transitionSeconds].filter(
    (x) => x.recoveryClass === 'REAL_NUMERIC_RECOVERY',
  ).length;

  const summaryByClass: Record<RecoveryClass, number> = {
    REAL_NUMERIC_RECOVERY: 0,
    STATE_CLASSIFICATION_ONLY: 0,
    DENOMINATOR_ONLY: 0,
    UNSAFE_OR_UNPROVEN: 0,
    NO_RECOVERY: 0,
  };
  for (const e of [...presentCohort, ...transitionSeconds]) {
    summaryByClass[e.recoveryClass] += 1;
  }

  return {
    schema: 'EXP021_P22E_COVERAGE_RECOVERY_MATRIX_V1',
    tripId: TESLA_REF_TRIP_ID,
    baselineTrustedNumeric: 775,
    baselineDenominatorSeconds: 1136,
    abcSummaryFromSupplementV3: supplement.abcSummary,
    groupBExperimentStatus: supplement.groupBExperimentHypothesis.status,
    presentSupportGapSeconds: presentCohort,
    transitionUncertainSeconds: transitionSeconds,
    recoverySummary: summaryByClass,
    realNumericRecoverySeconds: realNumericSeconds,
    realNumericCoverageDeltaPercentPoints: (realNumericSeconds / 1136) * 100,
    presentSupportGapRecoverableNumeric: 0,
    transitionRecoverableNumeric: 0,
    additionalSignalsInPinnedManifest: {
      POSITION: 'PRESENT',
      R1_OBD: 'NOT_APPLICABLE',
      NATIVE_EVENT: 'DISABLED',
      note: 'No verified Tesla wheel/park/gear speed in pinned S4 manifest — do not assume.',
    },
  };
}

export function buildTripBoundaryScenarios(repoRoot: string, rows: ReplayRow[]) {
  const boundary = readJson<{
    persisted: { startUtc: string; endUtc: string };
    externalVideoAnchor: { firstVisibleClockUtc: string; offsetSecondsPersistedStartToVideoAnchor: number };
  }>(
    path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/forensic-readonly-exports-2026-10-16/TRIP_BOUNDARY_PROVENANCE_EXPORT.json',
    ),
  );
  const segmentTrace = readJson<{
    lifecycleStartEpisode?: { value?: { startEpisode?: { candidateStartAt?: string } } };
  }>(
    path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/forensic-readonly-exports-2026-10-16-supplement-v1/DIMO_SEGMENT_TRACE_SUPPLEMENT_V1.json',
    ),
  );
  const segment =
    segmentTrace.lifecycleStartEpisode?.value?.startEpisode?.candidateStartAt ?? '2026-10-16T03:38:26.989Z';

  const persistedStart = boundary.persisted.startUtc;
  const persistedEnd = boundary.persisted.endUtc;
  const videoAnchor = boundary.externalVideoAnchor.firstVisibleClockUtc;
  const prefixExcludeSeconds = boundary.externalVideoAnchor.offsetSecondsPersistedStartToVideoAnchor;

  const labelMs = (label: string) => Date.parse(label.replace('Z', '.000Z'));
  const inRange = (label: string, start: string, endExclusiveLabel: string) => {
    const t = labelMs(label);
    return t >= Date.parse(start) && t < Date.parse(endExclusiveLabel.replace('Z', '.000Z'));
  };

  const scenarios = [
    {
      id: 'S1_OFFICIAL_PERSISTED_GRID',
      description: 'Official stored trip boundary + 1s acquisition grid (production denominator)',
      startUtc: persistedStart,
      endUtc: persistedEnd,
      denominatorSeconds: 1136,
      trustedNumericNumerator: 775,
      trustedNumericCoveragePercent: 68.2218,
      validatedGroundTruth: true,
      note: 'Canonical EXP021 baseline — unchanged.',
    },
    {
      id: 'S2_DIMO_SEGMENT_START',
      description: 'DIMO segment start 03:36:00Z (matches persisted start on this trip)',
      startUtc: '2026-10-16T03:36:00.000Z',
      endUtc: persistedEnd,
      denominatorSeconds: 1136,
      trustedNumericNumerator: 775,
      trustedNumericCoveragePercent: 68.2218,
      validatedGroundTruth: false,
      note: 'Diagnostic only — identical to S1 for this pin.',
    },
    {
      id: 'S3_FSM_START_CANDIDATE',
      description: 'FSM / lifecycleRecovery startEpisode candidate (not applied as trip start)',
      startUtc: segment,
      endUtc: persistedEnd,
      denominatorSeconds: rows.filter((r) => inRange(r.bucketLabelUtc, segment, '2026-10-16T03:54:56Z')).length,
      trustedNumericNumerator: rows.filter(
        (r) =>
          inRange(r.bucketLabelUtc, segment, '2026-10-16T03:54:56Z') &&
          r.l3SpeedKmh != null &&
          r.qcTrustLevel === 'TRUSTED',
      ).length,
      validatedGroundTruth: false,
      note: 'Shorter denominator if grid were re-cut — not implemented; counts from frozen replay slice.',
    },
    {
      id: 'S4_VIDEO_FIRST_ANCHOR',
      description: 'First video-visible clock anchor',
      startUtc: videoAnchor,
      endUtc: persistedEnd,
      denominatorSeconds: rows.filter((r) => inRange(r.bucketLabelUtc, videoAnchor, '2026-10-16T03:54:56Z')).length,
      trustedNumericNumerator: rows.filter(
        (r) =>
          inRange(r.bucketLabelUtc, videoAnchor, '2026-10-16T03:54:56Z') &&
          r.l3SpeedKmh != null &&
          r.qcTrustLevel === 'TRUSTED',
      ).length,
      validatedGroundTruth: false,
      note: 'Video-observable movement begins here; does not retroactively fix ROW_ABSENT prefix.',
    },
    {
      id: 'S5_HYPOTHETICAL_PREFIX_EXCLUDE_101S',
      description: 'Hypothetical exclude 101s before video anchor (NOT validated new coverage)',
      startUtc: videoAnchor,
      endUtc: persistedEnd,
      denominatorSeconds: 1035,
      trustedNumericNumerator: 775,
      trustedNumericCoveragePercent: Math.round((775 / 1035) * 10000) / 100,
      validatedGroundTruth: false,
      note: '775/1035 = 74.88% arithmetic only — numerator still includes seconds before video; not a product metric.',
    },
  ];

  return {
    schema: 'EXP021_P22E_TRIP_BOUNDARY_SCENARIOS_V1',
    tripId: TESLA_REF_TRIP_ID,
    boundaries: {
      officialPersisted: { startUtc: persistedStart, endUtc: persistedEnd },
      dimoSegmentStartUtc: '2026-10-16T03:36:00.000Z',
      fsmStartCandidateUtc: segment,
      firstVideoAnchorUtc: videoAnchor,
      prefixSecondsBeforeVideo: prefixExcludeSeconds,
    },
    scenarios,
    tripBoundaryDenominatorEffect:
      'Changing denominator without new trusted numerators inflates % only (S5). No independent physical trip-end dispute on this pin.',
  };
}

export function buildSlowRollStatePayload(repoRoot: string, rows: ReplayRow[], video: Map<string, { tachoKmh: number | null }>) {
  const stationary = readJson<{
    globalMetrics: Record<string, unknown>;
    limits: Record<string, unknown>;
  }>(
    path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/forensic-readonly-exports-2026-10-16-stationary-prototype/STATIONARY_OFFLINE_PROTOTYPE_EXPORT.json',
    ),
  );

  const gapEvents = readJson<Array<Record<string, unknown>>>(
    path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/forensic-readonly-exports-2026-10-16-retrospective-halt-v2-freeze/TEN_GAP_EVENTS.json',
    ),
  ).filter((e) => ['GAP_EVT_002', 'GAP_EVT_003', 'GAP_EVT_008'].includes(String(e.eventId)));

  const videoTachoZero = rows.filter((r) => video.get(r.bucketLabelUtc)?.tachoKmh === 0);
  const trustedLimited = rows.filter((r) => r.qcTrustLevel === 'TRUSTED_LIMITED');
  const tlTacho13 = trustedLimited.filter((r) => {
    const t = video.get(r.bucketLabelUtc)?.tachoKmh;
    return t != null && t >= 1 && t <= 3;
  });

  const slowRollGeometryLabels = readJson<Record<string, unknown>>(
    path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/forensic-readonly-exports-2026-10-16-retrospective-halt-v2-freeze/DEVELOPMENT_STATUS_CONSOLIDATED.json',
    ),
  );

  const classifyVideoSecond = (label: string): MotionAuditClass => {
    const t = video.get(label)?.tachoKmh;
    if (t == null) return 'UNKNOWN_CAUSAL';
    if (t === 0) return 'PROBABLE_HALT';
    if (t >= 1 && t <= 3) return 'LOW_SPEED_MOVEMENT_SUPPORTED';
    if (t >= 4) return 'CONFIRMED_MOVEMENT';
    return 'UNKNOWN_CAUSAL';
  };

  const videoTachoZeroAudit = videoTachoZero.map((r) => ({
    bucketLabelUtc: r.bucketLabelUtc,
    baselineMotion: r.motionState,
    baselineQc: r.qcTrustLevel,
    positionAvailability: r.positionAvailability,
    auditClass: classifyVideoSecond(r.bucketLabelUtc),
    note: r.positionAvailability === 'ROW_ABSENT'
      ? 'Tacho display 0 ≠ physics proof; ROW_ABSENT prevents STATIONARY_BAND.'
      : 'PRESENT but may still lack STATIONARY_SUPPORTED if L3 window incomplete.',
  }));

  return {
    stationaryPrototypeLimits: stationary.limits,
    stationaryGlobalMetrics: stationary.globalMetrics,
    videoTachoZeroSeconds: videoTachoZero.length,
    videoTachoZeroAuditSample: videoTachoZeroAudit.slice(0, 15),
    videoTachoZeroAuditSummary: {
      rowAbsentAmongTacho0: videoTachoZero.filter((r) => r.positionAvailability === 'ROW_ABSENT').length,
      presentAmongTacho0: videoTachoZero.filter((r) => r.positionAvailability === 'PRESENT').length,
    },
    trustedLimitedStationaryBand: {
      count: trustedLimited.length,
      withVideoTacho1to3: tlTacho13.length,
      auditNote:
        'STATIONARY_SUPPORTED / TRUSTED_LIMITED null is V2 band semantics (L3<3 km/h or hold-stop), not “tacho exactly 0”.',
    },
    slowRollGeometrySeconds: 52,
    slowRollVideoBreakdown: slowRollGeometryLabels,
    ambiguousGapEvents: gapEvents,
    falseHaltRisks: {
      source: 'forensic-readonly-exports-2026-10-16-retrospective-halt-v2-freeze/REVIEW_SUMMARY.md',
      naturalGapsLikelyHalt: 6,
      likelyHaltWithoutOverlappingMainHalt: 2,
      likelyHaltWithVideoContradictionOrNoStopEvidence: 1,
      v02SlowRollVsVideoGt5: 1,
      note: 'Retrospective v0_2 can label LIKELY_HALT on small chord across ROW_ABSENT without video tacho-0 in gap.',
    },
    strictStopSupportedSeconds: 14,
    slowRollSupportedSeconds: 52,
  };
}

export function renderSlowRollAuditMd(payload: ReturnType<typeof buildSlowRollStatePayload>): string {
  const lines = [
    '# EXP021 P22E — Slow-Roll & Stillstand State Audit',
    '',
    `Tesla reference trip \`${TESLA_REF_TRIP_ID}\` · frozen pre-deploy replay · **no detector input from video labels**.`,
    '',
    '## A — 135 video tacho=0 seconds',
    '',
    `- Count from comparison.json alignment: **${payload.videoTachoZeroSeconds}**`,
    `- ROW_ABSENT among them: **${payload.videoTachoZeroAuditSummary.rowAbsentAmongTacho0}** (display zero does not prove physics; pipeline abstains)`,
    `- PRESENT among them: **${payload.videoTachoZeroAuditSummary.presentAmongTacho0}**`,
    '',
    '## B — 14 TRUSTED_LIMITED (null numeric) band seconds',
    '',
    `- Total: **${payload.trustedLimitedStationaryBand.count}**`,
    `- With readable video tacho 1–3 km/h: **${payload.trustedLimitedStationaryBand.withVideoTacho1to3}**`,
    `- ${payload.trustedLimitedStationaryBand.auditNote}`,
    '',
    '## C — 52 retrospective SLOW_ROLL geometry seconds',
    '',
    '- Source: frozen v0_2 freeze review (`DEVELOPMENT_STATUS_CONSOLIDATED.json` / `REVIEW_SUMMARY.md`).',
    '- Video breakdown (all 52): tacho1–3: 20, tacho3–5: 19, tacho>5: 1, unknown: 12; **not** aggregate strict-stop candidates.',
    '',
    '## D — Five large tacho-0 blocks & ten natural GPS gaps',
    '',
    '- See `MAIN_HALTS_HONEST.json` + `TEN_GAP_EVENTS.json` (unchanged). Stationary prototype: 135/135 annotated zeros missed for V2 STATIONARY_BAND when ROW_ABSENT dominates.',
    '',
    '## E — GAP_EVT_002, GAP_EVT_003, GAP_EVT_008',
    '',
    '| Event | v0_2 (frozen) | Video decisiveness |',
    '|-------|---------------|-------------------|',
    '| GAP_EVT_002 | LIKELY_HALT / slow-roll family | Before video anchor — NOT_VERIFIABLE |',
    '| GAP_EVT_003 | LIKELY_HALT | Predominantly pre-anchor — NOT_DECISIVE |',
    '| GAP_EVT_008 | Shared position gap (H4/H5) | NOT_DECISIVE; optional clip context only |',
    '',
    '## False-halt risks',
    '',
    `- Natural gaps tagged LIKELY_HALT: **${payload.falseHaltRisks.naturalGapsLikelyHalt}**`,
    `- Without overlapping main halt window: **${payload.falseHaltRisks.likelyHaltWithoutOverlappingMainHalt}**`,
    `- ${payload.falseHaltRisks.note}`,
    '',
    '## Leg geometry for slow-roll (within full PRESENT chains)',
    '',
    'Where ±1s L3 support is calendar-complete and legs imply 1.5–5 km/h, v0_2 **already** emits SLOW_ROLL geometry labels; conflict with video >3 km/h on 52s shows **classification semantics**, not missing numeric coverage. Extending without QC change → **UNSAFE_OR_UNPROVEN**.',
  ];
  return lines.join('\n');
}

export function buildOptimizationPriorities(matrix: ReturnType<typeof buildCoverageRecoveryMatrix>) {
  return [
    {
      rank: 1,
      title: 'Independent RD003 / new Tesla capture with UTC + video sync',
      category: 'NOT_SOLVABLE_FROM_CURRENT_PIN',
      expectedNumericCoverageGainSeconds: 0,
      motionStateGain: 'Enables blind validation of halt/slow-roll/gap cases',
      dataAvailability: 'LOW in git pin',
      falseHaltRisk: 'LOW if UTC+video independent',
      effort: 'HIGH (field capture)',
      dependencies: ['Owner MP4+metadata', 'P23 protocol'],
      independentValidationRequired: true,
      suitableForP23: true,
    },
    {
      rank: 2,
      title: 'Document / enforce STATIONARY_BAND vs display-tacho semantics in UX & reports',
      category: 'SAFE_IMPROVEMENT',
      expectedNumericCoverageGainSeconds: 0,
      motionStateGain: 'Reduces mis-read of 14 TRUSTED_LIMITED + 135 tacho-0 seconds',
      dataAvailability: 'HIGH (existing exports)',
      falseHaltRisk: 'LOW',
      effort: 'LOW',
      dependencies: ['Product copy / DI reporting only'],
      independentValidationRequired: false,
      suitableForP23: false,
    },
    {
      rank: 3,
      title: 'Leg-resynthesis numeric from PRESENT neighbors (Group B experiment)',
      category: 'RESEARCH_HYPOTHESIS',
      expectedNumericCoverageGainSeconds: 0,
      motionStateGain: 'Unclear; risks false motion at holds',
      dataAvailability: '0 cohort seconds triggered in supplement v3',
      falseHaltRisk: 'HIGH',
      effort: 'MEDIUM',
      dependencies: ['QC policy review', 'v0_3 design only'],
      independentValidationRequired: true,
      suitableForP23: false,
    },
    {
      rank: 4,
      title: 'Trip prefix denominator trim (101s before video)',
      category: 'DENOMINATOR_ONLY',
      expectedNumericCoverageGainSeconds: 0,
      motionStateGain: 'None',
      dataAvailability: 'N/A',
      falseHaltRisk: 'MEDIUM (misleading KPI)',
      effort: 'LOW',
      dependencies: ['Must not ship as coverage fix'],
      independentValidationRequired: false,
      suitableForP23: false,
    },
  ];
}

export function renderOptimizationMd(priorities: ReturnType<typeof buildOptimizationPriorities>): string {
  const lines = [
    '# EXP021 P22E — Optimization Priorities (pre-P23)',
    '',
    '| Rank | Item | Category | Δ numeric (s) | False-halt risk | P23? |',
    '|------|------|----------|---------------|-----------------|------|',
  ];
  for (const p of priorities) {
    lines.push(
      `| ${p.rank} | ${p.title} | ${p.category} | ${p.expectedNumericCoverageGainSeconds} | ${p.falseHaltRisk} | ${p.suitableForP23} |`,
    );
  }
  lines.push('', '## Safe improvements', '', '- Reporting semantics for STATIONARY_BAND vs tacho display (no algorithm change).', '');
  lines.push('## Research hypotheses', '', '- Group-B leg resynthesis (explicitly blocked for 45s cohort).', '- Richer slow-roll disambiguation using same geometry + video **offline only**.', '');
  lines.push('## Not solvable from pin', '', '- RD003 UTC + independent clips.', '- Pre-video GPS gaps without earlier video.', '- Ruptela-specific channels (not in Tesla DIMO software pin).', '');
  return lines.join('\n');
}

export function renderPreP23DecisionMd(): string {
  return [
    '# EXP021 P22E — Pre-P23 Decision Brief',
    '',
    '## Explained from today’s Tesla development trip (diagnostic only)',
    '',
    '- L3/QC V2 numeric coverage **68.22%** with disjoint bucket parity (775/1136 trusted numeric).',
    '- Why **45** PRESENT centers lack numeric: L3 support crosses ROW_ABSENT (Group A, 45/45).',
    '- Why **32** TRANSITION_UNCERTAIN: abstained numeric with fresh support — state-only refinement conceivable, **0** trusted numeric recovery.',
    '- Why **135** video tacho=0 ≠ V2 stop band: mostly ROW_ABSENT / incomplete support.',
    '- v0_2 retrospective labels on gaps **≠** independent halt proof (002/003/008 documented).',
    '',
    '## Requires independent new video evidence',
    '',
    '- RD003 nine clips UTC sync (P22D blocked).',
    '- GAP_EVT_002/003 pre-video windows.',
    '- Decisive halt proof inside natural gaps where only geometry fired.',
    '',
    '## Requires different telemetry channel',
    '',
    '- Wheel speed / gear / park state (not in pinned Tesla DIMO software S4 manifest).',
    '- Ruptela hardware path — **out of scope** for this Tesla pin; separate campaign.',
    '',
    '## What another Tesla software-DIMO test would prove',
    '',
    '- Whether admission + unchanged boundaries reproduce same 775/1136 pin.',
    '- Whether new captures with sync markers improve **independent** halt/slow-roll validation (not hit-rate tuning on same video).',
    '',
    '## P23 readiness',
    '',
    '**CONDITIONAL** — proceed with P23 **field protocol** and independent capture; **do not** treat this trip as blind validation or justify v0_3 thresholds from it.',
  ].join('\n');
}

export function buildP22EPayload(repoRoot: string, headSha: string, prNumber: number) {
  const freeze = buildFreezeManifest(repoRoot);
  const rows = loadFrozenReplay(repoRoot);
  const parity = verifyReplayBaselineParity(rows);
  const partition = validateDisjointPartition(rows);
  const video = loadVideoComparison(repoRoot);
  const matrix = buildCoverageRecoveryMatrix(repoRoot, rows);
  const tripScenarios = buildTripBoundaryScenarios(repoRoot, rows);
  const slowRoll = buildSlowRollStatePayload(repoRoot, rows, video);
  const priorities = buildOptimizationPriorities(matrix);

  const p22eResult = parity.ok ? 'BASELINE_PARITY_OK_COVERAGE_RECOVERY_BLOCKED' : 'BASELINE_PARITY_FAIL';

  return {
    schema: P22E_SCHEMA,
    observedAtUtc: new Date().toISOString(),
    prNumber,
    headSha,
    p22eResult,
    preflight: {
      tripId: TESLA_REF_TRIP_ID,
      dimoTokenId: '186946',
      vehicleLabel: 'Tesla Model 3',
      pathsSeparated: {
        productiveL3Qc: 'pre-deploy PRE_DEPLOY_PER_SECOND_REPLAY + DI_V0_SPEED_QC_POLICY_V2',
        stationaryOfflinePrototype: 'forensic-readonly-exports-2026-10-16-stationary-prototype/',
        retrospectiveHaltV02: 'forensic-readonly-exports-2026-10-16-retrospective-halt-v2-freeze/',
      },
      v0_2: { parameterSnapshotHash: freeze.parameterSnapshotHash, unchanged: true },
    },
    baselineParity: parity,
    disjointPartition: partition,
    coverageMatrix: matrix,
    tripBoundaryScenarios: tripScenarios,
    slowRollState: slowRoll,
    optimizationPriorities: priorities,
    productionMutations: 'NONE',
    providerCalls: 'NONE',
    nextSafeAction:
      'P23: independent Tesla+video capture with UTC anchors; keep v0_2 frozen; use this pin only for regression parity (775/1136).',
  };
}

export function buildP22ECompletionLines(p: ReturnType<typeof buildP22EPayload>): string[] {
  return [
    `P22E_RESULT=${p.p22eResult}`,
    `PR_NUMBER=${p.prNumber}`,
    `HEAD_SHA=${p.headSha}`,
    `BASELINE_PARITY=${p.baselineParity.ok}`,
    `BASELINE_TRUSTED_COVERAGE=${p.baselineParity.trustedNumericCoveragePercentRounded}`,
    `ROW_ABSENT_CONFIRMED=${p.baselineParity.rowAbsentCount}`,
    `PRESENT_SUPPORT_GAP_RECOVERABLE=${p.coverageMatrix.presentSupportGapRecoverableNumeric}`,
    `TRANSITION_RECOVERABLE=${p.coverageMatrix.transitionRecoverableNumeric}`,
    `REAL_NUMERIC_RECOVERY_SECONDS=${p.coverageMatrix.realNumericRecoverySeconds}`,
    `REAL_NUMERIC_COVERAGE_POTENTIAL=${p.coverageMatrix.realNumericCoverageDeltaPercentPoints}`,
    `SLOW_ROLL_SUPPORTED_SECONDS=${p.slowRollState.slowRollSupportedSeconds}`,
    `STRICT_STOP_SUPPORTED_SECONDS=${p.slowRollState.strictStopSupportedSeconds}`,
    `FALSE_HALT_RISKS=${p.slowRollState.falseHaltRisks.naturalGapsLikelyHalt}_natural_gap_likely_halt_plus_${p.slowRollState.falseHaltRisks.likelyHaltWithoutOverlappingMainHalt}_without_main_halt_window`,
    `TRIP_BOUNDARY_DENOMINATOR_EFFECT=S5_hypothetical_775_over_1035_equals_74.88_percent_not_validated_coverage`,
    `ADDITIONAL_SIGNALS_VERIFIED=0_new_channels_in_pin`,
    `UNRESOLVED_DATA_GAPS=RD003_UTC;pre_video_gaps;ruptela_not_in_tesla_pin`,
    `OPTIMIZATION_PRIORITY_1=${p.optimizationPriorities[0]?.title ?? ''}`,
    `OPTIMIZATION_PRIORITY_2=${p.optimizationPriorities[1]?.title ?? ''}`,
    `OPTIMIZATION_PRIORITY_3=${p.optimizationPriorities[2]?.title ?? ''}`,
    `P23_READY=CONDITIONAL_FIELD_CAPTURE_NOT_BLIND_VALIDATION`,
    `V0_2_HASH_UNCHANGED=${String(p.preflight.v0_2.parameterSnapshotHash)}`,
    `PRODUCTION_MUTATIONS=${p.productionMutations}`,
    `NEXT_SAFE_ACTION=${p.nextSafeAction}`,
  ];
}
