/**
 * Tesla frozen trip regression — baseline Viterbi vs direction-aware P1 (no accuracy claims).
 *
 * cd backend && npx ts-node --transpile-only scripts/research/exp021-tesla-direction-aware-p1.harness.ts
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
import { buildWayAdjacency, graphReachable } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/osm-parse';

const repoRoot = path.resolve(__dirname, '../../..');
const evidenceDir = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10d');
const TRIP_ID = '358d0158-b2a9-47ed-af26-33926c5770b4';
const outPath = path.join(evidenceDir, 'TESLA_DIRECTION_AWARE_P1_REGRESSION.json');

function summarize(rows: { outcome: string }[]): Record<'ASSOCIATED' | 'AMBIGUOUS' | 'UNKNOWN', number> {
  const counts = { ASSOCIATED: 0, AMBIGUOUS: 0, UNKNOWN: 0 };
  for (const r of rows) {
    const label = r.outcome === 'CONFIRMED' ? 'ASSOCIATED' : (r.outcome as 'AMBIGUOUS' | 'UNKNOWN');
    counts[label] += 1;
  }
  return counts;
}

function totalPathCost(rows: { osmWayId: number | null }[]): number {
  let switches = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].osmWayId !== rows[i - 1].osmWayId) switches++;
  }
  return switches;
}

function main(): void {
  const fixturePath = path.join(evidenceDir, 'fixtures/tesla-20261016/TESLA_POSITION_GRID.json');
  const osmPath = path.join(evidenceDir, 'LDI10D_TESLA_OSM_FROZEN_SNAPSHOT.json');
  const grid = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
    tripId: string;
    buckets: Array<{
      bucketLabelUtc: string;
      availability: string;
      latitude: number | null;
      longitude: number | null;
      pinnedProductionL3Kmh?: number | null;
    }>;
  };
  if (grid.tripId !== TRIP_ID) throw new Error(`trip id mismatch ${grid.tripId}`);

  const buckets: ResearchGpsBucket[] = grid.buckets.map((b) => ({
    bucketLabelUtc: b.bucketLabelUtc,
    availability: b.availability as ResearchGpsBucket['availability'],
    latitude: b.latitude,
    longitude: b.longitude,
    l3SpeedKmh: b.pinnedProductionL3Kmh ?? null,
    qcTrustLevel: null,
  }));
  const doc = JSON.parse(fs.readFileSync(osmPath, 'utf8')) as { overpassResponse: unknown };
  const roadContext = buildRoadContextFromOverpass(doc.overpassResponse as { elements?: Array<Record<string, unknown>> }, {
    buckets,
    corridorMarginM: 75,
  });
  const cfg = DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG;
  const adj = buildWayAdjacency(roadContext.ways);
  const baselineInternal = buildBaselineMatches(buckets, roadContext, cfg);
  const headings = headingsFromBaseline(baselineInternal);

  const t0 = performance.now();
  const baselineVit = buildViterbiMatches(buckets, roadContext.ways, headings, cfg, { wayAdjacency: adj });
  const baselineMs = performance.now() - t0;

  const t1 = performance.now();
  const p1Vit = buildViterbiMatchesDirectionAwareEmissionP1(buckets, roadContext.ways, headings, cfg, {
    wayAdjacency: adj,
  });
  const p1Ms = performance.now() - t1;

  const baselineLabels = summarize(baselineVit);
  const p1Labels = summarize(p1Vit);

  let labelFlips = 0;
  let wayChanges = 0;
  let newAssociated = 0;
  let newUnknown = 0;
  for (let i = 0; i < buckets.length; i++) {
    const bL = baselineVit[i].outcome === 'CONFIRMED' ? 'ASSOCIATED' : baselineVit[i].outcome;
    const pL = p1Vit[i].outcome === 'CONFIRMED' ? 'ASSOCIATED' : p1Vit[i].outcome;
    if (bL !== pL) labelFlips++;
    if (baselineVit[i].osmWayId !== p1Vit[i].osmWayId) wayChanges++;
    if (bL !== 'ASSOCIATED' && pL === 'ASSOCIATED') newAssociated++;
    if (bL !== 'UNKNOWN' && pL === 'UNKNOWN') newUnknown++;
  }

  let impossibleBase = 0;
  let impossibleP1 = 0;
  for (let i = 1; i < buckets.length; i++) {
    const check = (rows: typeof baselineVit, counter: 'base' | 'p1') => {
      const prev = rows[i - 1].osmWayId;
      const cur = rows[i].osmWayId;
      if (prev != null && cur != null && prev !== cur && rows[i].outcome === 'CONFIRMED') {
        if (!graphReachable(adj, prev, cur)) {
          if (counter === 'base') impossibleBase++;
          else impossibleP1++;
        }
      }
    };
    check(baselineVit, 'base');
    check(p1Vit, 'p1');
  }

  const report = {
    tripId: TRIP_ID,
    independentAccuracy: 'NOT_ASSESSABLE',
    baseline: baselineLabels,
    p1_direction_aware: p1Labels,
    label_flips: labelFlips,
    way_id_changes: wayChanges,
    way_switches_baseline: totalPathCost(baselineVit),
    way_switches_p1: totalPathCost(p1Vit),
    new_associated_buckets: newAssociated,
    new_unknown_buckets: newUnknown,
    impossible_topology_transitions_baseline: impossibleBase,
    impossible_topology_transitions_p1: impossibleP1,
    runtime_ms: { baseline_viterbi: baselineMs, p1_viterbi: p1Ms },
    note: 'Label deltas are regression observability only — no road-ID ground truth on this trip.',
  };

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(
    path.join(evidenceDir, 'TESLA_DIRECTION_AWARE_P1_REGRESSION.md'),
    `# Tesla direction-aware P1 regression

Trip: \`${TRIP_ID}\`

| Metric | Baseline Viterbi | P1 |
|--------|------------------|-----|
| ASSOCIATED | ${baselineLabels.ASSOCIATED} | ${p1Labels.ASSOCIATED} |
| AMBIGUOUS | ${baselineLabels.AMBIGUOUS} | ${p1Labels.AMBIGUOUS} |
| UNKNOWN | ${baselineLabels.UNKNOWN} | ${p1Labels.UNKNOWN} |

Way-id changes: ${wayChanges}; label flips: ${labelFlips}; runtime baseline ${baselineMs.toFixed(0)} ms / P1 ${p1Ms.toFixed(0)} ms.

**No accuracy claim** — frozen Tesla fixture has no complete independent Road-ID ground truth.
`,
  );
  console.log(JSON.stringify(report));
}

main();
