import { createHash } from 'node:crypto';
import { evaluateDiV0SpeedQcInterval } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/evaluate-di-v0-speed-qc-interval';
import { DI_V0_SPEED_QC_POLICY_V2 } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-policy.version';
import type { DiV0SpeedQcPositionSample } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc.types';
import {
  bucketLabelMinusSeconds,
  bucketLabelPlusSeconds,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import {
  classifyHoldTransitionDetail,
  classifyNoNumericDisjointV2,
  dateToBucketLabel,
  diagnosePositionGapAtLabel,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-classify';
import type { P21ForensicLoadedContext } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import type { DiV0TripSpeedQualityShadowRow } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/build-di-v0-trip-speed-quality-projection.v1';
import { buildEvGroundTruthPerSecondReplay } from './exp021-ev-ground-truth-baseline.lib';

export const EXP021_EV_GT_REFERENCE = {
  organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
  vehicleId: '68868291-5478-42cd-b0c4-cc77b2a78e21',
  tripId: '358d0158-b2a9-47ed-af26-33926c5770b4',
  workItemId: '99fe9d1b-5cb6-4cbb-ba0c-e5f27a5cd50a',
  productionSha: 'a0ce01f192d888974e49c2558ee05e534f3dfeea',
  reviewBundleCommitPrefix: '518fc3dd67',
} as const;

export const EXP021_VIDEO_ANCHOR_UTC = '2026-10-16T03:37:41Z';

/** Video-confirmed tacho-zero windows (UTC inclusive), from external review Bericht.md. */
export const EXP021_VIDEO_TACHO_ZERO_WINDOWS_UTC: Array<{ from: string; to: string; note?: string }> = [
  { from: '2026-10-16T03:40:19Z', to: '2026-10-16T03:40:49Z' },
  { from: '2026-10-16T03:41:50Z', to: '2026-10-16T03:42:29Z' },
  { from: '2026-10-16T03:42:50Z', to: '2026-10-16T03:42:57Z' },
  { from: '2026-10-16T03:43:43Z', to: '2026-10-16T03:44:02Z' },
  { from: '2026-10-16T03:44:10Z', to: '2026-10-16T03:44:35Z' },
];

export const EXP021_FORENSIC_FOCUS_WINDOWS_UTC: Array<{ id: string; from: string; to: string; source: string }> = [
  ...EXP021_VIDEO_TACHO_ZERO_WINDOWS_UTC.map((w, i) => ({
    id: `video_tacho_zero_${i + 1}`,
    from: w.from,
    to: w.to,
    source: 'external_video_review',
  })),
  {
    id: 'trip_start_maneuver',
    from: '2026-10-16T03:37:41Z',
    to: '2026-10-16T03:38:25Z',
    source: 'cursor_prompt_auftrag_2',
  },
  {
    id: 'end_rangieren',
    from: '2026-10-16T03:54:15Z',
    to: '2026-10-16T03:54:56Z',
    source: 'cursor_prompt_auftrag_2',
  },
  {
    id: 'pre_video_persisted_start',
    from: '2026-10-16T03:36:00Z',
    to: '2026-10-16T03:37:40Z',
    source: 'trip_start_forensic',
  },
];

export function sha256Json(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function enumerateBucketLabelsInclusive(fromLabel: string, toLabel: string): string[] {
  const out: string[] = [];
  let cur = fromLabel;
  while (cur <= toLabel) {
    out.push(cur);
    if (cur === toLabel) break;
    cur = bucketLabelPlusSeconds(cur, 1);
  }
  return out;
}

function shadowByLabel(
  intervals: DiV0TripSpeedQualityShadowRow[],
): Map<string, DiV0TripSpeedQualityShadowRow> {
  const m = new Map<string, DiV0TripSpeedQualityShadowRow>();
  for (const r of intervals) {
    m.set(dateToBucketLabel(r.referenceTime), r);
  }
  return m;
}

function r1AtLabel(
  r1Obd: Array<{ bucketLabel: string; speedKmh: number | null }>,
  label: string,
): number | null {
  return r1Obd.find((r) => r.bucketLabel === label)?.speedKmh ?? null;
}

export type EvGtForensicBucketExport = {
  bucketLabelUtc: string;
  positionAvailability: string | null;
  positionState: string | null;
  positionGapDiagnosis: string;
  r1SpeedKmh: number | null;
  l3SpeedKmh: number | null;
  motionState: string | null;
  speedEvidenceState: string | null;
  sourceRelation: string | null;
  abstentionReason: string | null;
  sourceQualityFlags: string[];
  noNumericDisjointV2: string | null;
  holdTransitionDetail: string | null;
  qcTrustLevel: string;
  qcReasonCodes: string[];
  qcSupportCalendarComplete: boolean | null;
  qcLegDistancesM: { prevToCenter: number | null; centerToNext: number | null } | null;
  qcLegImpliedSpeedMps: { prevToCenter: number | null; centerToNext: number | null } | null;
};

export function exportForensicBucket(
  center: string,
  ctx: P21ForensicLoadedContext,
  shadow: DiV0TripSpeedQualityShadowRow | undefined,
  posByLabel: Map<string, DiV0SpeedQcPositionSample>,
): EvGtForensicBucketExport {
  const pos = posByLabel.get(center);
  const gap = diagnosePositionGapAtLabel(center, posByLabel, ctx.acquisitionWindow);
  const row = shadow;
  const numeric =
    row?.estimatedSpeedKmh != null && Number.isFinite(row.estimatedSpeedKmh)
      ? row.estimatedSpeedKmh
      : null;

  let noNumericV2: string | null = null;
  let holdDetail: string | null = null;
  if (row && numeric == null) {
    noNumericV2 = classifyNoNumericDisjointV2(row, posByLabel, ctx.acquisitionWindow);
    holdDetail = classifyHoldTransitionDetail(row, posByLabel);
  }

  const verdict = row
    ? evaluateDiV0SpeedQcInterval({
        qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
        centerBucketLabel: center,
        shadow: {
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
          sourceQualityFlags: Array.isArray(row.sourceQualityFlags)
            ? row.sourceQualityFlags.map(String)
            : [],
          evidenceSources: [],
        },
        positions: ctx.evidence.positions,
        r1Obd: ctx.evidence.r1Obd,
        evidenceIdentity: { pinnedSnapshotHash: ctx.pinnedSnapshotHash },
      })
    : null;

  return {
    bucketLabelUtc: center,
    positionAvailability: pos?.availability ?? null,
    positionState: pos?.positionState ?? null,
    positionGapDiagnosis: gap,
    r1SpeedKmh: r1AtLabel(ctx.evidence.r1Obd, center),
    l3SpeedKmh: numeric,
    motionState: row?.motionState ?? null,
    speedEvidenceState: row?.speedEvidenceState ?? null,
    sourceRelation: row?.sourceRelation ?? null,
    abstentionReason: row?.abstentionReason ?? null,
    sourceQualityFlags: Array.isArray(row?.sourceQualityFlags)
      ? row!.sourceQualityFlags.map(String)
      : [],
    noNumericDisjointV2: noNumericV2,
    holdTransitionDetail: holdDetail,
    qcTrustLevel: verdict?.trustLevel ?? 'UNTRUSTED',
    qcReasonCodes: verdict ? [...verdict.reasonCodes] : [],
    qcSupportCalendarComplete: verdict?.supportAssessment?.calendarSupportComplete ?? null,
    qcLegDistancesM: verdict?.supportAssessment?.legDistancesM ?? null,
    qcLegImpliedSpeedMps: verdict?.supportAssessment?.legImpliedSpeedMps ?? null,
  };
}

export function exportBucketWithContext(
  center: string,
  ctx: P21ForensicLoadedContext,
  contextRadiusSeconds: number,
): { center: EvGtForensicBucketExport; context: EvGtForensicBucketExport[] } {
  const posByLabel = new Map(ctx.evidence.positions.map((p) => [p.bucketLabel, p]));
  const shadowMap = shadowByLabel(ctx.shadowIntervals);
  const context: EvGtForensicBucketExport[] = [];
  for (let d = -contextRadiusSeconds; d <= contextRadiusSeconds; d += 1) {
    if (d === 0) continue;
    const label = d < 0 ? bucketLabelMinusSeconds(center, -d) : bucketLabelPlusSeconds(center, d);
    context.push(exportForensicBucket(label, ctx, shadowMap.get(label), posByLabel));
  }
  return {
    center: exportForensicBucket(center, ctx, shadowMap.get(center), posByLabel),
    context,
  };
}

export function verifyBaselineParity(perSecond: ReturnType<typeof buildEvGroundTruthPerSecondReplay>): {
  ok: boolean;
  rowCount: number;
  numericCount: number;
  trustedNumericCount: number;
  trustedLimitedCount: number;
  trustedMaxKmh: number | null;
  trustedMeanKmh: number | null;
  mismatches: string[];
} {
  const mismatches: string[] = [];
  const rowCount = perSecond.length;
  if (rowCount !== 1136) mismatches.push(`rowCount expected 1136 got ${rowCount}`);

  const numeric = perSecond.filter((r) => r.l3SpeedKmh != null && Number.isFinite(r.l3SpeedKmh));
  const trusted = numeric.filter((r) => r.qcTrustLevel === 'TRUSTED');
  const trustedLimited = perSecond.filter(
    (r) => r.qcTrustLevel === 'TRUSTED_LIMITED' && (r.l3SpeedKmh == null || r.l3SpeedKmh === 0),
  );

  const trustedMax = trusted.length
    ? Math.max(...trusted.map((r) => r.l3SpeedKmh as number))
    : null;
  const trustedMean = trusted.length
    ? trusted.reduce((s, r) => s + (r.l3SpeedKmh as number), 0) / trusted.length
    : null;

  if (numeric.length !== 776) mismatches.push(`numericCount expected 776 got ${numeric.length}`);
  if (trusted.length !== 775) mismatches.push(`trustedNumericCount expected 775 got ${trusted.length}`);
  if (trustedLimited.length !== 14) {
    mismatches.push(`trustedLimitedStationaryNull expected 14 got ${trustedLimited.length}`);
  }
  const expectedMax = 129.7885665128692;
  if (trustedMax == null || Math.abs(trustedMax - expectedMax) > 1e-6) {
    mismatches.push(`trustedMaxKmh expected ${expectedMax} got ${trustedMax}`);
  }
  const expectedMean = 66.08511361500206;
  if (trustedMean == null || Math.abs(trustedMean - expectedMean) > 0.0001) {
    mismatches.push(`trustedMeanKmh expected ~${expectedMean} got ${trustedMean}`);
  }

  return {
    ok: mismatches.length === 0,
    rowCount,
    numericCount: numeric.length,
    trustedNumericCount: trusted.length,
    trustedLimitedCount: trustedLimited.length,
    trustedMaxKmh: trustedMax,
    trustedMeanKmh: trustedMean,
    mismatches,
  };
}

export function pickStationarySupportedIntervals(
  perSecond: ReturnType<typeof buildEvGroundTruthPerSecondReplay>,
): Array<{ from: string; to: string; seconds: number }> {
  const out: Array<{ from: string; to: string; seconds: number }> = [];
  let start: string | null = null;
  for (const row of perSecond) {
    const isBand =
      row.qcTrustLevel === 'TRUSTED_LIMITED' &&
      row.motionState === 'STATIONARY_SUPPORTED' &&
      row.speedEvidenceState === 'STATIONARY_BAND';
    if (isBand) {
      if (!start) start = row.bucketLabelUtc;
    } else if (start) {
      const prev = bucketLabelMinusSeconds(row.bucketLabelUtc, 1);
      out.push({ from: start, to: prev, seconds: enumerateBucketLabelsInclusive(start, prev).length });
      start = null;
    }
  }
  if (start) {
    const last = perSecond[perSecond.length - 1]?.bucketLabelUtc;
    if (last) {
      out.push({ from: start, to: last, seconds: enumerateBucketLabelsInclusive(start, last).length });
    }
  }
  return out;
}
