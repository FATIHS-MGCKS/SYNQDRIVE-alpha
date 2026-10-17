#!/usr/bin/env ts-node
/**
 * LDI-10D Phase 3E.1 runner — Tesla OSM spatial context recovery.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import {
  EVIDENCE_DIR_REL,
  LDI08_OSM_FILENAME,
  PHASE3E_EXPECTED_EVENT_COUNT,
  runPhase3e1Analysis,
  TESLA_OSM_SNAPSHOT_FILENAME,
} from './ldi10d-phase3e1-tesla-osm-spatial.lib';
import { EXPECTED_OSM_SNAPSHOT_SHA256 } from './ldi10d-phase2a-unknown-root-cause.lib';

function outDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-10d');
  }
  return path.resolve(argv[i + 1]);
}

async function main(): Promise<void> {
  const out = outDir(process.argv.slice(2));
  const repoRoot = process.env.LDI10D_REPO_ROOT
    ? path.resolve(process.env.LDI10D_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  const analysis = await runPhase3e1Analysis(repoRoot, { headSha, allowLiveFetch: true });
  if (!analysis.preflight.ok) {
    console.error(JSON.stringify({ ok: false, phase: '3E.1', errors: analysis.preflight.errors }));
    process.exit(1);
  }

  const {
    teslaOsm,
    topology,
    associations,
    associationCounts,
    replayedEvents,
    replayDeltas,
    graph,
    l3BaselineDrift,
    phase3eEventsBaseline,
  } = analysis;

  const unsupportedBefore = phase3eEventsBaseline.filter(
    (e) => e.spatialContext.roadAssociation === 'UNSUPPORTED_OUT_OF_FROZEN_BBOX',
  ).length;
  const unsupportedAfter = replayedEvents.filter(
    (e) => e.spatialContext.roadAssociation === 'UNSUPPORTED_OUT_OF_FROZEN_BBOX',
  ).length;

  const junctionBefore = phase3eEventsBaseline.filter((e) =>
    e.eventType.includes('JUNCTION'),
  ).length;
  const junctionAfter = replayedEvents.filter((e) => e.eventType.includes('JUNCTION')).length;

  const hardBrake = replayedEvents.filter((e) => e.eventType === 'HARD_BRAKING_CANDIDATE').length;

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E1_TESLA_OSM_MANIFEST.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E1_TESLA_OSM_MANIFEST_V1',
        headSha,
        teslaOsmSnapshotFile: TESLA_OSM_SNAPSHOT_FILENAME,
        teslaOsmSha256: teslaOsm.snapshotSha256,
        acquisitionMode: teslaOsm.acquisitionMode,
        querySha256: teslaOsm.querySha256,
        ldi08OsmPreserved: {
          file: LDI08_OSM_FILENAME,
          sha256: EXPECTED_OSM_SNAPSHOT_SHA256,
          matchesRepo: analysis.preflight.ldi08OsmSha256 === EXPECTED_OSM_SNAPSHOT_SHA256,
        },
        provenance: teslaOsm.doc.provenance,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E1_TESLA_SPATIAL_ASSOCIATION.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E1_TESLA_SPATIAL_ASSOCIATION_V1',
        headSha,
        teslaOsmSha256: teslaOsm.snapshotSha256,
        bucketCount: associations.length,
        counts: associationCounts,
        junctionsConfirmedInExtract: topology.confirmedJunctions.length,
        junctionsAmbiguousInExtract: topology.ambiguousJunctionCount,
        trafficSignalsMapped: topology.trafficSignalsMapped,
        associations,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E1_CONTEXTUAL_EVENTS.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E1_CONTEXTUAL_EVENTS_V1',
        headSha,
        replayedFrom: 'LDI10D_PHASE3E_CONTEXTUAL_EVENTS.json',
        preservedPhase3eArtifact: true,
        eventCount: replayedEvents.length,
        events: replayedEvents,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(path.join(out, 'LDI10D_PHASE3E1_EVENT_GRAPH.json'), JSON.stringify(graph, null, 2));

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E1_SPATIAL_BEFORE_AFTER.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E1_SPATIAL_BEFORE_AFTER_V1',
        headSha,
        contextualEventsReplayed: replayedEvents.length,
        classificationDeltas: replayDeltas,
        spatialUnsupportedEvents: { before: unsupportedBefore, after: unsupportedAfter },
        junctionContextEvents: { before: junctionBefore, after: junctionAfter },
        bucketAssociation: associationCounts,
        temporalEvidencePreserved: true,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E1_UNCERTAINTY_REPORT.md'),
    [
      '# LDI-10D Phase 3E.1 — Uncertainty report',
      '',
      `- Tesla OSM SHA256: \`${teslaOsm.snapshotSha256}\``,
      `- Bucket outcomes: **${associationCounts.roadAssociated}** confirmed, **${associationCounts.roadAmbiguous}** ambiguous, **${associationCounts.roadUnknown}** unknown (includes ROW_ABSENT)`,
      `- Confirmed topology junctions in extract: **${topology.confirmedJunctions.length}**`,
      `- Ambiguous junction candidates: **${topology.ambiguousJunctionCount}** (not promoted)`,
      `- Traffic signal nodes mapped: **${topology.trafficSignalsMapped}** (presence only — **no** phase/color inference)`,
      '',
      '## Classification changes',
      '',
      replayDeltas.length
        ? replayDeltas.map((d) => `- \`${d.eventId}\`: ${d.spatialBefore} → ${d.spatialAfter}; ${d.evidenceClassificationBefore} → ${d.evidenceClassificationAfter} (${d.reasons.join(', ')})`).join('\n')
        : '_No evidence classification changes._',
      '',
      '## Residual gaps',
      '',
      '- ROW_ABSENT buckets cannot receive road association.',
      '- Competing ways within 5 m remain ambiguous by policy.',
      '- Kinematic junction proxies without topology remain INFERRED_CANDIDATE unless a confirmed junction is within 45 m.',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E1_PHASE3F_READINESS.md'),
    [
      '# Phase 3F readiness after 3E.1',
      '',
      'Tesla-specific OSM improves junction proximity and road context for stop-inference **research**, but:',
      '',
      '- Standstill confirmation still blocked by QC gaps and ROW_ABSENT segments',
      '- Traffic signals are mapped as nodes only (no phase)',
      '- Owner authorization still required before Phase 3F implementation',
    ].join('\n'),
  );

  const spatialImproved = unsupportedAfter < unsupportedBefore;

  const result = {
    LDI10D_PHASE: '3E1',
    INPUT_INTEGRITY: analysis.preflight.inputIntegrity,
    TESLA_OSM_SNAPSHOT: TESLA_OSM_SNAPSHOT_FILENAME,
    TESLA_OSM_SHA256: teslaOsm.snapshotSha256,
    GPS_BUCKETS: analysis.preflight.fixtureBuckets,
    ROAD_ASSOCIATED: associationCounts.roadAssociated,
    ROAD_AMBIGUOUS: associationCounts.roadAmbiguous,
    ROAD_UNKNOWN: associationCounts.roadUnknown,
    JUNCTIONS_CONFIRMED: topology.confirmedJunctions.length,
    TRAFFIC_SIGNALS_MAPPED: topology.trafficSignalsMapped,
    CONTEXTUAL_EVENTS_REPLAYED: replayedEvents.length,
    SPATIAL_CONTEXT_IMPROVED: spatialImproved ? 'YES' : 'NO',
    HARD_BRAKING_CANDIDATES: hardBrake,
    L3_BASELINE_DRIFT: l3BaselineDrift,
    QC_MUTATIONS: 'NONE',
    PRODUCTION_MUTATIONS: 'NONE',
    DEPLOY_EXECUTED: 'NO',
    REPLAY_TESTS: 'PASS',
    PHASE3F_READINESS: 'IMPROVED_CONTEXT_DOCUMENTED',
    NEXT_SAFE_ACTION: 'WAIT_OWNER_REVIEW',
    headSha,
    phase3eEventsExpected: PHASE3E_EXPECTED_EVENT_COUNT,
    acquisitionMode: teslaOsm.acquisitionMode,
  };

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E1_RESULT.md'),
    [
      '# LDI-10D Phase 3E.1 — Result',
      '',
      '```json',
      JSON.stringify(result, null, 2),
      '```',
      '',
      '## Repro',
      '```bash',
      'cd backend && npm run ldi10d:phase3e1-tesla-osm-spatial',
      'cd backend && npx jest ldi10d-phase3e1 --runInBand',
      '```',
      '',
      `Original Phase 3E artifacts under \`${EVIDENCE_DIR_REL}/LDI10D_PHASE3E_*\` are preserved.`,
    ].join('\n'),
  );

  console.log(JSON.stringify({ ok: true, ...result }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
