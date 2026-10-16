/**
 * EXP021 offline stationary / creep / gap prototype (not production).
 * Extends V2 semantics (CALIBRATION_UNSET_V0 bands + L3 ±1s) with explicit UNKNOWN gap limits.
 */
import { CALIBRATION_UNSET_V0_BUNDLE } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/calibration/CALIBRATION_UNSET_V0';
import { bucketLabelToMs } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import type { EvGroundTruthPerSecondRow } from './exp021-ev-ground-truth-baseline.lib';
import type { EvGtForensicBucketExport } from './exp021-ev-ground-truth-forensic-export.lib';
import type { VideoComparisonRow } from './exp021-ev-ground-truth-forensic-supplement-v3.lib';
import { EXP021_VIDEO_TACHO_ZERO_WINDOWS_UTC } from './exp021-ev-ground-truth-forensic-export.lib';

export const PROTOTYPE_VERSION = 'EXP021_STATIONARY_OFFLINE_PROTOTYPE_V0_1';

/** Development hold-out: first 80% of trip by time for rule tuning notes; last 20% reserved (not auto-tuned here). */
export const DEV_HOLDOUT_SPLIT = { developmentFraction: 0.8, note: 'No thresholds auto-fitted in this export; split documented for follow-up.' };

export const PROTOTYPE_LIMITS = {
  strictStopMaxLegImpliedKmh: 1.5,
  creepBandMaxKmh: CALIBRATION_UNSET_V0_BUNDLE.stopMovingBandMinKmh,
  v2StationaryBandMaxKmh: CALIBRATION_UNSET_V0_BUNDLE.stopStationaryBandMaxKmh,
  maxGapSecondsWithoutDowngradeToUnknown: 2,
  videoTachoZeroIsDisplayNotPhysics: true,
} as const;

export type ReferenceCaseCategory =
  | 'long_stop'
  | 'short_halt'
  | 'slow_creep'
  | 'stopping'
  | 'restart'
  | 'gap_during_stop'
  | 'gap_during_motion'
  | 'pre_video_prefix';

export type ReferenceCase = {
  id: string;
  category: ReferenceCaseCategory;
  fromUtc: string;
  toUtc: string;
  epistemic: 'CONFIRMED' | 'INFERRED';
  source: string;
  videoNote: string;
  chatGptReturn?: string[];
};

export type PrototypeMotionLabel =
  | 'STOP_STRICT'
  | 'STOP_V2_BAND'
  | 'CREEP'
  | 'MOVING'
  | 'UNKNOWN_GAP'
  | 'UNKNOWN_AMBIGUOUS'
  | 'TRANSITION';

export function buildReferenceCases(extraShortHalts: Array<{ fromUtc: string; toUtc: string }>): ReferenceCase[] {
  const base: ReferenceCase[] = [
    ...EXP021_VIDEO_TACHO_ZERO_WINDOWS_UTC.map((w, i) => ({
      id: `LONG_HALT_${i + 1}`,
      category: 'long_stop' as const,
      fromUtc: w.from,
      toUtc: w.to,
      epistemic: 'CONFIRMED' as const,
      source: 'Bericht.md / EXP021_VIDEO_TACHO_ZERO_WINDOWS_UTC',
      videoNote: 'Annotiertes Tacho 0 (Anzeigeauflösung ≠ garantierte physische Ruhe).',
    })),
    {
      id: 'TRIP_START_MANEUVER',
      category: 'restart',
      fromUtc: '2026-10-16T03:37:41Z',
      toUtc: '2026-10-16T03:38:25Z',
      epistemic: 'CONFIRMED',
      source: 'Auftrag 2 / owner reverse maneuver',
      videoNote: 'Erstes sichtbares Uhrlabel; PTS=0 nicht kalibriert.',
    },
    {
      id: 'STOPPING_DECEL_BERICHT',
      category: 'stopping',
      fromUtc: '2026-10-16T03:41:42Z',
      toUtc: '2026-10-16T03:41:47Z',
      epistemic: 'CONFIRMED',
      source: 'Bericht.md Beschleunigung (Tacho 56→8 km/h; DI nur wenn TRUSTED)',
      videoNote: 'Anhalten — kein Beschleunigungs-Tuning in diesem Auftrag; nur Stillstandsbezug.',
    },
    {
      id: 'END_RANGIER',
      category: 'slow_creep',
      fromUtc: '2026-10-16T03:54:15Z',
      toUtc: '2026-10-16T03:54:56Z',
      epistemic: 'CONFIRMED',
      source: 'Bericht.md Rangierphase',
      videoNote: 'Weitgehend ohne numerische DI; Kriechen/Rangieren.',
    },
    {
      id: 'PRE_VIDEO_PREFIX',
      category: 'pre_video_prefix',
      fromUtc: '2026-10-16T03:36:00Z',
      toUtc: '2026-10-16T03:37:40Z',
      epistemic: 'CONFIRMED',
      source: 'trip_start_forensic',
      videoNote: '98× ROW_ABSENT — keine Video-Abdeckung; kein Stillstandsbeweis.',
    },
    {
      id: 'GAP_UNKNOWN_TACHO_05_44',
      category: 'gap_during_stop',
      fromUtc: '2026-10-16T03:44:03Z',
      toUtc: '2026-10-16T03:44:09Z',
      epistemic: 'CONFIRMED',
      source: 'Bericht.md §Coverage',
      videoNote: 'Tacho unlesbar/verdeckt zwischen Haltfenstern.',
      chatGptReturn: [
        '2026-10-16T03:44:03Z',
        '2026-10-16T03:44:04Z',
        '2026-10-16T03:44:05Z',
        '2026-10-16T03:44:06Z',
        '2026-10-16T03:44:07Z',
        '2026-10-16T03:44:08Z',
        '2026-10-16T03:44:09Z',
      ],
    },
  ];

  for (let i = 0; i < extraShortHalts.length; i += 1) {
    const h = extraShortHalts[i];
    base.push({
      id: `SHORT_HALT_AUTO_${i + 1}`,
      category: 'short_halt',
      fromUtc: h.fromUtc,
      toUtc: h.toUtc,
      epistemic: 'INFERRED',
      source: 'comparison.json isolated tacho=0 runs (5–25s) outside main halt windows',
      videoNote: 'Kurzer Halt; gleiche Tacho-0-Semantik wie lange Stopps.',
    });
  }

  return base;
}

export function enumerateInclusive(fromUtc: string, toUtc: string): string[] {
  const out: string[] = [];
  let cur = fromUtc;
  while (cur <= toUtc) {
    out.push(cur);
    if (cur === toUtc) break;
    cur = new Date(bucketLabelToMs(cur) + 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  return out;
}

function maxLegImpliedKmh(forensic: EvGtForensicBucketExport): number | null {
  const legs = forensic.qcLegImpliedSpeedMps;
  if (!legs) return null;
  const vals = [legs.prevToCenter, legs.centerToNext].filter((v) => v != null && Number.isFinite(v)) as number[];
  if (vals.length === 0) return null;
  const maxMps = Math.max(...vals);
  return maxMps * 3.6;
}

export function explainV2StationaryDetection(): Record<string, unknown> {
  return {
    whenV2RecognizesStop: {
      epistemic: 'CONFIRMED',
      source: 'computeDiV0TripIntervals + classifyMotionState + deriveSpeedEvidenceState + QC V2',
      conditions: [
        'L3 ±1s Kalenderfenster vollständig (prev/center/next PRESENT, gültige Koordinaten, kein ROW_ABSENT in Support).',
        'L3 eligible; geschätzte Geschwindigkeit < stopStationaryBandMaxKmh (3 km/h) → motionState=STATIONARY_SUPPORTED.',
        'Alternativ positionState=FROZEN_STOP_SUPPORTED → STATIONARY_SUPPORTED unabhängig von numerischer L3.',
        'speedEvidenceState=STATIONARY_BAND bei STATIONARY_SUPPORTED; estimatedSpeedKmh bleibt absichtlich null.',
        'QC V2: TRUSTED_LIMITED bei STATIONARY_BAND + PRESENT center (bis STATIONARY_MAX_TRUSTED_SPEED_KMH=5 QC-intern).',
      ],
    },
    whyVideoStopsOftenMissed: {
      epistemic: 'CONFIRMED',
      source: '135 video tacho=0 replay + supplement v1/v3',
      reasons: [
        '133/135 annotierte Nullsekunden: ROW_ABSENT im Pin → L3 abstention ROW_ABSENT → NO_MOTION_EVIDENCE (kein STATIONARY_BAND).',
        'Fehlende Positionszeile ≠ Stillstandsbeweis; Pipeline enthält sich (kein synthetisches 0).',
        '45s PRESENT-Zentrum mit NO_MOTION: Nachbar-ROW_ABSENT bricht L3-Fenster (supplement v3, Gruppe A).',
      ],
    },
    whyTacho1to3UnderStationarySupported: {
      epistemic: 'CONFIRMED',
      source: 'Bericht.md + CALIBRATION_UNSET_V0 (3/5 km/h Bänder)',
      explanation: [
        'STATIONARY_SUPPORTED benennt ein Regelband (L3 < 3 km/h oder Hold-Stop), nicht „GPS=0“ oder „Tacho exakt 0“.',
        'QC V2 erlaubt TRUSTED_LIMITED null bis 5 km/h QC-Schwelle — 11/14 Band-Sekunden mit lesbarem Tacho 1–3 km/h konsistent.',
        'Anzeigequantum 1 km/h: Tacho 0 beweist nicht zwingend absolute Ruhe; umgekehrt 1–3 km/h kein Beweis für Fehlklassifikation allein aus dem Namen.',
      ],
    },
    notInferredFromNameAlone: true,
  };
}

export function classifyPrototypeSecond(args: {
  forensic: EvGtForensicBucketExport;
  baseline: EvGroundTruthPerSecondRow;
}): { label: PrototypeMotionLabel; reasons: string[]; noNumericCause: string } {
  const reasons: string[] = [];
  const { forensic, baseline } = args;
  const maxLeg = maxLegImpliedKmh(forensic);

  const v2Band =
    baseline.motionState === 'STATIONARY_SUPPORTED' &&
    baseline.speedEvidenceState === 'STATIONARY_BAND' &&
    baseline.qcTrustLevel === 'TRUSTED_LIMITED';

  if (forensic.positionGapDiagnosis !== 'PRESENT_OK') {
    reasons.push(`center_gap=${forensic.positionGapDiagnosis}`);
    return {
      label: 'UNKNOWN_GAP',
      reasons,
      noNumericCause: forensic.noNumericDisjointV2 ?? baseline.abstentionReason ?? 'POSITION_GAP',
    };
  }

  if (baseline.supportWindowNote && baseline.supportWindowNote.includes('ROW_ABSENT')) {
    reasons.push(`support_note=${baseline.supportWindowNote}`);
    return {
      label: 'UNKNOWN_GAP',
      reasons,
      noNumericCause: 'L3_SUPPORT_ROW_ABSENT',
    };
  }

  if (baseline.l3SpeedKmh != null && baseline.l3SpeedKmh >= PROTOTYPE_LIMITS.creepBandMaxKmh) {
    reasons.push(`baseline_l3=${baseline.l3SpeedKmh}`);
    return { label: 'MOVING', reasons, noNumericCause: 'NUMERIC_L3_PRESENT' };
  }

  if (baseline.motionState === 'MOVING_SPEED_ESTIMATED' && baseline.l3SpeedKmh != null) {
    return { label: 'MOVING', reasons: ['S1_MOVING_SPEED_ESTIMATED'], noNumericCause: 'NUMERIC_L3' };
  }

  if (v2Band) {
    reasons.push('V2_STATIONARY_BAND_TRUSTED_LIMITED');
    return {
      label: 'STOP_V2_BAND',
      reasons,
      noNumericCause: 'INTENTIONAL_NULL_STATIONARY_BAND',
    };
  }

  if (maxLeg != null && maxLeg < PROTOTYPE_LIMITS.strictStopMaxLegImpliedKmh && forensic.qcSupportCalendarComplete) {
    reasons.push(`maxLegImpliedKmh=${maxLeg.toFixed(3)}`);
    return {
      label: 'STOP_STRICT',
      reasons,
      noNumericCause: baseline.abstentionReason ?? 'LOW_LEG_SPEED_NO_NUMERIC',
    };
  }

  if (
    maxLeg != null &&
    maxLeg >= PROTOTYPE_LIMITS.strictStopMaxLegImpliedKmh &&
    maxLeg < PROTOTYPE_LIMITS.creepBandMaxKmh
  ) {
    reasons.push(`creep_legs=${maxLeg.toFixed(3)}kmh`);
    return {
      label: 'CREEP',
      reasons,
      noNumericCause: 'SLOW_LEG_GEOMETRY_WITHOUT_V2_BAND',
    };
  }

  if (baseline.motionState === 'TRANSITION_UNCERTAIN') {
    return {
      label: 'TRANSITION',
      reasons: ['S1_TRANSITION_UNCERTAIN'],
      noNumericCause: baseline.abstentionReason ?? 'TRANSITION',
    };
  }

  if (baseline.motionState === 'NO_MOTION_EVIDENCE') {
    return {
      label: 'UNKNOWN_GAP',
      reasons: ['S1_NO_MOTION_EVIDENCE'],
      noNumericCause: baseline.abstentionReason ?? 'NO_MOTION',
    };
  }

  return {
    label: 'UNKNOWN_AMBIGUOUS',
    reasons: ['INSUFFICIENT_CLASSIFICATION_SIGNAL'],
    noNumericCause: baseline.abstentionReason ?? 'UNKNOWN',
  };
}

export function isPrototypeStopLabel(label: PrototypeMotionLabel): boolean {
  return label === 'STOP_STRICT' || label === 'STOP_V2_BAND';
}

export function isBaselineV2Stop(row: EvGroundTruthPerSecondRow): boolean {
  return (
    row.motionState === 'STATIONARY_SUPPORTED' &&
    row.speedEvidenceState === 'STATIONARY_BAND' &&
    row.qcTrustLevel === 'TRUSTED_LIMITED'
  );
}

export function videoStopProxy(v: VideoComparisonRow | undefined): {
  isAnnotatedStop: boolean;
  uncertainty: string;
  epistemic: string;
} {
  if (!v) return { isAnnotatedStop: false, uncertainty: 'NO_ROW', epistemic: 'UNKNOWN' };
  if (v.tachoKmh === 0) {
    return {
      isAnnotatedStop: true,
      uncertainty: v.videoTimeUncertainty ?? 'UNSPECIFIED',
      epistemic: 'CONFIRMED_ANNOTATED_ZERO_NOT_PHYSICAL_PROOF',
    };
  }
  return {
    isAnnotatedStop: false,
    uncertainty: v.videoTimeUncertainty ?? 'UNSPECIFIED',
    epistemic: v.tachoKmh == null ? 'NO_READABLE_TACHO' : 'CONFIRMED_POSITIVE_TACHO',
  };
}

export function findShortTachoZeroHalts(
  videoByLabel: Map<string, VideoComparisonRow>,
  mainWindows: Array<{ from: string; to: string }>,
): Array<{ fromUtc: string; toUtc: string }> {
  const inMain = (label: string): boolean =>
    mainWindows.some((w) => label >= w.from && label <= w.to);
  const labels = [...videoByLabel.keys()].sort();
  const runs: Array<{ fromUtc: string; toUtc: string }> = [];
  let start: string | null = null;
  let prev: string | null = null;
  for (const label of labels) {
    const tacho = videoByLabel.get(label)?.tachoKmh;
    const isZero = tacho === 0 && !inMain(label);
    if (isZero) {
      if (!start) start = label;
      prev = label;
    } else if (start && prev) {
      const len = enumerateInclusive(start, prev).length;
      if (len >= 5 && len <= 25) runs.push({ fromUtc: start, toUtc: prev });
      start = null;
      prev = null;
    }
  }
  if (start && prev) {
    const len = enumerateInclusive(start, prev).length;
    if (len >= 5 && len <= 25) runs.push({ fromUtc: start, toUtc: prev });
  }
  return runs;
}

export type CaseEvaluation = {
  caseId: string;
  category: ReferenceCaseCategory;
  seconds: number;
  metrics: {
    videoAnnotatedStopSeconds: number;
    baselineV2StopSeconds: number;
    prototypeStopSeconds: number;
    missedStopVsVideo: number;
    falseStopVsVideo: number;
    unknownSeconds: number;
    creepSeconds: number;
  };
  perSecondSample: Array<Record<string, unknown>>;
};

export function evaluateReferenceCase(
  caseDef: ReferenceCase,
  perLabel: Map<
    string,
    {
      prototype: PrototypeMotionLabel;
      baseline: EvGroundTruthPerSecondRow;
      forensic: EvGtForensicBucketExport;
      video: VideoComparisonRow | undefined;
    }
  >,
  sampleLimit = 8,
): CaseEvaluation {
  const labels = enumerateInclusive(caseDef.fromUtc, caseDef.toUtc);
  let videoAnnotatedStopSeconds = 0;
  let baselineV2StopSeconds = 0;
  let prototypeStopSeconds = 0;
  let missedStopVsVideo = 0;
  let falseStopVsVideo = 0;
  let unknownSeconds = 0;
  let creepSeconds = 0;
  const perSecondSample: Array<Record<string, unknown>> = [];

  for (const label of labels) {
    const row = perLabel.get(label);
    if (!row) continue;
    const vStop = videoStopProxy(row.video);
    if (vStop.isAnnotatedStop) videoAnnotatedStopSeconds += 1;
    if (isBaselineV2Stop(row.baseline)) baselineV2StopSeconds += 1;
    if (isPrototypeStopLabel(row.prototype)) prototypeStopSeconds += 1;
    if (row.prototype === 'CREEP') creepSeconds += 1;
    if (row.prototype.startsWith('UNKNOWN')) unknownSeconds += 1;

    if (vStop.isAnnotatedStop && !isPrototypeStopLabel(row.prototype)) missedStopVsVideo += 1;
    if (
      isPrototypeStopLabel(row.prototype) &&
      row.video?.tachoKmh != null &&
      row.video.tachoKmh >= 4
    ) {
      falseStopVsVideo += 1;
    }
  }

  for (const label of labels.slice(0, sampleLimit)) {
    const row = perLabel.get(label);
    if (!row) continue;
    perSecondSample.push({
      bucketLabelUtc: label,
      prototype: row.prototype,
      baselineMotion: row.baseline.motionState,
      baselineQc: row.baseline.qcTrustLevel,
      positionAvailability: row.forensic.positionAvailability,
      positionGapDiagnosis: row.forensic.positionGapDiagnosis,
      holdTransitionDetail: row.forensic.holdTransitionDetail,
      noNumericDisjointV2: row.forensic.noNumericDisjointV2,
      videoTacho: row.video?.tachoKmh ?? null,
      videoUncertainty: row.video?.videoTimeUncertainty ?? null,
    });
  }

  return {
    caseId: caseDef.id,
    category: caseDef.category,
    seconds: labels.length,
    metrics: {
      videoAnnotatedStopSeconds,
      baselineV2StopSeconds,
      prototypeStopSeconds,
      missedStopVsVideo,
      falseStopVsVideo,
      unknownSeconds,
      creepSeconds,
    },
    perSecondSample,
  };
}

export function formulateGroupBExperimentFromCreep(seconds: number): Record<string, unknown> {
  return {
    triggered: seconds > 0,
    hypothesis:
      'CREEP-Sekunden: V2-Band (3 km/h) bzw. QC 5 km/h nicht erreicht, aber Bein-Geometrie 1.5–5 km/h — offline Leg-Mittel nur bei vollem Triplet testen; Zeitbezug Bucket-Mitte.',
    risks: ['Kriechen als Stillstand maskieren', 'Hold-Koordinaten als Bewegung'],
    noProductionActivation: true,
    epistemic: 'INFERRED',
  };
}
