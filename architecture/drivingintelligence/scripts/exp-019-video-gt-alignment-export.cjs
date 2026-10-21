#!/usr/bin/env node
/**
 * EXP-019 video GT alignment — absolute gap timeline export (READ-ONLY forensic).
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Wallet } = require('ethers');

const SESSION_ID = '2508b697-f101-4155-a0d3-8436e46bb779';
const CALIBRATION_SERIES_ID = '4d79843d-27b1-4bdb-9a2e-b6584545bbf9';
const TOKEN_ID = 187336;
const POLL_MS = [10000, 20000, 30000, 60000];
const SIGNAL_FIELDS = [
  'speed',
  'powertrainCombustionEngineSpeed',
  'powertrainCombustionEngineTPS',
  'obdThrottlePosition',
  'obdEngineLoad',
];
const SIGNAL_SHORT = {
  speed: 'SPEED',
  powertrainCombustionEngineSpeed: 'RPM',
  powertrainCombustionEngineTPS: 'TPS',
  obdThrottlePosition: 'THROTTLE',
  obdEngineLoad: 'ENGINE_LOAD',
};

function loadEnv() {
  for (const envPath of ['/opt/synqdrive/shared/backend.env']) {
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function canonicalTs(ts) {
  return new Date(Date.parse(ts)).toISOString();
}

function bucketKey(field, ts) {
  return `${field}|${canonicalTs(ts)}`;
}

function extractVal(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw && typeof raw === 'object' && 'value' in raw) {
    const v = raw.value;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

async function getDeveloperJwt() {
  const AUTH_URL = 'https://auth.dimo.zone';
  const CLIENT_ID = process.env.DIMO_CLIENT_ID;
  const PRIVATE_KEY = process.env.DIMO_PRIVATE_KEY;
  const DOMAIN = process.env.DIMO_REDIRECT_URI || process.env.DIMO_DOMAIN || 'https://auth.dimo.zone';
  const challenge = await axios.post(`${AUTH_URL}/auth/web3/generate_challenge`, null, {
    params: { client_id: CLIENT_ID, domain: DOMAIN, scope: 'openid email', response_type: 'code', address: CLIENT_ID },
    timeout: 30000,
  });
  const { state, challenge: msg } = challenge.data;
  const wallet = new Wallet(PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`);
  const signature = await wallet.signMessage(msg);
  const submit = await axios.post(
    `${AUTH_URL}/auth/web3/submit_challenge`,
    new URLSearchParams({ client_id: CLIENT_ID, domain: DOMAIN, grant_type: 'authorization_code', state, signature }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 },
  );
  const d = submit.data;
  return d.developer_jwt || d.access_token || d.token;
}

async function getVehicleJwt(devJwt) {
  const url = process.env.DIMO_TOKEN_EXCHANGE_URL || 'https://token-exchange-api.dimo.zone';
  const nft = process.env.DIMO_VEHICLE_NFT_CONTRACT_ADDRESS || '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';
  const resp = await axios.post(
    `${url}/v1/tokens/exchange`,
    { nftContractAddress: nft, privileges: [1, 2, 3, 4, 5], tokenId: TOKEN_ID },
    { headers: { Authorization: `Bearer ${devJwt}`, 'Content-Type': 'application/json' }, timeout: 30000 },
  );
  return resp.data.token || resp.data.access_token || resp.data.jwt;
}

async function gql(jwt, query) {
  const url = process.env.DIMO_TELEMETRY_API_URL || 'https://telemetry-api.dimo.zone/query';
  const resp = await axios.post(url, { query }, {
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    timeout: 120000,
  });
  return resp.data;
}

function buildQuery(tokenId, fields, from, to, interval) {
  const { buildBroadReferenceHistoricalSignalsQuery } = require('./src/modules/vehicle-intelligence/reference-capture/reference-capture-query-builder');
  return buildBroadReferenceHistoricalSignalsQuery(tokenId, fields, from, to, interval);
}

function classifyGap(ms) {
  if (ms > 120000) return '>120s';
  if (ms > 90000) return '>90s';
  if (ms > 60000) return '>60s';
  if (ms > 30000) return '>30s';
  if (ms > 20000) return '>20s';
  if (ms > 10000) return '>10s';
  if (ms > 5000) return '>5s';
  return 'NORMAL';
}

function nearBoundary(ts, boundary, ms) {
  if (!boundary || boundary === 'UNKNOWN') return false;
  return Math.abs(Date.parse(ts) - Date.parse(boundary)) <= ms;
}

function isInTransition(start, end, ranges) {
  const s = Date.parse(start);
  const e = Date.parse(end);
  return ranges.some((r) => s < Date.parse(r.end) && e > Date.parse(r.start));
}

function countByClass(gaps) {
  const c = { NORMAL: 0, '>5s': 0, '>10s': 0, '>20s': 0, '>30s': 0, '>60s': 0, '>90s': 0, '>120s': 0 };
  for (const g of gaps) c[g.classification] = (c[g.classification] || 0) + 1;
  return c;
}

function mergeWindows(windows) {
  const sorted = [...windows].sort((a, b) => Date.parse(a.reviewStartUtc) - Date.parse(b.reviewStartUtc));
  const merged = [];
  for (const w of sorted) {
    const last = merged[merged.length - 1];
    if (last && Date.parse(w.reviewStartUtc) <= Date.parse(last.reviewEndUtc) + 5000) {
      last.reviewEndUtc = new Date(Math.max(Date.parse(last.reviewEndUtc), Date.parse(w.reviewEndUtc))).toISOString();
      last.gapEndUtc = new Date(Math.max(Date.parse(last.gapEndUtc), Date.parse(w.gapEndUtc))).toISOString();
      last.sourceGapIds.push(w.gapId);
      last.gapDurationSeconds = (Date.parse(last.gapEndUtc) - Date.parse(last.gapStartUtc)) / 1000;
      continue;
    }
    merged.push({ ...w, sourceGapIds: [w.gapId] });
  }
  return merged;
}

function rowAt(tsIndex, valuesByTs) {
  const row = { timestampUtc: tsIndex };
  for (const f of SIGNAL_FIELDS) {
    const v = valuesByTs.get(f)?.get(tsIndex);
    if (v != null) row[f] = v;
  }
  return row;
}

(async () => {
  loadEnv();
  const dataDir = process.argv.find((a) => a.startsWith('--data-dir='))?.split('=')[1] || '/tmp/exp-019-settlement';
  const outDir = process.argv.find((a) => a.startsWith('--out-dir='))?.split('=')[1] || '/tmp/exp-019-video-alignment';
  fs.mkdirSync(outDir, { recursive: true });

  const ring = JSON.parse(fs.readFileSync(path.join(dataDir, 'provenance-ring.json'), 'utf8'));
  const meta = JSON.parse(fs.readFileSync(path.join(dataDir, 'session-meta.json'), 'utf8'));
  const report = fs.existsSync('/tmp/exp-016-retry-report.json')
    ? JSON.parse(fs.readFileSync('/tmp/exp-016-retry-report.json', 'utf8'))
    : {};

  const summaries = meta.phaseSummaries || [];
  const phaseEvidence = report.phaseEvidence || [];
  const phaseBoundaries = {};
  for (let i = 0; i < POLL_MS.length; i++) {
    const poll = POLL_MS[i];
    const s = summaries[i];
    const ev = phaseEvidence[i] || {};
    phaseBoundaries[`${poll / 1000}s`] = {
      phaseSequence: i + 1,
      effectivePollIntervalMs: poll,
      phaseRequestedAt: ev.requestedAt || 'UNKNOWN',
      phaseEffectiveAt: ev.effectiveAt || s?.effectiveConfig?.effectiveAt || 'UNKNOWN',
      phaseStartedAt: s?.phaseStartedAt || 'UNKNOWN',
      phaseEndedAt: s?.phaseEndedAt || 'UNKNOWN',
      calibrationPhaseId: s?.calibrationPhaseId || 'UNKNOWN',
    };
  }

  const transitionWindows = ring
    .filter((r) => r.windowClassification === 'TRANSITION_WINDOW')
    .map((r) => ({
      phaseSequence: r.phaseSequence,
      pollIntervalMs: r.pollIntervalMs,
      transitionStart: r.queryFrom,
      transitionEnd: r.queryTo,
      requestStartedAt: r.requestStartedAt,
    }));

  const sessionBoundaries = {
    SESSION_ID,
    CALIBRATION_SERIES_ID,
    SESSION_STARTED_AT_UTC: 'UNKNOWN',
    DRIVE_START_AUTHORIZED_AT_UTC: '2026-09-07T04:31:37.372Z',
    VIDEO_ANCHOR_SERVER_UTC_AT: '2026-09-07T04:30:14.000Z',
    SESSION_COMPLETED_AT_UTC: report.terminalFinalizationAt || '2026-09-07T05:00:20.016Z',
    OBSERVATION_LAYER: 'TRUE_T30_SETTLED',
    EXPORTED_AT_UTC: new Date().toISOString(),
    VIDEO_CLIP_CONTINUITY_REQUIRED: 'NO',
    ABSOLUTE_TIMESTAMP_REQUIRED: 'YES',
    phases: phaseBoundaries,
    transitionWindows,
  };

  const jwt = await getVehicleJwt(await getDeveloperJwt());
  const settledSeries = {};
  const allGaps = [];
  const signalGaps = [];
  const maxGaps = {};
  const valuesByPhase = {};

  for (const pollMs of POLL_MS) {
    const phaseKey = `${pollMs / 1000}s`;
    const phaseMeta = phaseBoundaries[phaseKey];
    const phaseSeq = POLL_MS.indexOf(pollMs) + 1;
    const nativeRecords = ring.filter(
      (r) =>
        r.queryOrigin === 'FAST_LOOP' &&
        r.windowClassification === 'PHASE_NATIVE' &&
        r.phaseSequence === phaseSeq &&
        r.pollIntervalMs === pollMs,
    );
    const transRanges = transitionWindows
      .filter((t) => t.phaseSequence === phaseSeq)
      .map((t) => ({ start: t.transitionStart, end: t.transitionEnd }));

    const valuesByTs = new Map();
    for (const f of SIGNAL_FIELDS) valuesByTs.set(f, new Map());

    for (let i = 0; i < nativeRecords.length; i++) {
      const rec = nativeRecords[i];
      const q = buildQuery(TOKEN_ID, SIGNAL_FIELDS, new Date(rec.queryFrom), new Date(rec.queryTo), rec.requestedInterval || '1s');
      if (!q) continue;
      const result = await gql(jwt, q);
      const rows = (result.data && result.data.signals) || [];
      for (const row of rows) {
        const rowTs = row.timestamp;
        if (!rowTs) continue;
        const ts = canonicalTs(rowTs);
        for (const f of SIGNAL_FIELDS) {
          const v = extractVal(row[f]);
          if (v != null) valuesByTs.get(f).set(ts, v);
        }
      }
      if ((i + 1) % 5 === 0) console.error(`[export] ${phaseKey}: ${i + 1}/${nativeRecords.length}`);
    }
    valuesByPhase[phaseKey] = valuesByTs;

    const speedTs = [...valuesByTs.get('speed').keys()].sort();
    const pairs = [];
    const gaps = [];
    for (let i = 1; i < speedTs.length; i++) {
      const prev = speedTs[i - 1];
      const next = speedTs[i];
      const deltaMs = Date.parse(next) - Date.parse(prev);
      pairs.push({ previousBucketStart: prev, nextBucketStart: next, deltaMs });
      const gap = {
        gapId: `GAP_${pollMs / 1000}_${String(gaps.length + 1).padStart(3, '0')}`,
        phase: phaseKey,
        effectivePollIntervalMs: pollMs,
        previousBucketTimestampUtc: prev,
        nextBucketTimestampUtc: next,
        gapStartUtc: prev,
        gapEndUtc: next,
        gapDurationMs: deltaMs,
        gapDurationSeconds: deltaMs / 1000,
        classification: classifyGap(deltaMs),
        previousBucketIdentity: bucketKey('speed', prev),
        nextBucketIdentity: bucketKey('speed', next),
        previousBucketSignalsAvailable: signalsAt(prev, valuesByTs),
        nextBucketSignalsAvailable: signalsAt(next, valuesByTs),
        transitionContaminated: isInTransition(prev, next, transRanges) ? 'YES' : 'NO',
        phaseBoundaryAdjacent:
          nearBoundary(prev, phaseMeta.phaseStartedAt, 5000) || nearBoundary(next, phaseMeta.phaseEndedAt, 5000)
            ? 'YES'
            : 'NO',
        phaseElapsedAtGapStartMs: Date.parse(prev) - Date.parse(phaseMeta.phaseStartedAt),
        phaseElapsedAtGapEndMs: Date.parse(next) - Date.parse(phaseMeta.phaseStartedAt),
      };
      gaps.push(gap);
    }

    const primaryGaps = gaps.filter((g) => g.transitionContaminated === 'NO');
    allGaps.push(...primaryGaps);
    let maxGap = null;
    for (const g of primaryGaps) {
      if (!maxGap || g.gapDurationMs > maxGap.gapDurationMs) maxGap = g;
    }
    if (maxGap) maxGaps[phaseKey] = { id: `MAX_GAP_${pollMs / 1000}_001`, ...maxGap };

    for (const f of SIGNAL_FIELDS) {
      const ts = [...valuesByTs.get(f).keys()].sort();
      for (let i = 1; i < ts.length; i++) {
        const deltaMs = Date.parse(ts[i]) - Date.parse(ts[i - 1]);
        if (deltaMs < 10000) continue;
        if (isInTransition(ts[i - 1], ts[i], transRanges)) continue;
        signalGaps.push({
          gapId: `${SIGNAL_SHORT[f]}_GAP_${pollMs / 1000}_${String(signalGaps.filter((x) => x.signal === f && x.phase === phaseKey).length + 1).padStart(3, '0')}`,
          signal: f,
          phase: phaseKey,
          gapStartUtc: ts[i - 1],
          gapEndUtc: ts[i],
          gapDurationMs: deltaMs,
          gapDurationSeconds: deltaMs / 1000,
          classification: classifyGap(deltaMs),
          transitionContaminated: 'NO',
        });
      }
    }

    settledSeries[phaseKey] = {
      phase: phaseKey,
      effectivePollIntervalMs: pollMs,
      observationLayer: 'TRUE_T30_SETTLED',
      nativeBucketCount: speedTs.length,
      orderedNativeTimestamps: speedTs,
      consecutivePairs: pairs,
      gapClassificationCounts: countByClass(primaryGaps),
    };
  }

  function signalsAt(ts, valuesByTs) {
    return SIGNAL_FIELDS.filter((f) => valuesByTs.get(f).has(ts));
  }

  const gapsGe10 = allGaps.filter((g) => g.gapDurationMs >= 10000);
  const gapsGe20 = allGaps.filter((g) => g.gapDurationMs >= 20000);
  const gapsGe60 = allGaps.filter((g) => g.gapDurationMs >= 60000);

  const rawVideoWindows = [];
  for (const phaseKey of ['10s', '20s', '30s', '60s']) {
    const mg = maxGaps[phaseKey];
    if (mg) rawVideoWindows.push(makeVidWin(mg, 'P0', phaseBoundaries[phaseKey]));
  }
  for (const g of gapsGe20) {
    if (maxGaps[g.phase] && g.gapId === maxGaps[g.phase].gapId) continue;
    rawVideoWindows.push(makeVidWin(g, g.gapDurationMs >= 60000 ? 'P1' : 'P2', phaseBoundaries[g.phase]));
  }
  const mergedVideoWindows = mergeWindows(rawVideoWindows);

  const gapContext = {};
  for (const w of mergedVideoWindows) {
    if (w.priority !== 'P0' && w.priority !== 'P1') continue;
    const series = settledSeries[w.phase].orderedNativeTimestamps;
    const idx = series.indexOf(w.gapStartUtc);
    gapContext[w.VIDEO_WINDOW_ID] = {
      window: w,
      bucketsBefore: series.slice(Math.max(0, idx - 3), idx).map((t) => rowAt(t, valuesByPhase[w.phase])),
      bucketsAfter: series.slice(idx + 1, idx + 4).map((t) => rowAt(t, valuesByPhase[w.phase])),
    };
  }

  function makeVidWin(g, priority, phaseMeta) {
    const pad = 10000;
    return {
      VIDEO_WINDOW_ID: `VID_${g.phase.replace('s', '')}_${priority}_${g.gapId}`,
      gapId: g.gapId,
      phase: g.phase,
      effectivePollIntervalMs: phaseMeta.effectivePollIntervalMs,
      gapStartUtc: g.gapStartUtc,
      gapEndUtc: g.gapEndUtc,
      reviewStartUtc: new Date(Date.parse(g.gapStartUtc) - pad).toISOString(),
      reviewEndUtc: new Date(Date.parse(g.gapEndUtc) + pad).toISOString(),
      gapDurationSeconds: g.gapDurationSeconds,
      priority,
      phaseElapsedAtGapStartMs: g.phaseElapsedAtGapStartMs,
      phaseElapsedAtGapEndMs: g.phaseElapsedAtGapEndMs,
    };
  }

  const summary = {
    SESSION_ID,
    CALIBRATION_SERIES_ID,
    TOTAL_GAPS_GE_10S: gapsGe10.length,
    TOTAL_GAPS_GE_20S: gapsGe20.length,
    TOTAL_GAPS_GE_60S: gapsGe60.length,
    MERGED_VIDEO_REVIEW_WINDOW_COUNT: mergedVideoWindows.length,
    P0_VIDEO_WINDOWS: mergedVideoWindows.filter((w) => w.priority === 'P0').length,
    P1_VIDEO_WINDOWS: mergedVideoWindows.filter((w) => w.priority === 'P1').length,
    P2_VIDEO_WINDOWS: mergedVideoWindows.filter((w) => w.priority === 'P2').length,
    maxGaps,
  };

  fs.writeFileSync(path.join(outDir, 'phase-boundaries.json'), JSON.stringify(sessionBoundaries, null, 2));
  fs.writeFileSync(path.join(outDir, 'settled-native-series.json'), JSON.stringify(settledSeries, null, 2));
  fs.writeFileSync(path.join(outDir, 'all-gaps.json'), JSON.stringify({ observationLayer: 'TRUE_T30_SETTLED', gaps: allGaps }, null, 2));
  fs.writeFileSync(path.join(outDir, 'signal-gaps.json'), JSON.stringify({ observationLayer: 'TRUE_T30_SETTLED', signalGaps }, null, 2));
  fs.writeFileSync(path.join(outDir, 'video-review-windows.json'), JSON.stringify({ RAW_GAP_WINDOWS: rawVideoWindows, MERGED_VIDEO_REVIEW_WINDOWS: mergedVideoWindows }, null, 2));
  fs.writeFileSync(path.join(outDir, 'gap-context.json'), JSON.stringify(gapContext, null, 2));
  fs.writeFileSync(path.join(outDir, 'export-summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
