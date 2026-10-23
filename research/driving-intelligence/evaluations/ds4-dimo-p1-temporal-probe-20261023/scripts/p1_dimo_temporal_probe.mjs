#!/usr/bin/env node
/**
 * P1 DIMO temporal probe — read-only, two windows, derived metrics only (no lat/lon in stdout JSON).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '../../../../..');
const backendRoot = path.join(repo, 'backend');
const require = createRequire(path.join(backendRoot, 'package.json'));
const axios = require('axios');
const { Wallet } = require('ethers');

const OUT = process.env.P1_PROBE_OUT || '/opt/cursor/artifacts/p1_dimo_probe';
fs.mkdirSync(OUT, { recursive: true });

for (const envPath of [path.join(backendRoot, '.env'), '/opt/synqdrive/shared/backend.env']) {
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

const TELEMETRY_URL = process.env.DIMO_TELEMETRY_API_URL ?? 'https://telemetry-api.dimo.zone/query';
const TOKEN_EXCHANGE_URL = process.env.DIMO_TOKEN_EXCHANGE_URL ?? 'https://token-exchange-api.dimo.zone';
const NFT_CONTRACT = process.env.DIMO_VEHICLE_NFT_CONTRACT_ADDRESS ?? '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';

async function getDeveloperJwt() {
  const AUTH_URL = 'https://auth.dimo.zone';
  const CLIENT_ID = process.env.DIMO_CLIENT_ID;
  const PRIVATE_KEY = process.env.DIMO_PRIVATE_KEY;
  const DOMAIN = process.env.DIMO_REDIRECT_URI ?? process.env.DIMO_DOMAIN ?? 'https://auth.dimo.zone';
  if (!CLIENT_ID || !PRIVATE_KEY) throw new Error('BLOCKED: DIMO_CLIENT_ID or DIMO_PRIVATE_KEY missing');
  const challenge = await axios.post(`${AUTH_URL}/auth/web3/generate_challenge`, null, {
    params: { client_id: CLIENT_ID, domain: DOMAIN, scope: 'openid email', response_type: 'code', address: CLIENT_ID },
    timeout: 20000,
  });
  const { state, challenge: msg } = challenge.data;
  const wallet = new Wallet(PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`);
  const signature = await wallet.signMessage(msg);
  const submit = await axios.post(
    `${AUTH_URL}/auth/web3/submit_challenge`,
    new URLSearchParams({ client_id: CLIENT_ID, domain: DOMAIN, grant_type: 'authorization_code', state, signature }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000 },
  );
  const d = submit.data;
  return d.developer_jwt ?? d.access_token ?? d.token;
}

async function getVehicleJwt(devJwt, tokenId) {
  const resp = await axios.post(
    `${TOKEN_EXCHANGE_URL}/v1/tokens/exchange`,
    { nftContractAddress: NFT_CONTRACT, privileges: [1, 2, 3, 4, 5, 6], tokenId },
    { headers: { Authorization: `Bearer ${devJwt}`, 'Content-Type': 'application/json' }, timeout: 30000 },
  );
  const d = resp.data;
  const jwt = d.token ?? d.access_token ?? d.jwt;
  if (!jwt) throw new Error(`BLOCKED: token exchange empty for tokenId=${tokenId}`);
  return jwt;
}

async function gql(jwt, query) {
  const resp = await axios.post(TELEMETRY_URL, { query }, {
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    timeout: 90000,
  });
  if (resp.data?.errors?.length) {
    const err = { errors: resp.data.errors.map((e) => ({ message: e.message, path: e.path })) };
    return { data: resp.data.data, error: err };
  }
  return { data: resp.data.data, error: null };
}

const R = 6371008.8;
function haversineM(a, b) {
  if (!a || !b || a.latitude == null || b.latitude == null) return null;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(b.latitude - a.latitude);
  const dLon = toR(b.longitude - a.longitude);
  const lat1 = toR(a.latitude);
  const lat2 = toR(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function summarizeSeries(label, rows, intervalLabel) {
  const out = [];
  let prev = null;
  let prevTs = null;
  for (const row of rows) {
    const ts = row.timestamp;
    const avg = row.avgLoc;
    const first = row.firstLoc;
    const last = row.lastLoc;
    const rec = {
      bucketUtc: ts,
      interval: intervalLabel,
      avgPresent: !!(avg?.latitude != null),
      firstPresent: !!(first?.latitude != null),
      lastPresent: !!(last?.latitude != null),
      avgEqFirst: avg && first ? avg.latitude === first.latitude && avg.longitude === first.longitude : null,
      avgEqLast: avg && last ? avg.latitude === last.latitude && avg.longitude === last.longitude : null,
      firstEqLast: first && last ? first.latitude === last.latitude && first.longitude === last.longitude : null,
      hdopAvg: avg?.hdop ?? null,
      hdopFirst: first?.hdop ?? null,
      hdopLast: last?.hdop ?? null,
      legDistM_avg: null,
      legDtLabelS: null,
      chordSpeedKmh_avg: null,
      legDistM_first: null,
      chordSpeedKmh_first: null,
    };
    if (prev && avg?.latitude != null && prev.avg?.latitude != null) {
      const dt = (Date.parse(ts) - Date.parse(prevTs)) / 1000;
      const d = haversineM(prev.avg, avg);
      rec.legDistM_avg = d == null ? null : Math.round(d * 10) / 10;
      rec.legDtLabelS = dt;
      rec.chordSpeedKmh_avg = d != null && dt > 0 ? Math.round((d / dt) * 3.6 * 10) / 10 : null;
    }
    if (prev && first?.latitude != null && prev.first?.latitude != null) {
      const dt = (Date.parse(ts) - Date.parse(prevTs)) / 1000;
      const d = haversineM(prev.first, first);
      rec.legDistM_first = d == null ? null : Math.round(d * 10) / 10;
      rec.chordSpeedKmh_first = d != null && dt > 0 ? Math.round((d / dt) * 3.6 * 10) / 10 : null;
    }
    out.push(rec);
    if (avg?.latitude != null) {
      prev = { avg, first, last };
      prevTs = ts;
    }
  }
  return out;
}

function buildQuery(tokenId, from, to, interval) {
  return `
    query P1Probe {
      signals(tokenId: ${tokenId}, from: "${from}", to: "${to}", interval: "${interval}") {
        timestamp
        avgLoc: currentLocationCoordinates(agg: AVG) { latitude longitude hdop }
        firstLoc: currentLocationCoordinates(agg: FIRST) { latitude longitude hdop }
        lastLoc: currentLocationCoordinates(agg: LAST) { latitude longitude hdop }
      }
    }
  `.trim();
}

const CASES = [
  {
    id: 'TES16',
    tokenId: 186946,
    from: '2026-10-16T03:50:17Z',
    to: '2026-10-16T03:50:27Z',
    sourceFamily: 'API_SYNTHETIC',
  },
  {
    id: 'TIG22',
    tokenId: 192922,
    from: '2026-10-22T19:04:30Z',
    to: '2026-10-22T19:04:56Z',
    sourceFamily: 'RUPTELA_R1',
  },
];

const INTERVALS = ['1s', '250ms'];

async function main() {
  const report = {
    schema: 'DS4_DIMO_P1_TEMPORAL_PROBE_V1',
    probedAtUtc: new Date().toISOString(),
    productionCodeSha: '579ee8b2fed06593d7d2aa57cffb6036dbf53a24',
    telemetryEndpoint: TELEMETRY_URL.replace(/\/query$/, '/query'),
    auth: { developerJwt: 'OK', vehicleJwtPerCase: {} },
    apiSupport: {},
    cases: {},
  };

  let devJwt;
  try {
    devJwt = await getDeveloperJwt();
  } catch (e) {
    report.auth.developerJwt = `BLOCKED: ${e.message}`;
    fs.writeFileSync(path.join(OUT, 'p1_probe_report.json'), JSON.stringify(report, null, 2));
    console.error(e);
    process.exit(2);
  }

  for (const c of CASES) {
    report.cases[c.id] = { tokenId: c.tokenId, window: { from: c.from, to: c.to }, intervals: {} };
    let vJwt;
    try {
      vJwt = await getVehicleJwt(devJwt, c.tokenId);
      report.auth.vehicleJwtPerCase[c.id] = 'OK';
    } catch (e) {
      report.auth.vehicleJwtPerCase[c.id] = `BLOCKED: ${e.message}`;
      continue;
    }
    for (const interval of INTERVALS) {
      const q = buildQuery(c.tokenId, c.from, c.to, interval);
      const { data, error } = await gql(vJwt, q);
      const key = interval === '1s' ? 'interval_1s' : 'interval_250ms';
      if (error) {
        report.cases[c.id].intervals[key] = { supported: false, error };
        if (!report.apiSupport[key]) report.apiSupport[key] = { supported: false, sampleError: error };
        continue;
      }
      const rows = data?.signals ?? [];
      const summarized = summarizeSeries(c.id, rows, interval);
      const rowCount = rows.length;
      const presentAvg = summarized.filter((r) => r.avgPresent).length;
      const multiSampleBuckets = summarized.filter((r) => r.avgPresent && r.firstPresent && r.lastPresent && r.firstEqLast === false).length;
      report.cases[c.id].intervals[key] = {
        supported: true,
        rowCount,
        presentAvgBuckets: presentAvg,
        bucketsWhereFirstNeLast: multiSampleBuckets,
        series: summarized,
      };
      report.apiSupport[key] = { supported: true, note: 'At least one successful query in this run' };
    }
  }

  fs.writeFileSync(path.join(OUT, 'p1_probe_report.json'), JSON.stringify(report, null, 2));
  console.log('written', path.join(OUT, 'p1_probe_report.json'));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
