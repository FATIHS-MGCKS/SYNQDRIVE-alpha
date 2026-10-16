/**
 * EXP021 v0_2 freeze + honest full evaluation (no threshold changes).
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CALIBRATION_UNSET_V0_BUNDLE } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/calibration/CALIBRATION_UNSET_V0';
import { bucketLabelToMs } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import type { DiV0SpeedQcPositionSample } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc.types';
import { EXP021_VIDEO_TACHO_ZERO_WINDOWS_UTC } from './exp021-ev-ground-truth-forensic-export.lib';
import { enumerateInclusive } from './exp021-stationary-offline-prototype.lib';
import { VIDEO_ANCHOR } from './exp021-ev-ground-truth-forensic-supplement-v1.lib';
import {
  analyzeGapCandidate,
  GEOMETRY_THRESHOLDS,
  MIN_DISPLACEMENT_M_FOR_ANY_INFERENCE,
  RETROSPECTIVE_HALT_PROTOTYPE_VERSION,
  type GapRun,
  type RetrospectiveExplanation,
} from './exp021-retrospective-halt-prototype.lib';
import {
  analyzeGapCandidateV2,
  buildGapBrackets,
  classifyAllPresentLegsV2,
  RETROSPECTIVE_HALT_PROTOTYPE_V2_VERSION,
  runSyntheticGapBattery,
  type GapBracketStructure,
} from './exp021-retrospective-halt-prototype-v2.lib';
import type { PresentPoint } from './exp021-retrospective-halt-prototype.lib';

export const V0_2_FREEZE_ID = 'EXP021_RETROSPECTIVE_HALT_V0_2_FROZEN_REVIEW_2026-10-16';

const BERLIN_TZ = 'Europe/Berlin';

/** Annotation gap between H4 and H5 (numeric windows unchanged). */
export const LONG_HALT_H4_H5_ANNOTATION_GAP = {
  utc: { from: '2026-10-16T03:44:03Z', to: '2026-10-16T03:44:09Z' },
  berlin: { from: '2026-10-16 05:44:03', to: '2026-10-16 05:44:09' },
  tacho: 'unknown',
  physicalEventCountH4H5: 'UNCLEAR_NOT_INFERRED_FROM_GAP',
  note: 'No restart inferred from unknown tacho alone; GAP_EVT_008 spans one position gap, not erroneous merge of halts.',
} as const;

export const REFERENCE_LONG_HALT_SEMANTICS = {
  definition:
    'LONG_HALT_1–5 are contiguous readable tacho-zero display segments from video overlay — not five proven independent physical halt events.',
  numericWindowsUnchanged: true,
  physicalProof: 'NOT_CLAIMED',
  timeZoneNote: 'Europe/Berlin 05:xx on 2026-10-16 (CEST) = UTC 03:xx.',
  videoAnchorUtc: VIDEO_ANCHOR.firstVisibleClockLabelUtc,
  h4h5AnnotationGap: LONG_HALT_H4_H5_ANNOTATION_GAP,
  docPath: 'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/EXP021_REFERENCE_SEMANTICS_LONG_HALT.md',
} as const;

export function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function sha256Json(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function buildFreezeManifest(repoRoot: string): Record<string, unknown> {
  const backendRoot = path.join(repoRoot, 'backend');
  const files = [
    'scripts/ops/exp021-retrospective-halt-prototype-v2.lib.ts',
    'scripts/ops/exp021-retrospective-halt-prototype.lib.ts',
    'scripts/ops/exp021-retrospective-halt-overpass.lib.ts',
    'scripts/ops/exp021-retrospective-halt-prototype.ts',
    'src/modules/vehicle-intelligence/driving-intelligence/core/calibration/CALIBRATION_UNSET_V0.ts',
  ];
  const fileHashes: Record<string, string> = {};
  for (const rel of files) {
    const p = path.join(backendRoot, rel);
    fileHashes[rel] = sha256File(p);
  }
  const parameterSnapshot = {
    prototypeVersions: {
      v0_1: RETROSPECTIVE_HALT_PROTOTYPE_VERSION,
      v0_2: RETROSPECTIVE_HALT_PROTOTYPE_V2_VERSION,
    },
    geometryThresholds: GEOMETRY_THRESHOLDS,
    minDisplacementMForAnyInference: MIN_DISPLACEMENT_M_FOR_ANY_INFERENCE,
    calibrationBundle: CALIBRATION_UNSET_V0_BUNDLE,
    v0_2ScoringNote: 'Composite hypothesis margins frozen in v2 lib — no edits in freeze review step',
    mapContextDecisionRule: 'NONE — mapContextVariantB is enrichment/logging only; classification identical A vs B',
  };
  return {
    freezeId: V0_2_FREEZE_ID,
    frozenAtUtc: new Date().toISOString(),
    fileHashes,
    parameterSnapshot,
    parameterSnapshotHash: sha256Json(parameterSnapshot),
  };
}

export function utcToBerlin(isoUtc: string): string {
  const d = new Date(isoUtc);
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: BERLIN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(d);
}

export type VideoTachoBreakdown = {
  tacho0: number;
  tacho1to3: number;
  tacho3to5: number;
  tachoGt5: number;
  unknown: number;
  totalLabeledSeconds: number;
};

export function videoBreakdownForLabels(
  labels: string[],
  videoByLabel: Map<string, { tachoKmh: number | null }>,
): VideoTachoBreakdown {
  const out: VideoTachoBreakdown = {
    tacho0: 0,
    tacho1to3: 0,
    tacho3to5: 0,
    tachoGt5: 0,
    unknown: 0,
    totalLabeledSeconds: labels.length,
  };
  for (const l of labels) {
    const t = videoByLabel.get(l)?.tachoKmh;
    if (t == null || !Number.isFinite(t)) out.unknown += 1;
    else if (t === 0) out.tacho0 += 1;
    else if (t >= 1 && t <= 3) out.tacho1to3 += 1;
    else if (t > 3 && t <= 5) out.tacho3to5 += 1;
    else if (t > 5) out.tachoGt5 += 1;
    else out.unknown += 1;
  }
  return out;
}

export type VideoVerdict = 'SUPPORTED' | 'CONTRADICTED' | 'NOT_DECISIVE' | 'UNKNOWN_COVERAGE';

export type VideoDualAxisEvaluation = {
  /** At least 3s tacho===0 somewhere inside gap labels (partial stop evidence). */
  haltSomewhereInWindow: 'YES' | 'NO' | 'UNKNOWN';
  /** All labeled seconds tacho===0 and ≥5 labeled seconds (strict full-window standstill display). */
  standstillEntireLabeledWindow: 'YES' | 'NO' | 'UNKNOWN';
  breakdown: VideoTachoBreakdown;
  ruleBook: string;
};

export function evaluateVideoDualAxis(video: VideoTachoBreakdown): VideoDualAxisEvaluation {
  const known = video.totalLabeledSeconds - video.unknown;
  let haltSomewhere: 'YES' | 'NO' | 'UNKNOWN' = 'UNKNOWN';
  let standstillEntire: 'YES' | 'NO' | 'UNKNOWN' = 'UNKNOWN';
  if (known === 0) {
    haltSomewhere = 'UNKNOWN';
    standstillEntire = 'UNKNOWN';
  } else {
    haltSomewhere = video.tacho0 >= 3 ? 'YES' : video.tacho0 > 0 ? 'YES' : 'NO';
    standstillEntire =
      known >= 5 && video.tacho0 === known && video.tacho1to3 === 0 && video.tacho3to5 === 0 && video.tachoGt5 === 0
        ? 'YES'
        : 'NO';
  }
  return {
    haltSomewhereInWindow: haltSomewhere,
    standstillEntireLabeledWindow: standstillEntire,
    breakdown: video,
    ruleBook:
      'Axis A: ≥3s or any tacho0 in gap window. Axis B: all known seconds tacho0 and ≥5 known seconds. Unknown seconds excluded from B and do not count as hit or error. Post-hoc verdict (SUPPORTED/…) compares detector class to both axes — not “no contradict = proof”.',
  };
}

export function videoVerdictForGapClass(
  classification: RetrospectiveExplanation,
  video: VideoTachoBreakdown,
): { verdict: VideoVerdict; rationale: string } {
  const known = video.totalLabeledSeconds - video.unknown;
  const dominantMoving = video.tachoGt5 + video.tacho3to5;
  const dominantStop = video.tacho0;

  if (known === 0) {
    return {
      verdict: 'UNKNOWN_COVERAGE',
      rationale: 'Keine bekannte Video-Tacho-Annotation im Lückenfenster (unbekannt zählt nicht als Treffer/Fehler).',
    };
  }

  if (classification === 'LIKELY_HALT') {
    if (dominantStop >= 5 && dominantMoving === 0) {
      return { verdict: 'SUPPORTED', rationale: `${dominantStop}s Tacho 0 im Fenster, kein Tacho >3.` };
    }
    if (dominantMoving >= 5 && dominantStop === 0) {
      return {
        verdict: 'CONTRADICTED',
        rationale: `${dominantMoving}s Tacho >3 im Fenster ohne Tacho 0 — positiver Haltbeleg fehlt.`,
      };
    }
    if (dominantStop >= 3 && dominantMoving > 0) {
      return {
        verdict: 'NOT_DECISIVE',
        rationale: 'Gemischtes Fenster (Tacho 0 und >3) — kleine Chord allein ist kein positiver Haltbeleg.',
      };
    }
    return {
      verdict: 'NOT_DECISIVE',
      rationale:
        'LIKELY_HALT aus Geometrie/Chord, aber Video liefert keinen klaren Stillstand im Lückenfenster (kein Widerspruch ≠ Haltbeleg).',
    };
  }

  if (classification === 'LIKELY_MOVING_WITH_GAP') {
    if (dominantStop >= 5) {
      return { verdict: 'CONTRADICTED', rationale: `${dominantStop}s Video-Tacho 0 widerspricht Durchfahrt.` };
    }
    if (dominantMoving >= 3) {
      return { verdict: 'SUPPORTED', rationale: 'Video zeigt überwiegend Tacho >3 im Lückenfenster.' };
    }
    return { verdict: 'NOT_DECISIVE', rationale: 'Unklare oder unbekannte Videoanteile.' };
  }

  if (classification === 'LIKELY_SLOW_ROLL_STOP_GO') {
    if (video.tacho1to3 >= 3 || (video.tacho1to3 + video.tacho0) >= 5) {
      return { verdict: 'SUPPORTED', rationale: 'Video zeigt langsame / Stop-go-ähnliche Werte (0–3 km/h).' };
    }
    if (dominantMoving >= 5) {
      return { verdict: 'CONTRADICTED', rationale: 'Video überwiegend >3 km/h.' };
    }
    return { verdict: 'NOT_DECISIVE', rationale: 'Video nicht eindeutig für Slow-roll.' };
  }

  return { verdict: 'NOT_DECISIVE', rationale: 'Detektor unentscheidbar oder dünne Videoabdeckung.' };
}

function intervalsOverlap(a0: string, a1: string, b0: string, b1: string): boolean {
  return a0 <= b1 && b0 <= a1;
}

export type MainHaltDetectorOutcome =
  | 'PROBABLE_HALT_CLASSIFIED'
  | 'STOP_AND_GO_ONLY'
  | 'CONTINUOUS_ROLL_OR_MOVING_GAP'
  | 'DETECTOR_UNKNOWN'
  | 'NO_GAP_CANDIDATE_OVERLAP';

export function classifyMainHaltOutcome(
  overlapping: Array<{ eventId: string; classification: RetrospectiveExplanation }>,
): { outcome: MainHaltDetectorOutcome; detail: string } {
  if (overlapping.length === 0) {
    return { outcome: 'NO_GAP_CANDIDATE_OVERLAP', detail: 'Kein Positionslücken-Kandidat überlappt.' };
  }
  const classes = overlapping.map((e) => e.classification);
  if (classes.includes('LIKELY_HALT')) {
    return {
      outcome: 'PROBABLE_HALT_CLASSIFIED',
      detail:
        'Mindestens ein überlappendes Ereignis LIKELY_HALT — bedeutet nicht zeitliche Lokalisierung des Halts innerhalb des Fensters.',
    };
  }
  if (classes.every((c) => c === 'LIKELY_SLOW_ROLL_STOP_GO')) {
    return { outcome: 'STOP_AND_GO_ONLY', detail: 'Nur Slow-roll/Stop-go-Klassifikation auf Lücke.' };
  }
  if (classes.includes('LIKELY_MOVING_WITH_GAP')) {
    return { outcome: 'CONTINUOUS_ROLL_OR_MOVING_GAP', detail: 'Weiterfahrt/mit Lücke klassifiziert.' };
  }
  return { outcome: 'DETECTOR_UNKNOWN', detail: 'NOT_DISTINGUISHABLE oder gemischte schwache Signale.' };
}

export function buildTenEventReview(args: {
  gaps: GapRun[];
  presentPoints: PresentPoint[];
  posByLabel: Map<string, DiV0SpeedQcPositionSample>;
  r1ByLabel: Map<string, number | null>;
  videoByLabel: Map<string, { tachoKmh: number | null }>;
  gapEventsV02FromExport?: Array<{ eventId: string; mapContextVariantB?: Record<string, unknown> | null }>;
}) {
  return args.gaps.map((g, idx) => {
    const eventId = `GAP_EVT_${String(idx + 1).padStart(3, '0')}`;
    const v01 = analyzeGapCandidate(g, args.presentPoints, args.r1ByLabel);
    const v02 = analyzeGapCandidateV2(g, args.presentPoints, args.posByLabel, args.r1ByLabel);
    const labels = g.labels.length ? g.labels : enumerateInclusive(g.fromUtc, g.toUtc);
    const video = videoBreakdownForLabels(labels, args.videoByLabel);
    const videoVerdict = videoVerdictForGapClass(v02.explanation, video);
    const videoDual = evaluateVideoDualAxis(video);
    const overlappingMainHalts = EXP021_VIDEO_TACHO_ZERO_WINDOWS_UTC.map((w, i) => ({
      haltId: `LONG_HALT_${i + 1}`,
      overlaps: intervalsOverlap(g.fromUtc, g.toUtc, w.from, w.to),
    })).filter((h) => h.overlaps);

    const exportMap = args.gapEventsV02FromExport?.find((e) => e.eventId === eventId)?.mapContextVariantB;

    return {
      eventId,
      windowUtc: { from: g.fromUtc, to: g.toUtc },
      windowBerlin: { from: utcToBerlin(g.fromUtc), to: utcToBerlin(g.toUtc) },
      gapDurationSec: g.durationSec,
      classificationV01: v01.explanation,
      classificationV02: v02.explanation,
      decisiveMetricsV02: v02.metrics,
      hypothesisScoresV02: v02.hypothesisScores,
      rulesV02: [
        'V0_2_COMPOSITE_HYPOTHESIS',
        'CALENDAR_ADJACENT_GAP_EDGES',
        'DISTANT_CONTEXT_REPORTED_SEPARATELY',
      ],
      decisiveFeaturesV02: v02.decisiveFeatures,
      evidenceV02: v02.evidence,
      videoInGapWindow: video,
      overlappingAnnotatedMainHalts: overlappingMainHalts.map((h) => h.haltId),
      videoPostHocVerdict: videoVerdict,
      videoDualAxis: videoDual,
      timeLabelNote: 'Berlin times are Europe/Berlin CEST (UTC+2); UTC = Berlin − 2h on this trip date.',
      mapContext: {
        role: 'DISPLAY_CONTEXT_ONLY_NOT_CLASSIFIER',
        payload: exportMap ?? null,
        classificationWouldChange: false,
      },
      haltLocalizationClaimed: false,
    };
  });
}

export function buildMainHaltHonestReview(
  gapReview: ReturnType<typeof buildTenEventReview>,
  videoByLabel: Map<string, { tachoKmh: number | null }>,
) {
  return EXP021_VIDEO_TACHO_ZERO_WINDOWS_UTC.map((w, i) => {
    const haltId = `LONG_HALT_${i + 1}`;
    const labels = enumerateInclusive(w.from, w.to);
    const video = videoBreakdownForLabels(labels, videoByLabel);
    const overlappingEvents = gapReview.filter((e) =>
      intervalsOverlap(e.windowUtc.from, e.windowUtc.to, w.from, w.to),
    );
    const { outcome, detail } = classifyMainHaltOutcome(
      overlappingEvents.map((e) => ({ eventId: e.eventId, classification: e.classificationV02 })),
    );
    const isH4 = haltId === 'LONG_HALT_4';
    const isH5 = haltId === 'LONG_HALT_5';
    return {
      haltId,
      referenceSemantics: REFERENCE_LONG_HALT_SEMANTICS.definition,
      physicalHaltProven: false,
      videoWindowUtc: { from: w.from, to: w.to },
      videoWindowBerlin: { from: utcToBerlin(w.from), to: utcToBerlin(w.to) },
      berlinEqualsUtcPlus2h: true,
      videoTacho0LabeledSeconds: video.tacho0,
      videoBreakdownFullWindow: video,
      h4h5Note:
        isH4 || isH5
          ? {
              annotationGapBetweenH4H5: LONG_HALT_H4_H5_ANNOTATION_GAP,
              sharedPositionGapCandidate: 'GAP_EVT_008',
              physicalEventCount: LONG_HALT_H4_H5_ANNOTATION_GAP.physicalEventCountH4H5,
            }
          : null,
      detectorOutcome: outcome,
      detectorOutcomeDetail: detail,
      overlappingGapEvents: overlappingEvents.map((e) => ({
        eventId: e.eventId,
        classificationV02: e.classificationV02,
        gapWindowUtc: e.windowUtc,
        note:
          e.gapDurationSec > labels.length + 5
            ? 'Lückenkandidat breiter als annotiertes Tacho-0-Fenster — Halt nicht innerhalb des Kandidaten lokalisiert.'
            : null,
      })),
      multipleEventsShareHalt: overlappingEvents.length > 1,
      visualReviewPerformed: false,
      annotationOnlyEvaluation: true,
    };
  });
}

export function naturalGapCounterReport(gapReview: ReturnType<typeof buildTenEventReview>) {
  const byClass: Record<string, number> = {};
  let falseHaltCandidate = 0;
  let haltWithoutVideoStop = 0;
  let notDecisiveVideo = 0;
  let contradicted = 0;
  let supported = 0;

  for (const e of gapReview) {
    byClass[e.classificationV02] = (byClass[e.classificationV02] ?? 0) + 1;
    if (e.classificationV02 === 'LIKELY_HALT') {
      if (e.overlappingAnnotatedMainHalts.length === 0) haltWithoutVideoStop += 1;
      if (e.videoPostHocVerdict.verdict === 'CONTRADICTED') falseHaltCandidate += 1;
      if (e.videoPostHocVerdict.verdict === 'NOT_DECISIVE' && e.overlappingAnnotatedMainHalts.length === 0) {
        falseHaltCandidate += 1;
      }
    }
    if (e.videoPostHocVerdict.verdict === 'NOT_DECISIVE') notDecisiveVideo += 1;
    if (e.videoPostHocVerdict.verdict === 'SUPPORTED') supported += 1;
    if (e.videoPostHocVerdict.verdict === 'CONTRADICTED') contradicted += 1;
  }

  return {
    caseCount: gapReview.length,
    predictedClassCounts: byClass,
    falseHaltSignals: {
      likelyHaltWithoutOverlappingMainHaltWindow: haltWithoutVideoStop,
      likelyHaltWithVideoContradictionOrNoStopEvidence: falseHaltCandidate,
      interpretation:
        'v0_2 kann Lücken mit kleiner Chord als LIKELY_HALT stufen ohne Video-Tacho-0 im Lückenfenster — kein positiver Haltbeleg.',
    },
    videoPostHoc: { supported, contradicted, notDecisive: notDecisiveVideo },
    referenceCoverage: {
      mainHaltsWithOverlap: EXP021_VIDEO_TACHO_ZERO_WINDOWS_UTC.filter((w, i) =>
        gapReview.some((e) => intervalsOverlap(e.windowUtc.from, e.windowUtc.to, w.from, w.to)),
      ).length,
      mainHaltsTotal: 5,
    },
  };
}

export function syntheticCounterReport(
  presentPoints: PresentPoint[],
  sortedLabels: string[],
  posByLabel: Map<string, DiV0SpeedQcPositionSample>,
) {
  const battery = runSyntheticGapBattery(presentPoints, sortedLabels, posByLabel);
  const synthetic = battery.cases.filter((c) => c.synthetic);
  const natural = battery.cases.filter((c) => !c.synthetic);
  return {
    syntheticCaseCount: synthetic.length,
    syntheticPassCount: synthetic.filter((c) => c.pass).length,
    syntheticFailCount: synthetic.filter((c) => !c.pass).length,
    syntheticByClass: countBy(synthetic.map((c) => c.classification)),
    naturalReplayCount: natural.length,
    naturalReplayClasses: countBy(natural.map((c) => c.classification)),
    cases: battery.cases,
  };
}

function countBy(items: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const x of items) m[x] = (m[x] ?? 0) + 1;
  return m;
}

export function slowRollVideoNumbers(
  presentPoints: PresentPoint[],
  positions: DiV0SpeedQcPositionSample[],
  videoByLabel: Map<string, { tachoKmh: number | null }>,
) {
  const rows = classifyAllPresentLegsV2(presentPoints, positions).filter((r) => r.geometryClass === 'SLOW_ROLL_GEOMETRY');
  const all = videoBreakdownForLabels(rows.map((r) => r.bucketLabelUtc), videoByLabel);
  const eligible = videoBreakdownForLabels(
    rows.filter((r) => r.countsForSlowRollAggregate).map((r) => r.bucketLabelUtc),
    videoByLabel,
  );
  return {
    totalSlowRollGeometrySeconds: rows.length,
    detectorBandKmh: `${GEOMETRY_THRESHOLDS.slowRollMinKmh}–${GEOMETRY_THRESHOLDS.slowRollMaxKmh}`,
    videoCrossTabAllSeconds: all,
    videoCrossTabAggregateEligibleSeconds: eligible,
    noteGt3Split: 'tacho3to5 = display (3,5]; tachoGt5 = >5 km/h (above detector slow-roll max)',
  };
}

export function buildReviewMarkdownTable(tenEvents: ReturnType<typeof buildTenEventReview>): string {
  const header =
    '| Evt | Berlin (von–bis) | v0_1 | v0_2 | Video 0 / 1–3 / 3–5 / >5 / ? | Haupthalt | Video-Urteil |\n|-----|-------------------|------|------|----------------------------------|-----------|--------------|';
  const rows = tenEvents.map((e) => {
    const v = e.videoInGapWindow;
    const halts = e.overlappingAnnotatedMainHalts.join(',') || '—';
    const verdict = e.videoPostHocVerdict.verdict;
    return `| ${e.eventId} | ${e.windowBerlin.from}–${e.windowBerlin.to} | ${e.classificationV01} | ${e.classificationV02} | ${v.tacho0}/${v.tacho1to3}/${v.tacho3to5}/${v.tachoGt5}/${v.unknown} | ${halts} | ${verdict} |`;
  });
  return `${header}\n${rows.join('\n')}`;
}

export function videoCoverageStatus(
  event: { windowUtc: { from: string; to: string } },
  videoAnchorUtc: string,
): 'BEFORE_EXISTING_VIDEO' | 'MOSTLY_BEFORE_EXISTING_VIDEO' | 'WITHIN_EXISTING_VIDEO' {
  const anchor = bucketLabelToMs(videoAnchorUtc);
  const from = bucketLabelToMs(event.windowUtc.from);
  const to = bucketLabelToMs(event.windowUtc.to);
  if (to < anchor) return 'BEFORE_EXISTING_VIDEO';
  if (from < anchor && to >= anchor) {
    const before = anchor - from;
    const total = to - from + 1000;
    if (before / total > 0.5) return 'MOSTLY_BEFORE_EXISTING_VIDEO';
  }
  return 'WITHIN_EXISTING_VIDEO';
}

export const GEOMETRY_NET_DISPLACEMENT_SEMANTICS = {
  endpointChordM: {
    name: 'Endpunkt-Abstand (Kalender-benachbarte PRESENT-Punkte über die Lücke)',
    not: ['gemessene Weglänge', 'tatsächliche Fahrgeschwindigkeit', 'mittlere Fahrgeschwindigkeit entlang der Strecke'],
    is: 'mittlere Netto-Ortsveränderung = chordM / gapDurationSec (nur für Bericht oft als km/h umgerechnet)',
    uncertainty:
      'Unbekannte Trajektorie innerhalb ROW_ABSENT; Werte allein belegen weder Stillstandsdauer noch Bewegung durch die ganze Lücke.',
  },
  separateFields: ['endpointDisplacementM', 'gapDurationSec', 'netDisplacementRateKmh (derived)'],
} as const;

export type VideoAxisAnswer = 'YES' | 'NO' | 'CANNOT_PROVE' | 'NOT_OBSERVABLE' | 'NOT_DETERMINED';

export type VideoAxesABC = {
  A_tachoZeroSectionInPredictedWindow: VideoAxisAnswer;
  B_entireWindowContinuousTachoZero: VideoAxisAnswer;
  C_haltBeginEndDurationDetermined: VideoAxisAnswer;
  breakdown: VideoTachoBreakdown;
  rules: {
    A: string;
    B: string;
    C: string;
  };
  exampleNote?: string;
};

export function evaluateVideoAxesABC(video: VideoTachoBreakdown): VideoAxesABC {
  const known = video.totalLabeledSeconds - video.unknown;
  let A: VideoAxisAnswer = 'NOT_OBSERVABLE';
  if (known === 0) A = 'NOT_OBSERVABLE';
  else A = video.tacho0 >= 1 ? 'YES' : 'NO';

  let B: VideoAxisAnswer = 'CANNOT_PROVE';
  const knownPositiveTacho =
    video.tacho1to3 + video.tacho3to5 + video.tachoGt5;
  if (known === 0) {
    B = 'CANNOT_PROVE';
  } else if (knownPositiveTacho >= 1) {
    // Any annotated non-zero tacho falsifies "entire window continuously tacho 0".
    B = 'NO';
  } else if (video.unknown > 0) {
    B = 'CANNOT_PROVE';
  } else if (video.tacho0 === known) {
    B = 'YES';
  } else {
    B = 'NO';
  }

  const C: VideoAxisAnswer = 'NOT_DETERMINED';

  const exampleNote =
    video.tacho0 >= 5 && (video.tacho1to3 + video.tacho3to5 + video.tachoGt5) >= 1
      ? 'Beispiel 006: viele Tacho-0-Sekunden stützen A, mindestens eine Bewegungssekunde widerspricht B; C bleibt offen.'
      : undefined;

  return {
    A_tachoZeroSectionInPredictedWindow: A,
    B_entireWindowContinuousTachoZero: B,
    C_haltBeginEndDurationDetermined: C,
    breakdown: video,
    rules: {
      A: 'Mindestens 1 s mit annotiertem Tacho 0 im vorhergesagten Lückenfenster.',
      B:
        'Alle gelabelten Sekunden Tacho 0 → YES; mindestens eine gelabelte Bewegungssekunde → NO (auch bei weiteren unbekannten Sekunden); nur unbekannte ohne gelabelte Bewegung → CANNOT_PROVE.',
      C: 'Retrospektiver Lücken-Detektor liefert keine Halt-Ein-/Ausfahrt oder Stillstandsdauer.',
    },
    exampleNote,
  };
}

export function movementEventLabel(classification: RetrospectiveExplanation): string {
  switch (classification) {
    case 'LIKELY_HALT':
      return 'wahrscheinlicher_Halt';
    case 'LIKELY_SLOW_ROLL_STOP_GO':
      return 'Rollen_Stop_and_go';
    case 'LIKELY_MOVING_WITH_GAP':
      return 'Fahrt_mit_Luecke';
    default:
      return 'unbekannt';
  }
}

export function classifyPossibleCauseContext(
  mapAnalysis: import('./exp021-retrospective-halt-map-hypothesis-v1.lib').MapAssociationAnalysis,
): {
  context: 'possibly_near_signal' | 'possibly_intersection_unresolved' | 'other_or_distant' | 'unknown_no_map';
  alongRouteM: number | null;
  euclideanM: number | null;
  bearingDeltaDeg: number | null;
  disclaimers: string[];
} {
  const n = mapAnalysis.nearestAlongRoute;
  const disclaimers = [
    'Kein Beweis für Rotphase oder Halt.',
    'Nur Einordnung möglicher Ursache — nicht entscheidungswirksam (MAP V1 verworfen).',
  ];
  if (!n || mapAnalysis.missingData.includes('no_osm_traffic_signals_in_frozen_export')) {
    return {
      context: 'unknown_no_map',
      alongRouteM: null,
      euclideanM: null,
      bearingDeltaDeg: null,
      disclaimers,
    };
  }
  if (n.alongRouteM <= 40) {
    return {
      context: 'possibly_near_signal',
      alongRouteM: n.alongRouteM,
      euclideanM: n.euclideanM,
      bearingDeltaDeg: n.bearingDeltaDeg,
      disclaimers,
    };
  }
  if (n.alongRouteM <= 80) {
    return {
      context: 'possibly_intersection_unresolved',
      alongRouteM: n.alongRouteM,
      euclideanM: n.euclideanM,
      bearingDeltaDeg: n.bearingDeltaDeg,
      disclaimers,
    };
  }
  return {
    context: 'other_or_distant',
    alongRouteM: n.alongRouteM,
    euclideanM: n.euclideanM,
    bearingDeltaDeg: n.bearingDeltaDeg,
    disclaimers,
  };
}

export function buildVideoABC005to008(tenEvents: ReturnType<typeof buildTenEventReview>) {
  return tenEvents
    .filter((e) => ['GAP_EVT_005', 'GAP_EVT_006', 'GAP_EVT_007', 'GAP_EVT_008'].includes(e.eventId))
    .map((e) => ({
      eventId: e.eventId,
      movementEventV02: movementEventLabel(e.classificationV02),
      videoAxes: evaluateVideoAxesABC(e.videoInGapWindow),
      videoCoverage: videoCoverageStatus(e, VIDEO_ANCHOR.firstVisibleClockLabelUtc),
    }));
}

export function buildDevelopmentStatusConsolidated(args: {
  natural: ReturnType<typeof naturalGapCounterReport>;
  synthetic: ReturnType<typeof syntheticCounterReport>;
  tenEvents: ReturnType<typeof buildTenEventReview>;
}) {
  const haltOnMain = args.tenEvents.filter(
    (e) => e.overlappingAnnotatedMainHalts.length > 0 && e.classificationV02 === 'LIKELY_HALT',
  );
  return {
    v02OnThisTripTraceable: [
      '10 Positionslücken ≥3 s als Kandidaten; 5 annotierte Tacho-0-Abschnitte (LONG_HALT_*) mit überlappender Lücke.',
      'v0_2 klassifiziert überlappende Haupthalt-Lücken überwiegend als LIKELY_HALT bei kleiner Endpunkt-Chord + Abfahrt-Muster (ohne Halt-Lokalisierung).',
      'Frühe Lücken 002/003: LIKELY_HALT aus Geometrie, Video nicht vollständig prüfbar — Fehlalarm-Risiko.',
      'Geometrie: Netto-Ortsveränderung über Lücke, nicht gemessene Weglänge (siehe GEOMETRY_NET_DISPLACEMENT_SEMANTICS).',
    ],
    counterCasesPassed: [
      `Synthetisch: ${args.synthetic.syntheticPassCount}/${args.synthetic.syntheticCaseCount} (kein LIKELY_HALT in maskierter Fahrt; ${JSON.stringify(args.synthetic.syntheticByClass)}).`,
      'Natürlich: keine v0_2 LIKELY_MOVING_WITH_GAP auf den fünf Referenz-Tacho-0-Lücken (v0_1-Fehlmuster behoben).',
      'MAP_DECISION_HYPOTHESIS_V1 verworfen — kein produktives Karten-Veto.',
    ],
    remainingFalseAlarmRisks: [
      `${args.natural.falseHaltSignals.likelyHaltWithoutOverlappingMainHaltWindow} LIKELY_HALT ohne LONG_HALT-Overlap (002/003).`,
      'Chord-kleine lange Lücken können LIKELY_HALT auslösen ohne Video-Tacho-0 im Lückenfenster.',
      'GAP_EVT_008: ein Kandidat für zwei annotierte Tacho-0-Abschnitte — physische Ereignisanzahl ungeklärt.',
      '52 SLOW_ROLL-Geometrie-Sekunden vs. Video oft >3 km/h — Rollen/Halt-Verwechslung bei dichten PRESENT-Ketten.',
    ],
    nextIndependentReferenceCasesNeeded: [
      'Weitere Fahrten mit unabhängigem Video + unterschiedliche Lückenprofile (kurz/lang, innerorts/außerorts).',
      'Fahrten mit vollständiger Videoabdeckung der gesamten Trip-Zeit (kein Vor-Anker-Blindfeld).',
      'Explizite Gegenfälle: Rollen an Ampel ohne Halt, Halt ohne OSM-Signal in Reichweite, Durchfahrt mit ROW_ABSENT.',
      'Blind gehaltene Halte (nicht in dieser Tesla-Referenzfahrt tunen).',
    ],
    noFurtherTuningOnTheseFourHaltRegions: true,
  };
}

export function buildPositiveHaltIndications005to008(
  tenEvents: ReturnType<typeof buildTenEventReview>,
): Array<{
  eventId: string;
  classificationV02: string;
  positiveIndications: Array<{ feature: string; value: string | number | null }>;
  supportingEvidenceLines: string[];
  explicitNonProof: string[];
}> {
  const ids = ['GAP_EVT_005', 'GAP_EVT_006', 'GAP_EVT_007', 'GAP_EVT_008'];
  return tenEvents
    .filter((e) => ids.includes(e.eventId))
    .map((e) => {
      const m = e.decisiveMetricsV02 as Record<string, unknown>;
      const positives: Array<{ feature: string; value: string | number | null }> = [];
      if (m.endpointDisplacementM != null) {
        positives.push({ feature: 'endpointChordM', value: Number(m.endpointDisplacementM) });
      }
      if (m.gapDurationSec != null) {
        positives.push({ feature: 'gapDurationSec', value: Number(m.gapDurationSec) });
      }
      if (m.impliedChordKmh != null) {
        positives.push({
          feature: 'netDisplacementRateKmh',
          value: Number(m.impliedChordKmh),
        });
      }
      positives.push({
        feature: 'geometrySemantics',
        value: GEOMETRY_NET_DISPLACEMENT_SEMANTICS.endpointChordM.is,
      });
      if (m.legOutOfGapKmh != null) {
        positives.push({ feature: 'legOutOfGapKmh_departure', value: Number(m.legOutOfGapKmh) });
      }
      if (m.legIntoGapKmh != null) {
        positives.push({ feature: 'legIntoGapKmh', value: Number(m.legIntoGapKmh) });
      }
      const scores = e.hypothesisScoresV02;
      positives.push({ feature: 'hypothesisScore_LIKELY_HALT', value: scores.LIKELY_HALT });
      const supportLines = e.evidenceV02.filter((x) => x.tier === 'SUPPORTS').map((x) => x.text);
      return {
        eventId: e.eventId,
        classificationV02: e.classificationV02,
        positiveIndications: positives,
        supportingEvidenceLines: supportLines,
        explicitNonProof: [
          'Small chord supports “little net displacement across gap”, not standstill duration.',
          'Post-gap moving leg supports halt-then-depart composite, not halt localized in gap.',
          'Empty contradictingEvidence list is not a positive halt proof.',
          'Video axis “halt somewhere” and detector LIKELY_HALT are separate claims.',
        ],
      };
    });
}

export function clipRequestsForVideoChat(
  mainHalts: ReturnType<typeof buildMainHaltHonestReview>,
  tenEvents: ReturnType<typeof buildTenEventReview>,
): Array<{
  id: string;
  berlinFrom: string;
  berlinTo: string;
  utcFrom: string;
  utcTo: string;
  reason: string;
  action: 'REQUEST_CLIP' | 'DOCUMENT_NOT_VERIFIABLE';
}> {
  const anchor = VIDEO_ANCHOR.firstVisibleClockLabelUtc;
  const out: Array<{
    id: string;
    berlinFrom: string;
    berlinTo: string;
    utcFrom: string;
    utcTo: string;
    reason: string;
    action: 'REQUEST_CLIP' | 'DOCUMENT_NOT_VERIFIABLE';
  }> = [];

  for (const e of tenEvents) {
    const coverage = videoCoverageStatus(e, anchor);
    if (coverage === 'BEFORE_EXISTING_VIDEO') {
      out.push({
        id: e.eventId,
        utcFrom: e.windowUtc.from,
        utcTo: e.windowUtc.to,
        berlinFrom: `${e.windowBerlin.from} (UTC ${e.windowUtc.from})`,
        berlinTo: `${e.windowBerlin.to} (UTC ${e.windowUtc.to})`,
        action: 'DOCUMENT_NOT_VERIFIABLE',
        reason:
          'Vollständig vor vorhandenem Video (Anker 05:37:41 Berlin / 03:37:41Z). Kein weiteres früheres Video anfordern.',
      });
      continue;
    }
    if (coverage === 'MOSTLY_BEFORE_EXISTING_VIDEO') {
      out.push({
        id: e.eventId,
        utcFrom: e.windowUtc.from,
        utcTo: e.windowUtc.to,
        berlinFrom: `${e.windowBerlin.from} (UTC ${e.windowUtc.from})`,
        berlinTo: `${e.windowBerlin.to} (UTC ${e.windowUtc.to})`,
        action: 'DOCUMENT_NOT_VERIFIABLE',
        reason:
          'Überwiegend vor Video-Anker; mit vorhandenem Material nicht vollständig prüfbar — keine Wiederholungsanfrage.',
      });
    }
  }

  const evt008 = tenEvents.find((e) => e.eventId === 'GAP_EVT_008');
  if (evt008) {
    out.push({
      id: 'GAP_EVT_008_H4_H5_CONTEXT',
      utcFrom: evt008.windowUtc.from,
      utcTo: evt008.windowUtc.to,
      berlinFrom: '05:43:43 (03:43:43Z)',
      berlinTo: '05:44:36 (03:44:36Z)',
      action: 'REQUEST_CLIP',
      reason:
        'Optional: H4/H5 Tacho-0-Fenster und Annotationslücke 05:44:03–05:44:09 (03:44:03–03:44:09Z) — physische Ereignisanzahl ungeklärt; kein Merge-Fehler.',
    });
  }

  return out;
}

export function buildPerEventDecisionRows(args: {
  tenEvents: ReturnType<typeof buildTenEventReview>;
  mapContextByEvent: Map<
    string,
    ReturnType<typeof classifyPossibleCauseContext> & {
      mapAnalysis: import('./exp021-retrospective-halt-map-hypothesis-v1.lib').MapAssociationAnalysis;
    }
  >;
}): Array<Record<string, unknown>> {
  return args.tenEvents.map((e) => {
    const axes = evaluateVideoAxesABC(e.videoInGapWindow);
    const ctx = args.mapContextByEvent.get(e.eventId);
    const videoSummary =
      axes.A_tachoZeroSectionInPredictedWindow === 'NOT_OBSERVABLE'
        ? 'unbekannt'
        : axes.A_tachoZeroSectionInPredictedWindow === 'YES' && axes.B_entireWindowContinuousTachoZero === 'NO'
          ? 'teilweise_gestuetzt'
          : axes.B_entireWindowContinuousTachoZero === 'YES'
            ? 'gestützt_ganzes_Fenster'
            : axes.A_tachoZeroSectionInPredictedWindow === 'YES'
              ? 'Abschnitt_ja_ganzes_Fenster_nein'
              : 'widersprochen_kein_Tacho0';
    return {
      eventId: e.eventId,
      windowBerlin: e.windowBerlin,
      windowUtc: e.windowUtc,
      timeLabelNote: '05:xx Europe/Berlin = 03:xx UTC (CEST)',
      movementEventV02: movementEventLabel(e.classificationV02),
      decisionV02Frozen: e.classificationV02,
      possibleCauseContext: ctx?.context ?? 'unknown_no_map',
      mapContextMetrics: ctx
        ? {
            alongRouteM: ctx.alongRouteM,
            euclideanM: ctx.euclideanM,
            bearingDeltaDeg: ctx.bearingDeltaDeg,
          }
        : null,
      mapDecisionV1: {
        status: 'REJECTED',
        effectiveOnClassification: false,
        note: 'MAP_DECISION_HYPOTHESIS_V1 not applied; see EXP021_MAP_DECISION_HYPOTHESIS_V1_REJECTED.md',
      },
      videoAxesABC: axes,
      videoSummary,
      videoValidatable: videoCoverageStatus(e, VIDEO_ANCHOR.firstVisibleClockLabelUtc),
    };
  });
}

export function inputStandHash(ctx: {
  evidence: { positions: DiV0SpeedQcPositionSample[] };
  shadowIntervals: unknown[];
}): string {
  const labels = ctx.evidence.positions.map((p) => `${p.bucketLabel}:${p.availability}`).sort();
  return sha256Json({ positionLabelCount: labels.length, positionLabelsSha: sha256Json(labels), shadowRows: ctx.shadowIntervals.length });
}

export { VIDEO_ANCHOR };
