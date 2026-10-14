/**
 * Read-only capture of sanitized DIMO interval buckets for R15 fixtures.
 * Usage: cd backend && node scripts/ops/capture-r15-dimo-interval-fixtures.cjs
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

const CLIENT_ID = process.env.DIMO_CLIENT_ID;
const PRIVATE_KEY = process.env.DIMO_PRIVATE_KEY;
const DOMAIN = process.env.DIMO_DOMAIN ?? process.env.DIMO_REDIRECT_URI ?? 'https://auth.dimo.zone';
const AUTH_URL = 'https://auth.dimo.zone';
const TOKEN_EXCHANGE_URL = process.env.DIMO_TOKEN_EXCHANGE_URL ?? 'https://token-exchange-api.dimo.zone';
const TELEMETRY_URL = process.env.DIMO_TELEMETRY_API_URL ?? 'https://telemetry-api.dimo.zone/query';
const NFT =
  process.env.DIMO_VEHICLE_NFT_CONTRACT_ADDRESS ?? '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';
const TOKEN_ID = 186946;

const OUT = path.resolve(
  __dirname,
  '..',
  '..',
  'src',
  'modules',
  'vehicle-intelligence',
  'battery-health',
  'hv-h4',
  'fixtures',
  'r15-dimo-added-energy-interval.v1.fixture.json',
);

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
  return `query {
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

function buildSegmentsQuery(from, to) {
  return `query {
  segments(tokenId: ${TOKEN_ID}, from: "${from}", to: "${to}", mechanism: recharge, signalRequests: [
    { name: "powertrainTractionBatteryChargingAddedEnergy", agg: MIN },
    { name: "powertrainTractionBatteryChargingAddedEnergy", agg: MAX },
    { name: "powertrainTractionBatteryStateOfChargeCurrent", agg: MIN },
    { name: "powertrainTractionBatteryStateOfChargeCurrent", agg: MAX },
    { name: "powertrainTractionBatteryStateOfChargeCurrentEnergy", agg: MIN },
    { name: "powertrainTractionBatteryStateOfChargeCurrentEnergy", agg: MAX }
  ]) {
    start { timestamp }
    end { timestamp }
    duration
    isOngoing
    signals { name value }
  }
}`;
}

const EPISODES = [
  {
    id: 'oct12_session_3e5fe028',
    hvChargeSessionId: '3e5fe028-a217-4dfd-b165-76993117c794',
    hvEnergyAddedKwh: 5.06,
    hvSocStartPct: 89.18,
    hvSocEndPct: 99,
    queryWindow: { from: '2026-10-12T12:30:00Z', to: '2026-10-12T15:45:00Z' },
    providerChargeInterval: { from: '2026-10-12T13:06:55Z', to: '2026-10-12T15:10:30Z' },
  },
  {
    id: 'oct13_session_795c7dcb',
    hvChargeSessionId: '795c7dcb-4f71-4105-9868-5830ebc67597',
    hvEnergyAddedKwh: 5.14,
    hvSocStartPct: 84,
    hvSocEndPct: 94.02,
    queryWindow: { from: '2026-10-13T12:30:00Z', to: '2026-10-13T16:45:00Z' },
    providerChargeInterval: { from: '2026-10-13T13:06:30Z', to: '2026-10-13T16:12:09Z' },
  },
];

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

function summarizeSegment(seg) {
  const grouped = {};
  for (const s of seg.signals) {
    grouped[s.name] = grouped[s.name] || [];
    grouped[s.name].push(s.value);
  }
  const minMax = (name) => {
    const v = grouped[name] || [];
    if (!v.length) return { min: null, max: null, delta: null };
    const min = Math.min(...v);
    const max = Math.max(...v);
    return { min, max, delta: max - min };
  };
  return {
    startAt: seg.start.timestamp,
    endAt: seg.end.timestamp,
    durationSeconds: seg.duration,
    isOngoing: seg.isOngoing,
    addedEnergyKwh: minMax('powertrainTractionBatteryChargingAddedEnergy'),
    socPct: minMax('powertrainTractionBatteryStateOfChargeCurrent'),
    packEnergyKwh: minMax('powertrainTractionBatteryStateOfChargeCurrentEnergy'),
  };
}

async function main() {
  if (!CLIENT_ID || !PRIVATE_KEY) {
    console.error('Missing DIMO credentials');
    process.exit(1);
  }
  const devJwt = await getDeveloperJwt();
  const vehicleJwt = await getVehicleJwt(devJwt);
  const capturedAt = new Date().toISOString();

  const fixture = {
    schemaVersion: 'r15-dimo-added-energy-interval-v1',
    capturedAt,
    r14ReferenceQueryExecutedAt: '2026-10-14T07:48:10.708Z',
    productionReferenceSha: '6d68289018b65ce0c061dc5dbf8c66db7954ab29',
    provider: {
      source: 'DIMO',
      telemetryGraphqlPath: 'signals(tokenId, from, to, interval)',
      tokenId: TOKEN_ID,
      vehicleId: '68868291-5478-42cd-b0c4-cc77b2a78e21',
      organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
    },
    signal: {
      id: 'powertrainTractionBatteryChargingAddedEnergy',
      unit: 'kWh',
      bucketWidth: '1m',
      aggregationSemantics:
        'Per-bucket FloatAggregation (LAST/MIN/MAX). Bucket timestamp labels the query interval bucket, not a certified MCU sample instant.',
    },
    episodes: [],
  };

  for (const ep of EPISODES) {
    const sigResp = await axios.post(
      TELEMETRY_URL,
      { query: buildSignalsQuery(ep.queryWindow.from, ep.queryWindow.to) },
      { headers: { Authorization: `Bearer ${vehicleJwt}`, 'Content-Type': 'application/json' } },
    );
    if (sigResp.data.errors) throw new Error(JSON.stringify(sigResp.data.errors));
    const buckets = (sigResp.data.data.signals ?? []).map(sanitizeBucket);

    const segResp = await axios.post(
      TELEMETRY_URL,
      {
        query: buildSegmentsQuery(
          ep.providerChargeInterval.from.slice(0, 10) + 'T00:00:00Z',
          ep.providerChargeInterval.to.slice(0, 10) + 'T23:59:59Z',
        ),
      },
      { headers: { Authorization: `Bearer ${vehicleJwt}`, 'Content-Type': 'application/json' } },
    );
    const segments = segResp.data.data.segments ?? [];
    const match = segments.find(
      (s) =>
        s.start.timestamp.startsWith(ep.providerChargeInterval.from.slice(0, 19)) ||
        Math.abs(Date.parse(s.start.timestamp) - Date.parse(ep.providerChargeInterval.from)) < 2000,
    );

    fixture.episodes.push({
      ...ep,
      buckets,
      rechargeSegmentEnvelope: match ? summarizeSegment(match) : null,
      overlappingRechargeSegmentCount: segments.length,
    });
  }

  const digestPayload = fixture.episodes.map((e) => ({
    id: e.id,
    buckets: e.buckets,
    rechargeSegmentEnvelope: e.rechargeSegmentEnvelope,
  }));
  fixture.evidenceDigestSha256 = crypto
    .createHash('sha256')
    .update(JSON.stringify(digestPayload))
    .digest('hex');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(fixture, null, 2));
  console.log(`Wrote ${OUT} digest=${fixture.evidenceDigestSha256}`);
}

main().catch((e) => {
  console.error(e.response?.data ?? e.message);
  process.exit(1);
});
