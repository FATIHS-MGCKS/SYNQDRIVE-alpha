#!/usr/bin/env node
'use strict';
/**
 * Read-only per-second C4 provenance traces (TES16 + TIG22). Uses pinned DI code via --code-root.
 * Writes TES16_TRACE.csv, TIG22_TRACE.csv, counterfactual_summary.json under outputs/.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const evalAccel = path.resolve(__dirname, '../../ds4-accel-brake-video-reference-20261023');
const speedEval = path.resolve(evalAccel, '../ds4-speed-video-reference-20261023');
const outRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const thisRepo = path.resolve(outRoot, '../../../..');
const codeRoot = path.resolve(opt('--code-root', thisRepo));
const expectSha = opt('--expect-sha', '579ee8b2fed06593d7d2aa57cffb6036dbf53a24');

const DI = 'backend/src/modules/vehicle-intelligence/driving-intelligence';
const codeSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: codeRoot }).toString().trim();
const diDirty = execFileSync('git', ['status', '--porcelain', '--', DI], { cwd: codeRoot }).toString().trim();
if (diDirty) throw new Error(`DI not clean in ${codeRoot}`);
const diDiff = execFileSync('git', ['diff', expectSha, 'HEAD', '--', DI], { cwd: codeRoot }).toString();
if (diDiff.length) throw new Error(`DI differs from production SHA ${expectSha}`);

require(path.join(codeRoot, 'backend/node_modules/ts-node')).register({
  transpileOnly: true,
  project: path.join(codeRoot, 'backend/tsconfig.json'),
});
const req = (rel) => require(path.join(codeRoot, DI, rel));
const core = req('core/index.ts');
const L = require(path.join(speedEval, 'scripts/eval_lib.cjs'));
const R = require(path.join(evalAccel, 'scripts/replay_event_eval.cjs'));

const {
  computeC4AdaptiveL3,
  replayFrozenL3OnGrid,
  robustPathSlopeC1,
  detectTimingJitterSuspectLegs,
  detectPositionOutliers,
  detectImplausibleOneSecondLegEndpointLabels,
  detectImplausibleOneSecondLegStartLabels,
  bucketLabelPlusSeconds,
  presentBucketMap,
  orderMotionCoreGrid,
  haversineMeters,
  parseBucketLabelMs,
} = core;
const { parseDiV0S4EvidenceContainer } = req('s4a-foundation/di-v0-s4a-evidence-container-parse.ts');
const { buildDiV0TripSpeedQualityEvidenceFromParsedContainer } = req('trip-speed-quality/di-v0-trip-speed-quality-evidence.ts');

const outDir = path.join(outRoot, 'outputs');
fs.mkdirSync(outDir, { recursive: true });

function legM(a, b) {
  if (!a?.latitude || !b?.latitude) return null;
  return Math.round(haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude) * 10) / 10;
}

function legSpeedKmh(distM, dtS) {
  if (distM == null || dtS <= 0) return null;
  return Math.round((distM / dtS) * 3.6 * 10) / 10;
}

function calendarGapS(labA, labB) {
  return Math.round((parseBucketLabelMs(labB) - parseBucketLabelMs(labA)) / 1000);
}

/** Offline CF: C1 slopes only across consecutive present 1 Hz labels (no bridging absent seconds). */
function counterfactualC1NoGapBridge(buckets, rejected) {
  const ordered = orderMotionCoreGrid(buckets);
  const pm = presentBucketMap(ordered);
  for (const lab of rejected) pm.delete(lab);
  const labels = [...pm.keys()].sort();
  const idx = new Map(labels.map((l, i) => [l, i]));
  const half = 2;
  const rows = new Map();
  for (const lab of labels) {
    const center = pm.get(lab);
    if (!center) { rows.set(lab, null); continue; }
    const pts = [];
    for (let k = -half; k <= half; k++) {
      const b = pm.get(bucketLabelPlusSeconds(lab, k));
      if (b) pts.push({ k, bucket: b });
    }
    if (pts.length < 3) { rows.set(lab, null); continue; }
    const slopes = [];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const ij = idx.get(pts[j].bucket.bucketLabelUtc) - idx.get(pts[i].bucket.bucketLabelUtc);
        if (ij !== pts[j].k - pts[i].k) continue;
        const dt = pts[j].k - pts[i].k;
        let dist = 0;
        for (let t = i; t < j; t++) dist += legM(pts[t].bucket, pts[t + 1].bucket) ?? 0;
        slopes.push(dist / dt);
      }
    }
    rows.set(lab, slopes.length ? Math.round(median(slopes) * 3.6 * 10) / 10 : null);
  }
  return rows;
}

function median(v) {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function c4DecisionPath(c4, l3, c1) {
  if (!c4) return 'UNAVAILABLE';
  if (c4.quality === 'OUTLIER_REJECTED') return 'OUTLIER_REJECTED';
  if (c4.quality === 'FROZEN_POSITION') return 'FROZEN_POSITION';
  if ((c4.flags || []).includes('L3_DIRECT')) return 'L3_DIRECT';
  if ((c4.flags || []).includes('L3_LEG_TIMING_SUSPECT_FALLBACK_ROBUST')) return 'C1_TIMING_JITTER_FALLBACK';
  if ((c4.flags || []).includes('L3_SUPPORT_MISSING_FALLBACK_ROBUST')) return 'C1_SPARSE_FALLBACK';
  return 'OTHER';
}

function buildTraceRows(drive, window, opts) {
  const { buckets, sourceFamily, refBySec, obdBySec, gridMetaBySec } = opts;
  const ordered = orderMotionCoreGrid(buckets);
  const pmAll = presentBucketMap(ordered);
  const outliers = detectPositionOutliers(ordered);
  const implausibleEnd = detectImplausibleOneSecondLegEndpointLabels(ordered);
  const blockedStarts = detectImplausibleOneSecondLegStartLabels(ordered);
  const rejected = new Set([...outliers.keys(), ...implausibleEnd]);
  const pm = presentBucketMap(ordered);
  for (const lab of rejected) pm.delete(lab);
  const suspect = detectTimingJitterSuspectLegs(ordered);
  const c4 = computeC4AdaptiveL3(buckets);
  const l3 = replayFrozenL3OnGrid(buckets, { sourceFamily });
  const c1Map = new Map(robustPathSlopeC1(buckets, { rejectedLabels: rejected, blockedLegStartLabels: blockedStarts }).map((s) => [s.label, s]));
  const cfMap = counterfactualC1NoGapBridge(buckets, rejected);
  const events = core.detectMotionManoeuvreEvents(0, c4, 'C4_ADAPTIVE_L3', core.MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities, core.MOTION_EVENT_V0_2_CANDIDATE_OPTIONS);

  const rows = [];
  for (let sec = window.from; sec <= window.to; sec++) {
    const lab = L.labelOf(sec * 1000);
    const b = ordered.find((x) => x.bucketLabelUtc === lab);
    const c = c4.find((x) => x.label === lab);
    const l = l3.find((x) => x.bucketLabelUtc === lab);
    const c1 = c1Map.get(lab);
    const prevLab = bucketLabelPlusSeconds(lab, -1);
    const nextLab = bucketLabelPlusSeconds(lab, 1);
    const prev = pmAll.get(prevLab);
    const next = pmAll.get(nextLab);
    const dtPrev = prev && b?.availability === 'PRESENT' ? calendarGapS(prevLab, lab) : null;
    const dtNext = b?.availability === 'PRESENT' && next ? calendarGapS(lab, nextLab) : null;
    const legPrevM = legM(prev, b);
    const legNextM = legM(b, next);
    const ev = events.find((e) => L.secOf(e.startLabel) <= sec && L.secOf(e.endLabel) >= sec);
    const meta = gridMetaBySec?.get(sec) ?? {};
    rows.push({
      sec_utc: lab,
      video_ref_kmh: refBySec?.get(sec) ?? '',
      bucket_availability: b?.availability ?? 'UNAVAILABLE',
      position_present: b?.availability === 'PRESENT' ? 1 : 0,
      provider_row_count: meta.providerRowCount ?? '',
      temporal_confidence: meta.temporalConfidence ?? 'BUCKET_BOUNDED',
      raw_measurement_utc_ms: 'UNAVAILABLE',
      arrival_persist_utc: 'UNAVAILABLE',
      leg_prev_m: legPrevM ?? '',
      leg_next_m: legNextM ?? '',
      dt_prev_s: dtPrev ?? '',
      dt_next_s: dtNext ?? '',
      chord_speed_prev_kmh: legSpeedKmh(legPrevM, dtPrev ?? 0) ?? '',
      chord_speed_next_kmh: legSpeedKmh(legNextM, dtNext ?? 0) ?? '',
      l3_kmh: l?.l3SpeedKmh ?? '',
      l3_eligible: l?.eligible ? 1 : 0,
      l3_abstention: l?.abstentionReason ?? '',
      c1_kmh: c1?.valueKmh ?? '',
      c1_quality: c1?.quality ?? '',
      c1_support_labels: (c1?.supportLabels ?? []).join('|'),
      c1_support_span_s: c1?.supportSpanS ?? '',
      cf_c1_no_gap_bridge_kmh: cfMap.get(lab) ?? '',
      c4_kmh: c?.valueKmh ?? '',
      c4_quality: c?.quality ?? '',
      c4_path: c4DecisionPath(c, l, c1),
      c4_support_labels: (c?.supportLabels ?? []).join('|'),
      c4_flags: (c?.flags ?? []).join('|'),
      jitter_leg_in: suspect.has(prevLab) ? 1 : 0,
      jitter_leg_out: suspect.has(lab) ? 1 : 0,
      outlier_rejected: rejected.has(lab) && outliers.has(lab) ? 1 : 0,
      leg_endpoint_quarantine: implausibleEnd.has(lab) ? 1 : 0,
      leg_start_blocked: blockedStarts.has(lab) ? 1 : 0,
      obd_compare_kmh: obdBySec?.get(sec) ?? '',
      in_ds4_event: ev ? `${ev.kind}|${ev.startLabel}|${ev.endLabel}` : '',
    });
  }
  return { rows, cfMap, c4, events };
}

function writeCsv(name, rows) {
  const keys = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('|') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  fs.writeFileSync(path.join(outDir, name), [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n') + '\n');
}

// ---------- TES16 ----------
const fx = path.join(thisRepo, 'architecture/drivingintelligence/evidence/ldi-10d/fixtures/tesla-20261016');
const gridJson = JSON.parse(fs.readFileSync(path.join(fx, 'TESLA_POSITION_GRID.json'), 'utf8'));
const refJson = JSON.parse(fs.readFileSync(path.join(fx, 'VIDEO_TACHO_REFERENCE.json'), 'utf8'));
const bucketsTes = gridJson.buckets.map((b) => ({
  bucketLabelUtc: b.bucketLabelUtc,
  availability: b.availability,
  latitude: b.latitude,
  longitude: b.longitude,
}));
const refBySec = new Map(refJson.rows.map((r) => [L.secOf(r.bucketLabelUtc), r.tachoKmh]));
const gridMetaBySec = new Map(gridJson.buckets.map((b) => [L.secOf(b.bucketLabelUtc), b]));
const tesWin = { from: L.secOf('2026-10-16T03:50:12Z'), to: L.secOf('2026-10-16T03:50:26Z') };
const tes = buildTraceRows({ id: 'TES16' }, tesWin, { buckets: bucketsTes, sourceFamily: 'API_SYNTHETIC', refBySec, gridMetaBySec });

// ---------- TIG22 ----------
const dTig = R.loadDrives().find((x) => x.id === 'TIG22');
const containerText = fs.readFileSync(path.join(speedEval, 'inputs/tiguan-20261022/snapshots/di_v0_s4_evidence_container.bin'), 'utf8');
const parsed = parseDiV0S4EvidenceContainer(containerText);
const bundle = buildDiV0TripSpeedQualityEvidenceFromParsedContainer(parsed);
const obdBySec = new Map(bundle.r1Obd.map((r) => [L.secOf(r.bucketLabel), r.speedKmh]));
const refTig = new Map(dTig.refRows.map((r) => [r.sec, r.ref]));
const tigWin = { from: L.secOf('2026-10-22T19:04:20Z'), to: L.secOf('2026-10-22T19:04:55Z') };
const tig = buildTraceRows(dTig, tigWin, { buckets: dTig.buckets, sourceFamily: 'RUPTELA_R1', refBySec: refTig, obdBySec });

writeCsv('TES16_TRACE.csv', tes.rows);
writeCsv('TIG22_TRACE.csv', tig.rows);

const counterfactual = {
  schema: 'DS4_C4_SPEED_ROOT_CAUSE_COUNTERFACTUAL_V1',
  productionCodeSha: expectSha,
  replayCodeSha: codeSha,
  TES16: {
    criticalSeconds: ['2026-10-16T03:50:20Z', '2026-10-16T03:50:22Z', '2026-10-16T03:50:23Z'],
    production_c4_kmh: { '03:50:20': 113.1, '03:50:22': 128.2, '03:50:23': 148.3 },
    cf_c1_no_gap_bridge_kmh: {
      '03:50:20': tes.cfMap.get('2026-10-16T03:50:20Z'),
      '03:50:22': tes.cfMap.get('2026-10-16T03:50:22Z'),
      '03:50:23': tes.cfMap.get('2026-10-16T03:50:23Z'),
    },
    video_ref_kmh: 133,
    note: 'CF suppresses non-consecutive C1 chord pairs across ROW_ABSENT :21',
  },
  TIG22: {
    criticalEvents: [
      { event: 'ACCELERATION 19:04:34–38', start_c4: 5.5, end_c4: 100.1 },
      { event: 'ACCELERATION 19:04:49–52', start_c4: 52.3, end_c4: 142.1 },
    ],
    cf_c1_no_gap_bridge_kmh: {
      '19:04:38': tig.cfMap.get('2026-10-22T19:04:38Z'),
      '19:04:52': tig.cfMap.get('2026-10-22T19:04:52Z'),
    },
    obd_compare_kmh: { '19:04:38': obdBySec.get(L.secOf('2026-10-22T19:04:38Z')), '19:04:52': obdBySec.get(L.secOf('2026-10-22T19:04:52Z')) },
    video_ref: 'UNAVAILABLE (ends 19:03:02Z)',
  },
};
fs.writeFileSync(path.join(outDir, 'counterfactual_summary.json'), JSON.stringify(counterfactual, null, 2) + '\n');

const manifest = {
  generatedAtUtc: new Date().toISOString(),
  productionCodeSha: expectSha,
  replayCodeSha: codeSha,
  tripIds: { TES16: gridJson.tripId, TIG22: parsed.tripId },
  outputs: ['TES16_TRACE.csv', 'TIG22_TRACE.csv', 'counterfactual_summary.json'].map((f) => ({
    file: f,
    sha256: L.sha256File(path.join(outDir, f)),
  })),
};
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('written', outDir, 'code', codeSha, 'production parity', expectSha);
