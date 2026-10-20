/**
 * HV R22 P1B — owner-gated historical DIMO read-only batch (max 13 GraphQL signals queries).
 *
 * Usage:
 *   HV_R22_P1B_13_SESSION_OWNER_AUTHORIZED=1 \
 *   node backend/scripts/ops/hv-r22-p1b-13-session-research.cjs \
 *     --sessions=/opt/cursor/artifacts/hv-r22-p1b-production-sessions.json
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { Wallet } = require('ethers');

const envPath = path.resolve(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

const TOKEN_ID = 186946;
const VEHICLE_ID = '68868291-5478-42cd-b0c4-cc77b2a78e21';
const ORG_ID = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const PAD_MS = 5 * 60 * 1000;
const MAX_QUERY_MS = 6 * 60 * 60 * 1000;
const MAX_SESSION_MS = 6 * 60 * 60 * 1000;
const MAX_REQUESTS = 13;

const CLIENT_ID = process.env.DIMO_CLIENT_ID;
const PRIVATE_KEY = process.env.DIMO_PRIVATE_KEY;
const DOMAIN = process.env.DIMO_DOMAIN ?? process.env.DIMO_REDIRECT_URI ?? 'https://auth.dimo.zone';
const AUTH_URL = 'https://auth.dimo.zone';
const TOKEN_EXCHANGE_URL = process.env.DIMO_TOKEN_EXCHANGE_URL ?? 'https://token-exchange-api.dimo.zone';
const TELEMETRY_URL = process.env.DIMO_TELEMETRY_API_URL ?? 'https://telemetry-api.dimo.zone/query';
const NFT =
  process.env.DIMO_VEHICLE_NFT_CONTRACT_ADDRESS ?? '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';

const OUT_DIR = process.env.HV_R22_P1B_ARTIFACT_DIR ?? '/opt/cursor/artifacts/hv-r22-p1b-sessions';

function parseArgs() {
  const args = {};
  for (const token of process.argv.slice(2)) {
    if (!token.startsWith('--')) continue;
    const [k, v] = token.slice(2).split('=');
    args[k] = v ?? 'true';
  }
  return args;
}

async function getDeveloperJwt() {
  const challenge = await axios.post(`${AUTH_URL}/auth/web3/generate_challenge`, null, {
    params: {
      client_id: CLIENT_ID,
      domain: DOMAIN,
      scope: 'openid email',
      response_type: 'code',
      address: CLIENT_ID,
    },
    timeout: 20000,
  });
  const { state, challenge: msg } = challenge.data;
  const wallet = new Wallet(PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`);
  const signature = await wallet.signMessage(msg);
  const submit = await axios.post(
    `${AUTH_URL}/auth/web3/submit_challenge`,
    new URLSearchParams({
      client_id: CLIENT_ID,
      domain: DOMAIN,
      grant_type: 'authorization_code',
      state,
      signature,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000 },
  );
  const d = submit.data;
  return d.developer_jwt ?? d.access_token ?? d.token;
}

async function getVehicleJwt(devJwt) {
  const resp = await axios.post(
    `${TOKEN_EXCHANGE_URL}/v1/tokens/exchange`,
    { nftContractAddress: NFT, privileges: [1, 2, 3, 4, 5, 6], tokenId: TOKEN_ID },
    {
      headers: { Authorization: `Bearer ${devJwt}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    },
  );
  const d = resp.data;
  return d.token ?? d.access_token ?? d.jwt;
}

function buildSignalsQuery(from, to) {
  return `query HvR22P1bSessionResearch {
  signals(tokenId: ${TOKEN_ID}, from: "${from}", to: "${to}", interval: "1m") {
    timestamp
    addedKwhLast: powertrainTractionBatteryChargingAddedEnergy(agg: LAST)
    addedKwhMin: powertrainTractionBatteryChargingAddedEnergy(agg: MIN)
    addedKwhMax: powertrainTractionBatteryChargingAddedEnergy(agg: MAX)
    socPctLast: powertrainTractionBatteryStateOfChargeCurrent(agg: LAST)
    packEnergyKwhLast: powertrainTractionBatteryStateOfChargeCurrentEnergy(agg: LAST)
  }
}`;
}

function sanitizeBucket(row) {
  return {
    timestamp: row.timestamp,
    addedKwhLast: row.addedKwhLast,
    addedKwhMin: row.addedKwhMin,
    addedKwhMax: row.addedKwhMax,
    socPctLast: row.socPctLast,
    packEnergyKwhLast: row.packEnergyKwhLast,
  };
}

function buildManifest(sessions) {
  const entries = [];
  for (const session of sessions) {
    const startMs = Date.parse(session.startAt);
    const endMs = Date.parse(session.endAt);
    const durationMs = endMs - startMs;
    const queryFrom = new Date(startMs - PAD_MS).toISOString();
    const queryTo = new Date(endMs + PAD_MS).toISOString();
    const queryWindowMs = Date.parse(queryTo) - Date.parse(queryFrom);

    let eligibility = 'ELIGIBLE';
    let skipReason = null;
    if (!session.endAt || session.isOngoing) {
      eligibility = 'SKIP';
      skipReason = 'ongoing_or_open_end';
    } else if (durationMs > MAX_SESSION_MS) {
      eligibility = 'NEEDS_REVIEW';
      skipReason = 'session_duration_exceeds_6h';
    } else if (queryWindowMs > MAX_QUERY_MS) {
      eligibility = 'NEEDS_REVIEW';
      skipReason = 'query_window_exceeds_6h';
    }

    entries.push({
      sessionId: session.id,
      segmentFingerprint: session.segmentFingerprint,
      sessionStartAt: session.startAt,
      sessionEndAt: session.endAt,
      queryFrom,
      queryTo,
      sessionDurationMinutes: Math.round(durationMs / 60_000),
      queryWindowMinutes: Math.round(queryWindowMs / 60_000),
      eligibility,
      skipReason,
      r15Studied: session.id.startsWith('3e5fe028') || session.id.startsWith('795c7dcb'),
      energyAddedKwhHv: session.energyAddedKwh,
      reconcileVersion: session.metadata?.reconcileVersion ?? null,
    });
  }
  return {
    schemaVersion: 'hv-r22-p1b-query-manifest-v1',
    frozenAt: new Date().toISOString(),
    tokenId: TOKEN_ID,
    vehicleId: VEHICLE_ID,
    organizationId: ORG_ID,
    maxGraphqlRequests: MAX_REQUESTS,
    paddingMinutes: 5,
    maxQueryWindowHours: 6,
    entries,
  };
}

function analyzeForensics(session, rows, queryFrom, queryTo) {
  const sessionStartMs = Date.parse(session.startAt);
  const sessionEndMs = Date.parse(session.endAt);
  const sorted = [...rows].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  let numeric = 0;
  let nulls = 0;
  let pos = 0;
  let neg = 0;
  let zero = 0;
  const numericLasts = sorted.filter((r) => typeof r.addedKwhLast === 'number' && Number.isFinite(r.addedKwhLast));

  for (const r of sorted) {
    if (typeof r.addedKwhLast === 'number' && Number.isFinite(r.addedKwhLast)) numeric++;
    else nulls++;
  }
  for (let i = 1; i < numericLasts.length; i++) {
    const d = numericLasts[i].addedKwhLast - numericLasts[i - 1].addedKwhLast;
    if (d > 0) pos++;
    else if (d < 0) neg++;
    else zero++;
  }

  const inSession = numericLasts.filter((r) => {
    const ms = Date.parse(r.timestamp);
    return ms >= sessionStartMs && ms <= sessionEndMs;
  });
  const firstIn = inSession[0]?.addedKwhLast ?? null;
  const lastIn = inSession[inSession.length - 1]?.addedKwhLast ?? null;
  const counterDeltaInSession =
    firstIn != null && lastIn != null ? lastIn - firstIn : null;

  const socIn = sorted.filter(
    (r) =>
      typeof r.socPctLast === 'number' &&
      Date.parse(r.timestamp) >= sessionStartMs &&
      Date.parse(r.timestamp) <= sessionEndMs,
  );
  const packIn = sorted.filter(
    (r) =>
      typeof r.packEnergyKwhLast === 'number' &&
      Date.parse(r.timestamp) >= sessionStartMs &&
      Date.parse(r.timestamp) <= sessionEndMs,
  );

  const socFirst = socIn[0]?.socPctLast ?? null;
  const socLast = socIn[socIn.length - 1]?.socPctLast ?? null;
  const packFirst = packIn[0]?.packEnergyKwhLast ?? null;
  const packLast = packIn[packIn.length - 1]?.packEnergyKwhLast ?? null;

  return {
    bucketCount: sorted.length,
    numericLastCount: numeric,
    nullLastCount: nulls,
    positiveDeltas: pos,
    negativeDeltas: neg,
    zeroDeltas: zero,
    firstNumericInSession: firstIn,
    lastNumericInSession: lastIn,
    counterDeltaFirstLastInSession: counterDeltaInSession,
    socFirstInSession: socFirst,
    socLastInSession: socLast,
    packEnergyFirstInSession: packFirst,
    packEnergyLastInSession: packLast,
    hvEnergyAddedKwh: session.energyAddedKwh,
    hvVsCounterDeltaDiff:
      session.energyAddedKwh != null && counterDeltaInSession != null
        ? session.energyAddedKwh - counterDeltaInSession
        : null,
    queryFrom,
    queryTo,
  };
}

async function main() {
  if (process.env.HV_R22_P1B_13_SESSION_OWNER_AUTHORIZED !== '1') {
    console.error('Refusing: set HV_R22_P1B_13_SESSION_OWNER_AUTHORIZED=1');
    process.exit(41);
  }
  if (!CLIENT_ID || !PRIVATE_KEY) {
    console.error('Missing DIMO credentials');
    process.exit(1);
  }

  const args = parseArgs();
  const sessionsPath =
    args.sessions ?? '/opt/cursor/artifacts/hv-r22-p1b-production-sessions.json';
  const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
  if (sessions.length !== 13) {
    console.error(`Expected 13 sessions, got ${sessions.length}`);
    process.exit(2);
  }
  for (const s of sessions) {
    if (s.metadata?.dimoTokenId && s.metadata.dimoTokenId !== TOKEN_ID) {
      console.error(`Session ${s.id} wrong token`);
      process.exit(3);
    }
  }

  const manifest = buildManifest(sessions);
  const manifestPath = '/opt/cursor/artifacts/hv-r22-p1b-query-manifest.json';
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const toQuery = manifest.entries.filter((e) => e.eligibility === 'ELIGIBLE');
  if (toQuery.length > MAX_REQUESTS) {
    console.error('Manifest exceeds request budget');
    process.exit(4);
  }

  console.log(
    JSON.stringify({
      phase: 'manifest_frozen',
      manifestPath,
      eligible: toQuery.length,
      skipped: manifest.entries.length - toQuery.length,
    }),
  );

  const devJwt = await getDeveloperJwt();
  const vehicleJwt = await getVehicleJwt(devJwt);

  const batchSummary = {
    schemaVersion: 'hv-r22-p1b-batch-summary-v1',
    executedAt: new Date().toISOString(),
    totalDimoGraphqlRequests: 0,
    rateLimitErrors: 0,
    sessions: [],
  };

  for (const entry of manifest.entries) {
    if (entry.eligibility !== 'ELIGIBLE') {
      batchSummary.sessions.push({
        sessionId: entry.sessionId,
        status: entry.eligibility,
        skipReason: entry.skipReason,
        graphqlExecuted: false,
      });
      continue;
    }

    if (batchSummary.totalDimoGraphqlRequests >= MAX_REQUESTS) {
      batchSummary.sessions.push({
        sessionId: entry.sessionId,
        status: 'SKIP',
        skipReason: 'budget_exhausted',
        graphqlExecuted: false,
      });
      continue;
    }

    const query = buildSignalsQuery(entry.queryFrom, entry.queryTo);
    const queriedAt = new Date().toISOString();
    let httpStatus = null;
    let graphqlErrors = null;
    let rows = [];
    let elapsedMs = null;

    try {
      const started = Date.now();
      const resp = await axios.post(
        TELEMETRY_URL,
        { query },
        {
          headers: { Authorization: `Bearer ${vehicleJwt}`, 'Content-Type': 'application/json' },
          timeout: 120_000,
          validateStatus: () => true,
        },
      );
      elapsedMs = Date.now() - started;
      httpStatus = resp.status;
      graphqlErrors = resp.data?.errors ?? null;
      if (resp.status === 429 || resp.status === 403) {
        batchSummary.rateLimitErrors += 1;
        batchSummary.sessions.push({
          sessionId: entry.sessionId,
          status: 'STOPPED',
          httpStatus,
          graphqlErrors,
          graphqlExecuted: true,
        });
        batchSummary.totalDimoGraphqlRequests += 1;
        break;
      }
      rows = (resp.data?.data?.signals ?? []).map(sanitizeBucket);
      batchSummary.totalDimoGraphqlRequests += 1;
    } catch (err) {
      batchSummary.sessions.push({
        sessionId: entry.sessionId,
        status: 'ERROR',
        message: err instanceof Error ? err.message : String(err),
        graphqlExecuted: false,
      });
      break;
    }

    const forensics = analyzeForensics(
      sessions.find((s) => s.id === entry.sessionId),
      rows,
      entry.queryFrom,
      entry.queryTo,
    );

    const artifact = {
      sessionId: entry.sessionId,
      segmentFingerprint: entry.segmentFingerprint,
      queryWindow: { from: entry.queryFrom, to: entry.queryTo },
      sessionWindow: { from: entry.sessionStartAt, to: entry.sessionEndAt },
      httpStatus,
      graphqlErrors,
      queriedAt,
      elapsedMs,
      rowCount: rows.length,
      rows,
      forensics,
    };

    const shortId = entry.sessionId.slice(0, 8);
    fs.writeFileSync(
      path.join(OUT_DIR, `${shortId}-dimo-response.json`),
      JSON.stringify(artifact, null, 2),
    );

    batchSummary.sessions.push({
      sessionId: entry.sessionId,
      status: graphqlErrors ? 'GRAPHQL_ERROR' : 'OK',
      httpStatus,
      rowCount: rows.length,
      forensics,
      graphqlExecuted: true,
    });
  }

  fs.writeFileSync(
    '/opt/cursor/artifacts/hv-r22-p1b-batch-summary.json',
    JSON.stringify(batchSummary, null, 2),
  );
  console.log(JSON.stringify(batchSummary, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
