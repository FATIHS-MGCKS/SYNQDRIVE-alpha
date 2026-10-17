import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/geo/haversine';
import { bucketLabelToMs } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import { parseDiV0PositionSnapshot } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-snapshot-parse';
import { DI_V0_POSITION_QUERY_SPEC_V0_1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-acquisition.versions';
import type { DiV0SpeedQcPositionSample } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc.types';
import type { P21ForensicLoadedContext } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import type { DiV0S4ParsedEvidenceContainer } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-evidence-container-parse';
import { EXP021_VIDEO_TACHO_ZERO_WINDOWS_UTC } from './exp021-ev-ground-truth-forensic-export.lib';
import { enumerateInclusive } from './exp021-stationary-offline-prototype.lib';
import { dateToBucketLabel } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-classify';

export type Epistemic = 'CONFIRMED' | 'INFERRED' | 'UNKNOWN';

export const PROVIDER_PATH_DOC = {
  querySpecId: DI_V0_POSITION_QUERY_SPEC_V0_1.id,
  graphqlShape:
    'signals(tokenId, from, to, interval: "1s") { timestamp currentLocationCoordinates(agg: AVG) { latitude longitude } }',
  pagination: 'None in SynqDrive adapter — single response array `data.signals` (CONFIRMED: di-v0-position-normalizer.ts extractProviderRows).',
  postProcessing:
    'Expected 1s grid [from,to); ROW_ABSENT iff zero provider rows map to bucket index after timestamp parse (CONFIRMED: normalizeDiV0PositionResponse).',
  timestampSemantics:
    'Bucket label field `timestamp` — query-anchored 1s interval start per DI_V0_POSITION_QUERY_SPEC_V0_1 / DIMO telemetry-api aggregation docs (INFERRED for Tesla path; same query family as RD001).',
  suppression:
    'Missing grid second = no row in provider array for that label — not SynqDrive dropping unchanged coordinates after receipt (CONFIRMED normalizer). Whether DIMO omits unchanged samples upstream: UNKNOWN without raw Tesla uplink trace; sparse array is consistent with absent rows.',
  liveVsHistorical:
    'This pin uses TELEMETRY_SIGNALS_HISTORICAL acquisition (CONFIRMED acquisitionProvenance in snapshot). Live latest path is separate in product (INFERRED — not mixed into this evidence).',
} as const;

export function parsePinnedPositionSnapshot(parsed: DiV0S4ParsedEvidenceContainer) {
  const payload = parsed.channelPayloads.POSITION;
  if (!payload) return null;
  return parseDiV0PositionSnapshot(payload);
}

export function haltLabelsAll(): Array<{ haltId: string; fromUtc: string; toUtc: string; labels: string[] }> {
  return EXP021_VIDEO_TACHO_ZERO_WINDOWS_UTC.map((w, i) => ({
    haltId: `LONG_HALT_${i + 1}`,
    fromUtc: w.from,
    toUtc: w.to,
    labels: enumerateInclusive(w.from, w.to),
  }));
}

export function auditHaltLabelProviderRows(
  labels: string[],
  material: ReturnType<typeof parseDiV0PositionSnapshot>,
  freshByLabel: Map<string, { providerRowCount?: number; availability?: string }> | null,
) {
  const byLabel = new Map(material.buckets.map((b) => [b.bucketLabel, b]));
  const rejectedNear = material.rejectedProviderRows.filter((r) => {
    if (!r.rawLabel) return false;
    return labels.some((l) => Math.abs(bucketLabelToMs(l) - bucketLabelToMs(r.rawLabel!)) <= 5000);
  });
  const perLabel = labels.map((label) => {
    const b = byLabel.get(label);
    return {
      bucketLabelUtc: label,
      pinnedAvailability: b?.availability ?? 'MISSING',
      pinnedProviderRowCount: b?.providerRowCount ?? null,
      freshProviderRowCount: freshByLabel?.get(label)?.providerRowCount ?? null,
      freshAvailability: freshByLabel?.get(label)?.availability ?? null,
      rowAbsentMeansNoRawProviderRow:
        b?.availability === 'ROW_ABSENT' && (b?.providerRowCount ?? 0) === 0
          ? 'CONFIRMED'
          : b?.availability === 'ROW_ABSENT'
            ? 'CHECK'
            : 'N/A',
    };
  });
  const pinAbsentRawAbsent = perLabel.filter(
    (r) => r.pinnedProviderRowCount === 0 && r.pinnedAvailability === 'ROW_ABSENT',
  ).length;
  const freshAbsentWhenPinAbsent = perLabel.filter(
    (r) =>
      r.pinnedAvailability === 'ROW_ABSENT' &&
      (r.freshProviderRowCount === 0 || r.freshAvailability === 'ROW_ABSENT'),
  ).length;
  return {
    perLabel,
    rejectedProviderRowsNearHalt: rejectedNear,
    summary: {
      labels: labels.length,
      pinRowAbsentWithProviderRowCount0: pinAbsentRawAbsent,
      pinAbsentFreshAlsoAbsent: freshAbsentWhenPinAbsent,
      epistemic:
        'CONFIRMED on this query path: ROW_ABSENT ↔ providerRowCount=0 in pinned snapshot material (semantic validator enforces).',
    },
  };
}

export type SignalInventoryRow = {
  signal: string;
  source: string;
  timeBasis: string;
  haltCoverage: Record<string, { presentLabels: number; totalLabels: number; sample: unknown[] }>;
  limits: string;
  epistemic: Epistemic;
};

export function buildSignalInventory(
  ctx: P21ForensicLoadedContext,
  halts: ReturnType<typeof haltLabelsAll>,
  shadowByLabel: Map<string, (typeof ctx.shadowIntervals)[number]>,
): SignalInventoryRow[] {
  const posByLabel = new Map(ctx.evidence.positions.map((p) => [p.bucketLabel, p]));
  const r1ByLabel = new Map(ctx.evidence.r1Obd.map((r) => [r.bucketLabel, r]));

  const rows: SignalInventoryRow[] = [];

  const positionHalt = summarizeHalt(posByLabel, halts, (label) => {
    const p = posByLabel.get(label);
    if (!p) return null;
    return {
      availability: p.availability,
      positionState: p.positionState,
      hasCoords: p.latitude != null && p.longitude != null,
    };
  });
  rows.push({
    signal: 'POSITION (pinned S4 currentLocationCoordinates 1s AVG)',
    source: 'di_v0_s4_evidence_snapshots POSITION channel',
    timeBasis: '1s bucket label UTC (not sensor time)',
    haltCoverage: positionHalt,
    limits: 'ROW_ABSENT = no provider row for label on historical query path; HOLD still PRESENT with coords',
    epistemic: 'CONFIRMED',
  });

  const r1Halt = summarizeHalt(r1ByLabel, halts, (label) => {
    if (!r1ByLabel.has(label)) return null;
    return { speedKmh: r1ByLabel.get(label)?.speedKmh ?? null };
  });
  rows.push({
    signal: 'R1_OBD speedKmh (pinned)',
    source: 'S4 R1_OBD channel — Tesla integration path (not Ruptela)',
    timeBasis: '1s bucket label',
    haltCoverage: r1Halt,
    limits: 'Null speedKmh = no numeric witness at label; independent of POSITION ROW_ABSENT',
    epistemic: 'CONFIRMED',
  });

  const l3Halt = summarizeHalt(shadowByLabel, halts, (label) => {
    const s = shadowByLabel.get(label);
    if (!s) return null;
    return {
      motionState: s.motionState,
      speedEvidenceState: s.speedEvidenceState,
      estimatedSpeedKmh: s.estimatedSpeedKmh,
      positionState: s.positionState,
      abstentionReason: s.abstentionReason,
      sourceQualityFlags: s.sourceQualityFlags,
    };
  });
  rows.push({
    signal: 'S1/L3 shadow (replay)',
    source: 'di_v0_shadow_intervals pinned replay',
    timeBasis: 'referenceTime → bucket label',
    haltCoverage: l3Halt,
    limits: 'NO_MOTION_EVIDENCE when position support missing; STATIONARY_BAND only with PRESENT center',
    epistemic: 'CONFIRMED',
  });

  return rows;
}

function summarizeHalt<T>(
  map: Map<string, T>,
  halts: ReturnType<typeof haltLabelsAll>,
  project: (label: string) => unknown | null,
): Record<string, { presentLabels: number; totalLabels: number; sample: unknown[] }> {
  const out: Record<string, { presentLabels: number; totalLabels: number; sample: unknown[] }> = {};
  for (const h of halts) {
    let present = 0;
    const sample: unknown[] = [];
    for (const label of h.labels) {
      const v = project(label);
      if (v != null) {
        present += 1;
        if (sample.length < 4) sample.push({ bucketLabelUtc: label, ...v });
      }
    }
    out[h.haltId] = { presentLabels: present, totalLabels: h.labels.length, sample };
  }
  return out;
}

export function analyzeBandSecondsLegGeometry(
  posByLabel: Map<string, DiV0SpeedQcPositionSample>,
  bandLabels: string[],
) {
  return bandLabels.map((label) => {
    const prev = posByLabel.get(new Date(bucketLabelToMs(label) - 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'));
    const center = posByLabel.get(label);
    const next = posByLabel.get(new Date(bucketLabelToMs(label) + 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'));
    const coordsPresent = {
      prev: prev?.availability === 'PRESENT' && prev.latitude != null,
      center: center?.availability === 'PRESENT' && center.latitude != null,
      next: next?.availability === 'PRESENT' && next.latitude != null,
    };
    let offlineLegKmh: { prevToCenter: number | null; centerToNext: number | null } = {
      prevToCenter: null,
      centerToNext: null,
    };
    if (coordsPresent.prev && coordsPresent.center && prev && center) {
      const d = haversineMeters(prev.latitude!, prev.longitude!, center.latitude!, center.longitude!);
      offlineLegKmh.prevToCenter = (d / 1) * 3.6;
    }
    if (coordsPresent.center && coordsPresent.next && center && next) {
      const d = haversineMeters(center.latitude!, center.longitude!, next.latitude!, next.longitude!);
      offlineLegKmh.centerToNext = (d / 1) * 3.6;
    }
    return {
      bucketLabelUtc: label,
      positionState: center?.positionState ?? null,
      coordsPresent,
      exportLegImpliedNullReason:
        'V2 STATIONARY_BAND QC path accepts null L3 without writing supportAssessment.legImpliedSpeedMps (CONFIRMED evaluate-di-v0-speed-qc-interval.ts).',
      offlineLegImpliedKmhFromPinnedCoords: offlineLegKmh,
    };
  });
}

/** Offline experiment: R1-only motion witness inside halt ROW_ABSENT runs (causal per second). */
export function experimentR1WitnessInHalts(
  halts: ReturnType<typeof haltLabelsAll>,
  posByLabel: Map<string, DiV0SpeedQcPositionSample>,
  r1ByLabel: Map<string, { speedKmh: number | null }>,
) {
  const STANDSTILL_R1_MAX = 1.0;
  const SLOW_R1_MAX = 5.0;
  const perHalt: Record<string, unknown> = {};
  let totalAbsent = 0;
  let r1Numeric = 0;
  let classifiedStandstill = 0;
  let classifiedSlow = 0;
  let classifiedMoving = 0;
  let classifiedUnknown = 0;

  for (const h of halts) {
    const seconds: Array<Record<string, unknown>> = [];
    for (const label of h.labels) {
      const pos = posByLabel.get(label);
      const r1 = r1ByLabel.get(label)?.speedKmh ?? null;
      if (pos?.availability !== 'ROW_ABSENT') continue;
      totalAbsent += 1;
      let causalClass: string;
      if (r1 == null || !Number.isFinite(r1)) {
        causalClass = 'UNKNOWN';
        classifiedUnknown += 1;
      } else {
        r1Numeric += 1;
        if (r1 <= STANDSTILL_R1_MAX) {
          causalClass = 'R1_WITNESS_STANDSTILL_LEQ_1KMH';
          classifiedStandstill += 1;
        } else if (r1 <= SLOW_R1_MAX) {
          causalClass = 'R1_WITNESS_SLOW_1_5';
          classifiedSlow += 1;
        } else {
          causalClass = 'R1_WITNESS_MOVING_GT_5';
          classifiedMoving += 1;
        }
      }
      if (seconds.length < 6) {
        seconds.push({ bucketLabelUtc: label, r1SpeedKmh: r1, causalClass });
      }
    }
    perHalt[h.haltId] = { sampleAbsentSeconds: seconds };
  }

  return {
    hypothesis:
      'Use pinned R1_OBD numeric speed as independent witness when POSITION is ROW_ABSENT (no new fetch).',
    thresholdsKmh: { standstill: STANDSTILL_R1_MAX, slowMax: SLOW_R1_MAX },
    totals: {
      positionRowAbsentInHalts: totalAbsent,
      withNumericR1: r1Numeric,
      causalClass: {
        standstill: classifiedStandstill,
        slow: classifiedSlow,
        moving: classifiedMoving,
        unknown: classifiedUnknown,
      },
    },
    perHaltSamples: perHalt,
    epistemic: 'INFERRED — R1 is interval/bucket witness not proven physical standstill; video remains evaluation only.',
    retrospectiveBracketNote:
      'Bracket displacement before/after gap is reported separately in halt forensics — not used in this causal per-second experiment.',
  };
}

export function buildHaltSummaryTable(
  halts: ReturnType<typeof haltLabelsAll>,
  ctx: P21ForensicLoadedContext,
  providerAuditByHalt: Map<string, ReturnType<typeof auditHaltLabelProviderRows>>,
  r1Experiment: ReturnType<typeof experimentR1WitnessInHalts>,
  shadowByLabel: Map<string, (typeof ctx.shadowIntervals)[number]>,
) {
  const posByLabel = new Map(ctx.evidence.positions.map((p) => [p.bucketLabel, p]));
  return halts.map((h) => {
    const providerAudit = providerAuditByHalt.get(h.haltId)!;
    const labels = h.labels;
    let v2Band = 0;
    let noMotion = 0;
    for (const l of labels) {
      const s = shadowByLabel.get(l);
      if (s?.motionState === 'NO_MOTION_EVIDENCE') noMotion += 1;
      if (
        s?.motionState === 'STATIONARY_SUPPORTED' &&
        s.speedEvidenceState === 'STATIONARY_BAND'
      ) {
        v2Band += 1;
      }
    }
    const pinPresent = labels.filter((l) => posByLabel.get(l)?.availability === 'PRESENT').length;
    const exp = r1Experiment.perHaltSamples[h.haltId] as { sampleAbsentSeconds?: unknown[] };
    return {
      haltId: h.haltId,
      window: { fromUtc: h.fromUtc, toUtc: h.toUtc },
      present: {
        pinnedPositionPresentSeconds: pinPresent,
        pinnedProviderRowCountGt0: providerAudit.perLabel.filter((p) => (p.pinnedProviderRowCount ?? 0) > 0)
          .length,
        shadowV2BandSeconds: v2Band,
        shadowNoMotionSeconds: noMotion,
      },
      missing: {
        pinnedPositionRowAbsent: labels.length - pinPresent,
        rawProviderRowAbsentConfirmed: providerAudit.perLabel.filter(
          (p) => p.pinnedAvailability === 'ROW_ABSENT' && p.pinnedProviderRowCount === 0,
        ).length,
      },
      recognition: {
        canClaimStandstill: pinPresent > 0 ? 'PARTIAL_ONLY_ON_PRESENT_LABELS' : 'NO_ON_GAP_LABELS',
        r1ExperimentOnAbsentSeconds: exp?.sampleAbsentSeconds ?? [],
        interpretation:
          'Pipeline withholds STATIONARY_BAND on ROW_ABSENT; R1 experiment shows whether any absent second has independent numeric witness.',
      },
    };
  });
}

export function shadowMapFromContext(ctx: P21ForensicLoadedContext) {
  return new Map(ctx.shadowIntervals.map((r) => [dateToBucketLabel(r.referenceTime), r]));
}

/** Offline experiment B: leg geometry on V2-band seconds where coords exist (not halt windows). */
export function experimentBandLegSlowMovement(
  legAnalysis: ReturnType<typeof analyzeBandSecondsLegGeometry>,
) {
  const rows = legAnalysis.map((leg) => {
    const a = leg.offlineLegImpliedKmhFromPinnedCoords.prevToCenter;
    const b = leg.offlineLegImpliedKmhFromPinnedCoords.centerToNext;
    const maxLeg = Math.max(a ?? 0, b ?? 0);
    let causalClass: string;
    if (!leg.coordsPresent.center) {
      causalClass = 'UNKNOWN_NO_CENTER_COORD';
    } else if (maxLeg < 1.5) {
      causalClass = 'LEG_EVIDENCE_LOW_LT_1_5_KMH';
    } else if (maxLeg < 5) {
      causalClass = 'LEG_EVIDENCE_SLOW_1_5_TO_5_KMH';
    } else {
      causalClass = 'LEG_EVIDENCE_FAST_GE_5_KMH';
    }
    return { bucketLabelUtc: leg.bucketLabelUtc, maxLegImpliedKmh: maxLeg, causalClass };
  });
  const slow = rows.filter((r) => r.causalClass === 'LEG_EVIDENCE_SLOW_1_5_TO_5_KMH').length;
  return {
    hypothesis:
      'On seconds already in V2 STATIONARY_BAND with full PRESENT triplets, use pinned coordinate leg speeds to separate slow roll vs near-stop (offline only).',
    perSecond: rows,
    totals: {
      seconds: rows.length,
      slowMovementEvidenced: slow,
      lowLeg: rows.filter((r) => r.causalClass === 'LEG_EVIDENCE_LOW_LT_1_5_KMH').length,
    },
    conflictNote:
      'These seconds are outside main video halts; shows missing leg export ≠ missing coords; slow legs align with video tacho 1–3 display band without proving halt-window standstill.',
    epistemic: 'INFERRED',
  };
}
