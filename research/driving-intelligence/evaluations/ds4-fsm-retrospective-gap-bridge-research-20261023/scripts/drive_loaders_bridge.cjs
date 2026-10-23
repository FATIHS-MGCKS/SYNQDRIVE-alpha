'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function loadAllDrives({ codeRoot, refEvalRoot, L, core, processDiV0MotionCoreShadowTrip }) {
  const inputs = path.join(refEvalRoot, 'inputs');
  const req = (rel) => require(path.join(codeRoot, 'backend/src/modules/vehicle-intelligence/driving-intelligence', rel));
  const { parseDiV0S4EvidenceContainer } = req('s4a-foundation/di-v0-s4a-evidence-container-parse.ts');
  const { adaptMotionCoreShadowEvidenceFromParsedContainer } = req('motion-core-shadow-worker/di-v0-motion-core-shadow-evidence.adapter.ts');
  const { buildDiV0S4dS1InputFromParsedContainer } = req('s4d-replay/di-v0-s4d-replay-s1.ts');
  const { parseDiV0PositionSnapshot, diV0PositionSnapshotToS1Observations } = req('position-acquisition/di-v0-position-snapshot-parse.ts');
  const { buildDiV0TripSpeedQualityEvidenceFromParsedContainer } = req('trip-speed-quality/di-v0-trip-speed-quality-evidence.ts');
  const { evaluateDiV0SpeedQcInterval } = req('speed-qc/evaluate-di-v0-speed-qc-interval.ts');
  const { DI_V0_SPEED_QC_POLICY_V2 } = req('speed-qc/di-v0-speed-qc-policy.version.ts');
  const { classifyPositionRows } = req('core/position/hold-release.ts');

  function diV0Replay(s1Input) {
    const out = core.computeDiV0TripIntervals(s1Input, {
      versions: core.DEFAULT_DI_V0_VERSION_TUPLE,
      calibration: core.CALIBRATION_UNSET_V0_BUNDLE,
    });
    const map = new Map();
    for (const iv of out.intervals) {
      map.set(L.secOf(iv.intervalStart), {
        speed: iv.estimatedSpeedKmh,
        state: iv.motionState,
        positionState: iv.positionState,
      });
    }
    return { map };
  }

  function loadContainerDrive(id, text, family, refRows) {
    const parsed = parseDiV0S4EvidenceContainer(text);
    const ad = adaptMotionCoreShadowEvidenceFromParsedContainer(parsed, family);
    const s1Full = buildDiV0S4dS1InputFromParsedContainer(parsed, family);
    const proc = processDiV0MotionCoreShadowTrip({
      parsed,
      sourceFamily: family,
      pinnedSnapshotHash: parsed.snapshotHash,
      combinedInputIdentity: parsed.combinedInputIdentity,
      computedAt: new Date('2026-10-23T00:00:00Z'),
    });
    const c4 = core.computeC4AdaptiveL3(ad.buckets);
    const fsm = proc.payload.fsmLabels.map((f) => ({
      label: f.bucketLabelUtc,
      state: f.state,
      evidenceQuality: f.evidenceQuality,
      reason: f.reason,
      speedKmh: f.speedKmh ?? null,
      flags: f.flags ?? [],
    }));
    const di = diV0Replay(s1Full);
    const gridSecs = new Set(ad.buckets.map((b) => L.secOf(b.bucketLabelUtc)));
    const refBySec = new Map(refRows.map((r) => [r.sec, r.ref]));
    const { classes, runs } = L.classifyReference(refRows);
    const rows = refRows.map((r) => ({
      ...r,
      cls: classes.get(r.sec).cls,
      phase: L.phaseOf(refBySec, r.sec),
    }));
    return {
      id,
      buckets: ad.buckets,
      gridSecs,
      mc: { c4, fsm },
      di,
      rows,
      refBySec,
      runs,
    };
  }

  function readInput(rel) {
    const file = path.join(inputs, rel);
    return fs.readFileSync(file);
  }

  function tig22() {
    const ref = L.parseCsv(readInput('tiguan-20261022/reference/TIGUAN_2026-10-22_1Hz.csv').toString('utf8'));
    const refRows = ref.map((r) => ({
      sec: L.secOf(r.time_utc_estimated),
      ref: L.numOrNull(r.speed_display_kmh),
      clip: r.source_clip,
    }));
    const text = readInput('tiguan-20261022/snapshots/di_v0_s4_evidence_container.bin').toString('utf8');
    return loadContainerDrive('TIG22', text, 'RUPTELA_R1', refRows);
  }

  function tesla21(key, tripNo) {
    const joined = L.parseCsv(readInput('tesla-20261021/JOINED_REFERENCE_TABLE.csv').toString('utf8'));
    const rowsForTrip = joined.filter((r) => r.trip === String(tripNo));
    const seen = new Set();
    const refRows = [];
    for (const r of rowsForTrip) {
      const sec = L.secOf(r.bucket_label_utc);
      if (seen.has(sec)) continue;
      seen.add(sec);
      const readable = r.inclusion_flag === 'INCLUDE' && r.speed_status === 'VISIBLE_DISPLAY_VALUE';
      refRows.push({
        sec,
        ref: readable ? L.numOrNull(r.tesla_speed_kmh_primary) : null,
        clip: r.clip,
      });
    }
    refRows.sort((a, b) => a.sec - b.sec);
    const text = zlib.gunzipSync(readInput(`tesla-20261021/s4_evidence/${key}_evidence_payload.gz`)).toString('utf8');
    return loadContainerDrive(`TES21-${tripNo}`, text, 'API_SYNTHETIC', refRows);
  }

  function tesla16() {
    const fx = path.join(codeRoot, 'architecture/drivingintelligence/evidence/ldi-10d/fixtures/tesla-20261016');
    const refJson = JSON.parse(fs.readFileSync(path.join(fx, 'VIDEO_TACHO_REFERENCE.json'), 'utf8'));
    const grid = JSON.parse(fs.readFileSync(path.join(fx, 'TESLA_POSITION_GRID.json'), 'utf8'));
    const snapshotText = fs.readFileSync(path.join(fx, 'POSITION_CHANNEL_SNAPSHOT_V0_1.txt'), 'utf8');
    const refRows = refJson.rows.map((r) => ({
      sec: L.secOf(r.bucketLabelUtc),
      ref: r.tachoKmh == null ? null : Number(r.tachoKmh),
      clip: r.videoFile,
    }));
    const buckets = grid.buckets.map((b) => ({
      bucketLabelUtc: b.bucketLabelUtc,
      availability: b.availability,
      latitude: b.latitude,
      longitude: b.longitude,
    }));
    const material = parseDiV0PositionSnapshot(snapshotText);
    const positions = diV0PositionSnapshotToS1Observations(material);
    const di = diV0Replay({ sourceFamily: 'API_SYNTHETIC', positions, r1Obd: [], nativeEvents: [] });
    const c4 = core.computeC4AdaptiveL3(buckets);
    const { withImplausibleLegEndpointsQuarantined } = req('core/kinematics/leg-consistency.ts');
    const kin = withImplausibleLegEndpointsQuarantined(buckets);
    const fsm = core
      .runMotionFsm(
        kin,
        c4,
        'RETROSPECTIVE',
        null,
        core.MOTION_FSM_PARAMS_V0_2_DEV,
        core.MOTION_FSM_V0_3_CANDIDATE_OPTIONS,
      )
      .map((f) => ({
        label: f.label,
        state: f.state,
        evidenceQuality: f.evidenceQuality,
        reason: f.reason,
        speedKmh: f.speedKmh,
        flags: f.flags ?? [],
      }));
    const gridSecs = new Set(buckets.map((b) => L.secOf(b.bucketLabelUtc)));
    const refBySec = new Map(refRows.map((r) => [r.sec, r.ref]));
    const { classes, runs } = L.classifyReference(refRows);
    const rows = refRows.map((r) => ({
      ...r,
      cls: classes.get(r.sec).cls,
      phase: L.phaseOf(refBySec, r.sec),
    }));
    return { id: 'TES16', buckets, gridSecs, mc: { c4, fsm }, di, rows, refBySec, runs };
  }

  return [tig22(), tesla21('TRIP_1', 1), tesla21('TRIP_2', 2), tesla16()];
}

module.exports = { loadAllDrives };
