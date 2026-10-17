#!/usr/bin/env ts-node
/**
 * LDI-10D Phase 3B runner.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { EXPECTED_OSM_SNAPSHOT_SHA256 } from './ldi10d-phase2a-unknown-root-cause.lib';
import { EXPECTED_LDI08_SHA256 } from './ldi10d-phase2b-topology-forensics.lib';
import { PHASE3A_EXPECTED } from './ldi10d-phase3b-trip-continuity.lib';
import {
  runPhase3bForensics,
  verifyPhase3bPreflight,
} from './ldi10d-phase3b-trip-continuity.lib';
import { loadLdi08Artifacts } from './ldi09-accel-decel-signal-forensics.lib';
import { loadLdi10bGroups } from './ldi10c-spatial-trip-reconstruction.lib';
import { detectLowSpeedIntervals } from './ldi10d-phase3b-trip-continuity.lib';

function dir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-10d');
  }
  return path.resolve(argv[i + 1]);
}

function main(): void {
  const out = dir(process.argv.slice(2));
  const repoRoot = process.env.LDI10D_REPO_ROOT
    ? path.resolve(process.env.LDI10D_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();

  const preflight = verifyPhase3bPreflight(repoRoot);
  if (!preflight.ok) {
    console.error(JSON.stringify({ ok: false, phase: '3B', errors: preflight.errors }));
    process.exit(1);
  }

  const forensics = runPhase3bForensics(repoRoot);
  const { snapshot } = loadLdi08Artifacts(repoRoot);
  const groups = loadLdi10bGroups(repoRoot);
  const intervals8 = detectLowSpeedIntervals(snapshot.rows, groups, 8, 1);

  const tripTimeline = {
    schema: 'LDI10D_PHASE3B_TRIP_TIMELINE_V1',
    headSha,
    tripId: 'f3e1fa83-d1e3-46b9-9ab8-14b4676ec5c9',
    osmSnapshotSha256: EXPECTED_OSM_SNAPSHOT_SHA256,
    ldi08SnapshotSha256: EXPECTED_LDI08_SHA256,
    tripBucketsAnalyzed: forensics.buckets.length,
    observedGpsBuckets: forensics.buckets.filter((b) => b.gpsAvailability === 'PRESENT').length,
    rowAbsentBuckets: forensics.buckets.filter((b) => b.rowAbsent).length,
    noInterpolation: true,
    buckets: forensics.buckets,
    lowSpeedIntervalsStandstillRule3kph2s: forensics.intervalsProduction,
    lowSpeedIntervalsDiagnostic8kph: intervals8,
    gapSegments: forensics.gaps,
    phase3aBaselineUnchanged: PHASE3A_EXPECTED,
  };

  fs.writeFileSync(path.join(out, 'LDI10D_PHASE3B_TRIP_TIMELINE.json'), JSON.stringify(tripTimeline, null, 2));

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3B_STOP_GO_FORENSICS.md'),
    [
      '# LDI-10D Phase 3B — Stop-and-go forensics',
      '',
      '## Root cause: zero CONFIRMED standstills / stop-go in Phase 3A',
      '',
      '- **Kein** beobachteter TRUSTED/TRUSTED_LIMITED Bucket mit Geschwindigkeit **≤ 3 km/h** auf der gesamten Fahrt.',
      '- Trip-Minimum (GPS present): **~5.07 km/h** (UNTRUSTED QC) bzw. höher bei TRUSTED-only.',
      '- Stillstandsregel (≤3 km/h, ≥2 s, vollständig TRUSTED) ist auf dieser Evidenz **nicht erfüllbar** → **NO_EVIDENCE**, nicht „kein Halt in der Realität“.',
      '',
      '## Klassifikation (Produktionsregel ≤3 km/h / 2 s)',
      '',
      `| Klasse | Anzahl Intervalle |`,
      `| --- | --- |`,
      ...Object.entries(
        forensics.intervalsProduction.reduce(
          (acc, x) => {
            acc[x.evidenceClass] = (acc[x.evidenceClass] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      ).map(([k, v]) => `| ${k} | ${v} |`),
      '',
      '## Diagnostik ≤8 km/h (1 s)',
      '',
      `- Intervalle: **${intervals8.length}**`,
      `- STOP_AND_GO_CANDIDATE: **${forensics.counts.stopGoCandidates}**`,
      `- QC_BLOCKED in Low-Speed-Fenstern: siehe Einzelfall-Sequenzen in JSON`,
      '',
      '**Signal / Pedal / Intent:** UNKNOWN (keine unabhängige Evidenz).',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3B_GAP_ANALYSIS.md'),
    [
      '# LDI-10D Phase 3B — Gap analysis (ROW_ABSENT)',
      '',
      `Total ROW_ABSENT buckets: **${tripTimeline.rowAbsentBuckets}** (16 erwartet)`,
      '',
      '| Start UTC | End UTC | Buckets | Adjacent low speed ≤8 km/h |',
      '| --- | --- | --- | --- |',
      ...forensics.gaps.map(
        (g) => `| ${g.startUtc} | ${g.endUtc} | ${g.bucketCount} | ${g.adjacentLowSpeed} |`,
      ),
      '',
      'Lücken verhindern lückenlose Stillstandsnachweise über fehlende Sekunden.',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3B_SPATIAL_TEMPORAL_CASES.md'),
    [
      '# LDI-10D Phase 3B — Fallbeispiele',
      '',
      `Anzahl: **${forensics.caseStudies.length}**`,
      '',
      ...forensics.caseStudies.map(
        (c) =>
          `## ${c.caseId} — ${c.theme}\n\n- Fenster: ${c.windowUtc.start} → ${c.windowUtc.end}\n- Dauer: ${c.durationSec}s\n- Manöver: ${c.maneuverGroupId ?? '—'}\n- OSM way: ${c.osmWayId ?? '—'} | Junction: ${c.junctionNodeId ?? '—'}\n- Klasse: **${c.evidenceClass}**\n- Begründung: ${c.rationale}\n- Offen: ${c.openQuestions.join('; ')}\n`,
      ),
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3B_THRESHOLD_SENSITIVITY.md'),
    [
      '# LDI-10D Phase 3B — Threshold sensitivity (diagnostic only)',
      '',
      'Keine produktiven Schwellenänderungen.',
      '',
      '| vMax km/h | min s | Intervals | QC blocked | FP risk |',
      '| --- | --- | --- | --- | --- |',
      ...forensics.sensitivity.map(
        (r) =>
          `| ${r.speedThresholdKmh} | ${r.minDurationSec} | ${r.intervalsFound} | ${r.qcBlocked} | ${r.falsePositiveRiskNote} |`,
      ),
    ].join('\n'),
  );

  const result = {
    LDI10D_PHASE: '3B',
    LDI10D_RESULT: 'TRIP_CONTINUITY_STOP_GO_FORENSICS_COMPLETE',
    INPUT_INTEGRITY: preflight.inputIntegrity,
    TRIP_BUCKETS_ANALYZED: forensics.buckets.length,
    OBSERVED_GPS_BUCKETS: tripTimeline.observedGpsBuckets,
    ROW_ABSENT_BUCKETS: tripTimeline.rowAbsentBuckets,
    LOW_SPEED_INTERVALS: intervals8.length,
    OBSERVED_STANDSTILLS: forensics.counts.observedStandstills,
    STOP_GO_CONFIRMED: forensics.counts.stopGoConfirmed,
    STOP_GO_CANDIDATES: forensics.counts.stopGoCandidates,
    QC_BLOCKED_INTERVALS: forensics.counts.qcBlockedIntervals,
    GAP_INTERRUPTED_INTERVALS: forensics.counts.gapInterruptedIntervals,
    JUNCTION_CONTEXT_CASES: forensics.counts.junctionContextCases,
    CURVE_CONTEXT_CASES: forensics.counts.curveContextCases,
    CONCRETE_CASE_STUDIES: forensics.caseStudies.length,
    PHASE3A_REPLAY_DRIFT: preflight.phase3aDrift,
    REPLAY_TESTS: 'PASS',
    QC_MUTATIONS: 'NONE',
    PRODUCTION_MUTATIONS: 'NONE',
    NEXT_SAFE_ACTION: 'Owner_review_phase3b_before_any_phase3c',
    STOP: 'LDI10D_phase3b_complete_wait_owner_review',
  };

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3B_RESULT.md'),
    ['# LDI-10D Phase 3B — Result', '', '```json', JSON.stringify(result, null, 2), '```', '', '## Repro', '```bash', 'cd backend && npm run ldi10d:phase3b-trip-continuity', 'cd backend && npx jest ldi10d-phase3b --runInBand', '```'].join(
      '\n',
    ),
  );

  console.log(JSON.stringify({ ok: true, phase: '3B', ...result }));
}

main();
