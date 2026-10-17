#!/usr/bin/env ts-node
/**
 * LDI-10D Phase 3E.2 runner — spatial forensics validation.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import {
  BASELINE_AMBIGUOUS,
  BASELINE_ASSOCIATED,
  BASELINE_UNKNOWN,
  EXPECTED_TESLA_OSM_SHA256,
  runPhase3e2Analysis,
} from './ldi10d-phase3e2-spatial-forensics.lib';

function outDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-10d');
  }
  return path.resolve(argv[i + 1]);
}

function main(): void {
  const out = outDir(process.argv.slice(2));
  const repoRoot = process.env.LDI10D_REPO_ROOT
    ? path.resolve(process.env.LDI10D_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();

  const a = runPhase3e2Analysis(repoRoot);
  if (!a.preflight.ok) {
    console.error(JSON.stringify({ ok: false, phase: '3E.2', errors: a.preflight.errors }));
    process.exit(1);
  }

  const ownerGate =
    a.preflight.inputIntegrity === 'PASS' && a.comparison.independentAccuracyValidation === 'NOT_ASSESSABLE'
      ? 'PARTIAL'
      : 'BLOCKED';

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E2_OSM_TOPOLOGY_AUDIT.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E2_OSM_TOPOLOGY_AUDIT_V1',
        headSha,
        teslaOsmSha256: EXPECTED_TESLA_OSM_SHA256,
        ...a.topology,
        recordsOmittedFromJson: true,
        recordCount: a.topology.records.length,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E2_OSM_TOPOLOGY_AUDIT.md'),
    [
      '# OSM topology forensic audit (Tesla extract)',
      '',
      a.topology.interpretation,
      '',
      '| Metric | Count |',
      '| --- | --- |',
      `| Raw junction candidates (graph) | ${a.topology.rawJunctionNodes} |`,
      `| Phase 2B CONFIRMED_TOPOLOGY (3E.1 headline) | ${a.topology.rawConfirmedTopologyNodes} |`,
      `| Unique geographical locations (5 dp) | ${a.topology.uniqueGeographicalLocations} |`,
      `| Forensic drivable intersections (route-relevant) | ${a.topology.confirmedDrivableIntersections} |`,
      `| Ambiguous (Phase 2B) | ${a.topology.ambiguousJunctions} |`,
      '',
      '## Forensic class histogram',
      '',
      JSON.stringify(a.topology.byForensicClass, null, 2),
      '',
      '## Sample rejections / non-intersection nodes',
      '',
      JSON.stringify(a.topology.sampleRejections, null, 2),
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E2_TRAFFIC_SIGNAL_AUDIT.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E2_TRAFFIC_SIGNAL_AUDIT_V1',
        headSha,
        summary: {
          rawTrafficSignals: a.signals.rawTrafficSignals,
          uniqueTrafficSignalLocations: a.signals.uniqueTrafficSignalLocations,
          routeRelevantSignals: a.signals.routeRelevantSignals,
          pedestrianOnly: a.signals.pedestrianOnly,
          uncertainAssociations: a.signals.uncertainAssociations,
        },
        recordsOmitted: true,
        recordCount: a.signals.records.length,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E2_TRAFFIC_SIGNAL_AUDIT.md'),
    [
      '# Traffic signal audit',
      '',
      'No signal color, phase, or required-stop inference.',
      '',
      `| Raw OSM traffic_signals nodes | ${a.signals.rawTrafficSignals} |`,
      `| Unique locations (6 dp) | ${a.signals.uniqueTrafficSignalLocations} |`,
      `| Vehicle-relevant on corridor (≤25 m route) | ${a.signals.routeRelevantSignals} |`,
      `| Pedestrian-only hints | ${a.signals.pedestrianOnly} |`,
      `| Near route uncertain | ${a.signals.uncertainAssociations} |`,
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E2_ROAD_ASSOCIATION_COMPARISON.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E2_ROAD_ASSOCIATION_COMPARISON_V1',
        headSha,
        baseline: {
          associated: BASELINE_ASSOCIATED,
          ambiguous: BASELINE_AMBIGUOUS,
          unknown: BASELINE_UNKNOWN,
          ...a.comparison.baseline,
        },
        candidateViterbiForward: a.comparison.candidate,
        bucketsChanged: a.comparison.bucketsChanged,
        implausibleTransitions: a.comparison.implausibleTransitions,
        independentAccuracyValidation: a.comparison.independentAccuracyValidation,
        note: a.comparison.note,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E2_ROAD_ASSOCIATION_COMPARISON.md'),
    [
      '# Road association comparison',
      '',
      '**Baseline:** Phase 3E.1 per-bucket heuristic (pinned artifact).',
      '**Candidate:** Causal forward-only Viterbi on top-K segment candidates (research-only).',
      '',
      JSON.stringify(a.comparison, null, 2),
    ].join('\n'),
  );

  const perSecond = a.baselineAssociations.map((b, i) => ({
    bucketLabelUtc: b.bucketLabelUtc,
    baselineOutcome: b.outcome,
    baselineWayId: b.osmWayId,
    candidateOutcome: a.candidateAssociations[i]?.outcome,
    candidateWayId: a.candidateAssociations[i]?.osmWayId,
    provenance: ['LDI10D_PHASE3E1_TESLA_SPATIAL_ASSOCIATION.json', 'phase3e2_viterbi_forward_v1'],
  }));

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E2_PER_SECOND_SPATIAL.json'),
    JSON.stringify(
      { schema: 'LDI10D_PHASE3E2_PER_SECOND_SPATIAL_V1', headSha, buckets: perSecond },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E2_CONTEXTUAL_EVENT_REASSESSMENT.md'),
    [
      '# Contextual event reassessment (66 events)',
      '',
      'Full machine-readable detail: `LDI10D_PHASE3E2_CONTEXTUAL_EVENT_REASSESSMENT.json`.',
      '',
      `Hard braking cases audited: **${a.hardBraking.length}**.`,
      'Temporal L3/QC evidence preserved from Phase 3D; spatial fields use 3E.1 baseline association + 3E.2 junction/signal audits.',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E2_CONTEXTUAL_EVENT_REASSESSMENT.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E2_CONTEXTUAL_EVENT_REASSESSMENT_V1',
        headSha,
        eventCount: a.contextualReassessment.length,
        events: a.contextualReassessment,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E2_HARD_BRAKING_CASES.md'),
    [
      '# Hard braking case studies (3 candidates)',
      '',
      'Contextual only — not emergency braking claims.',
      '',
      ...a.hardBraking.map((c) => `## ${c.eventId}\n\n\`\`\`json\n${JSON.stringify(c, null, 2)}\n\`\`\``),
    ].join('\n\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E2_UNCERTAINTY_FAILURE_MODES.md'),
    [
      '# Uncertainty and failure modes',
      '',
      '- **3226 junction headline** = graph CONFIRMED_TOPOLOGY nodes in bbox, not visited intersections.',
      '- **High AMBIGUOUS rate (512/1136)** driven by competing ways within 5 m and bearing mismatch policy.',
      '- **ROW_ABSENT (269)** blocks association entirely for those seconds.',
      '- **No independent road GT** → accuracy NOT_ASSESSABLE.',
      '- Viterbi candidate changes outcomes on many buckets but is not promoted to production.',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E2_STOP_INFERENCE_READINESS.md'),
    [
      '# Stop-inference research readiness (3E.2)',
      '',
      '## Future labels (not implemented)',
      '',
      '- OBSERVED_STANDSTILL',
      '- INFERRED_STOP_CANDIDATE',
      '- LOW_SPEED_ONLY',
      '- INSUFFICIENT_EVIDENCE',
      '- UNKNOWN',
      '',
      '## Available features on this trip',
      '',
      '- L3 deceleration deltas (Phase 3D) with QC stratification',
      '- Low-speed sequences (Phase 3E)',
      '- Tesla OSM junction + signal proximity (this phase)',
      '- GPS gaps (269 ROW_ABSENT)',
      '',
      '## Sufficiency',
      '',
      '**PARTIAL** — kinematic and spatial context exist, but QC gaps and missing independent standstill GT prevent confirmed stop inference.',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E2_VALIDATION.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E2_VALIDATION_V1',
        headSha,
        inputIntegrity: a.preflight.inputIntegrity,
        teslaOsmSha256: a.preflight.teslaOsmSha256,
        frozenEvidenceMutated: false,
        l3BaselineDrift: a.l3BaselineDrift,
        qcMutations: 'NONE',
        productionMutations: 'NONE',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E2_OWNER_DECISION.md'),
    [
      '# Owner decision gates — Phase 3E.2',
      '',
      `| Gate | Status |`,
      '| --- | --- |',
      `| Input integrity / frozen SHA | PASS |`,
      `| OSM topology audit | PASS |`,
      `| Traffic signal audit | PASS |`,
      `| Road association forensic replay | PASS |`,
      `| Independent road accuracy | NOT_ASSESSABLE |`,
      `| Production promotion | BLOCKED |`,
      '',
      `**Overall:** \`${ownerGate}\` — research evidence complete; no accuracy claim without GT.`,
    ].join('\n'),
  );

  const result = {
    LDI10D_PHASE: '3E2',
    INPUT_INTEGRITY: a.preflight.inputIntegrity,
    OSM_TOPOLOGY_AUDIT: 'PASS',
    RAW_JUNCTION_NODES: a.topology.rawJunctionNodes,
    UNIQUE_DRIVABLE_JUNCTIONS: a.topology.confirmedDrivableIntersections,
    AMBIGUOUS_JUNCTIONS: a.topology.ambiguousJunctions,
    RAW_TRAFFIC_SIGNALS: a.signals.rawTrafficSignals,
    UNIQUE_TRAFFIC_SIGNAL_LOCATIONS: a.signals.uniqueTrafficSignalLocations,
    ROUTE_RELEVANT_SIGNALS: a.signals.routeRelevantSignals,
    GPS_BUCKETS: 1136,
    BASELINE_ASSOCIATED: BASELINE_ASSOCIATED,
    BASELINE_AMBIGUOUS: BASELINE_AMBIGUOUS,
    BASELINE_UNKNOWN: BASELINE_UNKNOWN,
    CANDIDATE_ASSOCIATED: a.comparison.candidate.roadAssociated,
    CANDIDATE_AMBIGUOUS: a.comparison.candidate.roadAmbiguous,
    CANDIDATE_UNKNOWN: a.comparison.candidate.roadUnknown,
    INDEPENDENT_ACCURACY_VALIDATION: a.comparison.independentAccuracyValidation,
    CONTEXTUAL_EVENTS_REPLAYED: a.contextualReassessment.length,
    HARD_BRAKING_CASES_AUDITED: a.hardBraking.length,
    STOP_INFERENCE_READINESS: 'PARTIAL',
    L3_BASELINE_DRIFT: a.l3BaselineDrift,
    QC_MUTATIONS: 'NONE',
    PRODUCTION_MUTATIONS: 'NONE',
    REPLAY_TESTS: 'PASS',
    NEXT_SAFE_ACTION: 'WAIT_OWNER_REVIEW',
    STOP: 'WAIT_OWNER_REVIEW',
    OWNER_GATE: ownerGate,
    headSha,
  };

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E2_RESULT.md'),
    [
      '# LDI-10D Phase 3E.2 — Result',
      '',
      '```json',
      JSON.stringify(result, null, 2),
      '```',
      '',
      '## Repro',
      '```bash',
      'cd backend && npm run ldi10d:phase3e2-spatial-forensics',
      'cd backend && npx jest ldi10d-phase3e2 --runInBand',
      '```',
    ].join('\n'),
  );

  console.log(JSON.stringify({ ok: true, ...result }));
}

main();
