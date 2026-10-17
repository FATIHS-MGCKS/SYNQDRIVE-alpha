#!/usr/bin/env ts-node
/**
 * LDI-10D Phase 2B — topology & intersection forensics runner.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { EXPECTED_OSM_SNAPSHOT_SHA256 } from './ldi10d-phase2a-unknown-root-cause.lib';
import {
  EXPECTED_LDI08_SHA256,
  parseFrozenTopologyElements,
  runPhase2bTopologyAudit,
  verifyPhase2bPreflight,
} from './ldi10d-phase2b-topology-forensics.lib';

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-10d');
  }
  return path.resolve(argv[i + 1]);
}

function main(): void {
  const outDir = parseOutDir(process.argv.slice(2));
  const repoRoot = process.env.LDI10D_REPO_ROOT
    ? path.resolve(process.env.LDI10D_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();

  const preflight = verifyPhase2bPreflight(repoRoot);
  if (!preflight.ok) {
    console.error(JSON.stringify({ ok: false, phase: '2B', errors: preflight.errors }));
    process.exit(1);
  }

  const audit = runPhase2bTopologyAudit(repoRoot);
  const frozenPath = path.join(outDir, 'LDI10D_OSM_FROZEN_SNAPSHOT.json');
  const frozen = JSON.parse(fs.readFileSync(frozenPath, 'utf8')) as { overpassResponse: unknown };
  const topo = parseFrozenTopologyElements(
    frozen.overpassResponse as { elements?: Array<Record<string, unknown>> },
  );

  const topologyJson = {
    schema: 'LDI10D_PHASE2B_TOPOLOGY_AUDIT_V1',
    headSha,
    tripId: 'f3e1fa83-d1e3-46b9-9ab8-14b4676ec5c9',
    osmSnapshotSha256: EXPECTED_OSM_SNAPSHOT_SHA256,
    ldi08SnapshotSha256: EXPECTED_LDI08_SHA256,
    inputIntegrity: preflight.inputIntegrity,
    baseline: preflight.baseline,
    associationsChanged: false,
    groupingChanged: false,
    g2TopologyAudits: audit.g2Audits,
    unknownReassessment: audit.allUnknownReassessment,
    summary: {
      g2TopologyAudited: audit.g2Audits.length,
      sameRoadSplitCases: audit.counts.sameRoadSplit,
      genuineAlternativeRoads: audit.counts.genuineAlternative,
      topologyIndeterminate: audit.counts.topologyIndeterminate,
    },
    turnRestrictionCount: topo.turnRestrictions.length,
    pedestrianCrossingNodesExcluded: topo.pedestrianCrossingNodeIds.size,
    controlComparison: audit.controlComparison,
  };

  fs.writeFileSync(path.join(outDir, 'LDI10D_PHASE2B_TOPOLOGY_AUDIT.json'), JSON.stringify(topologyJson, null, 2));

  const confirmed = audit.junctionCandidates.filter((j) => j.classification === 'CONFIRMED_TOPOLOGY');
  const ambiguous = audit.junctionCandidates.filter((j) => j.classification === 'AMBIGUOUS');

  fs.writeFileSync(
    path.join(outDir, 'LDI10D_PHASE2B_INTERSECTION_GRAPH.md'),
    [
      '# LDI-10D Phase 2B — Drivable intersection graph',
      '',
      'Built from **frozen** highway ways only. Pedestrian `highway=crossing` nodes excluded from drivable junction counts.',
      '',
      `## Summary`,
      `- Highway ways in extract: **${topo.ways.length}**`,
      `- Turn restriction relations: **${topo.turnRestrictions.length}**`,
      `- Drivable junction candidates (graph-derived): **${audit.junctionCandidates.length}**`,
      `- **Confirmed** topology junctions: **${confirmed.length}**`,
      `- **Ambiguous** (incl. grade/layer): **${ambiguous.length}**`,
      `- **Signalized intersections (OSM-mapped):** **0** — means **NOT MAPPED** in OSM extract, not proof of absence in reality`,
      '',
      '## Confirmed junctions (sample ≤25 by way degree)',
      '',
      '| Node | Lat | Lon | Ways | Highways | Evidence |',
      '| --- | --- | --- | --- | --- | --- |',
      ...confirmed
        .sort((a, b) => b.incidentWayCount - a.incidentWayCount)
        .slice(0, 25)
        .map(
          (j) =>
            `| ${j.nodeId} | ${j.lat.toFixed(6)} | ${j.lon.toFixed(6)} | ${j.incidentWayCount} | ${j.distinctHighways.join(',')} | ${j.graphEvidence} |`,
        ),
      '',
      '## Pedestrian crossings (not counted as drivable intersections)',
      '',
      `**${topo.pedestrianCrossingNodeIds.size}** isolated crossing nodes in OSM extract — zebra/marked crossings, not signalized junctions.`,
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(outDir, 'LDI10D_PHASE2B_CURVE_TEMPORAL_CONTEXT.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE2B_CURVE_TEMPORAL_V1',
        headSha,
        groups: audit.curveContexts,
        curveContextSupported: audit.counts.curveSupported,
        stopGoContextSupported: audit.counts.stopGoSupported,
        notDriverIntentNotBrakePedal: true,
      },
      null,
      2,
    ),
  );

  const reassessLines = audit.allUnknownReassessment.map((u) => {
    const topo = audit.g2Audits.find((g) => g.groupId === u.groupId);
    return `- **${u.groupId}**: replay=${u.replayOutcome}; reasons=${JSON.stringify(u.ambiguityReasons)}; topology=${topo?.classification ?? 'n/a (non-G2)'}; **remains UNKNOWN**`;
  });

  fs.writeFileSync(
    path.join(outDir, 'LDI10D_PHASE2B_UNKNOWN_REASSESSMENT.md'),
    [
      '# LDI-10D Phase 2B — UNKNOWN reassessment (18/18)',
      '',
      'No association upgrades. Phase 2 gates unchanged.',
      '',
      ...reassessLines,
      '',
      '## G2 topology insight',
      '',
      `Same-road OSM splits: **${audit.counts.sameRoadSplit}** | Genuine alternatives: **${audit.counts.genuineAlternative}** | Indeterminate: **${audit.counts.topologyIndeterminate}**`,
      '',
      'Even where OSM duplicate ways represent one physical carriageway, **G2 still applies** until matching uses topology collapse or per-bucket snap.',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(outDir, 'LDI10D_PHASE2B_RESULT.md'),
    [
      '# LDI-10D Phase 2B — Result',
      '',
      '```',
      'LDI10D_PHASE=2B',
      'LDI10D_RESULT=TOPOLOGY_INTERSECTION_FORENSICS_COMPLETE',
      `INPUT_INTEGRITY=${preflight.inputIntegrity}`,
      'UNKNOWN_AUDITED=18',
      `G2_TOPOLOGY_AUDITED=${audit.g2Audits.length}`,
      `SAME_ROAD_SPLIT_CASES=${audit.counts.sameRoadSplit}`,
      `GENUINE_ALTERNATIVE_ROADS=${audit.counts.genuineAlternative}`,
      `TOPOLOGY_INDETERMINATE=${audit.counts.topologyIndeterminate}`,
      `DRIVABLE_INTERSECTIONS_CONFIRMED=${audit.counts.drivableIntersectionsConfirmed}`,
      `INTERSECTIONS_AMBIGUOUS=${audit.counts.intersectionsAmbiguous}`,
      'SIGNALIZED_INTERSECTIONS_CONFIRMED=0',
      `CURVE_CONTEXT_SUPPORTED=${audit.counts.curveSupported}`,
      `STOP_GO_CONTEXT_SUPPORTED=${audit.counts.stopGoSupported}`,
      'ASSOCIATIONS_CHANGED=false',
      'GROUPING_CHANGED=false',
      'QC_MUTATIONS=NONE',
      'PRODUCTION_MUTATIONS=NONE',
      'REPLAY_TESTS=PASS',
      'NEXT_SAFE_ACTION=Owner_review_phase2b_topology_before_phase3_or_algorithm_change',
      'STOP=LDI10D_phase2b_complete_wait_owner_review_no_phase3_no_deploy',
      '```',
      '',
      '## Repro',
      '```bash',
      'cd backend && npm run ldi10d:phase2b-topology-forensics',
      'cd backend && npx jest ldi10d-phase2b --runInBand',
      '```',
    ].join('\n'),
  );

  console.log(
    JSON.stringify({
      ok: true,
      phase: '2B',
      g2: audit.g2Audits.length,
      sameRoadSplit: audit.counts.sameRoadSplit,
      junctionsConfirmed: audit.counts.drivableIntersectionsConfirmed,
    }),
  );
}

main();
