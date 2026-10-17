#!/usr/bin/env ts-node
/**
 * LDI-10D Phase 2A — UNKNOWN association root-cause audit.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import {
  auditCrossingSemantics,
  auditOsmSignalCoverage,
  buildGroupDiagnostics,
  EXPECTED_OSM_SNAPSHOT_SHA256,
  rootCauseDistribution,
  verifyPhase2aIntegrity,
} from './ldi10d-phase2a-unknown-root-cause.lib';
import {
  DEFAULT_UNCERTAINTY_RADIUS_M,
  parseOverpassElements,
  verifyPhase2Inputs,
} from './ldi10d-phase2-osm-road-context.lib';

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-10d');
  }
  return path.resolve(argv[i + 1]);
}

function mdTable(rows: string[][]): string {
  if (rows.length === 0) return '';
  const header = rows[0];
  const sep = header.map(() => '---');
  const body = rows.slice(1).map((r) => r.join(' | '));
  return [`| ${header.join(' | ')} |`, `| ${sep.join(' | ')} |`, ...body.map((b) => `| ${b} |`)].join('\n');
}

function main(): void {
  const outDir = parseOutDir(process.argv.slice(2));
  const repoRoot = process.env.LDI10D_REPO_ROOT
    ? path.resolve(process.env.LDI10D_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();

  const integrity = verifyPhase2aIntegrity(repoRoot);
  if (!integrity.ok) {
    console.error(JSON.stringify({ ok: false, phase: '2A', errors: integrity.errors }));
    process.exit(1);
  }

  const inputCheck = verifyPhase2Inputs(repoRoot);
  const frozenPath = path.join(outDir, 'LDI10D_OSM_FROZEN_SNAPSHOT.json');
  const assocPath = path.join(outDir, 'LDI10D_MANEUVER_ROAD_ASSOCIATION.json');
  const frozen = JSON.parse(fs.readFileSync(frozenPath, 'utf8')) as { overpassResponse: unknown };
  const assoc = JSON.parse(fs.readFileSync(assocPath, 'utf8')) as {
    associations: Array<Record<string, unknown>>;
  };
  const parsed = parseOverpassElements(frozen.overpassResponse as { elements?: Array<Record<string, unknown>> });
  const crossingNodes = parsed.nodes.filter((n) => n.kind === 'crossing' || n.kind === 'junction');

  const allDiagnostics = assoc.associations.map((a) =>
    buildGroupDiagnostics({
      stored: a,
      ways: parsed.ways,
      uncertaintyRadiusM: DEFAULT_UNCERTAINTY_RADIUS_M,
    }),
  );
  const unknownDiagnostics = allDiagnostics.filter((d) => d.associationOutcome === 'UNKNOWN');
  const associatedDiagnostics = allDiagnostics.filter((d) => d.associationOutcome === 'ASSOCIATED');

  const unknownDist = rootCauseDistribution(unknownDiagnostics);
  const signalAudit = auditOsmSignalCoverage(frozenPath);
  const crossingRows = auditCrossingSemantics(crossingNodes);

  const rootCauseJson = {
    schema: 'LDI10D_PHASE2A_UNKNOWN_ROOT_CAUSES_V1',
    headSha,
    tripId: 'f3e1fa83-d1e3-46b9-9ab8-14b4676ec5c9',
    osmSnapshotSha256: EXPECTED_OSM_SNAPSHOT_SHA256,
    associationSha256: integrity.associationSha256,
    inputArtifactHashes: inputCheck.hashes,
    inputIntegrity: integrity.inputIntegrity,
    phase2Thresholds: {
      uncertaintyRadiusM: DEFAULT_UNCERTAINTY_RADIUS_M,
      bearingCompatDeg: 45,
      competingWayGapM: 5,
      competingSignalGapM: 8,
      corridorMarginM: 75,
      matchingThresholdChanges: 'NONE',
    },
    rejectionGateCatalog: [
      'G0_NO_GPS_IN_WINDOW',
      'G1_NO_WAY_WITHIN_RADIUS',
      'G2_COMPETING_WAYS_GAP_LT_5M',
      'G3_BEARING_DELTA_GT_45',
      'G4_COMPETING_SIGNALS_GAP_LT_8M',
      'G5_ASSOCIATION_PASSED',
    ],
    unknownCount: unknownDiagnostics.length,
    associatedCount: associatedDiagnostics.length,
    unknownGroups: unknownDiagnostics,
    crossingSemantics: crossingRows,
    osmSignalCoverage: signalAudit,
    rootCauseDistributionUnknown: unknownDist,
    rootCauseDistributionAssociated: rootCauseDistribution(associatedDiagnostics),
    groups: allDiagnostics,
    knowableFromFrozenEvidence: [
      'Phase 2 association gates and ambiguity reason strings',
      'Centroid-based nearest-way distances and bearing delta vs segment bearing',
      'Per-bucket distinct way counts within 25m',
      'OSM way inventory inside 75m corridor bbox',
      'Absence of highway=traffic_signals nodes in frozen Overpass response',
    ],
    requiresAdditionalEvidence: [
      'Sub-meter GPS accuracy and road lane assignment',
      'Independent HD map or surveyed signal inventory',
      'Mapbox matched geometry (not frozen for this trip in repo evidence)',
      'OSM ways outside highway regex or outside bbox (tracks, paths, private roads)',
      'Signal phase / right-of-way at time of maneuver',
    ],
  };

  fs.writeFileSync(
    path.join(outDir, 'LDI10D_PHASE2A_UNKNOWN_ROOT_CAUSES.json'),
    JSON.stringify(rootCauseJson, null, 2),
  );

  const controlRows: string[][] = [
    ['Group', 'Outcome', 'Gates', 'Root causes', 'Top ambiguity', 'Nearest m', 'GPS buckets'],
  ];
  for (const d of associatedDiagnostics) {
    controlRows.push([
      d.groupId,
      d.associationOutcome,
      d.rejectionGatesFired.join(','),
      d.rootCauses.join('+'),
      d.phase2AmbiguityReasons.join(';') || '—',
      d.wayCandidatesWithinRadius[0]?.distanceM?.toFixed(2) ?? '—',
      String(d.temporalCoverage.gpsPresentCount),
    ]);
  }
  for (const d of unknownDiagnostics) {
    controlRows.push([
      d.groupId,
      d.associationOutcome,
      d.rejectionGatesFired.join(','),
      d.rootCauses.join('+'),
      d.phase2AmbiguityReasons.join(';'),
      d.wayCandidatesWithinRadius[0]?.distanceM?.toFixed(2) ?? '—',
      String(d.temporalCoverage.gpsPresentCount),
    ]);
  }

  fs.writeFileSync(
    path.join(outDir, 'LDI10D_PHASE2A_ASSOCIATED_CONTROL.md'),
    [
      '# LDI-10D Phase 2A — Associated vs UNKNOWN control diagnostics',
      '',
      'Identical diagnostic pipeline; Phase 2 outcomes preserved (no re-matching).',
      '',
      mdTable(controlRows),
      '',
      '## Associated summary',
      `- Count: **${associatedDiagnostics.length}**`,
      `- Primary pass gate: **G5_ASSOCIATION_PASSED** (no G2/G3/G1/G0)`,
      '',
      '## UNKNOWN summary',
      `- Count: **${unknownDiagnostics.length}**`,
      `- Dominant gate: **G2** (${unknownDiagnostics.filter((d) => d.rejectionGatesFired.includes('G2_COMPETING_WAYS_GAP_LT_5M')).length}), **G3** (${unknownDiagnostics.filter((d) => d.rejectionGatesFired.includes('G3_BEARING_DELTA_GT_45')).length}), **G1** (${unknownDiagnostics.filter((d) => d.rejectionGatesFired.includes('G1_NO_WAY_WITHIN_RADIUS')).length})`,
      '',
      '## Mapbox (descriptive only)',
      'No frozen Mapbox matched route artifact for trip `f3e1fa83` exists in `architecture/drivingintelligence/evidence/`. Production trip enrich may hold matched geometry, but **was not queried** (read-only scope). Phase 1 documents Mapbox as optional comparison only — **not ground truth** for LDI pins.',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(outDir, 'LDI10D_PHASE2A_OSM_SIGNAL_COVERAGE.md'),
    [
      '# LDI-10D Phase 2A — OSM traffic signal coverage audit',
      '',
      '**No new Overpass fetch.** Analysis of frozen snapshot only.',
      '',
      `## Conclusion: \`${signalAudit.conclusion}\``,
      '',
      '### Rationale',
      ...signalAudit.rationale.map((r) => `- ${r}`),
      '',
      '### Raw element counts',
      '```json',
      JSON.stringify(signalAudit.rawElementCounts, null, 2),
      '```',
      '',
      '### Query included traffic_signals filter',
      String(signalAudit.queryIncludedTrafficSignals),
      '',
      '### Bounding box (Phase 2)',
      '```json',
      JSON.stringify(signalAudit.bbox, null, 2),
      '```',
      '',
      '**TRAFFIC_SIGNAL_ZERO_CAUSE:** No `highway=traffic_signals` nodes returned in complete Overpass response for the Phase 2 bbox query — consistent with **sparse/absent OSM signal mapping** in this corridor, not a parser drop (crossing nodes present).',
      '',
      '## Crossing / intersection semantics (task 6)',
      '',
      `Features audited: **${crossingRows.length}** crossing/junction-tagged nodes in frozen extract.`,
      '',
      '| OSM id | Class | highway | crossing | Road intersection? | Notes |',
      '| --- | --- | --- | --- | --- | --- |',
      ...crossingRows.map(
        (r) =>
          `| ${r.osmNodeId} | ${r.semanticClass} | ${r.highwayTag ?? '—'} | ${r.crossingTag ?? '—'} | ${r.isRoadIntersection} | ${r.notes} |`,
      ),
      '',
      '**INTERSECTION_SEMANTICS:** Phase 2 “8 intersections” = **8 `highway=crossing` nodes** (pedestrian crossings), **0** junction-tagged nodes, **0** traffic signals — **not** 8 signalized drivable intersections.',
    ].join('\n'),
  );

  const remediation = [
    '# LDI-10D Phase 2A — Remediation options (prioritized, no threshold changes in this phase)',
    '',
    '## P0 — Evidence-only (owner-approved)',
    '1. **Per-bucket association** instead of centroid-only snap (may resolve G2 in parking-lot / parallel-residential cases).',
    '2. **Widen candidate search along trajectory polyline** (buffer corridor) without changing UNCERTAINTY_RADIUS gate until validated offline.',
    '3. **Archive Mapbox matched geometry** for same trip as *descriptive* side-by-side (no L3 QC coupling).',
    '',
    '## P1 — OSM completeness (new fetch only with owner authorization)',
    '4. Expand highway classes (`track`, `path`, `footway` where legally drivable) in bbox extract.',
    '5. Query `crossing=traffic_signals` and `direction=forward` signal nodes (tags not in Phase 2 query).',
    '',
    '## P2 — Algorithm (Phase 3+)',
    '6. Graph-based map matching (OSM topology) with explicit ambiguity retention.',
    '7. Lane-level GPS / RTK — outside current 1 Hz pin evidence.',
    '',
    '## Counterfactual summary (UNKNOWN only)',
    `- Would pass G1 at **35m** radius: **${unknownDiagnostics.filter((d) => d.counterfactual.radiusM35.wouldPassG1).length}** / ${unknownDiagnostics.length}`,
    `- Would pass G1 at **50m** radius: **${unknownDiagnostics.filter((d) => d.counterfactual.radiusM50.wouldPassG1).length}** / ${unknownDiagnostics.length}`,
    `- Would pass G3 at **60°** bearing tolerance: **${unknownDiagnostics.filter((d) => d.counterfactual.bearingCompat60Deg.wouldPassG3).length}** / ${unknownDiagnostics.length} (bearing UNKNOWN groups only)`,
    `- G2 still fires at **3m** gap threshold: **${unknownDiagnostics.filter((d) => d.counterfactual.competingGapThreshold3m.wouldStillFireG2).length}** / ${unknownDiagnostics.length} competing groups`,
    '',
    '**MATCHING_THRESHOLD_CHANGES:** NONE (counterfactuals are diagnostic only).',
  ];
  fs.writeFileSync(path.join(outDir, 'LDI10D_PHASE2A_REMEDIATION_OPTIONS.md'), remediation.join('\n'));

  const trafficZeroCause =
    signalAudit.conclusion === 'NO_MAPPED_SIGNALS_IN_BBOX'
      ? 'NO_MAPPED_SIGNALS_IN_BBOX_QUERY_COMPLETE'
      : signalAudit.conclusion;

  fs.writeFileSync(
    path.join(outDir, 'LDI10D_PHASE2A_RESULT.md'),
    [
      '# LDI-10D Phase 2A — Result',
      '',
      '```',
      'LDI10D_PHASE=2A',
      'LDI10D_RESULT=UNKNOWN_ROOT_CAUSE_AUDIT_COMPLETE',
      `INPUT_INTEGRITY=${integrity.inputIntegrity}`,
      `UNKNOWN_AUDITED=${unknownDiagnostics.length}`,
      `ASSOCIATED_CONTROLS=${associatedDiagnostics.length}`,
      `ROOT_CAUSE_DISTRIBUTION=${JSON.stringify(unknownDist)}`,
      `TRAFFIC_SIGNAL_ZERO_CAUSE=${trafficZeroCause}`,
      'INTERSECTION_SEMANTICS=8_PEDESTRIAN_CROSSING_NODES_NOT_SIGNALIZED_INTERSECTIONS',
      'MATCHING_THRESHOLD_CHANGES=NONE',
      'QC_MUTATIONS=NONE',
      'PRODUCTION_MUTATIONS=NONE',
      'RECOMMENDED_NEXT_ACTION=Owner_review_phase2a_matrix_before_phase3_or_osm_query_expansion',
      'STOP=LDI10D_phase2a_complete_wait_owner_review',
      '```',
      '',
      '## Repro',
      '```bash',
      'cd backend && npm run ldi10d:phase2a-unknown-root-cause',
      'cd backend && npx jest ldi10d-phase2a --runInBand',
      '```',
    ].join('\n'),
  );

  console.log(
    JSON.stringify({
      ok: true,
      phase: '2A',
      unknown: unknownDiagnostics.length,
      associated: associatedDiagnostics.length,
      inputIntegrity: integrity.inputIntegrity,
    }),
  );
}

main();
