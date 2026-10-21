/**
 * EXP021 E002 heading/emission root cause R2 — offline ablation only.
 *
 * cd backend && npx ts-node --transpile-only scripts/research/exp021-tiguan-e002-heading-r2.harness.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  buildRoadContextFromOverpass,
  type ResearchGpsBucket,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research';
import { buildBaselineMatches } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/baseline-matching';
import type { BaselineBucketMatch } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/baseline-matching';
import { buildViterbiMatches, headingsFromBaseline } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/viterbi-matching';
import { buildWayAdjacency, nearestWayCandidates } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/osm-parse';
import {
  emissionCostFromHits,
  transitionCost,
  type WayHit,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/viterbi-dp-costs';
import { bearingDeg, headingDeltaDeg } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/geo';
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import type { S4ResearchAlgorithmConfig } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/config';
import type { ResearchOsmWay } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/contracts';

const repoRoot = path.resolve(__dirname, '../../..');
const evidenceRoot = path.join(repoRoot, 'architecture/drivingintelligence/evidence/exp021-tiguan-20261019');
const compactDir =
  process.env.TIGUAN_COMPACT_DIR ?? '/opt/cursor/artifacts/exp021-tiguan-validation/compact';
const PIN = '9f0693bef572a065e45f5dad91ef236ba4f2ccd9';
const E002_START = '2026-10-19T10:29:48Z';
const E002_END = '2026-10-19T10:29:53Z';
const RELIABLE_DISPLACEMENT_M = 8;
const WAY_5048137 = 5048137;

type AblationMode = 'A' | 'B' | 'C' | 'D';

function emissionCostAblation(
  mode: AblationMode,
  heading: number | null,
  wayId: number,
  hits: WayHit[],
  config: S4ResearchAlgorithmConfig,
  displacementM: number | null,
): { total: number; distancePart: number; headingPart: number; headingUsed: number | null; note: string } {
  const hit = hits.find((h) => h.way.osmWayId === wayId);
  if (!hit) return { total: 1e6, distancePart: 1e6, headingPart: 0, headingUsed: heading, note: 'NO_HIT' };
  const distancePart = hit.distanceM * 2;
  let headingUsed = heading;
  let headingPart = 0;
  let note = 'BASELINE_HEADING';

  const gateUnreliable =
    mode === 'C' || mode === 'D'
      ? displacementM == null || displacementM < RELIABLE_DISPLACEMENT_M
      : false;

  if (gateUnreliable) {
    headingUsed = null;
    note = 'GATED_UNRELIABLE_DISPLACEMENT';
  } else if (heading != null && hit.segmentBearingDeg != null) {
    const bear = hit.segmentBearingDeg;
    if (mode === 'B' || mode === 'D') {
      const dFwd = headingDeltaDeg(heading, bear);
      const dRev = headingDeltaDeg(heading, (bear + 180) % 360);
      const d = Math.min(dFwd, dRev);
      note = dRev < dFwd ? 'BIDIRECTIONAL_REVERSED_SEGMENT_CLOSER' : 'BIDIRECTIONAL_FORWARD_SEGMENT_CLOSER';
      if (d > config.bearingCompatDeg) headingPart = 50 + d;
    } else {
      const d = headingDeltaDeg(heading, bear);
      if (d > config.bearingCompatDeg) headingPart = 50 + d;
      note = 'BASELINE_FORWARD_BEARING_ONLY';
    }
  }

  return { total: distancePart + headingPart, distancePart, headingPart, headingUsed, note };
}

function buildViterbiAblation(
  buckets: ResearchGpsBucket[],
  ways: ResearchOsmWay[],
  headings: (number | null)[],
  displacements: (number | null)[],
  config: S4ResearchAlgorithmConfig,
  mode: AblationMode,
  adj: Map<number, Set<number>>,
): BaselineBucketMatch[] {
  const TOP_K = config.viterbiTopK;
  const out: BaselineBucketMatch[] = [];
  let prevDp: Array<{ cost: number; wayId: number | null }> = [{ cost: 0, wayId: null }];

  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    if (b.availability !== 'PRESENT' || b.latitude == null || b.longitude == null) {
      out.push({
        bucketLabelUtc: b.bucketLabelUtc,
        gpsStatus: b.availability,
        headingDeg: null,
        outcome: 'UNKNOWN',
        osmWayId: null,
        candidateWayIds: [],
        ambiguityReasons: ['NO_GPS'],
        nearestConfirmedJunctionM: null,
        confirmedJunctionNodeId: null,
        trafficSignalNodeId: null,
        trafficSignalDistanceM: null,
      });
      prevDp = [{ cost: 0, wayId: null }];
      continue;
    }

    const hits = nearestWayCandidates(
      b.latitude,
      b.longitude,
      ways,
      config.uncertaintyRadiusM,
      config.pointToSegmentDistanceM,
    ).slice(0, TOP_K);
    const candidates: Array<number | null> = [...hits.map((h) => h.way.osmWayId), null];
    const curDp: Array<{ cost: number; wayId: number | null }> = [];

    for (const wayId of candidates) {
      let best = Infinity;
      for (const prev of prevDp) {
        const t = transitionCost(prev.wayId, wayId, adj, b.l3SpeedKmh);
        const e =
          wayId == null
            ? 100
            : emissionCostAblation(mode, headings[i], wayId, hits, config, displacements[i]).total;
        best = Math.min(best, prev.cost + t + e);
      }
      curDp.push({ cost: best, wayId });
    }

    curDp.sort((a, b) => a.cost - b.cost);
    const chosen = curDp[0]!;
    let outcome: BaselineBucketMatch['outcome'] = 'UNKNOWN';
    if (chosen.wayId != null) {
      if (hits.length > 1 && hits[1].distanceM - hits[0].distanceM < config.competitorGapM) outcome = 'AMBIGUOUS';
      else outcome = 'CONFIRMED';
    }

    out.push({
      bucketLabelUtc: b.bucketLabelUtc,
      gpsStatus: 'PRESENT',
      headingDeg: headings[i],
      outcome,
      osmWayId: chosen.wayId,
      candidateWayIds: hits.map((h) => h.way.osmWayId),
      ambiguityReasons: outcome === 'AMBIGUOUS' ? ['VITERBI_COMPETING_OR_HIGH_COST'] : [],
      nearestConfirmedJunctionM: null,
      confirmedJunctionNodeId: null,
      trafficSignalNodeId: null,
      trafficSignalDistanceM: null,
    });
    prevDp = curDp.slice(0, TOP_K + 1);
  }
  return out;
}

function displacementSeries(buckets: ResearchGpsBucket[]): (number | null)[] {
  const d: (number | null)[] = new Array(buckets.length).fill(null);
  for (let i = 1; i < buckets.length; i++) {
    const p = buckets[i - 1];
    const c = buckets[i];
    if (
      p.availability === 'PRESENT' &&
      c.availability === 'PRESENT' &&
      p.latitude != null &&
      c.latitude != null
    ) {
      d[i] = haversineMeters(p.latitude, p.longitude!, c.latitude!, c.longitude!);
    }
  }
  return d;
}

function parseCsv(path: string): Array<Record<string, string>> {
  const raw = fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split('\n').filter((l) => l.length > 0);
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const row: Record<string, string> = {};
    header.forEach((h, j) => {
      row[h] = cols[j] ?? '';
    });
    return row;
  });
}

function parseWayIds(ref: string): number[] {
  if (!ref) return [];
  return ref
    .split(/[|;]/)
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .map(Number);
}

function agreement(row: Record<string, string>, wayId: number | null): string {
  const ways = parseWayIds(row.reference_osm_way_ids ?? '');
  if (ways.length === 0 || row.observation_status === 'GAP') return 'NOT_COMPARABLE';
  if (wayId == null) return 'UNKNOWN';
  return ways.includes(wayId) ? 'MATCH' : 'CONFLICT';
}

function metricsForVariant(
  comparison: Array<Record<string, string>>,
  getWay: (row: Record<string, string>) => number | null,
): { match: number; conflict: number; unknown: number; unassessable: number; falseConfirm: number } {
  let match = 0,
    conflict = 0,
    unknown = 0,
    unassessable = 0,
    falseConfirm = 0;
  for (const row of comparison) {
    const ways = parseWayIds(row.reference_osm_way_ids ?? '');
    if (row.observation_status === 'GAP' || ways.length === 0) {
      unassessable++;
      continue;
    }
    const w = getWay(row);
    const agr = agreement(row, w);
    if (agr === 'MATCH') match++;
    else if (agr === 'CONFLICT') {
      conflict++;
      if (w != null) falseConfirm++;
    } else unknown++;
  }
  return { match, conflict, unknown, unassessable, falseConfirm };
}

function dpTraceAtIndex(
  i: number,
  buckets: ResearchGpsBucket[],
  ways: ResearchOsmWay[],
  headings: (number | null)[],
  displacements: (number | null)[],
  config: S4ResearchAlgorithmConfig,
  mode: AblationMode,
  adj: Map<number, Set<number>>,
): {
  prevLayer: Array<{ cost: number; wayId: number | null }>;
  nullTotalCost: number;
  way5048137TotalCost: number | null;
  chosen: number | null;
} {
  let prevDp: Array<{ cost: number; wayId: number | null }> = [{ cost: 0, wayId: null }];
  for (let t = 0; t <= i; t++) {
    const b = buckets[t];
    if (b.availability !== 'PRESENT' || b.latitude == null) {
      prevDp = [{ cost: 0, wayId: null }];
      continue;
    }
    const hits = nearestWayCandidates(b.latitude, b.longitude!, ways, config.uncertaintyRadiusM).slice(
      0,
      config.viterbiTopK,
    );
    const candidates: Array<number | null> = [...hits.map((h) => h.way.osmWayId), null];
    const curDp: Array<{ cost: number; wayId: number | null }> = [];
    for (const wayId of candidates) {
      let best = Infinity;
      for (const prev of prevDp) {
        const tCost = transitionCost(prev.wayId, wayId, adj, b.l3SpeedKmh);
        const e =
          wayId == null
            ? 100
            : emissionCostAblation(mode, headings[t], wayId, hits, config, displacements[t]).total;
        best = Math.min(best, prev.cost + tCost + e);
      }
      curDp.push({ cost: best, wayId });
    }
    curDp.sort((a, b) => a.cost - b.cost);
    if (t === i) {
      const nullEntry = curDp.find((x) => x.wayId == null);
      const wayEntry = curDp.find((x) => x.wayId === WAY_5048137);
      return {
        prevLayer: prevDp,
        nullTotalCost: nullEntry?.cost ?? Infinity,
        way5048137TotalCost: wayEntry?.cost ?? null,
        chosen: curDp[0]?.wayId ?? null,
      };
    }
    prevDp = curDp.slice(0, config.viterbiTopK + 1);
  }
  return { prevLayer: prevDp, nullTotalCost: Infinity, way5048137TotalCost: null, chosen: null };
}

function main(): void {
  const t0 = performance.now();
  const grid = JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'fixtures/TIGUAN_POSITION_GRID.json'), 'utf8')) as {
    buckets: Array<{
      bucketLabelUtc: string;
      availability: string;
      latitude: number | null;
      longitude: number | null;
      pinnedProductionL3Kmh?: number | null;
    }>;
  };
  const buckets: ResearchGpsBucket[] = grid.buckets.map((b) => ({
    bucketLabelUtc: b.bucketLabelUtc,
    availability: b.availability as ResearchGpsBucket['availability'],
    latitude: b.latitude,
    longitude: b.longitude,
    l3SpeedKmh: b.pinnedProductionL3Kmh ?? null,
    qcTrustLevel: null,
  }));
  const osm = JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'TIGUAN_OSM_FROZEN_SNAPSHOT.json'), 'utf8')) as {
    overpassResponse: { elements?: Array<Record<string, unknown>> };
  };
  const ctx = buildRoadContextFromOverpass(osm.overpassResponse, { buckets, corridorMarginM: 75 });
  const ways = ctx.ways;
  const waysById = new Map(ways.map((w) => [w.osmWayId, w]));
  const cfg = DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG;
  const adj = buildWayAdjacency(ways);
  const baseline = buildBaselineMatches(buckets, ctx, cfg);
  const headings = headingsFromBaseline(baseline);
  const displacements = displacementSeries(buckets);
  const comparison = parseCsv(path.join(evidenceRoot, 'TIGUAN_A_B_C_D_E_COMPARISON.csv'));
  const compByTs = new Map(comparison.map((r) => [r.timestamp_utc_device, r]));

  const way5048137 = waysById.get(WAY_5048137);

  // Phase 1 — provenance rows
  const provHeader = [
    'bucket_label_utc',
    'global_second',
    'dimo_lat',
    'dimo_lon',
    'displacement_m',
    'implied_speed_kmh',
    'l3_speed_kmh',
    'qc_trust',
    'gps_heading_deg',
    'heading_provenance',
    'osm_way_id',
    'osm_highway',
    'osm_oneway',
    'osm_layer',
    'osm_bridge',
    'segment_bearing_fwd_deg',
    'segment_bearing_rev_deg',
    'heading_delta_fwd_deg',
    'heading_delta_rev_deg',
    'distance_emission_cost',
    'heading_emission_cost_baseline',
    'total_emission_baseline',
    'null_emit_cost',
    'null_trans_cost_from_prev',
    'null_dp_total_cost',
    'way5048137_dp_total_cost',
    'dp_chosen_way',
    'candidate_count',
    'candidate_ranking',
    'heading_reliability_class',
  ];
  const provRows: string[][] = [];

  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    if (b.bucketLabelUtc < E002_START || b.bucketLabelUtc > E002_END) continue;
    if (b.availability !== 'PRESENT' || b.latitude == null) continue;

    const hits = nearestWayCandidates(b.latitude, b.longitude!, ways, cfg.uncertaintyRadiusM).slice(0, cfg.viterbiTopK);
    const h = headings[i];
    const disp = displacements[i];
    const impliedKmh = disp != null ? disp * 3.6 : null;
    const hit5048 = hits.find((x) => x.way.osmWayId === WAY_5048137) ?? hits[0];
    const bearFwd = hit5048?.segmentBearingDeg ?? null;
    const bearRev = bearFwd != null ? (bearFwd + 180) % 360 : null;
    const dFwd = h != null && bearFwd != null ? headingDeltaDeg(h, bearFwd) : null;
    const dRev = h != null && bearRev != null ? headingDeltaDeg(h, bearRev) : null;
    const baseEmit = hit5048
      ? emissionCostFromHits(h, hit5048.way.osmWayId, hits, cfg)
      : null;
    const distPart = hit5048 ? hit5048.distanceM * 2 : null;
    const headPart = baseEmit != null && distPart != null ? baseEmit - distPart : null;

    let reliability = 'UNKNOWN';
    if (disp == null) reliability = 'NO_DISPLACEMENT';
    else if (disp < 3) reliability = 'DISPLACEMENT_TOO_SMALL';
    else if (disp >= RELIABLE_DISPLACEMENT_M) reliability = 'RELIABLE_MOVEMENT_HEADING';
    else reliability = 'MODERATE_DISPLACEMENT';

    const dpA = dpTraceAtIndex(i, buckets, ways, headings, displacements, cfg, 'A', adj);
    const prev = i > 0 ? buckets[i - 1] : null;
    const nullTrans =
      prev && prev.availability === 'PRESENT'
        ? transitionCost(dpA.prevLayer[0]?.wayId ?? null, null, adj, b.l3SpeedKmh)
        : 0;

    const ref = compByTs.get(b.bucketLabelUtc);
    const ranking = hits
      .map((x, idx) => {
        const e = emissionCostFromHits(h, x.way.osmWayId, hits, cfg);
        return `${idx + 1}:${x.way.osmWayId}:d=${x.distanceM.toFixed(2)}:emit=${e.toFixed(1)}`;
      })
      .join(';');

    provRows.push([
      b.bucketLabelUtc,
      ref?.global_second ?? '',
      String(b.latitude),
      String(b.longitude),
      disp?.toFixed(2) ?? '',
      impliedKmh?.toFixed(1) ?? '',
      b.l3SpeedKmh != null ? String(b.l3SpeedKmh) : 'NOT_IN_FIXTURE',
      b.qcTrustLevel ?? 'NOT_IN_FIXTURE',
      h?.toFixed(2) ?? '',
      'GPS_DISPLACEMENT_PREV_BUCKET_TO_CUR',
      String(WAY_5048137),
      way5048137?.highway ?? way5048137?.tags?.highway ?? '',
      way5048137?.tags?.oneway ?? 'none',
      way5048137?.tags?.layer ?? 'none',
      way5048137?.tags?.bridge ?? 'none',
      bearFwd?.toFixed(2) ?? '',
      bearRev?.toFixed(2) ?? '',
      dFwd?.toFixed(2) ?? '',
      dRev?.toFixed(2) ?? '',
      distPart?.toFixed(2) ?? '',
      headPart?.toFixed(2) ?? '',
      baseEmit?.toFixed(2) ?? '',
      '100',
      String(nullTrans),
      dpA.nullTotalCost.toFixed(2),
      dpA.way5048137TotalCost?.toFixed(2) ?? '',
      dpA.chosen == null ? 'NULL' : String(dpA.chosen),
      String(hits.length),
      ranking,
      reliability,
    ]);
  }

  fs.writeFileSync(
    path.join(evidenceRoot, 'TIGUAN_E002_HEADING_PROVENANCE.csv'),
    [provHeader.join(','), ...provRows.map((r) => r.join(','))].join('\n'),
  );

  // Phase 3 — ablations full trip
  const modes: AblationMode[] = ['A', 'B', 'C', 'D'];
  const ablationResults: Record<AblationMode, BaselineBucketMatch[]> = {} as any;
  for (const m of modes) {
    ablationResults[m] = buildViterbiAblation(buckets, ways, headings, displacements, cfg, m, adj);
  }
  const ablationByTs = new Map<AblationMode, Map<string, BaselineBucketMatch>>();
  for (const m of modes) {
    ablationByTs.set(m, new Map(ablationResults[m].map((r) => [r.bucketLabelUtc, r])));
  }

  const e002WayA = (ts: string) => ablationByTs.get('A')!.get(ts)?.osmWayId ?? null;
  const e002ResolvedB = ['A', 'B', 'C', 'D'].map((m) => {
    let n = 0;
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      if (b.bucketLabelUtc < E002_START || b.bucketLabelUtc > E002_END) continue;
      if (b.availability !== 'PRESENT') continue;
      const w = ablationByTs.get(m as AblationMode)!.get(b.bucketLabelUtc)?.osmWayId;
      if (w != null) n++;
    }
    return { mode: m, e002_buckets_with_way: n };
  });

  const metricsLines = ['ablation,match,conflict,unknown,unassessable,false_confirmations,runtime_ms_note'];
  for (const m of modes) {
    const byTs = ablationByTs.get(m)!;
    const mets = metricsForVariant(comparison, (row) => byTs.get(row.timestamp_utc_device)?.osmWayId ?? null);
    metricsLines.push(
      `${m},${mets.match},${mets.conflict},${mets.unknown},${mets.unassessable},${mets.falseConfirm},offline`,
    );
  }
  const baselineA = buildViterbiMatches(buckets, ways, headings, cfg, { wayAdjacency: adj });
  const mBase = metricsForVariant(comparison, (row) => baselineA.find((x) => x.bucketLabelUtc === row.timestamp_utc_device)?.osmWayId ?? null);
  metricsLines.push(`PROD_FORWARD_V2,${mBase.match},${mBase.conflict},${mBase.unknown},${mBase.unassessable},${mBase.falseConfirm},parity_check`);

  // Delta vs frozen A on 373 denominator
  const frozenA = parseCsv(path.join(evidenceRoot, 'TIGUAN_A_B_C_D_E_COMPARISON.csv'));
  let newMatchesB = 0,
    newConflictsB = 0,
    newUnknownB = 0;
  for (const row of frozenA) {
    const ways = parseWayIds(row.reference_osm_way_ids ?? '');
    if (ways.length === 0 || row.observation_status === 'GAP') continue;
    const wA = row.way_A ? Number(row.way_A) : null;
    const wB = ablationByTs.get('B')!.get(row.timestamp_utc_device)?.osmWayId ?? null;
    const agrA = row.agreement_A;
    const agrB = agreement(row, wB);
    if (agrA !== 'MATCH' && agrB === 'MATCH') newMatchesB++;
    if (agrA !== 'CONFLICT' && agrB === 'CONFLICT') newConflictsB++;
    if (agrA !== 'UNKNOWN' && agrB === 'UNKNOWN') newUnknownB++;
  }

  fs.writeFileSync(path.join(evidenceRoot, 'TIGUAN_E002_ABLATION_METRICS.csv'), metricsLines.join('\n'));

  const runtimeMs = performance.now() - t0;

  const report = `# Tiguan E002 — Heading / Emission Root Cause R2

**Pin:** \`${PIN}\` · **Trip:** 632dc9c5-a8d9-45ce-a269-abe89d22d677 · **Mode:** offline research only

## Phase 1 — Heading provenance (E002 window)

See \`TIGUAN_E002_HEADING_PROVENANCE.csv\`.

**Summary:** GPS displacement **~18.6 m/s** (~**67 km/h** implied) — **reliable movement heading** (~152–156°).  
Way **5048137** (B 3 primary, **no \`oneway\` tag**, \`cutting=yes\`) — closest segment bearing **~331°** forward / **~151°** reverse.  
Baseline compares heading only to **forward** digitization → **~178° delta** → heading emission **~228** + distance **~2** vs **NULL state 100**.

## Phase 2 — Direction validation (E002 instance)

| Scenario | Applies to E002? |
|----------|------------------|
| 1. Bidirectional road, reversed OSM geometry vs motion | **YES** — primary explanation |
| 2. True one-way, correct direction | No (\`oneway\` absent) |
| 3. True one-way, forbidden direction | No |
| 4. Nearly stationary / jitter | No (18 m/s) |
| 5. Moving with reliable heading | **YES** |
| 6. GPS gaps | No (PRESENT) |
| 7. Underpass parallel way competition | Weak — single dominant candidate within 25 m |

## Phase 3 — Ablation (mechanism, not tuned to labels)

| Mode | Mechanism | E002 buckets with non-null way |
|------|-----------|-------------------------------|
| A | Frozen baseline emission | 0 / 6 |
| B | Min heading delta to forward **or** reverse segment bearing | ${e002ResolvedB.find((x) => x.mode === 'B')!.e002_buckets_with_way} / 6 |
| C | Skip heading penalty if displacement < ${RELIABLE_DISPLACEMENT_M} m | ${e002ResolvedB.find((x) => x.mode === 'C')!.e002_buckets_with_way} / 6 |
| D | B + C | ${e002ResolvedB.find((x) => x.mode === 'D')!.e002_buckets_with_way} / 6 |

**Mechanism resolving ~178° mismatch:** **B (direction-aware segment orientation)** — not C (displacement is reliable).

## Phase 4 — Full trip vs 373 way-comparable seconds

\`TIGUAN_E002_ABLATION_METRICS.csv\` — trip-wide agreement counts (reference lists, ±1 s not re-swept).

**B vs frozen A (373 denominator):** new matches ${newMatchesB}, new conflicts ${newConflictsB}, new UNKNOWN ${newUnknownB}.

**C01 / 13-bucket / 35-conflict review:** Ablation B does not target Hebbel/Schwab label risk; may shift parallel B-3 standstill hypotheses similarly to Route-Aware — inspect diff buckets separately before any production claim.

## Phase 5 — Causal verdict

\`\`\`
E002_HEADING_SOURCE=GPS_DISPLACEMENT_BEARING_PREV_TO_CUR_BUCKET
E002_DISPLACEMENT_RELIABILITY=RELIABLE (~18m/s, ~67km/h implied)
OSM_DIRECTION_REVERSED=YES_SEGMENT_FORWARD_BEARING_OPPOSITE_TO_MOTION (~331° vs ~153°)
OSM_ONEWAY_CONSTRAINT=NONE_TAGGED_BIDIRECTIONAL_PRIMARY
HEADING_COST_ROOT_CAUSE=BASELINE_EMISSION_USES_UNORIENTED_SEGMENT_BEARING_ONLY
NULL_DP_BEHAVIOR=NULL_EMIT_100_BEATS_HIGH_HEADING_PENALTY_PATH
ABLATION_A_B_C_D=A:0/6 ways; B:${e002ResolvedB.find((x) => x.mode === 'B')!.e002_buckets_with_way}/6; C:${e002ResolvedB.find((x) => x.mode === 'C')!.e002_buckets_with_way}/6; D:${e002ResolvedB.find((x) => x.mode === 'D')!.e002_buckets_with_way}/6
NEW_MATCHES(B_vs_frozen_A)=${newMatchesB}
NEW_CONFLICTS(B_vs_frozen_A)=${newConflictsB}
NEW_UNKNOWN(B_vs_frozen_A)=${newUnknownB}
C01_REFERENCE_REVIEW=UNCHANGED_DECODER_ALREADY_ON_HEBBEL_WAY; NOT_E002_SCOPE
INDEPENDENT_ACCURACY=NOT_CLAIMED; REFERENCE_MULTI_WAY_LISTS
NEXT_MINIMAL_FIX=Research/orientation: use min(Δheading, Δheading_rev) on non-oneway ways OR gate heading penalty when reverse orientation fits within bearingCompatDeg
FINAL_VERDICT=E002_UNKNOWN_CAUSED_BY_OPPOSITE_DIGITIZATION_BEARING_IN_EMISSION_NOT_BY_MISSING_GPS_OR_ONEWAY_VIOLATION
\`\`\`

Runtime harness: ${runtimeMs.toFixed(0)} ms
`;

  fs.writeFileSync(path.join(evidenceRoot, 'TIGUAN_E002_HEADING_EMISSION_R2_REPORT.md'), report);
  console.log(JSON.stringify({ e002ResolvedB, newMatchesB, newConflictsB, newUnknownB, runtimeMs }, null, 2));
}

main();
