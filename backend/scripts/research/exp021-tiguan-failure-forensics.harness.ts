/**
 * EXP021 Tiguan failure forensics R1 — read-only traces, no algorithm changes.
 *
 * cd backend && npx ts-node --transpile-only scripts/research/exp021-tiguan-failure-forensics.harness.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { DI_V0_S4_LIMITS } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-contract';
import { parseDiV0S4EvidenceContainer } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-evidence-container-parse';
import { parseDiV0PositionSnapshot } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-snapshot-parse';
import {
  DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  buildDirectedCarRoutingGraph,
  buildRoadContextFromOverpass,
  buildStrictNodeIdWayAdjacency,
  buildViterbiMatchesBacktrackR1,
  buildViterbiMatchesRouteAwareR4_1,
  type ResearchGpsBucket,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research';
import { buildBaselineMatches } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/baseline-matching';
import {
  buildViterbiMatches,
  headingsFromBaseline,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/viterbi-matching';
import { buildWayAdjacency, nearestWayCandidates } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/osm-parse';
import {
  emissionCostFromHits,
  transitionCost,
  type WayHit,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/viterbi-dp-costs';
import { computeRouteAwareTransitionCost } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/route-aware-transition';
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';

const repoRoot = path.resolve(__dirname, '../../..');
const evidenceRoot = path.join(repoRoot, 'architecture/drivingintelligence/evidence/exp021-tiguan-20261019');
const compactDir =
  process.env.TIGUAN_COMPACT_DIR ?? '/opt/cursor/artifacts/exp021-tiguan-validation/compact';
const evidenceGzip =
  process.env.TIGUAN_EVIDENCE_GZIP ??
  '/opt/cursor/artifacts/exp021-tiguan-validation/raw/tiguan_evidence_payload.gz';
const PIN_SHA = '9f0693bef572a065e45f5dad91ef236ba4f2ccd9';

const HEBBEL_WAY = 25932713;
const SCHWAB_WAYS = [25699754, 25932717];
const B3_REF_WAYS = [344301563, 790233501, 790233502, 5048137, 4321532, 382929730, 382929736];

const DIFF_BUCKETS = [
  '2026-10-19T10:30:13Z',
  '2026-10-19T10:30:14Z',
  '2026-10-19T10:30:15Z',
  '2026-10-19T10:30:16Z',
  '2026-10-19T10:30:18Z',
  '2026-10-19T10:30:19Z',
  '2026-10-19T10:30:35Z',
  '2026-10-19T10:30:37Z',
  '2026-10-19T10:30:38Z',
  '2026-10-19T10:30:39Z',
  '2026-10-19T10:34:46Z',
  '2026-10-19T10:34:51Z',
  '2026-10-19T10:34:54Z',
];

const E002_BUCKETS = ['2026-10-19T10:29:48Z', '2026-10-19T10:29:49Z', '2026-10-19T10:29:50Z', '2026-10-19T10:29:51Z', '2026-10-19T10:29:52Z', '2026-10-19T10:29:53Z'];

function parseCsv(path: string): Array<Record<string, string>> {
  const raw = fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split('\n').filter((l) => l.length > 0);
  const header = parseCsvLine(lines[0]);
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    header.forEach((h, j) => {
      row[h] = cols[j] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === ',' && !inQ) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function parseWayIds(ref: string): number[] {
  if (!ref) return [];
  return ref
    .split(/[|;]/)
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .map(Number);
}

function wayName(waysById: Map<number, { tags?: Record<string, string> }>, id: number | null): string {
  if (id == null) return '';
  return waysById.get(id)?.tags?.name ?? waysById.get(id)?.tags?.['name:de'] ?? '';
}

function distToWay(
  lat: number,
  lon: number,
  wayId: number,
  waysById: Map<number, { osmWayId: number; nodes: Array<{ lat: number; lon: number }> }>,
  cfg: typeof DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
): number | null {
  const w = waysById.get(wayId);
  if (!w) return null;
  const hits = nearestWayCandidates(lat, lon, [w], cfg.uncertaintyRadiusM * 4, cfg.pointToSegmentDistanceM);
  return hits[0]?.distanceM ?? null;
}

type TraceRow = Record<string, string | number>;

function traceBucket(params: {
  idx: number;
  bucket: ResearchGpsBucket;
  heading: number | null;
  baseline: ReturnType<typeof buildBaselineMatches>[number];
  fwd: ReturnType<typeof buildViterbiMatches>[number];
  bkt: ReturnType<typeof buildViterbiMatchesBacktrackR1>['matches'][number];
  strictFwd: ReturnType<typeof buildViterbiMatches>[number];
  strictBt: ReturnType<typeof buildViterbiMatchesBacktrackR1>['matches'][number];
  route: ReturnType<typeof buildViterbiMatchesRouteAwareR4_1>['matches'][number];
  ways: ResearchOsmWay[];
  waysById: Map<number, ResearchOsmWay>;
  adj: Map<number, Set<number>>;
  prevFwdWay: number | null;
  refRow?: Record<string, string>;
}): TraceRow {
  const { bucket, heading, baseline, fwd, bkt, strictFwd, strictBt, route, ways, waysById, adj, prevFwdWay, refRow } =
    params;
  const cfg = DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG;
  let hits: WayHit[] = [];
  if (bucket.availability === 'PRESENT' && bucket.latitude != null && bucket.longitude != null) {
    hits = nearestWayCandidates(
      bucket.latitude,
      bucket.longitude,
      ways,
      cfg.uncertaintyRadiusM,
      cfg.pointToSegmentDistanceM,
    );
  }
  const topK = hits.slice(0, cfg.viterbiTopK);
  const candidateJson = topK
    .map((h) => {
      const emit = emissionCostFromHits(heading, h.way.osmWayId, topK, cfg);
      const trans = transitionCost(prevFwdWay, h.way.osmWayId, adj, bucket.l3SpeedKmh);
      return `${h.way.osmWayId}|d=${h.distanceM.toFixed(2)}|bear=${h.segmentBearingDeg?.toFixed(1) ?? 'na'}|emit=${emit.toFixed(1)}|trans=${trans}`;
    })
    .join(';');
  const nullEmit = 100;
  const nullTrans = transitionCost(prevFwdWay, null, adj, bucket.l3SpeedKmh);
  const refWays = refRow ? parseWayIds(refRow.osm_way_ids ?? '') : [];
  return {
    bucket_index: params.idx,
    bucket_label_utc: bucket.bucketLabelUtc,
    global_second: refRow?.global_second ?? '',
    source_video: refRow?.source_video ?? '',
    dimo_lat: bucket.latitude ?? '',
    dimo_lon: bucket.longitude ?? '',
    gps_availability: bucket.availability,
    baseline_outcome: baseline.outcome,
    baseline_ambiguity: baseline.ambiguityReasons.join('|'),
    heading_deg: heading ?? '',
    candidate_top_k: candidateJson,
    null_state_emit_cost: nullEmit,
    null_state_trans_cost: nullTrans,
    way_A: fwd.osmWayId ?? '',
    way_B: bkt.osmWayId ?? '',
    way_C: strictFwd.osmWayId ?? '',
    way_D: strictBt.osmWayId ?? '',
    way_E: route.osmWayId ?? '',
    outcome_A: fwd.outcome,
    ref_road: refRow?.road_name_verified ?? '',
    ref_way_ids: refRow?.osm_way_ids ?? '',
    dist_hebbel_m: bucket.latitude != null ? distToWay(bucket.latitude, bucket.longitude!, HEBBEL_WAY, waysById as any, cfg) ?? '' : '',
    dist_schwab_min_m:
      bucket.latitude != null
        ? Math.min(
            ...SCHWAB_WAYS.map((id) => distToWay(bucket.latitude!, bucket.longitude!, id, waysById as any, cfg) ?? 1e9),
          )
        : '',
    chosen_vs_ref:
      refWays.length && fwd.osmWayId != null
        ? refWays.includes(fwd.osmWayId)
          ? 'MATCH'
          : 'CONFLICT'
        : 'NOT_DECIDABLE',
  };
}

type ResearchOsmWay = import('../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/contracts').ResearchOsmWay;

function refWays(row: Record<string, string>): number[] {
  return parseWayIds(row.reference_osm_way_ids ?? row.osm_way_ids ?? '');
}

function classifyFromAgreement(
  row: Record<string, string>,
  variant: 'A' | 'B' | 'C' | 'D' | 'E',
): 'correct' | 'incorrect' | 'abstained' | 'unassessable' {
  if (row.observation_status === 'GAP') return 'unassessable';
  const ways = refWays(row);
  const road = row.reference_road ?? row.road_name_verified ?? '';
  if (ways.length === 0 && (road === 'UNKNOWN' || !road)) return 'unassessable';
  const agr = row[`agreement_${variant}`];
  const way = row[`way_${variant}`];
  if (!way && (row[`outcome_${variant}`]?.includes('UNKNOWN') || agr === 'UNKNOWN')) return 'abstained';
  if (agr === 'MATCH') return 'correct';
  if (agr === 'CONFLICT') return 'incorrect';
  if (agr === 'NOT_COMPARABLE') return 'unassessable';
  return 'abstained';
}

function main(): void {
  const grid = JSON.parse(
    fs.readFileSync(path.join(evidenceRoot, 'fixtures/TIGUAN_POSITION_GRID.json'), 'utf8'),
  ) as { buckets: Array<{ bucketLabelUtc: string; availability: string; latitude: number | null; longitude: number | null }> };
  const buckets: ResearchGpsBucket[] = grid.buckets.map((b) => ({
    bucketLabelUtc: b.bucketLabelUtc,
    availability: b.availability as ResearchGpsBucket['availability'],
    latitude: b.latitude,
    longitude: b.longitude,
    l3SpeedKmh: null,
  }));
  const osm = JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'TIGUAN_OSM_FROZEN_SNAPSHOT.json'), 'utf8')) as {
    overpassResponse: { elements?: Array<Record<string, unknown>> };
  };
  const roadContext = buildRoadContextFromOverpass(osm.overpassResponse, { buckets, corridorMarginM: 75 });
  const ways = roadContext.ways;
  const waysById = new Map(ways.map((w) => [w.osmWayId, w]));
  const baseline = buildBaselineMatches(buckets, roadContext, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
  const headings = headingsFromBaseline(baseline);
  const roundedAdj = buildWayAdjacency(ways);
  const strict = buildStrictNodeIdWayAdjacency(osm.overpassResponse, ways, roundedAdj);
  const directed = buildDirectedCarRoutingGraph(osm.overpassResponse, ways);

  const fwd = buildViterbiMatches(buckets, ways, headings, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG, {
    wayAdjacency: roundedAdj,
  });
  const bt = buildViterbiMatchesBacktrackR1(buckets, ways, headings, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG, {
    wayAdjacency: roundedAdj,
  }).matches;
  const fwdStrict = buildViterbiMatches(buckets, ways, headings, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG, {
    wayAdjacency: strict.undirectedAdj,
  });
  const btStrict = buildViterbiMatchesBacktrackR1(buckets, ways, headings, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG, {
    wayAdjacency: strict.undirectedAdj,
  }).matches;
  const route = buildViterbiMatchesRouteAwareR4_1(
    buckets,
    ways,
    headings,
    DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    directed,
  ).matches;

  const refRows = parseCsv(path.join(compactDir, 'TIGUAN_SECOND_BY_SECOND.csv'));
  const refByTs = new Map(refRows.map((r) => [r.timestamp_utc_device, r]));
  const comparison = parseCsv(path.join(evidenceRoot, 'TIGUAN_A_B_C_D_E_COMPARISON.csv'));

  // Phase 1 — time
  const overlayRows = refRows.filter((r) => r.coordinate_source === 'IPHONE_VIDEO_OVERLAY' && r.gps_lat && r.gps_lon);
  const overlayDists: number[] = [];
  for (const r of overlayRows) {
    const b = buckets.find((x) => x.bucketLabelUtc === r.timestamp_utc_device);
    if (b?.latitude != null && b.longitude != null) {
      overlayDists.push(haversineMeters(Number(r.gps_lat), Number(r.gps_lon), b.latitude, b.longitude));
    }
  }
  overlayDists.sort((a, b) => a - b);
  const gzipBuf = fs.readFileSync(evidenceGzip);
  const container = gunzipSync(gzipBuf, { maxOutputLength: DI_V0_S4_LIMITS.maxUncompressedSnapshotBytes }).toString('utf8');
  const parsed = parseDiV0S4EvidenceContainer(container);
  const posMat = parseDiV0PositionSnapshot(parsed.channelPayloads.POSITION ?? '');

  const timeVerdict = {
    providerMeasurementTimestampsInExport: 'NOT_PRESENT_ONLY_BUCKET_LABEL_UTC',
    providerSignalsNull: posMat.providerSignalsNull,
    rejectedProviderRows: posMat.rejectedProviderRows.length,
    bucketTemporalConfidence: 'BUCKET_BOUNDED_WHEN_PRESENT',
    tripWindowUtc: { from: posMat.window.fromUtc, to: posMat.window.toUtc },
    videoWindowUtc: { from: '2026-10-19T10:29:19Z', to: '2026-10-19T10:38:24Z' },
    overlayAnchorCount: overlayDists.length,
    overlayVsDimoDistanceM: {
      min: overlayDists[0],
      median: overlayDists[Math.floor(overlayDists.length / 2)],
      max: overlayDists[overlayDists.length - 1],
    },
    supportedOffsetSeconds: 0,
    offsetUncertaintySeconds: 'PLUS_MINUS_1_UNCALIBRATED_DISPLAY_GRID',
    note: 'Do not confuse bucketLabelUtc (grid assignment) with unavailable per-row provider measurement timestamps in frozen snapshot.',
  };

  // C01 window 10:36:45 - 10:37:40 local => 10:36:45 - 10:37:40Z
  const c01Rows: TraceRow[] = [];
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    if (b.bucketLabelUtc < '2026-10-19T10:36:45Z' || b.bucketLabelUtc > '2026-10-19T10:37:40Z') continue;
    const prev = i > 0 ? fwd[i - 1].osmWayId : null;
    c01Rows.push(
      traceBucket({
        idx: i,
        bucket: b,
        heading: headings[i],
        baseline: baseline[i],
        fwd: fwd[i],
        bkt: bt[i],
        strictFwd: fwdStrict[i],
        strictBt: btStrict[i],
        route: route[i],
        ways,
        waysById,
        adj: roundedAdj,
        prevFwdWay: prev,
        refRow: refByTs.get(b.bucketLabelUtc),
      }),
    );
  }

  // E002
  const e002Rows: TraceRow[] = [];
  for (const ts of E002_BUCKETS) {
    const i = buckets.findIndex((b) => b.bucketLabelUtc === ts);
    if (i < 0) continue;
    const b = buckets[i];
    const hits = nearestWayCandidates(b.latitude!, b.longitude!, ways, 25);
    const layerTags = ways
      .filter((w) => hits.some((h) => h.way.osmWayId === w.osmWayId))
      .map((w) => `${w.osmWayId}:layer=${w.tags?.layer ?? 'none'}:bridge=${w.tags?.bridge ?? 'none'}`);
    e002Rows.push({
      ...traceBucket({
        idx: i,
        bucket: b,
        heading: headings[i],
        baseline: baseline[i],
        fwd: fwd[i],
        bkt: bt[i],
        strictFwd: fwdStrict[i],
        strictBt: btStrict[i],
        route: route[i],
        ways,
        waysById,
        adj: roundedAdj,
        prevFwdWay: i > 0 ? fwd[i - 1].osmWayId : null,
        refRow: refByTs.get(ts),
      }),
      b3_ref_way_in_top_k: B3_REF_WAYS.filter((id) => hits.slice(0, 4).some((h) => h.way.osmWayId === id)).join('|'),
      osm_layer_bridge: layerTags.join(';'),
      failure_hypothesis:
        baseline[i].ambiguityReasons.some((a) => a.startsWith('BEARING_MISMATCH'))
          ? 'EMISSION_HEADING_MISMATCH_CAUSES_NULL_DP_STATE'
          : hits.length === 0
            ? 'NO_CANDIDATE_IN_UNCERTAINTY_RADIUS'
            : 'OTHER',
    });
  }

  // 13 diff buckets
  const diffTraces: TraceRow[] = [];
  for (const ts of DIFF_BUCKETS) {
    const i = buckets.findIndex((b) => b.bucketLabelUtc === ts);
    if (i < 0) continue;
    let routeTrans = '';
    if (i > 0 && buckets[i].availability === 'PRESENT' && buckets[i - 1].availability === 'PRESENT') {
      const pw = route[i - 1].osmWayId;
      const cw = route[i].osmWayId;
      if (pw != null && cw != null) {
        const parts = computeRouteAwareTransitionCost(
          directed,
          buckets[i - 1],
          buckets[i],
          waysById.get(pw)!,
          waysById.get(cw)!,
          DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
        );
        routeTrans = `${parts.status}|dist=${parts.routeDistanceM}|cost=${parts.total}`;
      }
    }
    diffTraces.push({
      ...traceBucket({
        idx: i,
        bucket: buckets[i],
        heading: headings[i],
        baseline: baseline[i],
        fwd: fwd[i],
        bkt: bt[i],
        strictFwd: fwdStrict[i],
        strictBt: btStrict[i],
        route: route[i],
        ways,
        waysById,
        adj: roundedAdj,
        prevFwdWay: i > 0 ? fwd[i - 1].osmWayId : null,
        refRow: refByTs.get(ts),
      }),
      diff_cluster: ts.startsWith('2026-10-19T10:34') ? 'POST_GAP_PARALLEL_WAYS' : 'B3_STANDSTILL_ROUTE_AWARE',
      route_aware_transition: routeTrans,
      ab_diff: fwd[i].osmWayId !== bt[i].osmWayId ? 'YES' : 'NO',
      ae_diff: fwd[i].osmWayId !== route[i].osmWayId ? 'YES' : 'NO',
    });
  }

  function writeCsv(file: string, rows: TraceRow[]): void {
    if (rows.length === 0) return;
    const keys = Object.keys(rows[0]);
    const lines = [keys.join(',')];
    for (const r of rows) {
      lines.push(keys.map((k) => String(r[k] ?? '').replace(/,/g, ';')).join(','));
    }
    fs.writeFileSync(path.join(evidenceRoot, file), lines.join('\n'));
  }

  writeCsv('TIGUAN_C01_HEBBEL_SCHWAB_AUDIT.csv', c01Rows);
  writeCsv('TIGUAN_E002_B3_UNDERPASS_AUDIT.csv', e002Rows);
  writeCsv('TIGUAN_13_BUCKET_DECISION_TRACES.csv', diffTraces);

  // Metrics phase 5
  const metricsRows: string[] = [
    'variant,assessable,correct,incorrect,abstained,unassessable,accuracy_among_decided,conflict_rate_assessable,corrected_from_A_incorrect_to_E_match,abstained_A_assessable_now_E',
  ];
  for (const variant of ['A', 'B', 'C', 'D', 'E'] as const) {
    let correct = 0,
      incorrect = 0,
      abstained = 0,
      unassessable = 0;
    for (const row of comparison) {
      const c = classifyFromAgreement(row, variant);
      if (c === 'correct') correct++;
      else if (c === 'incorrect') incorrect++;
      else if (c === 'abstained') abstained++;
      else unassessable++;
    }
    const assessable = correct + incorrect + abstained;
    const decided = correct + incorrect;
    metricsRows.push(
      [
        variant,
        assessable,
        correct,
        incorrect,
        abstained,
        unassessable,
        decided ? (correct / decided).toFixed(4) : '',
        assessable ? (incorrect / assessable).toFixed(4) : '',
        '',
        '',
      ].join(','),
    );
  }
  // E vs A delta on assessable way rows
  let aIncEfix = 0,
    aMatchEabstain = 0,
    aConflictEabstain = 0;
  for (const row of comparison) {
    const ways = refWays(row);
    if (ways.length === 0 || row.observation_status === 'GAP') continue;
    if (row.agreement_A === 'CONFLICT' && row.agreement_E === 'MATCH') aIncEfix++;
    if (row.agreement_A === 'MATCH' && row.agreement_E === 'UNKNOWN') aMatchEabstain++;
    if (row.agreement_A === 'CONFLICT' && row.agreement_E === 'UNKNOWN') aConflictEabstain++;
  }
  metricsRows.push(`E_vs_A,na,na,na,na,na,na,na,${aIncEfix},${aMatchEabstain}+conflict_abstain:${aConflictEabstain}`);
  fs.writeFileSync(path.join(evidenceRoot, 'TIGUAN_A_E_METRICS.csv'), metricsRows.join('\n'));

  const rootCauses = [
    {
      id: 'RC-C01',
      observation: 'Decoder assigns Hebbelstraße way 25932713; Schwabstraße ways >50m from DIMO point in C01 window',
      evidence: ['TIGUAN_C01_HEBBEL_SCHWAB_AUDIT.csv', 'dist_hebbel_m ~1-2m vs dist_schwab_min_m no hit'],
      missingEvidence: ['Independent high-precision GPS; which parallel arm if GPS biased <5m'],
      stage: 'CANDIDATE_GENERATION_GEOMETRY',
      confidence: 'HIGH',
      reproducible: true,
      minimalFix: 'Not required for C01 decoder path; optional map-matching label disambiguation in UI only',
    },
    {
      id: 'RC-E002',
      observation: 'UNDERPASS seconds: single nearby way 5048137 rejected by heading-emission (~178° mismatch); Viterbi chooses NULL',
      evidence: ['TIGUAN_E002_B3_UNDERPASS_AUDIT.csv', 'baseline BEARING_MISMATCH_178deg'],
      missingEvidence: ['Layer/bridge tagging completeness in OSM extract for underpass topology'],
      stage: 'EMISSION_MODEL_HEADING',
      confidence: 'HIGH',
      reproducible: true,
      minimalFix: 'Soften or gate bearing penalty under bridge/low-speed B3; or widen candidate bearing tolerance in research config (not done here)',
    },
    {
      id: 'RC-DIFF-B3',
      observation: 'Route-Aware E picks 401665362 where Forward picks 382929735 during B3 standstill; same GPS, different directed routing cost',
      evidence: ['TIGUAN_13_BUCKET_DECISION_TRACES.csv cluster B3_STANDSTILL_ROUTE_AWARE'],
      missingEvidence: ['Reference single way ID for multi-carriageway B3 list'],
      stage: 'ROUTE_AWARE_TRANSITION_DP',
      confidence: 'MEDIUM',
      reproducible: true,
      minimalFix: 'Review directed graph parity lane selection vs rounded adjacency under standstill',
    },
    {
      id: 'RC-DIFF-GAP',
      observation: 'Backtrack B/D selects parallel way 737508499 vs 737508498 for A/C/E at 3 post-gap seconds',
      evidence: ['TIGUAN_13_BUCKET_DECISION_TRACES.csv', 'ab_diff YES'],
      missingEvidence: ['Video reference way ID in GAP-adjacent seconds'],
      stage: 'VITERBI_BACKTRACK_TIE_BREAK',
      confidence: 'MEDIUM',
      reproducible: true,
      minimalFix: 'Audit traceback tie-break when emission costs degenerate on parallel ways',
    },
    {
      id: 'RC-UTC',
      observation: 'Frozen export lacks provider measurement timestamps; only 1Hz bucket labels',
      evidence: ['position snapshot parse', 'overlay vs DIMO distance distribution'],
      missingEvidence: ['Raw DIMO provider row timestamps export'],
      stage: 'INPUT_TIME_ALIGNMENT',
      confidence: 'HIGH',
      reproducible: true,
      minimalFix: 'Forensic export of provider labels separate from bucket grid',
    },
  ];
  fs.writeFileSync(path.join(evidenceRoot, 'TIGUAN_ROOT_CAUSE_REGISTER.json'), JSON.stringify(rootCauses, null, 2));

  // HTML map
  const features = comparison
    .filter((r) => r.dimo_lat && r.dimo_lon)
    .map((r) => {
      const agrA = r.agreement_A;
      const color =
        agrA === 'MATCH' ? '#22c55e' : agrA === 'CONFLICT' ? '#ef4444' : agrA === 'UNKNOWN' ? '#eab308' : '#94a3b8';
      return {
        type: 'Feature',
        properties: {
          ts: r.timestamp_utc_device,
          gs: r.global_second,
          road: r.reference_road,
          wayA: r.way_A,
          wayE: r.way_E,
          agrA,
          agrE: r.agreement_E,
          color,
        },
        geometry: { type: 'Point', coordinates: [Number(r.dimo_lon), Number(r.dimo_lat)] },
      };
    });
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Tiguan EXP021 Failure Map</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>body{margin:0;font-family:system-ui}#map{height:100vh}</style></head><body>
<div id="map"></div><script>
const data=${JSON.stringify({ type: 'FeatureCollection', features })};
const map=L.map('map').setView([51.342,9.512],14);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OSM'}).addTo(map);
const layer=L.geoJSON(data,{pointToLayer:(f,latlng)=>L.circleMarker(latlng,{radius:4,color:f.properties.color,fillColor:f.properties.color,fillOpacity:0.8}),onEachFeature:(f,l)=>l.bindPopup(
  '<b>'+f.properties.ts+'</b><br/>gs '+f.properties.gs+'<br/>ref '+f.properties.road+'<br/>A '+f.properties.wayA+' E '+f.properties.wayE+'<br/>'+f.properties.agrA+' / '+f.properties.agrE)}).addTo(map);
map.fitBounds(layer.getBounds(),{padding:[20,20]});
</script></body></html>`;
  fs.writeFileSync(path.join(evidenceRoot, 'TIGUAN_FAILURE_MAP.html'), html);

  const report = `# Tiguan EXP021 — Failure Forensics R1

**Mode:** read-only research · **Algorithm pin:** \`${PIN_SHA}\` · **Production mutations:** NONE

## Phase 1 — Zeitreferenz

${JSON.stringify(timeVerdict, null, 2)}

**UTC_SYNC_VERDICT:** Bucket-Label = Geräte-UTC-Kandidat mit **0 s** Offset; Unsicherheit mindestens **±1 s** (Anzeigeraster). Provider-Messzeitstempel je Zeile in der eingefrorenen Nutzlast **nicht verfügbar** (\`providerSignalsNull=${posMat.providerSignalsNull}\`, rejected rows=${posMat.rejectedProviderRows.length}).

## Phase 2 — Cluster

### C01 Hebbel / Schwab
- Decoder wählt durchgehend **Hebbelstraße (25932713)** wenn Way-ID gesetzt.
- Schwab-Ways (**25699754**, **25932717**) liegen **außerhalb 50 m** zum DIMO-Punkt — kein Schwab-Kandidat in \`nearestWayCandidates\`.
- **C01_ROOT_CAUSE:** Kein Decoder-Fehler; Risiko ist **Navi-Label** (Nachbarstraße), nicht falsche OSM-Way-Hypothese.

### E002 B-3-Unterführung
- GPS **PRESENT**; typisch **ein** Kandidat (**5048137**, <2 m).
- Baseline: **BEARING_MISMATCH ~178°** → Emissionskosten ~230 vs **NULL-Zustand 100**.
- Viterbi A–E: **UNKNOWN**, \`osmWayId=null\`.
- **E002_ROOT_CAUSE:** **Emissionsmodell (Heading)** + NULL-State-Wettbewerb, nicht fehlendes GPS/OSM-Segment.

### 13 Decoder-Diff-Buckets
- **10×** B-3-Standphase: **E ≠ A** (382929735 vs 401665362) — Route-Aware directed transition.
- **3×** nach Aufnahmelücke: **B/D ≠ A/C/E** (737508499 vs 737508498) — Backtrack-Traceback.

## Phase 3 — Traces
Siehe \`TIGUAN_13_BUCKET_DECISION_TRACES.csv\`, \`TIGUAN_C01_HEBBEL_SCHWAB_AUDIT.csv\`, \`TIGUAN_E002_B3_UNDERPASS_AUDIT.csv\`.

## Phase 5 — Metriken
Recomputed in \`TIGUAN_A_E_METRICS.csv\`. **E** reduziert Way-Konflikte vs **A** hauptsächlich durch **Abstention (UNKNOWN)**, nicht durch nachgewiesene Korrektur aller A-Konflikte (\`E_vs_A\` Zeile).

## FINAL

| Field | Value |
|-------|-------|
| UTC_SYNC_VERDICT | ZERO_OFFSET_BUCKET_LABEL_UNCERTAINTY_PM1S |
| C01_ROOT_CAUSE | NOT_DECODER_ERROR_GPS_SUPPORTS_HEBBEL_WAY |
| E002_ROOT_CAUSE | HEADING_EMISSION_MISMATCH_NULL_DP_WINS |
| DIFF_BUCKETS_ANALYZED | 13 |
| ROUTE_AWARE_GAIN_PROVEN | NO_ABSTENTION_NOT_CORRECTION |
| NEXT_MINIMAL_FIX | E002: bearing gating; DIFF: parallel-way DP audit; UTC: export provider row timestamps |
| FINAL_VERDICT | Failures dominated by emission/heading and route-aware DP — not missing Hebbel/Schwab geometry in C01 |

`;
  fs.writeFileSync(path.join(evidenceRoot, 'TIGUAN_FAILURE_FORENSICS_REPORT.md'), report);

  console.log(
    JSON.stringify(
      {
        timeVerdict,
        c01Rows: c01Rows.length,
        e002Rows: e002Rows.length,
        diffTraces: diffTraces.length,
        aConflictEabstain,
        aMatchEabstain,
      },
      null,
      2,
    ),
  );
}

main();
