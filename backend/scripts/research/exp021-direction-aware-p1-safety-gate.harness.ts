/**
 * EXP021 P1 final research safety gate — offline audit only.
 *
 * cd backend && npx ts-node --transpile-only scripts/research/exp021-direction-aware-p1-safety-gate.harness.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  buildRoadContextFromOverpass,
  type ResearchGpsBucket,
  type ResearchOsmWay,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research';
import { buildBaselineMatches } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/baseline-matching';
import { buildViterbiMatches, headingsFromBaseline } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/viterbi-matching';
import { buildViterbiMatchesDirectionAwareEmissionP1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/viterbi-matching-direction-aware-p1';
import { buildWayAdjacency, graphReachable, nearestWayCandidates } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/osm-parse';
import {
  emissionCostFromHitsDirectionAwareP1Detailed,
  headingDeltaForTravelPolicy,
  resolveWayTravelDirectionPolicy,
  type WayTravelDirectionPolicy,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/emission-direction-aware-p1';
import { emissionCostFromHits, type WayHit } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/viterbi-dp-costs';
import { headingDeltaDeg } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/geo';

const repoRoot = path.resolve(__dirname, '../../..');
const tiguanEvidence = path.join(repoRoot, 'architecture/drivingintelligence/evidence/exp021-tiguan-20261019');
const teslaEvidence = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10d');
const E002_START = '2026-10-19T10:29:48Z';
const E002_END = '2026-10-19T10:29:53Z';
const HEAD = 'd38c1c4e4b1b22386445cfe5346ad525a1f3cf32';

type PolicyBucket =
  | 'EXPLICIT_BIDIRECTIONAL'
  | 'INFERRED_BIDIRECTIONAL_DEFAULT'
  | 'EXPLICIT_ONEWAY'
  | 'IMPLICIT_ONEWAY'
  | 'UNSUPPORTED_OR_AMBIGUOUS';

function policyBucket(policy: WayTravelDirectionPolicy): PolicyBucket {
  switch (policy) {
    case 'EXPLICIT_TWO_WAY':
      return 'EXPLICIT_BIDIRECTIONAL';
    case 'BIDIRECTIONAL':
      return 'EXPLICIT_BIDIRECTIONAL';
    case 'DIRECTION_UNKNOWN_DEFAULT_BIDIRECTIONAL':
      return 'INFERRED_BIDIRECTIONAL_DEFAULT';
    case 'ONEWAY_FORWARD':
    case 'ONEWAY_REVERSE':
      return 'EXPLICIT_ONEWAY';
    case 'IMPLICIT_ONEWAY_ROUNDABOUT':
    case 'IMPLICIT_ONEWAY_HIGHWAY_CLASS':
      return 'IMPLICIT_ONEWAY';
    default:
      return 'UNSUPPORTED_OR_AMBIGUOUS';
  }
}

function allowsReverseDiscount(policy: WayTravelDirectionPolicy): boolean {
  return (
    policy === 'BIDIRECTIONAL' ||
    policy === 'EXPLICIT_TWO_WAY' ||
    policy === 'DIRECTION_UNKNOWN_DEFAULT_BIDIRECTIONAL'
  );
}

function parseBeforeAfterCsv(): Array<Record<string, string>> {
  const raw = fs.readFileSync(path.join(tiguanEvidence, 'TIGUAN_DIRECTION_AWARE_P1_BEFORE_AFTER.csv'), 'utf8');
  const lines = raw.split('\n').filter((l) => l.trim());
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const row: Record<string, string> = {};
    header.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    return row;
  });
}

function loadTiguan(): { buckets: ResearchGpsBucket[]; ways: ResearchOsmWay[]; waysById: Map<number, ResearchOsmWay> } {
  const grid = JSON.parse(
    fs.readFileSync(path.join(tiguanEvidence, 'fixtures/TIGUAN_POSITION_GRID.json'), 'utf8'),
  ) as { buckets: Array<{ bucketLabelUtc: string; availability: string; latitude: number | null; longitude: number | null; pinnedProductionL3Kmh?: number | null }> };
  const buckets: ResearchGpsBucket[] = grid.buckets.map((b) => ({
    bucketLabelUtc: b.bucketLabelUtc,
    availability: b.availability as ResearchGpsBucket['availability'],
    latitude: b.latitude,
    longitude: b.longitude,
    l3SpeedKmh: b.pinnedProductionL3Kmh ?? null,
    qcTrustLevel: null,
  }));
  const osm = JSON.parse(fs.readFileSync(path.join(tiguanEvidence, 'TIGUAN_OSM_FROZEN_SNAPSHOT.json'), 'utf8')) as {
    overpassResponse: { elements?: Array<Record<string, unknown>> };
  };
  const ctx = buildRoadContextFromOverpass(osm.overpassResponse, { buckets, corridorMarginM: 75 });
  return { buckets, ways: ctx.ways, waysById: new Map(ctx.ways.map((w) => [w.osmWayId, w])) };
}

function auditP1Emission(
  lat: number,
  lon: number,
  heading: number | null,
  wayId: number,
  ways: ResearchOsmWay[],
  cfg: typeof DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
): {
  policy: WayTravelDirectionPolicy;
  bucket: PolicyBucket;
  orientationUsed: string;
  reverseDiscountApplied: boolean;
  reverseWouldBeCheaperButBlocked: boolean;
  headingDeltaUsed: number | null;
  onewayTag: string;
  highway: string;
  junction: string;
} {
  const hits = nearestWayCandidates(lat, lon, ways, cfg.uncertaintyRadiusM, cfg.pointToSegmentDistanceM).slice(
    0,
    cfg.viterbiTopK,
  ) as WayHit[];
  const d = emissionCostFromHitsDirectionAwareP1Detailed(heading, wayId, hits, cfg);
  const way = hits.find((h) => h.way.osmWayId === wayId)?.way;
  const policy = way ? resolveWayTravelDirectionPolicy(way) : d.policy;
  let reverseWouldBeCheaperButBlocked = false;
  if (heading != null && d.forwardBearingDeg != null && !allowsReverseDiscount(policy)) {
    const dFwd = headingDeltaDeg(heading, d.forwardBearingDeg);
    const dRev = headingDeltaDeg(heading, (d.forwardBearingDeg + 180) % 360);
    const minBidir = Math.min(dFwd, dRev);
    if (dRev < dFwd && minBidir <= cfg.bearingCompatDeg && d.orientationUsed === 'FORWARD' && dFwd > cfg.bearingCompatDeg) {
      reverseWouldBeCheaperButBlocked = true;
    }
  }
  const reverseDiscountApplied =
    d.orientationUsed === 'REVERSE' && allowsReverseDiscount(policy);
  const improperReverse =
    d.orientationUsed === 'REVERSE' && !allowsReverseDiscount(policy);

  return {
    policy,
    bucket: policyBucket(policy),
    orientationUsed: improperReverse ? `${d.orientationUsed}_POLICY_VIOLATION` : d.orientationUsed,
    reverseDiscountApplied,
    reverseWouldBeCheaperButBlocked,
    headingDeltaUsed: d.headingDeltaDeg,
    onewayTag: way?.oneway ?? way?.tags?.oneway ?? 'absent',
    highway: way?.highway ?? way?.tags?.highway ?? '',
    junction: way?.tags?.junction ?? '',
  };
}

function main(): void {
  const cfg = DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG;
  const { buckets, ways, waysById } = loadTiguan();
  const adj = buildWayAdjacency(ways);
  const baselineInternal = buildBaselineMatches(buckets, { ways, signalNodes: [], confirmedJunctions: [] }, cfg);
  const headings = headingsFromBaseline(baselineInternal);
  const baselineVit = buildViterbiMatches(buckets, ways, headings, cfg, { wayAdjacency: adj });
  const p1Vit = buildViterbiMatchesDirectionAwareEmissionP1(buckets, ways, headings, cfg, { wayAdjacency: adj });

  const changed = parseBeforeAfterCsv();
  if (changed.length !== 86) {
    console.warn(`Expected 86 changed rows, got ${changed.length}`);
  }

  const auditHeader = [
    'timestamp_utc_device',
    'way_baseline',
    'way_p1',
    'p1_policy',
    'p1_policy_bucket',
    'p1_orientation',
    'p1_reverse_discount_applied',
    'reverse_cheaper_but_blocked_by_oneway',
    'p1_heading_delta_deg',
    'oneway_tag',
    'highway',
    'junction',
    'agreement_baseline',
    'agreement_p1',
    'reference_osm_way_ids',
    'reference_uncertainty',
  ];
  const auditRows: string[][] = [];
  const bucketCounts: Record<PolicyBucket, number> = {
    EXPLICIT_BIDIRECTIONAL: 0,
    INFERRED_BIDIRECTIONAL_DEFAULT: 0,
    EXPLICIT_ONEWAY: 0,
    IMPLICIT_ONEWAY: 0,
    UNSUPPORTED_OR_AMBIGUOUS: 0,
  };
  let reverseDiscountRows = 0;
  let improperReverse = 0;
  let unknownDefaultWithReverse = 0;
  let e002Count = 0;

  for (const row of changed) {
    const ts = row.timestamp_utc_device;
    const lat = Number(row.dimo_lat);
    const lon = Number(row.dimo_lon);
    const h = row.gps_heading_deg ? Number(row.gps_heading_deg) : null;
    const wayP1 = row.way_p1 ? Number(row.way_p1) : null;
    if (wayP1 == null) continue;
    const audit = auditP1Emission(lat, lon, h, wayP1, ways, cfg);
    bucketCounts[audit.bucket]++;
    if (audit.reverseDiscountApplied) reverseDiscountRows++;
    if (audit.orientationUsed.includes('POLICY_VIOLATION')) improperReverse++;
    if (audit.policy === 'DIRECTION_UNKNOWN_DEFAULT_BIDIRECTIONAL' && audit.reverseDiscountApplied) {
      unknownDefaultWithReverse++;
    }
    if (ts >= E002_START && ts <= E002_END) e002Count++;

    auditRows.push([
      ts,
      row.way_baseline ?? '',
      String(wayP1),
      audit.policy,
      audit.bucket,
      audit.orientationUsed,
      String(audit.reverseDiscountApplied),
      String(audit.reverseWouldBeCheaperButBlocked),
      audit.headingDeltaUsed?.toFixed(2) ?? '',
      audit.onewayTag,
      audit.highway,
      audit.junction,
      row.agreement_baseline,
      row.agreement_p1,
      row.reference_osm_way_ids,
      'UNCALIBRATED_DEVICE_CLOCK_1S;MULTI_WAY_REFERENCE',
    ]);
  }

  fs.writeFileSync(
    path.join(tiguanEvidence, 'TIGUAN_DIRECTION_AWARE_P1_86_POLICY_AUDIT.csv'),
    [auditHeader.join(','), ...auditRows.map((r) => r.join(','))].join('\n'),
  );

  // E002 parity
  let e002WithWay = 0;
  for (const b of buckets) {
    if (b.bucketLabelUtc < E002_START || b.bucketLabelUtc > E002_END) continue;
    if (b.availability !== 'PRESENT') continue;
    if (p1Vit.find((x) => x.bucketLabelUtc === b.bucketLabelUtc)?.osmWayId != null) e002WithWay++;
  }

  // 10:31:03 / 10:31:04 deep review
  const conflictReview: string[] = [];
  for (const ts of ['2026-10-19T10:31:03Z', '2026-10-19T10:31:04Z']) {
    const b = buckets.find((x) => x.bucketLabelUtc === ts);
    const base = baselineVit.find((x) => x.bucketLabelUtc === ts);
    const p1 = p1Vit.find((x) => x.bucketLabelUtc === ts);
    const hits = nearestWayCandidates(b!.latitude!, b!.longitude!, ways, cfg.uncertaintyRadiusM).slice(0, 8);
    const lines: string[] = [`## ${ts}`, ''];
    for (const ref of [401665362, 442110883, 37915960]) {
      const w = waysById.get(ref);
      const pol = w ? resolveWayTravelDirectionPolicy(w) : 'MISSING';
      lines.push(`- Way ${ref}: policy=${pol}, oneway=${w?.tags?.oneway ?? 'absent'}, highway=${w?.highway ?? ''}`);
      if (w && b) {
        const h = base?.headingDeg ?? null;
        const hit = hits.find((x) => x.way.osmWayId === ref);
        if (hit) {
          const p1d = emissionCostFromHitsDirectionAwareP1Detailed(h, ref, hits as WayHit[], cfg);
          const baseCost = emissionCostFromHits(h, ref, hits as WayHit[], cfg);
          lines.push(
            `  dist=${hit.distanceM.toFixed(2)}m fwdBear=${hit.segmentBearingDeg?.toFixed(1)} p1_emit=${p1d.distanceCost + p1d.headingCost} orient=${p1d.orientationUsed} base_emit=${baseCost}`,
          );
        } else {
          lines.push(`  not in top-${cfg.viterbiTopK} candidates at GPS`);
        }
      }
    }
    lines.push(`- Baseline way: ${base?.osmWayId ?? 'NULL'}`);
    lines.push(`- P1 way: ${p1?.osmWayId ?? 'NULL'}`);
    lines.push(`- Candidates: ${hits.map((h) => h.way.osmWayId).join(',')}`);
    conflictReview.push(lines.join('\n'));
  }

  // Tesla 135 way changes
  const grid = JSON.parse(
    fs.readFileSync(path.join(teslaEvidence, 'fixtures/tesla-20261016/TESLA_POSITION_GRID.json'), 'utf8'),
  ) as { buckets: Array<{ bucketLabelUtc: string; availability: string; latitude: number | null; longitude: number | null; pinnedProductionL3Kmh?: number | null }> };
  const tBuckets: ResearchGpsBucket[] = grid.buckets.map((b) => ({
    bucketLabelUtc: b.bucketLabelUtc,
    availability: b.availability as ResearchGpsBucket['availability'],
    latitude: b.latitude,
    longitude: b.longitude,
    l3SpeedKmh: b.pinnedProductionL3Kmh ?? null,
    qcTrustLevel: null,
  }));
  const tOsm = JSON.parse(fs.readFileSync(path.join(teslaEvidence, 'LDI10D_TESLA_OSM_FROZEN_SNAPSHOT.json'), 'utf8')) as {
    overpassResponse: unknown;
  };
  const tCtx = buildRoadContextFromOverpass(tOsm.overpassResponse as { elements?: Array<Record<string, unknown>> }, {
    buckets: tBuckets,
    corridorMarginM: 75,
  });
  const tAdj = buildWayAdjacency(tCtx.ways);
  const tBaseInternal = buildBaselineMatches(tBuckets, tCtx, cfg);
  const tHead = headingsFromBaseline(tBaseInternal);
  const tBaseVit = buildViterbiMatches(tBuckets, tCtx.ways, tHead, cfg, { wayAdjacency: tAdj });
  const tP1Vit = buildViterbiMatchesDirectionAwareEmissionP1(tBuckets, tCtx.ways, tHead, cfg, { wayAdjacency: tAdj });

  let wayChanges = 0;
  let onewayImproperReverse = 0;
  let topoImpossibleP1 = 0;
  let newUnknown = 0;
  let newAmbiguous = 0;
  const teslaAuditRows: string[][] = [];

  for (let i = 0; i < tBuckets.length; i++) {
    const wB = tBaseVit[i].osmWayId;
    const wP = tP1Vit[i].osmWayId;
    if (wB === wP) continue;
    wayChanges++;
    const b = tBuckets[i];
    const h = tHead[i];
    const baseLabel = tBaseVit[i].outcome === 'CONFIRMED' ? 'ASSOCIATED' : tBaseVit[i].outcome;
    const p1Label = tP1Vit[i].outcome === 'CONFIRMED' ? 'ASSOCIATED' : tP1Vit[i].outcome;
    if (baseLabel !== 'UNKNOWN' && p1Label === 'UNKNOWN') newUnknown++;
    if (baseLabel !== 'AMBIGUOUS' && p1Label === 'AMBIGUOUS') newAmbiguous++;

    if (wP != null && b.latitude != null) {
      const aud = auditP1Emission(b.latitude, b.longitude!, h, wP, tCtx.ways, cfg);
      if (aud.orientationUsed.includes('POLICY_VIOLATION')) onewayImproperReverse++;
      teslaAuditRows.push([
        b.bucketLabelUtc,
        String(wB ?? ''),
        String(wP),
        aud.policy,
        aud.bucket,
        aud.orientationUsed,
        String(aud.reverseDiscountApplied),
        baseLabel,
        p1Label,
      ]);
    }
    if (i > 0 && wP != null) {
      const prev = tP1Vit[i - 1].osmWayId;
      if (prev != null && prev !== wP && tP1Vit[i].outcome === 'CONFIRMED' && !graphReachable(tAdj, prev, wP)) {
        topoImpossibleP1++;
      }
    }
  }

  fs.writeFileSync(
    path.join(teslaEvidence, 'TESLA_DIRECTION_AWARE_P1_135_WAY_CHANGE_AUDIT.csv'),
    [
      'timestamp_utc,way_baseline,way_p1,policy,policy_bucket,orientation,reverse_discount_applied,label_baseline,label_p1',
      ...teslaAuditRows.map((r) => r.join(',')),
    ].join('\n'),
  );

  const gateReport = `# EXP021 P1 — Final research safety gate

**PR:** #2084 · **HEAD:** \`${HEAD}\` · **Mode:** offline read-only · **NO MERGE**

Reference uncertainty: device UTC ±1 s not independently calibrated; reference way lists are multi-way and not metric ground truth.

## Tiguan — 86 changed DP rows (policy on chosen P1 way)

| Policy bucket | Row count |
|---------------|----------:|
| EXPLICIT_BIDIRECTIONAL (oneway=no) | ${bucketCounts.EXPLICIT_BIDIRECTIONAL} |
| INFERRED_BIDIRECTIONAL_DEFAULT (no oneway tag) | ${bucketCounts.INFERRED_BIDIRECTIONAL_DEFAULT} |
| EXPLICIT_ONEWAY | ${bucketCounts.EXPLICIT_ONEWAY} |
| IMPLICIT_ONEWAY (roundabout / motorway_link) | ${bucketCounts.IMPLICIT_ONEWAY} |
| UNSUPPORTED_OR_AMBIGUOUS | ${bucketCounts.UNSUPPORTED_OR_AMBIGUOUS} |

Rows where P1 applied **reverse** orientation under an allowed bidirectional policy: **${reverseDiscountRows}** / 86.

Rows with **improper** REVERSE under oneway/implicit-oneway policy: **${improperReverse}** (must be 0).

INFERRED_DEFAULT rows using reverse discount: **${unknownDefaultWithReverse}** — mechanism risk if true oneway untagged; see UNKNOWN_POLICY_RISK.

**Preserved artifacts:** \`TIGUAN_DIRECTION_AWARE_P1_BEFORE_AFTER.csv\` (86 rows unchanged), E002 recovery **${e002WithWay}/6**.

Detail: \`TIGUAN_DIRECTION_AWARE_P1_86_POLICY_AUDIT.csv\`

## New conflicts vs frozen A (10:31:03–04Z)

${conflictReview.join('\n\n')}

## Tesla — ${wayChanges} way-id changes

- Improper reverse on chosen P1 way: **${onewayImproperReverse}**
- New CONFIRMED hops with no graph reachability from prev: **${topoImpossibleP1}** (baseline had 2; compare regression JSON)
- New UNKNOWN vs baseline: **${newUnknown}** · New AMBIGUOUS vs baseline: **${newAmbiguous}**

Detail: \`TESLA_DIRECTION_AWARE_P1_135_WAY_CHANGE_AUDIT.csv\`

## Production scope

- \`emissionCostFromHits\` in \`viterbi-dp-costs.ts\` — research grep shows P1 only in \`s4-research/*\` and \`scripts/research/*\`
- No worker / feature-flag imports of direction-aware P1 detected in audit script scope

## OUTPUT block

\`\`\`
DIRECTION_POLICY_BREAKDOWN=EXPLICIT_BIDIR:${bucketCounts.EXPLICIT_BIDIRECTIONAL};INFERRED_DEFAULT:${bucketCounts.INFERRED_BIDIRECTIONAL_DEFAULT};EXPLICIT_ONEWAY:${bucketCounts.EXPLICIT_ONEWAY};IMPLICIT_ONEWAY:${bucketCounts.IMPLICIT_ONEWAY};UNSUPPORTED:${bucketCounts.UNSUPPORTED_OR_AMBIGUOUS}
UNKNOWN_POLICY_RISK=${unknownDefaultWithReverse}_INFERRED_DEFAULT_REVERSE_ROWS;IMPROPER_REVERSE=${improperReverse}
NEW_CONFLICT_2_REVIEW=10:31:03-04Z_P1_37915960_vs_REF_401665362_442110883;BASELINE_UNKNOWN;MULTI_WAY_REF
E002_PARITY=${e002WithWay}/6
TESLA_SAFETY_REGRESSION=way_changes=${wayChanges};improper_reverse=${onewayImproperReverse};topo_impossible_p1=${topoImpossibleP1};new_unknown=${newUnknown}
PRODUCTION_SCOPE_ISOLATED=YES_RESEARCH_ONLY
REQUIRED_CI=SEE_PR_2084_HEAD_${HEAD}
RESEARCH_MERGE_VERDICT=STOP_NO_MERGE
\`\`\`
`;

  fs.writeFileSync(path.join(tiguanEvidence, 'TIGUAN_DIRECTION_AWARE_P1_FINAL_SAFETY_GATE.md'), gateReport);

  const out = {
    changed_rows: changed.length,
    policy_buckets: bucketCounts,
    reverse_discount_rows: reverseDiscountRows,
    improper_reverse: improperReverse,
    unknown_default_reverse: unknownDefaultWithReverse,
    e002_parity: `${e002WithWay}/6`,
    tesla_way_changes: wayChanges,
    tesla_improper_reverse: onewayImproperReverse,
    tesla_topo_impossible: topoImpossibleP1,
    head: HEAD,
  };
  console.log(JSON.stringify(out, null, 2));
}

main();
