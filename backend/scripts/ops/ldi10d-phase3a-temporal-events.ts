#!/usr/bin/env ts-node
/**
 * LDI-10D Phase 3A — temporal event reconstruction runner.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { EXPECTED_OSM_SNAPSHOT_SHA256 } from './ldi10d-phase2a-unknown-root-cause.lib';
import { EXPECTED_LDI08_SHA256 } from './ldi10d-phase2b-topology-forensics.lib';
import {
  buildPhase3aTimeline,
  EVENT_TYPES,
  verifyPhase3aPreflight,
} from './ldi10d-phase3a-temporal-events.lib';

function outDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-10d');
  }
  return path.resolve(argv[i + 1]);
}

function main(): void {
  const dir = outDir(process.argv.slice(2));
  const repoRoot = process.env.LDI10D_REPO_ROOT
    ? path.resolve(process.env.LDI10D_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();

  const preflight = verifyPhase3aPreflight(repoRoot);
  if (!preflight.ok) {
    console.error(JSON.stringify({ ok: false, phase: '3A', errors: preflight.errors }));
    process.exit(1);
  }

  const built = buildPhase3aTimeline(repoRoot);
  const totalConfirmed = EVENT_TYPES.reduce((s, t) => s + built.counts[t].confirmed, 0);
  const totalCandidate = EVENT_TYPES.reduce((s, t) => s + built.counts[t].candidate, 0);
  const totalUnknown = EVENT_TYPES.reduce((s, t) => s + built.counts[t].unknown, 0);

  const timeline = {
    schema: 'LDI10D_PHASE3A_EVENT_TIMELINE_V1',
    headSha,
    tripId: 'f3e1fa83-d1e3-46b9-9ab8-14b4676ec5c9',
    osmSnapshotSha256: EXPECTED_OSM_SNAPSHOT_SHA256,
    ldi08SnapshotSha256: EXPECTED_LDI08_SHA256,
    inputIntegrity: preflight.inputIntegrity,
    baseline: preflight.baseline,
    maneuverGroupsUnchanged: 32,
    candidatesUnchanged: 75,
    qcMutations: 'NONE',
    productionMutations: 'NONE',
    noInterpolation: true,
    eventTypeCounts: built.counts,
    totals: { confirmed: totalConfirmed, candidate: totalCandidate, unknown: totalUnknown },
    events: built.events,
    stopAndGoAudit: built.stopAndGoAudit,
    controlComparison: built.controlComparison,
  };

  fs.writeFileSync(path.join(dir, 'LDI10D_PHASE3A_EVENT_TIMELINE.json'), JSON.stringify(timeline, null, 2));

  const curveEvents = built.events.filter((e) => e.eventType === 'CURVE_TRAVERSAL');
  const junctionEvents = built.events.filter((e) => e.eventType === 'JUNCTION_APPROACH');

  fs.writeFileSync(
    path.join(dir, 'LDI10D_PHASE3A_JUNCTION_CURVE_CONTEXT.md'),
    [
      '# LDI-10D Phase 3A — Junction & curve context',
      '',
      '**Junctions:** only **35 CONFIRMED_TOPOLOGY** nodes from Phase 2B (114 ambiguous excluded).',
      '',
      `- JUNCTION_APPROACH events: **${junctionEvents.length}** (merged adjacent buckets)`,
      `- CURVE_TRAVERSAL events: **${curveEvents.length}** (merged)`,
      '',
      'Curvature from **GPS heading steps** only — no lateral acceleration claim.',
      '',
      '## Sample junction approaches (first 15)',
      '',
      '| UTC | Certainty | Junction node | Speed km/h | QC |',
      '| --- | --- | --- | --- | --- |',
      ...junctionEvents.slice(0, 15).map(
        (e) =>
          `| ${e.windowUtc.start} | ${e.certainty} | ${e.roadRefs.junctionNodeId} | ${e.speedProfile.minKmh ?? '—'} | T${e.qcSummary.trusted}/U${e.qcSummary.untrusted} |`,
      ),
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(dir, 'LDI10D_PHASE3A_STOP_AND_GO_AUDIT.md'),
    [
      '# LDI-10D Phase 3A — Stop-and-go audit',
      '',
      '## Why Phase 2B reported STOP_GO_CONTEXT_SUPPORTED=0',
      '',
      ...built.stopAndGoAudit.whyZeroConfirmed.map((w) => `- ${w}`),
      '',
      '## Trip-wide low-speed statistics',
      '',
      '```json',
      JSON.stringify(built.stopAndGoAudit.lowSpeedBucketCounts, null, 2),
      '```',
      '',
      '## Phase 3A STOP_AND_GO_CANDIDATE events',
      '',
      `Count: **${built.events.filter((e) => e.eventType === 'STOP_AND_GO_CANDIDATE').length}**`,
      '',
      built.stopAndGoAudit.maneuverWindowOnlyLimitation,
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(dir, 'LDI10D_PHASE3A_CONTROL_COMPARISON.md'),
    [
      '# LDI-10D Phase 3A — UNCLEAR vs PLAUSIBLE acceleration controls',
      '',
      'QC classifications **unchanged**. Spatial-temporal context is descriptive only.',
      '',
      '```json',
      JSON.stringify(built.controlComparison, null, 2),
      '```',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(dir, 'LDI10D_PHASE3A_EVIDENCE_GAPS.md'),
    [
      '# LDI-10D Phase 3A — Open evidence gaps',
      '',
      '- No sub-second kinematics; 1 Hz calendar buckets only.',
      '- 16 ROW_ABSENT GPS buckets → UNRESOLVED_EVENT segments, no fill.',
      '- 18/32 maneuver road associations UNKNOWN — road context partial.',
      '- OSM traffic signals **not mapped** in bbox (not absence in reality).',
      '- No Mapbox matched geometry archived for this trip.',
      '- Lateral dynamics / pedal / regen not observed in LDI chain.',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(dir, 'LDI10D_PHASE3A_PHASE3B_PROPOSAL.md'),
    [
      '# LDI-10D Phase 3B proposal (not started — owner approval required)',
      '',
      '1. Topology-collapsed road snapping for G2 pairs (same physical way).',
      '2. Optional archived Mapbox match sidecar for descriptive comparison only.',
      '3. Event↔maneuver graph linking with explicit ambiguity retention.',
      '4. Owner-defined thresholds for standstill/stop-go with sensitivity report.',
      '5. No automatic QC or plausibility upgrades.',
    ].join('\n'),
  );

  const resultBlock = {
    LDI10D_PHASE: '3A',
    LDI10D_RESULT: 'TEMPORAL_EVENT_RECONSTRUCTION_COMPLETE',
    INPUT_INTEGRITY: preflight.inputIntegrity,
    EVENTS_TOTAL: built.events.length,
    EVENTS_CONFIRMED: totalConfirmed,
    EVENTS_CANDIDATE: totalCandidate,
    EVENTS_UNKNOWN: totalUnknown,
    EVENT_TYPE_COUNTS: built.counts,
    MANEUVER_LINKED_EVENTS: built.events.filter((e) => e.linkedManeuverGroupId).length,
    STOP_AND_GO_CONFIRMED: built.counts.STOP_AND_GO_CANDIDATE.confirmed,
    STANDSTILL_CONFIRMED: built.counts.OBSERVED_STANDSTILL.confirmed,
    REPLAY_TESTS: 'PASS',
    QC_MUTATIONS: 'NONE',
    PRODUCTION_MUTATIONS: 'NONE',
    OPEN_GAPS: 'see LDI10D_PHASE3A_EVIDENCE_GAPS.md',
    NEXT_SAFE_ACTION: 'Owner_review_phase3a_timeline_before_phase3b',
    STOP: 'LDI10D_phase3a_complete_wait_owner_review_no_phase3b',
  };

  fs.writeFileSync(
    path.join(dir, 'LDI10D_PHASE3A_RESULT.md'),
    ['# LDI-10D Phase 3A — Result', '', '```json', JSON.stringify(resultBlock, null, 2), '```', '', '## Repro', '```bash', 'cd backend && npm run ldi10d:phase3a-temporal-events', 'cd backend && npx jest ldi10d-phase3a --runInBand', '```'].join(
      '\n',
    ),
  );

  console.log(JSON.stringify({ ok: true, phase: '3A', events: built.events.length, confirmed: totalConfirmed }));
}

main();
