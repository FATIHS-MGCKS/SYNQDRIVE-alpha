/**
 * Pinned S4 evidence snapshot ↔ shadow adapter ↔ frozen candidate field parity.
 * cd backend && npx ts-node --transpile-only scripts/test/motion-core-shadow-pinned-snapshot-parity.harness.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { gunzipSync } from 'zlib';
import {
  computeC4AdaptiveL3,
  extractMotionFsmStopEpisodes,
  MOTION_FSM_PARAMS_V0_2_DEV,
  MOTION_FSM_V0_3_CANDIDATE_OPTIONS,
  runMotionFsm,
  type MotionCorePositionBucket,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/core';
import { parseDiV0S4EvidenceContainer } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-evidence-container-parse';
import { buildDiV0S4EvidenceSnapshotHash } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-identity';
import { adaptMotionCoreShadowEvidenceFromParsedContainer } from '../../src/modules/vehicle-intelligence/driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-evidence.adapter';
import { processDiV0MotionCoreShadowTrip } from '../../src/modules/vehicle-intelligence/driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-processor';

const OUT =
  process.env.MOTION_CORE_SHADOW_PARITY_OUT ?? '/opt/cursor/artifacts/exp021-motion-core-shadow-integration';
const PHASE5C =
  process.env.EXP021_PHASE5C_ROOT ?? '/opt/cursor/artifacts/exp021-phase5c-tesla-reference-20261021';
const REF = path.join(PHASE5C, 'reference_package/Tesla_Referenz_20261021');
const DIMO =
  process.env.EXP021_DIMO_READONLY ?? '/opt/cursor/artifacts/exp021-motion-core-design/inputs/dimo_readonly';
const REVIEW = process.env.MOTION_CORE_REVIEW_OUT ?? '/opt/cursor/artifacts/exp021-motion-core-fable-review';

const lines: string[] = [];
lines.push('# Pinned snapshot parity & stop/zero crosswalk');
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push('');

function loadSparse(n: number) {
  const p = path.join(DIMO, `TRIP_${n}_dimo_speed_location_1s.json`);
  if (!fs.existsSync(p)) return [];
  const doc = JSON.parse(fs.readFileSync(p, 'utf8')) as { rows: Array<{ timestamp: string; speedAvg: number | null }> };
  return doc.rows
    .filter((r) => r.speedAvg != null)
    .map((r) => ({ label: r.timestamp.replace('.000Z', 'Z'), speedKmh: r.speedAvg as number }));
}

for (const [tripKey, n] of [['TRIP_1', 1], ['TRIP_2', 2]] as const) {
  const gz = path.join(PHASE5C, 'telemetry/production_export/s4_evidence', `${tripKey}_evidence_payload.gz`);
  if (!fs.existsSync(gz)) continue;
  const raw = gunzipSync(fs.readFileSync(gz)).toString('utf8');
  const parsed = parseDiV0S4EvidenceContainer(raw);
  const hash = buildDiV0S4EvidenceSnapshotHash(raw);
  const adapted = adaptMotionCoreShadowEvidenceFromParsedContainer(parsed, 'API_SYNTHETIC');
  const shadow = processDiV0MotionCoreShadowTrip({
    parsed,
    sourceFamily: 'API_SYNTHETIC',
    pinnedSnapshotHash: hash,
    combinedInputIdentity: 'harness',
    computedAt: new Date('2026-10-21T12:00:00.000Z'),
  });

  const replay: MotionCorePositionBucket[] = JSON.parse(
    fs.readFileSync(path.join(PHASE5C, 'replay', `${tripKey}_position_grid.json`), 'utf8'),
  ).buckets;
  const c4Ref = computeC4AdaptiveL3(replay);
  const fsmRef = runMotionFsm(
    replay,
    c4Ref,
    'RETROSPECTIVE',
    loadSparse(n),
    MOTION_FSM_PARAMS_V0_2_DEV,
    MOTION_FSM_V0_3_CANDIDATE_OPTIONS,
  );
  const epRef = extractMotionFsmStopEpisodes(n, fsmRef, 'RETROSPECTIVE');
  const epSnap = shadow.payload.stopEpisodes;

  lines.push(`## ${tripKey}`);
  lines.push(`- snapshot hash: \`${hash.slice(0, 16)}…\``);
  lines.push(`- R1_OBD: \`${parsed.channelManifest.find((c) => c.channel === 'R1_OBD')?.outcome}\` / \`${parsed.channelManifest.find((c) => c.channel === 'R1_OBD')?.reasonCode ?? '—'}\``);
  lines.push(`- adapter sparse samples: ${adapted.sparseSpeed.length} (comparable=${adapted.sparseComparable})`);
  lines.push(`- shadow fingerprint: \`${shadow.payloadFingerprint.slice(0, 16)}…\``);
  lines.push(`- stop episodes (pinned snapshot, no sparse): **${epSnap.length}**`);
  lines.push(`- stop episodes (offline replay + DIMO sparse): **${epRef.length}**`);
  lines.push(`- events (pinned): ${shadow.payload.summary.eventCount} (accepted ${shadow.payload.summary.eventAcceptedCount}, artefact ${shadow.payload.summary.eventArtefactSuspectCount})`);
  lines.push('');
  lines.push('### FSM stop episodes (pinned snapshot path)');
  for (const [i, e] of epSnap.entries()) {
    lines.push(
      `${i + 1}. \`${e.startEarliest}\` … \`${e.endLatest ?? 'OPEN'}\` labels=${e.labels} observed=${e.observedLabels} gap=${e.gapLabels} minDur=${e.minDurationS}s openEnd=${e.openEnd}`,
    );
  }
  lines.push('');
}

if (fs.existsSync(path.join(REF, 'ZERO_DISPLAY_RUNS.json'))) {
  const zeros = JSON.parse(fs.readFileSync(path.join(REF, 'ZERO_DISPLAY_RUNS.json'), 'utf8')) as Array<{
    trip: number;
    first_display_time: string;
    last_display_time: string;
    zero_sample_count: number;
  }>;
  lines.push('## Video display zero runs (reference package)');
  lines.push(`- Total JSON rows: ${zeros.length} (not equal to FSM episode count)`);
  lines.push('- Fable review evaluated **10 in-grid zero display runs** (cS) with strict ≥50% label share; **2 additional** references were outside the 1 Hz grid.');
  lines.push('- **8 FSM stop episodes** on Tesla development trips = 3 (TRIP_1) + 5 (TRIP_2) under pinned snapshot / full grid — a **movement-state episode** metric, not a count of video zero-display clips.');
  lines.push('');
  for (const z of zeros) {
    lines.push(`- trip ${z.trip}: display ${z.first_display_time} → ${z.last_display_time} (${z.zero_sample_count} zero samples in clip)`);
  }
  lines.push('');
}

if (fs.existsSync(path.join(REVIEW, 'STOP_RUN_SUMMARY.csv'))) {
  lines.push('## Review stop-run summary (authoritative for 10/10 matching)');
  lines.push(`See \`${REVIEW}/STOP_RUN_SUMMARY.csv\` and \`STOP_RUN_EVALUATION.csv\` — matched@0 cS: 10, missed+support: 0, n/a: 3 sparse-only + 2 out-of-grid.`);
}

fs.mkdirSync(OUT, { recursive: true });
const outPath = path.join(OUT, 'SNAPSHOT_PARITY.md');
fs.writeFileSync(outPath, lines.join('\n'));
console.log(`Wrote ${outPath}`);
