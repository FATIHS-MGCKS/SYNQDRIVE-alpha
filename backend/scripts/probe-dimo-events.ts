/**
 * Probe the DIMO Telemetry API for the VW Golf (tokenId=189118) to discover
 * the actual vehicleEvents vocabulary and confirm the current SynqDrive
 * query is broken.
 *
 * Usage: npx ts-node -r tsconfig-paths/register scripts/probe-dimo-events.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { Wallet } from 'ethers';

{
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

const TOKEN_ID = 189118;
const AUTH_URL = 'https://auth.dimo.zone';
const TOKEN_EXCHANGE_URL =
  process.env.DIMO_TOKEN_EXCHANGE_URL ?? 'https://token-exchange-api.dimo.zone';
const TELEMETRY_URL =
  process.env.DIMO_TELEMETRY_API_URL ?? 'https://telemetry-api.dimo.zone/query';
const NFT_CONTRACT =
  process.env.DIMO_VEHICLE_NFT_CONTRACT_ADDRESS ??
  '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';
const CLIENT_ID = process.env.DIMO_CLIENT_ID!;
const PRIVATE_KEY = process.env.DIMO_PRIVATE_KEY!;
const DOMAIN = process.env.DIMO_REDIRECT_URI ?? 'https://auth.dimo.zone';

async function getDeveloperJwt(): Promise<string> {
  const challenge = await axios.post(
    `${AUTH_URL}/auth/web3/generate_challenge`,
    null,
    {
      params: {
        client_id: CLIENT_ID,
        domain: DOMAIN,
        scope: 'openid email',
        response_type: 'code',
        address: CLIENT_ID,
      },
      timeout: 20000,
    },
  );
  const { state, challenge: msg } = challenge.data as { state: string; challenge: string };
  const normalizedKey = PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`;
  const wallet = new Wallet(normalizedKey);
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
  const d = submit.data as any;
  return d.developer_jwt ?? d.access_token ?? d.token;
}

async function getVehicleJwt(devJwt: string, tokenId: number): Promise<string> {
  const resp = await axios.post(
    `${TOKEN_EXCHANGE_URL}/v1/tokens/exchange`,
    {
      nftContractAddress: NFT_CONTRACT,
      privileges: [1, 2, 3, 4, 5, 6],
      tokenId,
    },
    {
      headers: { Authorization: `Bearer ${devJwt}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    },
  );
  const d = resp.data as any;
  return d.token ?? d.access_token ?? d.jwt;
}

async function gql(jwt: string, query: string): Promise<any> {
  try {
    const resp = await axios.post(
      TELEMETRY_URL,
      { query },
      {
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      },
    );
    return resp.data;
  } catch (e: any) {
    if (e.response) {
      return { _HTTP_ERROR: e.response.status, _BODY: e.response.data };
    }
    throw e;
  }
}

async function main() {
  console.log(`[probe] Acquiring DIMO dev JWT...`);
  const devJwt = await getDeveloperJwt();
  console.log(`[probe] Dev JWT acquired (len=${devJwt.length})`);
  const jwt = await getVehicleJwt(devJwt, TOKEN_ID);
  console.log(`[probe] Vehicle JWT acquired for tokenId=${TOKEN_ID} (len=${jwt.length})`);

  const now = new Date();
  const to = now.toISOString();
  const from48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const from7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const from30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  console.log(`\n========== Q1: dataSummary.eventDataSummary ==========`);
  const q1 = `query { dataSummary(tokenId: ${TOKEN_ID}) { eventDataSummary { name numberOfEvents firstSeen lastSeen } } }`;
  const r1 = await gql(jwt, q1);
  console.log(JSON.stringify(r1, null, 2));

  console.log(`\n========== Q2: events(last 48h) ==========`);
  const q2 = `query { events(tokenId: ${TOKEN_ID}, from: "${from48h}", to: "${to}") { timestamp name source durationNs metadata } }`;
  const r2 = await gql(jwt, q2);
  console.log(JSON.stringify(r2, null, 2).slice(0, 10000));
  const evs2: any[] = r2?.data?.events ?? [];
  if (evs2.length > 0) {
    const byName: Record<string, number> = {};
    for (const e of evs2) byName[e.name] = (byName[e.name] ?? 0) + 1;
    console.log(`\n  Q2 counts:`, byName);
  }

  console.log(`\n========== Q3: events(last 7d) ==========`);
  const q3 = `query { events(tokenId: ${TOKEN_ID}, from: "${from7d}", to: "${to}") { timestamp name source } }`;
  const r3 = await gql(jwt, q3);
  const evs3: any[] = r3?.data?.events ?? [];
  console.log(`  ${evs3.length} events in last 7d`);
  if (evs3.length > 0) {
    const byName: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    for (const e of evs3) {
      byName[e.name] = (byName[e.name] ?? 0) + 1;
      bySource[e.source] = (bySource[e.source] ?? 0) + 1;
    }
    console.log(`  Counts by name:`, byName);
    console.log(`  Counts by source:`, bySource);
    console.log(`  First 15:`);
    for (const e of evs3.slice(0, 15)) console.log(`    ${e.timestamp}  ${e.name}  (src=${e.source})`);
  }

  console.log(`\n========== Q4: events(last 30d) ==========`);
  const q4 = `query { events(tokenId: ${TOKEN_ID}, from: "${from30d}", to: "${to}") { timestamp name source } }`;
  const r4 = await gql(jwt, q4);
  const evs4: any[] = r4?.data?.events ?? [];
  console.log(`  ${evs4.length} events in last 30d`);
  if (evs4.length > 0) {
    const byName: Record<string, number> = {};
    for (const e of evs4) byName[e.name] = (byName[e.name] ?? 0) + 1;
    console.log(`  Counts by name:`, byName);
  }

  console.log(`\n========== Q5: legacy safetySystem signals (current SynqDrive code) ==========`);
  const q5 = `query { signals(tokenId: ${TOKEN_ID}, from: "${from48h}", to: "${to}", interval: "1s") { timestamp safetySystemBrakingHarshBraking(agg: MAX) safetySystemBrakingExtremeEmergency(agg: MAX) safetySystemAccelerationHarshAcceleration(agg: MAX) safetySystemCorneringHarshCornering(agg: MAX) } }`;
  const r5 = await gql(jwt, q5);
  console.log(JSON.stringify(r5, null, 2).slice(0, 2000));

  console.log(`\n========== Q6: fuel signals latest ==========`);
  const q6 = `query { signalsLatest(tokenId: ${TOKEN_ID}) { powertrainFuelSystemRelativeLevel { timestamp value } powertrainFuelSystemAbsoluteLevel { timestamp value } powertrainTransmissionTravelledDistance { timestamp value } isIgnitionOn { timestamp value } } }`;
  const r6 = await gql(jwt, q6);
  console.log(JSON.stringify(r6, null, 2));

  console.log(`\n========== Q7: availableSignals (fuel/safety) ==========`);
  const q7 = `query { availableSignals(tokenId: ${TOKEN_ID}) }`;
  const r7 = await gql(jwt, q7);
  const all: string[] = r7?.data?.availableSignals ?? [];
  console.log(`  total: ${all.length}`);
  console.log(`  fuel: ${JSON.stringify(all.filter((s) => s.toLowerCase().includes('fuel')))}`);
  console.log(`  safety: ${JSON.stringify(all.filter((s) => s.toLowerCase().includes('safety')))}`);

  console.log(`\n========== Q8: fuel signals historical (48h, 2m bucket) ==========`);
  const q8 = `query { signals(tokenId: ${TOKEN_ID}, from: "${from48h}", to: "${to}", interval: "2m") { timestamp powertrainFuelSystemRelativeLevel(agg: AVG) powertrainFuelSystemAbsoluteLevel(agg: AVG) powertrainTransmissionTravelledDistance(agg: MAX) } }`;
  const r8 = await gql(jwt, q8);
  const samples: any[] = r8?.data?.signals ?? [];
  console.log(`  ${samples.length} samples in 48h`);
  const firstNonNull = samples.find((s) => s.powertrainFuelSystemRelativeLevel != null);
  const lastNonNull = [...samples].reverse().find((s) => s.powertrainFuelSystemRelativeLevel != null);
  if (firstNonNull) console.log(`  earliest fuel%: ${JSON.stringify(firstNonNull)}`);
  if (lastNonNull) console.log(`  latest fuel%: ${JSON.stringify(lastNonNull)}`);
  const firstNonNullAbs = samples.find((s) => s.powertrainFuelSystemAbsoluteLevel != null);
  const lastNonNullAbs = [...samples].reverse().find((s) => s.powertrainFuelSystemAbsoluteLevel != null);
  console.log(`  fuel_abs samples: first=${firstNonNullAbs?.timestamp} last=${lastNonNullAbs?.timestamp}`);
}

main().catch((err) => {
  console.error('[probe] Failed:', err?.response?.data ?? err);
  process.exit(1);
});
