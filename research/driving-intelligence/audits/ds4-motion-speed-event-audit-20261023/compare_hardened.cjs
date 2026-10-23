#!/usr/bin/env node
// Offline replay of the actual #2134 processor; no provider/DB calls or runtime changes.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const repo = path.resolve(__dirname, '../../../..');
const pkg = path.resolve(__dirname, '../ds4-motion-tiguan-20261022-compact/DS4_Motion_Tiguan_CURSOR_COMPACT');
const di = 'backend/src/modules/vehicle-intelligence/driving-intelligence';
const productSha = 'f95420593ecae98d54d1d3185476c66427d2aede';
const read = (rel) => JSON.parse(fs.readFileSync(path.join(pkg, rel), 'utf8'));
const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
// Every runtime input to this replay must be byte-identical to the reviewed product SHA.
execFileSync('git', ['diff', '--exit-code', productSha, '--', di], { cwd: repo });
require(path.join(repo, 'backend/node_modules/ts-node')).register({
  transpileOnly: true, project: path.join(repo, 'backend/tsconfig.json'),
});
const { parseDiV0S4EvidenceContainer } = require(path.join(repo, di, 's4a-foundation/di-v0-s4a-evidence-container-parse.ts'));
const { processDiV0MotionCoreShadowTrip } = require(path.join(repo, di, 'motion-core-shadow-worker/di-v0-motion-core-shadow-processor.ts'));
const frozenCore = path.join(pkg, di, 'core/kinematics');
const { computeC4AdaptiveL3 } = require(path.join(frozenCore, 'c4-adaptive-l3.ts'));
const { detectMotionManoeuvreEvents, MOTION_CORE_EVENT_GUARDS_V0_1_DEV, MOTION_EVENT_V0_2_CANDIDATE_OPTIONS } = require(path.join(frozenCore, 'motion-event-detector.ts'));
const { evaluateGates, ENVELOPE } = require('./event_quality_research.cjs');
const persisted = read('evaluation/snapshots/di_v0_motion_core_shadow_payload.json');
const grid = read('evaluation/snapshots/position_grid_verified.json');
const provenance = read('evaluation/PROVENANCE_MANIFEST.json');
const pin = provenance.trip_identity.di_artifacts.pinned_snapshot_hash;
const evidenceFile = path.join(pkg, 'evaluation/snapshots/di_v0_s4_evidence_container.bin');
const parsed = parseDiV0S4EvidenceContainer(fs.readFileSync(evidenceFile, 'utf8'));
assert.equal(parsed.snapshotHash, pin);
assert.equal(parsed.tripId, provenance.trip_identity.trip.id);
const hardened = processDiV0MotionCoreShadowTrip({
  parsed, sourceFamily: 'RUPTELA_R1', pinnedSnapshotHash: pin,
  combinedInputIdentity: parsed.combinedInputIdentity, computedAt: new Date('2026-10-23T00:00:00Z'),
}).payload;
const frozen = computeC4AdaptiveL3(grid);
const frozenEvents = detectMotionManoeuvreEvents(0, frozen, 'C4_ADAPTIVE_L3', MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities, MOTION_EVENT_V0_2_CANDIDATE_OPTIONS);
for (const [i, event] of frozenEvents.entries()) {
  for (const field of ['kind', 'startLabel', 'endLabel', 'startSpeedKmh', 'endSpeedKmh', 'deltaKmh', 'quality']) {
    assert.deepEqual(event[field], persisted.events[i][field], `historical event ${i} ${field}`);
  }
}
assert.equal(frozenEvents.length, 21);
assert.equal(frozen.filter((s) => s.valueKmh != null).length, 1916);
assert.equal(hardened.events.length, 20);
assert.equal(hardened.summary.speedNumericCount, 1908);
assert.equal(hardened.stopEpisodes.length, 11);
const key = (e) => `${e.kind}|${e.startLabel}|${e.endLabel}`;
const historicalByKey = new Map(persisted.events.map((e) => [key(e), e]));
for (const event of hardened.events) assert.deepEqual(event, historicalByKey.get(key(event)));
const retained = new Set(hardened.events.map(key));
const removed = persisted.events.filter((e) => !retained.has(key(e)));
assert.deepEqual(removed.map(key), ['ACCELERATION|2026-10-22T18:49:12Z|2026-10-22T18:49:18Z']);
const historicalSpeeds = new Map(persisted.speeds.map((s) => [Date.parse(s.bucketLabelUtc), s.speedKmh]));
const hardenedSpeeds = new Map(hardened.speeds.map((s) => [Date.parse(s.bucketLabelUtc), s.speedKmh]));
const lostLabels = persisted.speeds.filter((s) => s.speedKmh != null && hardenedSpeeds.get(Date.parse(s.bucketLabelUtc)) == null).map((s) => s.bucketLabelUtc);
assert.equal(lostLabels.length, 8);
for (const [t, v] of historicalSpeeds) if (v != null && hardenedSpeeds.get(t) != null) assert.equal(hardenedSpeeds.get(t), v);
// RFC-4180 cells; preserve empty video speed as missing, never Number('') = zero.
function csv(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const cells = (line) => {
    const result = []; let value = ''; let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
      else if (ch === ',' && !quoted) { result.push(value); value = ''; } else value += ch;
    }
    result.push(value); return result;
  };
  const header = cells(lines.shift());
  return lines.map((line) => Object.fromEntries(cells(line).map((v, i) => [header[i], v])));
}
const referenceFile = path.join(pkg, 'evaluation/reference/TIGUAN_2026-10-22_1Hz.csv');
const reference = csv(referenceFile).map((r) => ({
  label: r.time_utc_estimated, t: Date.parse(r.time_utc_estimated),
  speed: r.speed_display_kmh.trim() === '' ? null : Number(r.speed_display_kmh),
}));
assert.equal(reference.length, 1464);
assert.equal(new Set(reference.map((r) => r.t)).size, 1464);
const readable = reference.filter((r) => r.speed != null && Number.isFinite(r.speed));
assert.equal(readable.length, 1417);
function metrics(rows, speeds) {
  const errors = rows.filter((r) => speeds.get(r.t) != null).map((r) => speeds.get(r.t) - r.speed);
  const abs = errors.map(Math.abs).sort((a, b) => a - b);
  const n = errors.length;
  const percentile = (p) => { const x = (n - 1) * p; const lo = Math.floor(x); return abs[lo] + (abs[Math.ceil(x)] - abs[lo]) * (x - lo); };
  return { n, maeKmh: abs.reduce((a, b) => a + b, 0) / n, medianAbsKmh: percentile(0.5),
    p95AbsKmh: percentile(0.95), rmseKmh: Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / n),
    biasKmh: errors.reduce((a, b) => a + b, 0) / n, maxAbsKmh: abs[n - 1] };
}
const coverage = (speeds) => ({ referenceRows: reference.length, readableReference: readable.length,
  missingReference: reference.length - readable.length,
  pairedReadable: readable.filter((r) => speeds.get(r.t) != null).length,
  missingEstimateOnReadable: readable.filter((r) => speeds.get(r.t) == null).length });
const common = readable.filter((r) => historicalSpeeds.get(r.t) != null && hardenedSpeeds.get(r.t) != null);
const videoFirst = Date.parse(provenance.trip_identity.video_reference_window_utc.first);
const videoLast = Date.parse(provenance.trip_identity.video_reference_window_utc.last);
const researchRows = (payload) => payload.speeds.map((s) => ({ label: s.bucketLabelUtc, quality: s.quality, flags: s.flags }));
const gateFor = (payload) => evaluateGates(payload.events, researchRows(payload), grid).map((g) => ({
  eventKey: `${g.kind}|${g.start}|${g.end}`, reasons: { G1: g.G1_envelope, G2: g.G2_timingSupport },
  experimentalFlag: g.K_E_combined_uncertain,
  videoCoverage: Date.parse(g.start) >= videoFirst && Date.parse(g.end) <= videoLast ? 'VIDEO_COVERED' : 'NOT_VIDEO_COVERED',
}));
const originalGate = gateFor(persisted), hardenedGate = gateFor(hardened);
const windows = csv(path.join(pkg, 'evaluation/reference/TIGUAN_2026-10-22_analysis_windows.csv'));
const windowMatches = windows.map((w) => {
  const kind = w.type === 'SPEED_INCREASE' ? 'ACCELERATION' : 'DECELERATION';
  const start = Date.parse(w.start_time_local_estimated), end = Date.parse(w.end_time_local_estimated);
  const match = (events) => events.filter((e) => e.kind === kind && Date.parse(e.startLabel) <= end && Date.parse(e.endLabel) >= start).map(key);
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString(), kind,
    original: match(persisted.events), hardened: match(hardened.events),
    scope: 'Selected window direction/overlap only; not full-trip precision/recall or pedal evidence' };
});
const grid19 = read('evaluation/snapshots/TIGUAN_20261019_POSITION_GRID.json').buckets;
const currentCore = require(path.join(repo, di, 'core/index.ts'));
const frozen19 = computeC4AdaptiveL3(grid19), hardened19 = currentCore.computeC4AdaptiveL3(grid19);
assert.deepEqual(hardened19.map((s) => [s.label, s.valueKmh, s.quality]), frozen19.map((s) => [s.label, s.valueKmh, s.quality]));
const events19 = (c4) => currentCore.detectMotionManoeuvreEvents(0, c4, 'C4_ADAPTIVE_L3', currentCore.MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities, currentCore.MOTION_EVENT_V0_2_CANDIDATE_OPTIONS);
assert.deepEqual(events19(hardened19), events19(frozen19));
const out = {
  schema: 'DS4_HARDENED_COMPARISON_V1',
  source: { originalReplaySha: 'dea2555bb746550c632f4315dabe08b9481be0df', productRuntimeSha: productSha,
    runtimeDiffAgainstProductSha: 'EMPTY', pin, combinedInputIdentity: parsed.combinedInputIdentity,
    evidenceSha256: sha256(evidenceFile), referenceSha256: sha256(referenceFile),
    originalVersions: persisted.contract.algorithmVersions, hardenedVersions: hardened.contract.algorithmVersions },
  primaryShiftS: 0,
  original: { events: persisted.events.length, numericC4: 1916, stops: persisted.stopEpisodes.length,
    coverage: coverage(historicalSpeeds), speed: metrics(readable, historicalSpeeds) },
  hardened: { ...hardened.summary, coverage: coverage(hardenedSpeeds), speed: metrics(readable, hardenedSpeeds) },
  commonReadableSeconds: { n: common.length, original: metrics(common, historicalSpeeds), hardened: metrics(common, hardenedSpeeds),
    note: 'Shared numeric values unchanged. Reduced raw MAE includes withholding eight quarantined seconds, not more accurate common values.' },
  preservation: { removedEventKeys: removed.map(key), unchangedRetainedEvents: hardened.events.length, lostNumericLabels: lostLabels },
  offlineGates: { status: 'EXPERIMENTAL_NOT_CUSTOMER_CLASSIFICATION', parameters: ENVELOPE,
    original: originalGate, hardened: hardenedGate,
    excludedAlreadyRemovedBy2134: originalGate.filter((g) => g.experimentalFlag && !retained.has(g.eventKey)).map((g) => g.eventKey),
    remainingHypothesesOnHardened: hardenedGate.filter((g) => g.experimentalFlag),
    note: 'Flags are hypotheses, not proven detector improvements. G2 label-gap branch does not detect missing positions in a continuous 1 Hz grid.' },
  selectedReferenceWindows: windowMatches,
  olderDrivePreservation: { scope: 'Tiguan-19 position-only C4/event core; no independent video claim',
    labels: grid19.length, numericC4: hardened19.filter((s) => s.valueKmh != null).length,
    events: events19(hardened19).length, valueQualityAndEventParity: true,
    experimentalFlagged: evaluateGates(events19(hardened19), hardened19, grid19).filter((g) => g.K_E_combined_uncertain).length },
  limits: ['single_partial_development_drive', 'tacho_not_calibrated_ground_truth', 'no_1904_video_reference',
    'no_new_speed_estimator_or_event_detector', 'no_production_or_authenticated_mapbox_execution'],
};
fs.writeFileSync(path.join(__dirname, 'analysis/hardened_comparison.json'), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ original: out.original, hardened: out.hardened, commonReadableSeconds: out.commonReadableSeconds,
  removed: out.preservation.removedEventKeys, remainingHypotheses: out.offlineGates.remainingHypothesesOnHardened }, null, 2));
