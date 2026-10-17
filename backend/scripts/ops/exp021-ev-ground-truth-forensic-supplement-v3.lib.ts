import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  bucketLabelMinusSeconds,
  bucketLabelPlusSeconds,
  bucketLabelToMs,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import {
  classifySupportWindowGaps,
  dateToBucketLabel,
  diagnosePositionGapAtLabel,
  supportWindowConditionLabel,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-classify';
import type { P21ForensicLoadedContext } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import type { DiV0SpeedQcPositionSample } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc.types';
import {
  type EvGtForensicBucketExport,
  exportForensicBucket,
} from './exp021-ev-ground-truth-forensic-export.lib';
import type { EvGroundTruthPerSecondRow } from './exp021-ev-ground-truth-baseline.lib';
import { DI_V0_POSITION_QUERY_SPEC_V0_1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-acquisition.versions';

export type VideoComparisonRow = {
  bucketLabelUtc?: string;
  tachoKmh?: number | null;
  videoTimeUncertainty?: string | null;
  videoClock?: string | null;
  videoSamplesThisClockSecond?: number | null;
};

export function loadVideoComparisonByLabel(repoRoot: string): Map<string, VideoComparisonRow> {
  const comparisonPath = path.join(
    repoRoot,
    'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/external-video-review-kompakt-2026-10-16/analysis/results/comparison.json',
  );
  const rows = JSON.parse(fs.readFileSync(comparisonPath, 'utf8')) as VideoComparisonRow[];
  const m = new Map<string, VideoComparisonRow>();
  for (const r of rows) {
    if (r.bucketLabelUtc) m.set(r.bucketLabelUtc, r);
  }
  return m;
}

export function isCohortPresentNoMotionNoL3(row: EvGroundTruthPerSecondRow): boolean {
  return (
    row.positionAvailability === 'PRESENT' &&
    row.motionState === 'NO_MOTION_EVIDENCE' &&
    (row.l3SpeedKmh == null || !Number.isFinite(row.l3SpeedKmh))
  );
}

export type L3SupportPointExport = {
  bucketLabelUtc: string;
  deltaSecondsFromCenter: number;
  role: 'PREV' | 'CENTER' | 'NEXT';
  positionAvailability: string | null;
  positionState: string | null;
  positionGapDiagnosis: string;
  motionState: string | null;
  l3SpeedKmh: number | null;
  abstentionReason: string | null;
};

export function buildL3SupportTriplet(
  centerLabel: string,
  ctx: P21ForensicLoadedContext,
  posByLabel: Map<string, DiV0SpeedQcPositionSample>,
  shadowMap: Map<string, { motionState?: string | null; estimatedSpeedKmh?: number | null; abstentionReason?: string | null }>,
): L3SupportPointExport[] {
  const triplet: Array<{ label: string; delta: number; role: L3SupportPointExport['role'] }> = [
    { label: bucketLabelMinusSeconds(centerLabel, 1), delta: -1, role: 'PREV' },
    { label: centerLabel, delta: 0, role: 'CENTER' },
    { label: bucketLabelPlusSeconds(centerLabel, 1), delta: 1, role: 'NEXT' },
  ];
  return triplet.map(({ label, delta, role }) => {
    const pos = posByLabel.get(label);
    const sh = shadowMap.get(label);
    const gap = diagnosePositionGapAtLabel(label, posByLabel, ctx.acquisitionWindow);
    const numeric =
      sh?.estimatedSpeedKmh != null && Number.isFinite(sh.estimatedSpeedKmh) ? sh.estimatedSpeedKmh : null;
    return {
      bucketLabelUtc: label,
      deltaSecondsFromCenter: delta,
      role,
      positionAvailability: pos?.availability ?? null,
      positionState: pos?.positionState ?? null,
      positionGapDiagnosis: gap,
      motionState: sh?.motionState ?? null,
      l3SpeedKmh: numeric,
      abstentionReason: sh?.abstentionReason ?? null,
    };
  });
}

export type AbcGroup = 'A' | 'B' | 'C';

export function classifyAbcGroup(
  center: EvGtForensicBucketExport,
  supportCondition: string,
): { group: AbcGroup; rationale: string; epistemic: 'CONFIRMED' | 'INFERRED' } {
  const supportGaps = supportCondition !== 'L3_WINDOW_COMPLETE';
  const posGap = center.noNumericDisjointV2?.startsWith('POS_GAP_') ?? false;
  const abstentionGap =
    center.abstentionReason === 'ROW_ABSENT' ||
    center.abstentionReason === 'ROW_GAP_IN_SUPPORT' ||
    center.abstentionReason === 'INCOMPLETE_SUPPORT';

  if (posGap || abstentionGap || supportGaps) {
    return {
      group: 'A',
      rationale:
        'Enthaltung erforderlich: L3-Unterstützungsfenster (±1s) oder S1-Abstention zeigt Positionslücke/kompromittierte Evidenz trotz PRESENT am Mittelpunkt.',
      epistemic: 'CONFIRMED',
    };
  }

  const prevMps = center.qcLegImpliedSpeedMps?.prevToCenter;
  const nextMps = center.qcLegImpliedSpeedMps?.centerToNext;
  const maxLeg = Math.max(prevMps ?? 0, nextMps ?? 0);
  const calendarComplete = center.qcSupportCalendarComplete === true;

  if (calendarComplete && maxLeg >= 0.3) {
    return {
      group: 'B',
      rationale:
        'Kalender-Unterstützung vollständig und Bein-Implied-Speed > Schwellwert, aber L3 numerisch null — mögliche Nichtnutzung verwertbarer Geometrie (nur Hypothese).',
      epistemic: 'INFERRED',
    };
  }

  return {
    group: 'C',
    rationale:
      'Mit gepinnter Evidenz allein nicht entscheidbar (kein Positions-Gap-Nachweis, aber auch keine klare B-Geometrie).',
    epistemic: 'INFERRED',
  };
}

export function buildContiguousGapEvents(
  labels: string[],
  signatureForLabel: (label: string) => string,
): Array<{ eventId: string; fromUtc: string; toUtc: string; seconds: number; signature: string }> {
  if (labels.length === 0) return [];
  const sorted = [...labels].sort();
  const events: Array<{ eventId: string; fromUtc: string; toUtc: string; seconds: number; signature: string }> = [];
  let start = sorted[0];
  let prev = sorted[0];
  let sig = signatureForLabel(sorted[0]);
  let count = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const cur = sorted[i];
    const contiguous = bucketLabelToMs(cur) - bucketLabelToMs(prev) === 1000;
    const sameSig = signatureForLabel(cur) === sig;
    if (contiguous && sameSig) {
      count += 1;
      prev = cur;
      continue;
    }
    events.push({
      eventId: `GAP_EVT_${events.length + 1}`,
      fromUtc: start,
      toUtc: prev,
      seconds: count,
      signature: sig,
    });
    start = cur;
    prev = cur;
    sig = signatureForLabel(cur);
    count = 1;
  }
  events.push({
    eventId: `GAP_EVT_${events.length + 1}`,
    fromUtc: start,
    toUtc: prev,
    seconds: count,
    signature: sig,
  });
  return events;
}

export function videoTachoAttachment(
  label: string,
  videoByLabel: Map<string, VideoComparisonRow>,
): Record<string, unknown> {
  const v = videoByLabel.get(label);
  if (!v) {
    return { tachoKmh: null, uncertainty: 'NO_COMPARISON_ROW', epistemic: 'UNKNOWN' as const };
  }
  const uncertainty = v.videoTimeUncertainty ?? 'UNSPECIFIED';
  if (v.tachoKmh == null) {
    return {
      tachoKmh: null,
      videoClock: v.videoClock ?? null,
      videoSamplesThisClockSecond: v.videoSamplesThisClockSecond ?? null,
      uncertainty,
      epistemic: 'CONFIRMED' as const,
      note: 'Kein lesbarer Video-Tacho in kompakt-Annotation für diese Sekunde.',
    };
  }
  return {
    tachoKmh: v.tachoKmh,
    videoClock: v.videoClock ?? null,
    videoSamplesThisClockSecond: v.videoSamplesThisClockSecond ?? null,
    uncertainty,
    epistemic: 'CONFIRMED' as const,
  };
}

export function formulateGroupBExperimentHypothesis(
  samples: Array<{ label: string; support: L3SupportPointExport[]; center: EvGtForensicBucketExport }>,
): Record<string, unknown> {
  const candidates = samples.filter((s) => {
    const prev = s.support.find((p) => p.role === 'PREV');
    const next = s.support.find((p) => p.role === 'NEXT');
    return (
      prev?.positionGapDiagnosis === 'PRESENT_OK' &&
      next?.positionGapDiagnosis === 'PRESENT_OK' &&
      s.center.positionGapDiagnosis === 'PRESENT_OK'
    );
  });
  return {
    status: candidates.length > 0 ? 'APPLICABLE_TO_SUBSET' : 'NOT_TRIGGERED_FOR_COHORT',
    cohortSecondsWithFullTripletPresent: candidates.length,
    hypothesis:
      'Offline: L3-Geschwindigkeit aus den beiden benachbarten PRESENT-GPS-Beinen (prev→center, center→next) mit festem 1s-Raster re-schätzen; Zeitbezug = Bucket-Mittelpunkt (DIMO 1s-Label, nicht physische Messzeit).',
    usableGpsPoints:
      'Nur Buckets mit PRESENT_OK und gültiger Koordinate im gepinnten Snapshot (Koordinaten absichtlich nicht in Export — nur Availability/Gap-Diagnose).',
    temporalReference:
      'Geschwindigkeit wäre implizit bucket-zentriert (±1s Nachbarn), analog bestehendem QC-Leg-Assessment, nicht Video-PTS.',
    risks: [
      'Falsche Bewegung bei eingefrorenem/hold-kompromittierten Nachbarn',
      'Überschreitung Stop/Moving-Bänder ohne STATIONARY_BAND-Schutz',
      'Verwechslung Bucket-Label vs. physische Observation',
      'Aufweichen von ROW_GAP_IN_SUPPORT-Enthaltung',
    ],
    explicitNonGoals: [
      'Keine produktive Freigabe',
      'Keine Lockerung QC-Schutzgrenzen',
      'Keine künstlichen Nullen',
    ],
    epistemic: 'INFERRED',
  };
}

export function buildRowAbsent269Audit(
  rowAbsentLabels: string[],
  pinnedRejectedCount: number,
  sumProviderRowCountAbsentBuckets: number,
): Record<string, unknown> {
  return {
    schema: 'EXP021_ROW_ABSENT_269_AUDIT_V3',
    rowAbsentBucketCount: rowAbsentLabels.length,
    epistemic: 'CONFIRMED',
    source: 'Pinned POSITION snapshot buckets with availability ROW_ABSENT',
    acquisitionSummary: {
      rejectedProviderRowsInSnapshot: pinnedRejectedCount,
      sumProviderRowCountOnRowAbsentBuckets: sumProviderRowCountAbsentBuckets,
      interpretation:
        'ROW_ABSENT buckets tragen providerRowCount=0 im Snapshot; keine rejected rows in v2 — fehlende Rasterzeile in S3A, kein Sensor-Ausfall-Beweis.',
    },
    comparisonFetchPlan: {
      executed: false,
      provider: DI_V0_POSITION_QUERY_SPEC_V0_1.provider,
      queryFamily: DI_V0_POSITION_QUERY_SPEC_V0_1.queryFamily,
      signal: DI_V0_POSITION_QUERY_SPEC_V0_1.signal,
      interval: DI_V0_POSITION_QUERY_SPEC_V0_1.interval,
      coordinateAggregation: DI_V0_POSITION_QUERY_SPEC_V0_1.coordinateAggregation,
      proposedWindowUtc: {
        fromInclusive: rowAbsentLabels[0] ?? null,
        toInclusive: rowAbsentLabels[rowAbsentLabels.length - 1] ?? null,
        note: 'Eng gefasst auf min/max ROW_ABSENT label; alternative: volles Trip-Fenster 03:36–03:54:56Z.',
      },
      maxProviderCalls: 1,
      callShape:
        'Single historical signals query for currentLocationCoordinates with 1s AVG over proposedWindowUtc (same family as DI_V0_POSITION_QUERY_SPEC_V0_1).',
      learningGoal:
        'Prüfen ob Provider-Zeilen für ROW_ABSENT-Labels außerhalb des gepinnten Snapshots existieren (Cache/Replay-Lücke) vs. konsistente Abwesenheit im Abfragefenster.',
      risks: ['Provider rate limits', 'Nicht-äquivalentes Fenster vs. Pin', 'Keine automatische Produktübernahme'],
      ownerAuthorizationRequired: true,
    },
  };
}

export function noNumericSpeedExplanation(center: EvGtForensicBucketExport, supportCondition: string): string {
  const parts = [
    `speedEvidenceState=${center.speedEvidenceState ?? 'null'}`,
    `abstentionReason=${center.abstentionReason ?? 'null'}`,
    `noNumericDisjointV2=${center.noNumericDisjointV2 ?? 'null'}`,
    `holdTransitionDetail=${center.holdTransitionDetail ?? 'null'}`,
    `supportCondition=${supportCondition}`,
    `qcReasonCodes=${center.qcReasonCodes.join(',') || '(none)'}`,
  ];
  return parts.join('; ');
}
