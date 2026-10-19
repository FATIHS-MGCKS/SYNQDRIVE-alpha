/**
 * EXP021 — Direction-aware emission P1 (Tiguan replay + deliverables).
 *
 * cd backend && npx ts-node --transpile-only scripts/research/exp021-direction-aware-emission-p1.harness.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  buildRoadContextFromOverpass,
  type ResearchGpsBucket,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research';
import { buildBaselineMatches } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/baseline-matching';
import { buildViterbiMatches, headingsFromBaseline } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/viterbi-matching';
import { buildViterbiMatchesDirectionAwareEmissionP1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/viterbi-matching-direction-aware-p1';
import { buildWayAdjacency, nearestWayCandidates } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/osm-parse';
import {
  emissionCostFromHits,
  type WayHit,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/viterbi-dp-costs';
import {
  emissionCostFromHitsDirectionAwareP1Detailed,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/emission-direction-aware-p1';
import {
  S4_RESEARCH_EMISSION_DIRECTION_AWARE_P1_ID,
  S4_RESEARCH_VITERBI_DIRECTION_AWARE_EMISSION_P1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/version';

const repoRoot = path.resolve(__dirname, '../../..');
const evidenceRoot = path.join(repoRoot, 'architecture/drivingintelligence/evidence/exp021-tiguan-20261019');
const PIN = '9f0693bef572a065e45f5dad91ef236ba4f2ccd9';
const E002_START = '2026-10-19T10:29:48Z';
const E002_END = '2026-10-19T10:29:53Z';
const C01_START = '2026-10-19T10:32:42Z';
const C01_END = '2026-10-19T10:32:47Z';

function parseCsv(filePath: string): Array<Record<string, string>> {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
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

function agreement(ways: number[], wayId: number | null): string {
  if (ways.length === 0) return 'NOT_COMPARABLE';
  if (wayId == null) return 'UNKNOWN';
  return ways.includes(wayId) ? 'MATCH' : 'CONFLICT';
}

function metrics(
  comparison: Array<Record<string, string>>,
  getWay: (row: Record<string, string>) => number | null,
): { match: number; conflict: number; unknown: number; denominator: number } {
  let match = 0,
    conflict = 0,
    unknown = 0,
    denominator = 0;
  for (const row of comparison) {
    const ways = parseWayIds(row.reference_osm_way_ids ?? '');
    if (ways.length === 0 || row.dimo_gps_availability === 'GAP') continue;
    denominator++;
    const agr = agreement(ways, getWay(row));
    if (agr === 'MATCH') match++;
    else if (agr === 'CONFLICT') conflict++;
    else unknown++;
  }
  return { match, conflict, unknown, denominator };
}

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function emissionBreakdownAt(
  lat: number,
  lon: number,
  heading: number | null,
  wayId: number | null,
  ways: ReturnType<typeof buildRoadContextFromOverpass>['ways'],
  cfg: typeof DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  useP1: boolean,
): string {
  if (wayId == null) return 'NULL_EMIT=100';
  const hits = nearestWayCandidates(lat, lon, ways, cfg.uncertaintyRadiusM, cfg.pointToSegmentDistanceM).slice(
    0,
    cfg.viterbiTopK,
  ) as WayHit[];
  if (useP1) {
    const d = emissionCostFromHitsDirectionAwareP1Detailed(heading, wayId, hits, cfg);
    return `dist=${d.distanceCost.toFixed(1)};head=${d.headingCost.toFixed(1)};delta=${d.headingDeltaDeg?.toFixed(1) ?? 'na'};orient=${d.orientationUsed};policy=${d.policy}`;
  }
  const total = emissionCostFromHits(heading, wayId, hits, cfg);
  const hit = hits.find((h) => h.way.osmWayId === wayId);
  const dist = hit ? hit.distanceM * 2 : 0;
  return `dist=${dist.toFixed(1)};head=${(total - dist).toFixed(1)};baseline_total=${total.toFixed(1)}`;
}

function main(): void {
  const t0 = performance.now();
  const grid = JSON.parse(
    fs.readFileSync(path.join(evidenceRoot, 'fixtures/TIGUAN_POSITION_GRID.json'), 'utf8'),
  ) as {
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
  const cfg = DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG;
  const adj = buildWayAdjacency(ctx.ways);
  const baselineInternal = buildBaselineMatches(buckets, ctx, cfg);
  const headings = headingsFromBaseline(baselineInternal);

  const tBase0 = performance.now();
  const baselineVit = buildViterbiMatches(buckets, ctx.ways, headings, cfg, { wayAdjacency: adj });
  const baselineMs = performance.now() - tBase0;

  const tP10 = performance.now();
  const p1Vit = buildViterbiMatchesDirectionAwareEmissionP1(buckets, ctx.ways, headings, cfg, { wayAdjacency: adj });
  const p1Ms = performance.now() - tP10;

  const byTsBase = new Map(baselineVit.map((r) => [r.bucketLabelUtc, r]));
  const byTsP1 = new Map(p1Vit.map((r) => [r.bucketLabelUtc, r]));
  const comparison = parseCsv(path.join(evidenceRoot, 'TIGUAN_A_B_C_D_E_COMPARISON.csv'));

  const mBase = metrics(comparison, (row) => byTsBase.get(row.timestamp_utc_device)?.osmWayId ?? null);
  const mP1 = metrics(comparison, (row) => byTsP1.get(row.timestamp_utc_device)?.osmWayId ?? null);
  const mFrozenA = metrics(comparison, (row) => (row.way_A ? Number(row.way_A) : null));

  let e002WithWay = 0;
  for (const b of buckets) {
    if (b.bucketLabelUtc < E002_START || b.bucketLabelUtc > E002_END) continue;
    if (b.availability !== 'PRESENT') continue;
    if (byTsP1.get(b.bucketLabelUtc)?.osmWayId != null) e002WithWay++;
  }

  let newConflictsVsFrozenA = 0;
  let newMatchesVsFrozenA = 0;
  let unknownToMatchVsFrozenA = 0;
  const frozenConflictRows: string[][] = [];
  for (const row of comparison) {
    const ways = parseWayIds(row.reference_osm_way_ids ?? '');
    if (ways.length === 0 || row.dimo_gps_availability === 'GAP') continue;
    const wA = row.way_A ? Number(row.way_A) : null;
    const wP1 = byTsP1.get(row.timestamp_utc_device)?.osmWayId ?? null;
    const agrA = row.agreement_A || agreement(ways, wA);
    const agrP1 = agreement(ways, wP1);
    if (agrA !== 'MATCH' && agrP1 === 'MATCH') newMatchesVsFrozenA++;
    if (agrA !== 'CONFLICT' && agrP1 === 'CONFLICT') {
      newConflictsVsFrozenA++;
      frozenConflictRows.push([
        row.timestamp_utc_device,
        row.global_second ?? '',
        String(wA ?? ''),
        String(wP1 ?? ''),
        agrA,
        agrP1,
        row.reference_osm_way_ids ?? '',
      ]);
    }
    if (agrA === 'UNKNOWN' && agrP1 === 'MATCH') unknownToMatchVsFrozenA++;
  }

  const changedHeader = [
    'timestamp_utc_device',
    'global_second',
    'dimo_lat',
    'dimo_lon',
    'gps_heading_deg',
    'reference_osm_way_ids',
    'reference_uncertainty',
    'way_baseline',
    'way_p1',
    'agreement_baseline',
    'agreement_p1',
    'emission_baseline',
    'emission_p1',
    'dp_decision_note',
  ];
  const changedRows: string[][] = [];
  const newConflicts: string[][] = [];

  for (const row of comparison) {
    const ts = row.timestamp_utc_device;
    const ways = parseWayIds(row.reference_osm_way_ids ?? '');
    if (ways.length === 0) continue;
    const b = buckets.find((x) => x.bucketLabelUtc === ts);
    const base = byTsBase.get(ts);
    const p1 = byTsP1.get(ts);
    const wBase = base?.osmWayId ?? null;
    const wP1 = p1?.osmWayId ?? null;
    const agrBase = agreement(ways, wBase);
    const agrP1 = agreement(ways, wP1);
    if (wBase === wP1 && agrBase === agrP1) continue;

    const lat = b?.latitude ?? Number(row.dimo_lat);
    const lon = b?.longitude ?? Number(row.dimo_lon);
    const h = base?.headingDeg ?? null;
    changedRows.push([
      ts,
      row.global_second ?? '',
      String(lat),
      String(lon),
      h?.toFixed(2) ?? '',
      row.reference_osm_way_ids ?? '',
      'UNCALIBRATED_DEVICE_CLOCK_1S_DISPLAY;REFERENCE_MULTI_WAY_LIST',
      wBase == null ? '' : String(wBase),
      wP1 == null ? '' : String(wP1),
      agrBase,
      agrP1,
      b && b.latitude != null ? emissionBreakdownAt(lat, lon, h, wBase, ctx.ways, cfg, false) : '',
      b && b.latitude != null ? emissionBreakdownAt(lat, lon, h, wP1, ctx.ways, cfg, true) : '',
      wBase !== wP1 ? 'WAY_CHANGED' : 'AGREEMENT_LABEL_CHANGED',
    ]);
    if (agrBase !== 'CONFLICT' && agrP1 === 'CONFLICT') {
      newConflicts.push(changedRows[changedRows.length - 1]!);
    }
  }

  fs.writeFileSync(
    path.join(evidenceRoot, 'TIGUAN_DIRECTION_AWARE_P1_BEFORE_AFTER.csv'),
    [changedHeader.join(','), ...changedRows.map((r) => r.map(csvEscape).join(','))].join('\n'),
  );
  fs.writeFileSync(
    path.join(evidenceRoot, 'TIGUAN_DIRECTION_AWARE_P1_NEW_CONFLICTS.csv'),
    [changedHeader.join(','), ...newConflicts.map((r) => r.map(csvEscape).join(','))].join('\n'),
  );
  fs.writeFileSync(
    path.join(evidenceRoot, 'TIGUAN_DIRECTION_AWARE_P1_NEW_CONFLICTS_VS_FROZEN_A.csv'),
    [
      'timestamp_utc_device,global_second,way_frozen_A,way_p1,agreement_frozen_A,agreement_p1,reference_osm_way_ids',
      ...frozenConflictRows.map((r) => r.map(csvEscape).join(',')),
    ].join('\n'),
  );

  const traces13 = parseCsv(path.join(evidenceRoot, 'TIGUAN_13_BUCKET_DECISION_TRACES.csv'));
  const bucket13Review: string[] = [];
  for (const tr of traces13) {
    const ts = tr.bucket_label_utc ?? tr.timestamp_utc_device ?? '';
    const wB = byTsBase.get(ts)?.osmWayId ?? null;
    const wP = byTsP1.get(ts)?.osmWayId ?? null;
    bucket13Review.push(`${ts},baseline=${wB},p1=${wP},changed=${wB !== wP}`);
  }
  fs.writeFileSync(
    path.join(evidenceRoot, 'TIGUAN_DIRECTION_AWARE_P13_DECODER_BUCKET_REVIEW.csv'),
    'bucket_label_utc,review_line\n' + bucket13Review.map((l) => csvEscape(l)).join('\n'),
  );

  let c01Changed = 0;
  for (const b of buckets) {
    if (b.bucketLabelUtc < C01_START || b.bucketLabelUtc > C01_END) continue;
    const wB = byTsBase.get(b.bucketLabelUtc)?.osmWayId ?? null;
    const wP = byTsP1.get(b.bucketLabelUtc)?.osmWayId ?? null;
    if (wB !== wP) c01Changed++;
  }

  let unknownToMatch = 0;
  for (const row of comparison) {
    const ways = parseWayIds(row.reference_osm_way_ids ?? '');
    if (ways.length === 0) continue;
    const ts = row.timestamp_utc_device;
    const agrBase = agreement(ways, byTsBase.get(ts)?.osmWayId ?? null);
    const agrP1 = agreement(ways, byTsP1.get(ts)?.osmWayId ?? null);
    if (agrBase === 'UNKNOWN' && agrP1 === 'MATCH') unknownToMatch++;
  }

  const safetyLines = [
    '# Direction-aware emission P1 — safety evaluation (research)',
    '',
    `- Algorithm pin: \`${PIN}\``,
    `- Emission id: \`${S4_RESEARCH_EMISSION_DIRECTION_AWARE_P1_ID}\``,
    `- Viterbi id: \`${S4_RESEARCH_VITERBI_DIRECTION_AWARE_EMISSION_P1}\``,
    '',
    '## Oneway / forbidden direction',
    '',
    'Unit tests assert `oneway=yes`, `oneway=-1`, roundabout, and motorway_link classes do **not** apply reverse-bearing min-delta.',
    '',
    '## Tiguan reference agreement (373 way-comparable seconds)',
    '',
    `| Variant | MATCH | CONFLICT | UNKNOWN |`,
    `|---------|------:|---------:|--------:|`,
    `| Baseline forward Viterbi | ${mBase.match} | ${mBase.conflict} | ${mBase.unknown} |`,
    `| P1 direction-aware emission | ${mP1.match} | ${mP1.conflict} | ${mP1.unknown} |`,
    '',
    `E002 buckets with non-null way (P1): **${e002WithWay} / 6**`,
    `UNKNOWN→MATCH (reference lists): **${unknownToMatch}** (not independent accuracy)`,
    `New conflicts vs live baseline Viterbi: **${newConflicts.length}**`,
    `New conflicts vs frozen variant A (373 denom): **${newConflictsVsFrozenA}**`,
    `UNKNOWN→MATCH vs frozen A: **${unknownToMatchVsFrozenA}** (ablation B reported 83; P1 uses oneway-safe policy)`,
    `C01 window way changes: **${c01Changed}**`,
    '',
    '## Root cause (E002)',
    '',
    'Bidirectional B3 primary digitized opposite to motion; P1 min heading delta aligns reverse segment bearing (~151°) with GPS (~153°).',
    '',
    '## Merge readiness',
    '',
    '**STOP** — research module only; baseline `emissionCostFromHits` unchanged; no production wiring.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(evidenceRoot, 'TIGUAN_DIRECTION_AWARE_P1_SAFETY_EVALUATION.md'), safetyLines);

  const techDiff = [
    '# Technical code diff — direction-aware emission P1',
    '',
    '## New files (research-only)',
    '',
    '- `s4-research/emission-direction-aware-p1.ts` — `resolveWayTravelDirectionPolicy`, `headingDeltaForTravelPolicy`, `emissionCostFromHitsDirectionAwareP1`',
    '- `s4-research/viterbi-matching-direction-aware-p1.ts` — forward Viterbi DP with P1 emission',
    '- `s4-research/__tests__/emission-direction-aware-p1.unit.spec.ts`',
    '',
    '## Unchanged',
    '',
    '- `viterbi-dp-costs.ts` `emissionCostFromHits` (production-parity baseline)',
    '- Transition model, NULL cost 100, candidate radius, TOP_K',
    '',
    '## Policy summary',
    '',
    '| OSM signal | Eligible orientations for heading |',
    '|------------|-----------------------------------|',
    '| (none) / unknown | min(Δ_fwd, Δ_rev) |',
    '| oneway=no | min(Δ_fwd, Δ_rev) |',
    '| oneway=yes | forward only |',
    '| oneway=-1 | reverse only |',
    '| junction=roundabout | forward only |',
    '| motorway_link class | forward only |',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(evidenceRoot, 'DIRECTION_AWARE_EMISSION_P1_TECH_DIFF.md'), techDiff);

  const masterReport = [
    '# EXP021 — Direction-aware emission P1 (offline research)',
    '',
    `Pin: \`${PIN}\` · Research emission: \`${S4_RESEARCH_EMISSION_DIRECTION_AWARE_P1_ID}\``,
    '',
    '## Tiguan before/after (373 way-comparable seconds)',
    '',
    '| Variant | MATCH | CONFLICT | UNKNOWN |',
    '|---------|------:|---------:|--------:|',
    `| Frozen validation A (CSV) | ${mFrozenA.match} | ${mFrozenA.conflict} | ${mFrozenA.unknown} |`,
    `| Live baseline Viterbi (replay) | ${mBase.match} | ${mBase.conflict} | ${mBase.unknown} |`,
    `| P1 direction-aware Viterbi | ${mP1.match} | ${mP1.conflict} | ${mP1.unknown} |`,
    '',
    `E002 (6 buckets): **${e002WithWay}/6** with non-null way under P1.`,
    '',
    '## Artifacts',
    '',
    '- `TIGUAN_DIRECTION_AWARE_P1_BEFORE_AFTER.csv` — changed DP decisions',
    '- `TIGUAN_DIRECTION_AWARE_P1_NEW_CONFLICTS_VS_FROZEN_A.csv` — new conflicts vs frozen A',
    '- `DIRECTION_AWARE_EMISSION_P1_TECH_DIFF.md`',
    '- `TIGUAN_DIRECTION_AWARE_P1_SAFETY_EVALUATION.md`',
    '- Tesla: `ldi-10d/TESLA_DIRECTION_AWARE_P1_REGRESSION.json`',
    '',
    '## OUTPUT',
    '',
    '```',
  ].join('\n');

  const teslaJsonPath = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10d/TESLA_DIRECTION_AWARE_P1_REGRESSION.json');
  let teslaRegressionResult = 'NOT_RUN';
  if (fs.existsSync(teslaJsonPath)) {
    const tr = JSON.parse(fs.readFileSync(teslaJsonPath, 'utf8')) as {
      p1_direction_aware: Record<string, number>;
      baseline: Record<string, number>;
      way_id_changes: number;
      runtime_ms: { baseline_viterbi: number; p1_viterbi: number };
    };
    teslaRegressionResult = `ASSOC ${tr.baseline.ASSOCIATED}->${tr.p1_direction_aware.ASSOCIATED}; UNK ${tr.baseline.UNKNOWN}->${tr.p1_direction_aware.UNKNOWN}; way_changes=${tr.way_id_changes}; NO_ACCURACY_CLAIM`;
  }

  const runtimeMs = performance.now() - t0;
  const output = {
    DIRECTION_AWARE_EMISSION_IMPLEMENTED: true,
    BIDIRECTIONAL_REVERSE_BEARING_VERIFIED: e002WithWay === 6,
    ONEWAY_SAFETY_VERIFIED: 'UNIT_TESTS',
    E002_RECOVERED_BUCKETS: `${e002WithWay}/6`,
    TIGUAN_REFERENCE_MATCHES: `${mP1.match}/${mP1.denominator}`,
    TIGUAN_NEW_CONFLICTS_REVIEWED: newConflictsVsFrozenA,
    TIGUAN_NEW_CONFLICTS_VS_LIVE_BASELINE: newConflicts.length,
    TIGUAN_UNKNOWN_TO_MATCH_VS_FROZEN_A: unknownToMatchVsFrozenA,
    TIGUAN_UNKNOWN_DELTA: mP1.unknown - mBase.unknown,
    TESLA_REGRESSION_RESULT: teslaRegressionResult,
    FALSE_CONFIRMATIONS: mP1.conflict,
    INDEPENDENT_ACCURACY: 'NOT_CLAIMED',
    RESEARCH_MERGE_READINESS: 'STOP_NO_MERGE',
    FINAL_VERDICT:
      e002WithWay === 6
        ? 'E002_RECOVERED; ONEWAY_SAFE_DIRECTION_POLICY; TIGUAN_REFERENCE_SHIFT_NOT_INDEPENDENT_ACCURACY; STOP_BEFORE_MERGE'
        : 'P1_PARTIAL_REVIEW_REQUIRED',
    baseline_runtime_ms: baselineMs,
    p1_runtime_ms: p1Ms,
    changed_decisions: changedRows.length,
    pin: PIN,
    runtime_ms: runtimeMs,
  };

  fs.writeFileSync(path.join(evidenceRoot, 'TIGUAN_DIRECTION_AWARE_P1_OUTPUT.json'), JSON.stringify(output, null, 2));

  const outputBlock = Object.entries(output)
    .filter(([k]) => !['baseline_runtime_ms', 'p1_runtime_ms', 'changed_decisions', 'pin', 'runtime_ms'].includes(k))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  fs.writeFileSync(
    path.join(evidenceRoot, 'TIGUAN_DIRECTION_AWARE_P1_REPORT.md'),
    `${masterReport}\n${outputBlock}\n\`\`\`\n`,
  );
  console.log(JSON.stringify(output, null, 2));
}

main();
