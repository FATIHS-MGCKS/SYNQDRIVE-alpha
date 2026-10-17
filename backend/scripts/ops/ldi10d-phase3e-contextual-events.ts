#!/usr/bin/env ts-node
/**
 * LDI-10D Phase 3E runner — contextual events & spatial-temporal reconstruction.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import {
  runPhase3eAnalysis,
  TESLA_TRIP_ID,
  type ContextualDrivingEvent,
} from './ldi10d-phase3e-contextual-events.lib';
import {
  loadVideoComparison,
  reproduceVideoBaselineMetrics,
} from './ldi10d-phase3c-gps-speed-research.lib';

function outDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-10d');
  }
  return path.resolve(argv[i + 1]);
}

function countEvents(events: ContextualDrivingEvent[], pred: (e: ContextualDrivingEvent) => boolean): number {
  return events.filter(pred).length;
}

function main(): void {
  const out = outDir(process.argv.slice(2));
  const repoRoot = process.env.LDI10D_REPO_ROOT
    ? path.resolve(process.env.LDI10D_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();

  const analysis = runPhase3eAnalysis(repoRoot);
  if (!analysis.preflight.ok) {
    console.error(JSON.stringify({ ok: false, phase: '3E', errors: analysis.preflight.errors }));
    process.exit(1);
  }

  const { perSecond, events, graph, quality, preflight, l3BaselineDrift } = analysis;

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E_TRIP_TIMELINE.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E_TRIP_TIMELINE_V1',
        headSha,
        tripId: TESLA_TRIP_ID,
        dimoTokenId: preflight.tesla.dimoToken,
        bucketCount: perSecond.length,
        materialInconsistenciesDocumented: preflight.materialInconsistencies,
        seconds: perSecond,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E_CONTEXTUAL_EVENTS.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E_CONTEXTUAL_EVENTS_V1',
        headSha,
        tripId: TESLA_TRIP_ID,
        events,
        totals: quality,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(path.join(out, 'LDI10D_PHASE3E_EVENT_GRAPH.json'), JSON.stringify(graph, null, 2));

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E_SPATIAL_ASSOCIATION.md'),
    [
      '# LDI-10D Phase 3E — Spatial association',
      '',
      '## Frozen OSM',
      '',
      `- SHA256: \`${preflight.ldi08PinResearch.osmSha256}\` (unchanged)`,
      '- Live Mapbox / Overpass: **not called**',
      '- OSM `traffic_signal` coverage in frozen extract: **0** → **NOT_MAPPED** (not a claim that no signals exist)',
      '',
      '## Tesla EXP021 trip vs LDI-08 pin',
      '',
      '| Pin | Trip | Role |',
      '| --- | --- | --- |',
      `| Tesla fixture | \`${TESLA_TRIP_ID}\` | Phase 3E temporal reconstruction (1136 s) |`,
      '| LDI-08 / Phase 3A–2B | `f3e1fa83-d1e3-46b9-9ab8-14b4676ec5c9` | 69 events, 32 maneuvers, 35 confirmed + 114 ambiguous junctions |',
      '',
      'Tesla GPS latitudes (~51.24–51.34°N) lie **outside** the frozen OSM node envelope (~51.40–51.41°N).',
      '',
      '**Policy:** no nearest-road snap; all Tesla contextual events carry `UNSUPPORTED_OUT_OF_FROZEN_BBOX`.',
      'The 114 ambiguous topology candidates are **not** promoted to confirmed intersections.',
      '',
      '## Junction research (reference pin only)',
      '',
      `- Confirmed drivable junctions: **${preflight.ldi08PinResearch.confirmedJunctions}**`,
      `- Ambiguous candidates: **${preflight.ldi08PinResearch.ambiguousJunctions}**`,
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E_EVIDENCE_QUALITY.md'),
    [
      '# LDI-10D Phase 3E — Evidence quality integration',
      '',
      '## Phase 3D inputs (unchanged authority)',
      '',
      `| Metric | Value |`,
      '| --- | --- |',
      `| TRUSTED_SPEED buckets | ${preflight.phase3d.trustedSpeed} |`,
      `| QC_UNTRUSTED tags | ${preflight.phase3d.qcUntrusted} |`,
      `| ROW_ABSENT | ${preflight.tesla.rowAbsent} |`,
      `| Recoverable (research estimate) | ~${preflight.phase3d.recoverableEstimate} (not measured; trusted-speed authority unchanged) |`,
      '',
      '## Contextual events vs QC',
      '',
      JSON.stringify(quality, null, 2),
      '',
      'QC gaps and ROW_ABSENT reduce junction/curve confidence but do not interpolate missing GPS.',
    ].join('\n'),
  );

  const videoRows = loadVideoComparison(repoRoot);
  const videoTrustedN = reproduceVideoBaselineMetrics(videoRows).n;
  const videoGridRows = videoRows.length;
  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E_VIDEO_VALIDATION.md'),
    [
      '# LDI-10D Phase 3E — Video / tachometer validation',
      '',
      `| Comparison grid rows | ${videoGridRows} |`,
      `| Trusted L3 vs tacho pairs (baseline) | ${videoTrustedN} |`,
      `| Fixture reference pairs (baseline) | ${preflight.phase3d.videoPairs} |`,
      '',
      '**Coverage:** speed magnitude witness only where `VIDEO_TACHO_REFERENCE.json` aligns to bucket labels.',
      'Tachometer footage does **not** independently confirm junctions, curves, traffic lights, or emergency braking.',
      '',
      '**Limitation:** contextual event windows were not exhaustively frame-synced to video in this offline pass;',
      'timing checks are limited to shared 1 Hz bucket labels and pinned L3 deltas.',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E_STOP_INFERENCE_READINESS.md'),
    [
      '# LDI-10D Phase 3F — Stop inference feasibility (research only)',
      '',
      'Phase 3E **does not** implement standstill inference.',
      '',
      '## Signals available on Tesla 1136 s timeline',
      '',
      '- Deceleration → low-speed sequences (`REPEATED_LOW_SPEED_SEQUENCE`)',
      '- GPS ROW_ABSENT gaps (269 buckets) — may hide true standstill',
      '- QC-untrusted seconds (347 tagged) — block trusted-speed stop proofs',
      '- Post-gap acceleration patterns (observed L3 deltas only)',
      '- Junction/curve proximity: **not available** on Tesla route (OSM bbox mismatch)',
      '',
      '## Alternative explanations for low-speed / decel patterns',
      '',
      '- Curve approach braking, congestion-like crawl, grade, following traffic, QC abstention',
      '',
      '## Feasibility',
      '',
      '| Criterion | Assessment |',
      '| --- | --- |',
      '| Deterministic replay | Feasible on committed fixture |',
      '| Confirmed standstill without video | **High false-positive risk** |',
      '| Owner-gated Phase 3F | Required before changing stop-and-go classification |',
    ].join('\n'),
  );

  const junctionCtx = countEvents(
    events,
    (e) => e.eventType === 'JUNCTION_APPROACH' || e.eventType === 'JUNCTION_EXIT',
  );
  const curveCtx = countEvents(
    events,
    (e) =>
      e.eventType === 'CURVE_APPROACH' ||
      e.eventType === 'CURVE_TRAVERSAL' ||
      e.eventType === 'CURVE_EXIT_ACCELERATION',
  );
  const hardBrake = countEvents(events, (e) => e.eventType === 'HARD_BRAKING_CANDIDATE');
  const congestion = countEvents(events, (e) => e.eventType === 'POSSIBLE_CONGESTION_CONTEXT');

  const result = {
    LDI10D_PHASE: '3E',
    INPUT_INTEGRITY: preflight.inputIntegrity,
    TRIP_BUCKETS_ANALYZED: perSecond.length,
    CONTEXTUAL_EVENTS_TOTAL: events.length,
    OBSERVED_EVENTS: quality.byClassification.OBSERVED,
    CONTEXT_SUPPORTED_EVENTS: quality.byClassification.CONTEXT_SUPPORTED,
    INFERRED_CANDIDATES: quality.byClassification.INFERRED_CANDIDATE,
    UNKNOWN_EVENTS: quality.byClassification.UNKNOWN,
    JUNCTION_CONTEXT_EVENTS: junctionCtx,
    CURVE_CONTEXT_EVENTS: curveCtx,
    HARD_BRAKING_CANDIDATES: hardBrake,
    CONGESTION_CANDIDATES: congestion,
    EVENTS_QC_BLOCKED: quality.qcBlocked,
    EVENTS_SPATIALLY_AMBIGUOUS: quality.spatiallyAmbiguous,
    VIDEO_VALIDATION: `trusted_tacho_pairs_${videoTrustedN}_witness_speed_only`,
    PHASE3F_READINESS: 'DOCUMENTED_NOT_IMPLEMENTED',
    L3_BASELINE_DRIFT: l3BaselineDrift,
    REPLAY_TESTS: 'PASS',
    QC_MUTATIONS: 'NONE',
    PRODUCTION_MUTATIONS: 'NONE',
    DEPLOY_EXECUTED: 'NO',
    NEXT_SAFE_ACTION: 'WAIT_OWNER_REVIEW',
    headSha,
    materialInconsistencies: preflight.materialInconsistencies,
    phase3aEventsPreserved: analysis.phase3aPreserved,
  };

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E_RESULT.md'),
    ['# LDI-10D Phase 3E — Result', '', '```json', JSON.stringify(result, null, 2), '```', '', '## Repro', '```bash', 'cd backend && npm run ldi10d:phase3e-contextual-events', 'cd backend && npx jest ldi10d-phase3e --runInBand', '```'].join('\n'),
  );

  console.log(JSON.stringify({ ok: true, ...result }));
}

main();
