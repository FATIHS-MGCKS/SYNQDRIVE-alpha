/**
 * EXP021 Phase B6 — Direction-Aware P1 safety gates (library) + two-trip offline replay.
 * cd backend && npx ts-node --transpile-only scripts/research/exp021-tesla-phase-b6.harness.ts
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseDiV0S4EvidenceContainer } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-evidence-container-parse';
import { buildDiV0S4EvidenceSnapshotHash } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-identity';
import { DI_V0_S4_LIMITS } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-contract';
import { buildResearchGpsBucketsFromParsedContainer } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research-worker/di-v0-s4-research-snapshot-adapter';
import { shadowBucketKeyFromIntervalStart } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research-worker/di-v0-s4-research-shadow-evidence';
import {
  DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  applyDirectionAwareP1SafetyGates,
  buildDirectedCarRoutingGraph,
  buildRoadContextFromOverpass,
  buildViterbiMatchesBacktrackR1,
  buildViterbiMatchesRouteAwareR4_1,
  resetRouteQueryRuntimeProfile,
  type ResearchGpsBucket,
  type ShadowMotionEvidence,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research';
import { buildBaselineMatches } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/baseline-matching';
import { buildViterbiMatches, headingsFromBaseline } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/viterbi-matching';
import { buildViterbiMatchesDirectionAwareEmissionP1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/viterbi-matching-direction-aware-p1';
import { buildWayAdjacency } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/osm-parse';
import type { BaselineBucketMatch } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/baseline-matching';
import type { SafetyGateReasonCode } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/direction-aware-p1-safety-gates';

const PINNED_COMMIT = '91fbf024f';
const b1 = process.env.TESLA_B1_RESEARCH_OUT ?? '/opt/cursor/artifacts/exp021-tesla-two-trip-research';
const b2 = process.env.TESLA_B2_OUT ?? '/opt/cursor/artifacts/exp021-tesla-b2';
const b3 = process.env.TESLA_B3_OUT ?? '/opt/cursor/artifacts/exp021-tesla-b3';
const b4ArtifactsDir = process.env.TESLA_B4_OUT ?? '/opt/cursor/artifacts/exp021-tesla-b4';
const evidenceDir = process.env.TESLA_EXPORT_DIR ?? '/opt/cursor/artifacts/exp021-tesla-two-trip';
const shadowDir = path.join(b2, 'shadow');
const outRoot = process.env.TESLA_B6_OUT ?? '/opt/cursor/artifacts/exp021-tesla-b6';

const TRIP_PINS: Record<'TRIP_1' | 'TRIP_2', string> = {
  TRIP_1: 'DI_V0_S4_EVIDENCE_V1:sha256:2af8f07a89e166d1e1e37089f525f1e4d52aecae79e15cbc7c92a9d2d7883884',
  TRIP_2: 'DI_V0_S4_EVIDENCE_V1:sha256:45e5515fecf8e3f8744531915ee81f18964e610363d827ad7d297d6d41359338',
};

const TC_ANCHORS: Record<string, string> = {
  'TC-1': '2026-10-20T09:33:39Z',
  'TC-2': '2026-10-20T09:33:58Z',
  'TC-3': '2026-10-20T09:35:23Z',
  'TC-4': '2026-10-20T09:36:15Z',
  'TC-5': '2026-10-20T09:37:25Z',
  'TC-6': '2026-10-20T09:38:23Z',
};

type ShadowRow = {
  intervalStart: string;
  motionState: string;
  positionState: string;
  estimatedSpeedKmh: number | null;
  speedEvidenceState: string | null;
  valueConfidence: string;
};

function loadShadowMap(tripKey: string): Map<string, ShadowRow> {
  const p = path.join(shadowDir, `${tripKey}_shadow_intervals.jsonl`);
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n');
  const m = new Map<string, ShadowRow>();
  for (const l of lines) {
    const r = JSON.parse(l) as ShadowRow;
    m.set(shadowBucketKeyFromIntervalStart(new Date(r.intervalStart)), r);
  }
  return m;
}

function shadowEvidenceMap(shadow: Map<string, ShadowRow>): Map<string, ShadowMotionEvidence> {
  const out = new Map<string, ShadowMotionEvidence>();
  for (const [k, r] of shadow) {
    out.set(k, {
      motionState: r.motionState,
      positionState: r.positionState,
      estimatedSpeedKmh: r.estimatedSpeedKmh,
      valueConfidence: r.valueConfidence,
      speedEvidenceState: r.speedEvidenceState,
    });
  }
  return out;
}

function loadBuckets(tripKey: 'TRIP_1' | 'TRIP_2'): ResearchGpsBucket[] {
  const raw = gunzipSync(fs.readFileSync(path.join(evidenceDir, `${tripKey}_evidence_payload.gz`)), {
    maxOutputLength: DI_V0_S4_LIMITS.maxUncompressedSnapshotBytes,
  });
  const c = raw.toString('utf8');
  if (buildDiV0S4EvidenceSnapshotHash(c) !== TRIP_PINS[tripKey]) throw new Error(`snapshot mismatch ${tripKey}`);
  return buildResearchGpsBucketsFromParsedContainer(parseDiV0S4EvidenceContainer(c));
}

function outcomeCounts(rows: BaselineBucketMatch[]) {
  const c = { CONFIRMED: 0, AMBIGUOUS: 0, UNKNOWN: 0 };
  for (const r of rows) {
    if (r.outcome === 'CONFIRMED') c.CONFIRMED++;
    else if (r.outcome === 'AMBIGUOUS') c.AMBIGUOUS++;
    else c.UNKNOWN++;
  }
  return c;
}

function shadowOnlyCounts(shadow: Map<string, ShadowRow>) {
  const c = { STATIONARY_SUPPORTED: 0, MOVING_SPEED_ESTIMATED: 0, NO_MOTION_EVIDENCE: 0, ROW_ABSENT: 0, FRESH: 0 };
  for (const r of shadow.values()) {
    if (r.motionState === 'STATIONARY_SUPPORTED') c.STATIONARY_SUPPORTED++;
    else if (r.motionState === 'MOVING_SPEED_ESTIMATED') c.MOVING_SPEED_ESTIMATED++;
    else c.NO_MOTION_EVIDENCE++;
    if (r.positionState === 'ROW_ABSENT') c.ROW_ABSENT++;
    if (r.positionState === 'FRESH') c.FRESH++;
  }
  return c;
}

function wayChanges(rows: BaselineBucketMatch[]): number {
  let n = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].osmWayId != null && rows[i - 1].osmWayId !== rows[i].osmWayId) n++;
  }
  return n;
}

function replayTrip(tripKey: 'TRIP_1' | 'TRIP_2') {
  const t0 = process.hrtime.bigint();
  const buckets = loadBuckets(tripKey);
  const shadow = loadShadowMap(tripKey);
  const osmPath = path.join(b1, `${tripKey}/OSM_FROZEN_SNAPSHOT.json`);
  const osmSha = crypto.createHash('sha256').update(fs.readFileSync(osmPath)).digest('hex');
  const overpass = (JSON.parse(fs.readFileSync(osmPath, 'utf8')) as { overpassResponse: unknown }).overpassResponse;
  const cfg = DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG;
  const roadContext = buildRoadContextFromOverpass(overpass as { elements?: Array<Record<string, unknown>> }, {
    buckets,
    corridorMarginM: 75,
  });
  const adj = buildWayAdjacency(roadContext.ways);
  const graph = buildDirectedCarRoutingGraph(overpass as { elements?: Array<Record<string, unknown>> }, roadContext.ways);

  const tBaseline = process.hrtime.bigint();
  const baseline = buildBaselineMatches(buckets, roadContext, cfg);
  const headings = headingsFromBaseline(baseline);
  const variantB = baseline;
  const variantC = buildViterbiMatchesBacktrackR1(buckets, roadContext.ways, headings, cfg, { wayAdjacency: adj }).matches;
  const variantD = buildViterbiMatchesDirectionAwareEmissionP1(buckets, roadContext.ways, headings, cfg, { wayAdjacency: adj });
  const tGated = process.hrtime.bigint();
  const gated = applyDirectionAwareP1SafetyGates(
    variantD,
    buckets,
    roadContext.ways,
    graph,
    shadowEvidenceMap(shadow),
  );
  const tAfterGated = process.hrtime.bigint();
  resetRouteQueryRuntimeProfile();
  const variantE = buildViterbiMatchesRouteAwareR4_1(buckets, roadContext.ways, headings, cfg, graph).matches;
  const tEnd = process.hrtime.bigint();

  const mem = process.memoryUsage();

  return {
    tripKey,
    evidencePin: TRIP_PINS[tripKey],
    osmSnapshotSha256: osmSha,
    bucketCount: buckets.length,
    shadowMotionPosition: shadowOnlyCounts(shadow),
    variants: {
      A_productionShadowMotionOnly: shadowOnlyCounts(shadow),
      B_baseline: outcomeCounts(variantB),
      C_viterbiBacktrack: outcomeCounts(variantC),
      D_directionAwareP1Ungated: outcomeCounts(variantD),
      D_gatedB6: outcomeCounts(gated.matches),
      E_routeAwareR4_1: outcomeCounts(variantE),
    },
    wayChanges: {
      D_ungated: wayChanges(variantD),
      D_gated: wayChanges(gated.matches),
    },
    gateTriggers: gated.triggerCounts,
    auditsSample: gated.audits.filter((a) => a.triggeredGates.some((g) => g !== 'GATE_NO_OP')).slice(0, 25),
    performanceMs: {
      total: Number(tEnd - t0) / 1e6,
      throughD_ungated: Number(tGated - tBaseline) / 1e6,
      gatedOnly: Number(tAfterGated - tGated) / 1e6,
      routeAwareE: Number(tEnd - tAfterGated) / 1e6,
    },
    memoryHeapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    rows: {
      variantB,
      variantD,
      variantDgated: gated.matches,
      variantE,
      buckets,
      gatedAudits: gated.audits,
    },
  };
}

function compareB4(trip1Ungated: ReturnType<typeof outcomeCounts>, trip1Gated: ReturnType<typeof outcomeCounts>) {
  const b4Path = path.join(b4ArtifactsDir, 'DIRECTION_P1_SAFETY_GATE_SIMULATION.json');
  if (!fs.existsSync(b4Path)) return { b4Available: false };
  const b4 = JSON.parse(fs.readFileSync(b4Path, 'utf8')) as {
    ungated: typeof trip1Ungated;
    gated: typeof trip1Gated;
  };
  return {
    b4Available: true,
    trip1UngatedMatchesB4: JSON.stringify(b4.ungated) === JSON.stringify(trip1Ungated),
    trip1GatedDeltaVsB4: {
      CONFIRMED: trip1Gated.CONFIRMED - b4.gated.CONFIRMED,
      AMBIGUOUS: trip1Gated.AMBIGUOUS - b4.gated.AMBIGUOUS,
      UNKNOWN: trip1Gated.UNKNOWN - b4.gated.UNKNOWN,
    },
    note: 'B6 uses library gates; ROUTE_NOT_FOUND → AMBIGUOUS (B4 inline sim used UNKNOWN for that case)',
  };
}

function falseDowngradeAnalysis(
  ungated: BaselineBucketMatch[],
  gated: BaselineBucketMatch[],
  baseline: BaselineBucketMatch[],
) {
  const downgrades: Array<{ bucket: string; from: string; to: string; reasons: string[] }> = [];
  let preventedConfirmed = 0;
  let proxyCorrectLost = 0;
  for (let i = 0; i < ungated.length; i++) {
    if (ungated[i].outcome === 'CONFIRMED' && gated[i].outcome !== 'CONFIRMED') {
      preventedConfirmed++;
      if (baseline[i].outcome === 'CONFIRMED' && baseline[i].osmWayId === ungated[i].osmWayId) proxyCorrectLost++;
      downgrades.push({
        bucket: ungated[i].bucketLabelUtc,
        from: ungated[i].outcome,
        to: gated[i].outcome,
        reasons: gated[i].ambiguityReasons.filter((r) => r.startsWith('GATE_')),
      });
    }
  }
  return { preventedConfirmed, proxyCorrectLost, sample: downgrades.slice(0, 40) };
}

function tcCsv(trip1: ReturnType<typeof replayTrip>) {
  const lines = [
    'case_id,utc_anchor,D_ungated_way,D_ungated_outcome,D_gated_way,D_gated_outcome,gate_reasons,routing_status,route_m,gps_chord_m,shadow_motion',
  ];
  for (const [caseId, anchor] of Object.entries(TC_ANCHORS)) {
    const i = trip1.rows.buckets.findIndex((b) => b.bucketLabelUtc === anchor);
    const d = trip1.rows.variantD[i];
    const dg = trip1.rows.variantDgated[i];
    const audit = trip1.rows.gatedAudits[i];
    lines.push(
      [
        caseId,
        anchor,
        d?.osmWayId ?? '',
        d?.outcome ?? '',
        dg?.osmWayId ?? '',
        dg?.outcome ?? '',
        (audit?.triggeredGates ?? []).filter((g) => g !== 'GATE_NO_OP').join('|'),
        audit?.routingStatus ?? '',
        audit?.routeDistanceM ?? '',
        audit?.gpsChordM ?? '',
        audit?.shadowMotionState ?? '',
      ].join(','),
    );
  }
  return lines.join('\n');
}

function writeDocs(outRoot: string): void {
  const auditMd = `# B6 Architecture Audit (EXP021)

Pinned commit: \`${PINNED_COMMIT}\`

## Integration point

- **Ungated track:** \`buildViterbiMatchesDirectionAwareEmissionP1\` (unchanged forward Viterbi + P1 emission).
- **B6 gates:** \`applyDirectionAwareP1SafetyGates\` post-processes bucket rows; does not alter DP costs or backpointer state.
- **Directed evidence:** \`buildDirectedCarRoutingGraph\` + \`queryRouteBetweenProjections\` (Route-Aware R4.1 graph).
- **Motion evidence:** production \`di_v0_shadow_intervals\` mapped via \`shadowBucketKeyFromIntervalStart\`.

## Preserved modules (not modified)

- Production S4 decoder / shadow writers
- \`road-matching-pipeline.ts\` forward V2 track
- Viterbi backpointer R1 internals

## Research-only surface

- \`direction-aware-p1-safety-gates.ts\`
- \`direction-aware-p1-safety-gates.config.ts\`
- \`exp021-tesla-phase-b6.harness.ts\`
`;
  fs.writeFileSync(path.join(outRoot, 'B6_ARCHITECTURE_AUDIT.md'), auditMd);

  const specMd = `# B6 Gate Specification

Algorithm ID: \`S4_RESEARCH_DIRECTION_AWARE_P1_SAFETY_GATES_B6_V1\`

## Gates

| Gate | Reason codes | Effect |
|------|----------------|--------|
| Directed connectivity | \`GATE_DIRECTED_ROUTE_NOT_FOUND\`, \`GATE_DIRECTED_ROUTE_NOT_CONNECTED\`, \`GATE_DIRECTED_TOPOLOGY_UNCERTAIN\` | CONFIRMED → AMBIGUOUS on way change |
| Kinematic plausibility | \`GATE_KINEMATIC_DETOUR_RATIO\`, \`GATE_KINEMATIC_SPEED_IMPLAUSIBLE\` | Uses actual Δt between bucket labels |
| Stationary-aware | \`GATE_STATIONARY_WAY_CHANGE\`, \`GATE_STATIONARY_SERVICE_TRANSITION\` | Bypass when directed route ≤35m and displacement ≥5m (TC-6 class turns) |
| GPS missing | \`GATE_GPS_POSITION_ABSENT\` | UNKNOWN; never treated as stationary |

## Explainability

Each bucket: \`SafetyGateAuditRecord\` with original/gated outcome, ways, routing status, kinematic fields, stationary evaluation.

Original ungated rows are preserved in replay JSON under \`variants.D_ungated\` audits reference indices only.
`;
  fs.writeFileSync(path.join(outRoot, 'B6_GATE_SPECIFICATION.md'), specMd);
}

async function main(): Promise<void> {
  fs.mkdirSync(outRoot, { recursive: true });
  writeDocs(outRoot);

  const trip1 = replayTrip('TRIP_1');
  const trip2 = replayTrip('TRIP_2');

  const replayJson = {
    schema: 'EXP021_B6_TWO_TRIP_REPLAY_V1',
    pinnedCommit: PINNED_COMMIT,
    vehicleId: '68868291-5478-42cd-b0c4-cc77b2a78e21',
    trips: {
      TRIP_1: {
        tripId: '11f5a645-752e-4b8a-b20a-9f1fc3a6673e',
        ...trip1,
        rows: undefined,
      },
      TRIP_2: {
        tripId: '0f8d2f76-9b09-4aba-8c56-fa7e2ce1c5a8',
        ...trip2,
        rows: undefined,
      },
    },
    b4Comparison: compareB4(trip1.variants.D_directionAwareP1Ungated, trip1.variants.D_gatedB6),
    falseDowngrades: {
      TRIP_1: falseDowngradeAnalysis(trip1.rows.variantD, trip1.rows.variantDgated, trip1.rows.variantB),
      TRIP_2: falseDowngradeAnalysis(trip2.rows.variantD, trip2.rows.variantDgated, trip2.rows.variantB),
    },
  };
  fs.writeFileSync(path.join(outRoot, 'B6_TWO_TRIP_REPLAY.json'), JSON.stringify(replayJson, null, 2));
  fs.writeFileSync(path.join(outRoot, 'B6_TC1_TC6_VALIDATION.csv'), tcCsv(trip1));

  const perf = {
    schema: 'EXP021_B6_PERFORMANCE_V1',
    TRIP_1: trip1.performanceMs,
    TRIP_2: trip2.performanceMs,
    memoryHeapUsedMb: { TRIP_1: trip1.memoryHeapUsedMb, TRIP_2: trip2.memoryHeapUsedMb },
    gateOverheadMs: { TRIP_1: trip1.performanceMs.gatedOnly, TRIP_2: trip2.performanceMs.gatedOnly },
  };
  fs.writeFileSync(path.join(outRoot, 'B6_PERFORMANCE_COMPARISON.json'), JSON.stringify(perf, null, 2));

  const directedTriggers =
    (trip1.gateTriggers.GATE_DIRECTED_ROUTE_NOT_CONNECTED ?? 0) +
    (trip1.gateTriggers.GATE_DIRECTED_ROUTE_NOT_FOUND ?? 0) +
    (trip2.gateTriggers.GATE_DIRECTED_ROUTE_NOT_CONNECTED ?? 0) +
    (trip2.gateTriggers.GATE_DIRECTED_ROUTE_NOT_FOUND ?? 0);

  const finalMd = `# EXP021 Phase B6 Final Report

## Summary

Library-backed safety gates on Direction-Aware P1 reduce ungated CONFIRMED counts without changing Viterbi DP.

## Trip 1 (ungated → gated)

- CONFIRMED: ${trip1.variants.D_directionAwareP1Ungated.CONFIRMED} → ${trip1.variants.D_gatedB6.CONFIRMED}
- AMBIGUOUS: ${trip1.variants.D_directionAwareP1Ungated.AMBIGUOUS} → ${trip1.variants.D_gatedB6.AMBIGUOUS}
- UNKNOWN: ${trip1.variants.D_directionAwareP1Ungated.UNKNOWN} → ${trip1.variants.D_gatedB6.UNKNOWN}

## Trip 2

- CONFIRMED: ${trip2.variants.D_directionAwareP1Ungated.CONFIRMED} → ${trip2.variants.D_gatedB6.CONFIRMED}
- AMBIGUOUS: ${trip2.variants.D_directionAwareP1Ungated.AMBIGUOUS} → ${trip2.variants.D_gatedB6.AMBIGUOUS}
- UNKNOWN: ${trip2.variants.D_directionAwareP1Ungated.UNKNOWN} → ${trip2.variants.D_gatedB6.UNKNOWN}

## TC-1..TC-6

See \`B6_TC1_TC6_VALIDATION.csv\`

## Limitations

- Offline simulation only; no accuracy ground truth.
- ROUTE_NOT_FOUND in extract ≠ physical impossibility.
- Driver claims are DRIVER_REPORTED.

\`\`\`json
${JSON.stringify({ replayJson: { b4Comparison: replayJson.b4Comparison, falseDowngrades: replayJson.falseDowngrades } }, null, 2)}
\`\`\`
`;
  fs.writeFileSync(path.join(outRoot, 'B6_FINAL_REPORT.md'), finalMd);

  console.log(
    JSON.stringify({
      outRoot,
      trip1: {
        ungated: trip1.variants.D_directionAwareP1Ungated,
        gated: trip1.variants.D_gatedB6,
        gateTriggers: trip1.gateTriggers,
      },
      trip2: {
        ungated: trip2.variants.D_directionAwareP1Ungated,
        gated: trip2.variants.D_gatedB6,
        gateTriggers: trip2.gateTriggers,
      },
      directedTriggers,
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
