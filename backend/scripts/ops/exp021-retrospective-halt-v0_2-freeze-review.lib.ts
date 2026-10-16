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
  classifyAllPresentLegsV2,
  RETROSPECTIVE_HALT_PROTOTYPE_V2_VERSION,
  runSyntheticGapBattery,
  type MainHaltRow,
} from './exp021-retrospective-halt-prototype-v2.lib';
import type { PresentPoint } from './exp021-retrospective-halt-prototype.lib';

export const V0_2_FREEZE_ID = 'EXP021_RETROSPECTIVE_HALT_V0_2_FROZEN_REVIEW_2026-10-16';

const BERLIN_TZ = 'Europe/Berlin';

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

export type VideoVerdict = 'SUPPORTED' | 'CONTRADICTED' | 'NOT_DECISIVE';

export function videoVerdictForGapClass(
  classification: RetrospectiveExplanation,
  video: VideoTachoBreakdown,
): { verdict: VideoVerdict; rationale: string } {
  const known = video.totalLabeledSeconds - video.unknown;
  const dominantMoving = video.tachoGt5 + video.tacho3to5;
  const dominantStop = video.tacho0;

  if (known === 0) {
    return {
      verdict: 'NOT_DECISIVE',
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
      mapContext: {
        role: 'ENRICHMENT_ONLY_NOT_CLASSIFIER',
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
    return {
      haltId,
      videoWindowUtc: { from: w.from, to: w.to },
      videoWindowBerlin: { from: utcToBerlin(w.from), to: utcToBerlin(w.to) },
      videoTacho0LabeledSeconds: video.tacho0,
      videoBreakdownFullWindow: video,
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

export function clipRequestsForVideoChat(
  mainHalts: ReturnType<typeof buildMainHaltHonestReview>,
  tenEvents: ReturnType<typeof buildTenEventReview>,
): Array<{ id: string; berlinFrom: string; berlinTo: string; utcFrom: string; utcTo: string; reason: string }> {
  const out: Array<{ id: string; berlinFrom: string; berlinTo: string; utcFrom: string; utcTo: string; reason: string }> = [];
  for (const e of tenEvents) {
    if (e.classificationV02 === 'LIKELY_HALT' && e.overlappingAnnotatedMainHalts.length === 0) {
      out.push({
        id: e.eventId,
        utcFrom: e.windowUtc.from,
        utcTo: e.windowUtc.to,
        berlinFrom: e.windowBerlin.from,
        berlinTo: e.windowBerlin.to,
        reason: 'LIKELY_HALT ohne annotiertes Haupthalt-Fenster — visuelle Klärung ob Stillstand oder Datenlücke.',
      });
    }
    if (e.videoInGapWindow.unknown === e.videoInGapWindow.totalLabeledSeconds) {
      out.push({
        id: `${e.eventId}_NO_TACHO`,
        utcFrom: e.windowUtc.from,
        utcTo: e.windowUtc.to,
        berlinFrom: e.windowBerlin.from,
        berlinTo: e.windowBerlin.to,
        reason: 'Keine Tacho-Overlay-Annotation im Lückenfenster (vor Video-Anker oder fehlendes Label).',
      });
    }
  }
  for (const h of mainHalts) {
    if (h.multipleEventsShareHalt) {
      out.push({
        id: h.haltId,
        utcFrom: h.videoWindowUtc.from,
        utcTo: h.videoWindowUtc.to,
        berlinFrom: h.videoWindowBerlin.from,
        berlinTo: h.videoWindowBerlin.to,
        reason: `Mehrere Lückenkandidaten (${h.overlappingGapEvents.map((x) => x.eventId).join(', ')}) — zeitliche Halt-Lokalisierung unklar.`,
      });
    }
  }
  return out;
}

export function inputStandHash(ctx: {
  evidence: { positions: DiV0SpeedQcPositionSample[] };
  shadowIntervals: unknown[];
}): string {
  const labels = ctx.evidence.positions.map((p) => `${p.bucketLabel}:${p.availability}`).sort();
  return sha256Json({ positionLabelCount: labels.length, positionLabelsSha: sha256Json(labels), shadowRows: ctx.shadowIntervals.length });
}

export { VIDEO_ANCHOR };
