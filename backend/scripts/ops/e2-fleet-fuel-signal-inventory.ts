/**
 * E2 read-only fleet fuel signal capability inventory (bounded DIMO queries).
 *
 * Usage:
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/e2-fleet-fuel-signal-inventory.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { Wallet } from 'ethers';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

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
const DOMAIN =
  process.env.DIMO_DOMAIN ?? process.env.DIMO_REDIRECT_URI ?? 'https://auth.dimo.zone';

/** Production LTE_R1 fleet (docs/audits/dimo-driving-signals-capability.md). */
const FLEET = [
  { label: 'VW Tiguan ICE', tokenId: 192922, powertrain: 'ICE', provider: 'LTE_R1' },
  { label: 'VW Golf ICE', tokenId: 190497, powertrain: 'ICE', provider: 'LTE_R1' },
  { label: 'VW Arteon ICE', tokenId: 187784, powertrain: 'ICE', provider: 'LTE_R1' },
  { label: 'Audi A4 ICE (KS MS 661)', tokenId: 187361, powertrain: 'ICE', provider: 'LTE_R1' },
  { label: 'MB C63 ICE (KS MX 2024)', tokenId: 187336, powertrain: 'ICE', provider: 'LTE_R1' },
  { label: 'Tesla M3 EV (KS FH 660E)', tokenId: 186946, powertrain: 'EV', provider: 'LTE_R1' },
] as const;

const HIST_FROM = '2026-08-01T00:00:00.000Z';
const HIST_TO = '2026-08-27T00:00:00.000Z';

async function getDeveloperJwt(): Promise<string> {
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
  const d = submit.data as Record<string, string>;
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
  const d = resp.data as Record<string, string>;
  return d.token ?? d.access_token ?? d.jwt;
}

async function gql(jwt: string, query: string) {
  const resp = await axios.post(TELEMETRY_URL, { query }, {
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    timeout: 30000,
    validateStatus: () => true,
  });
  return {
    httpStatus: resp.status,
    data: resp.data?.data,
    errors: resp.data?.errors ?? null,
  };
}

function listed(signals: string[], name: string): boolean {
  return signals.includes(name);
}

async function main() {
  if (!CLIENT_ID || !PRIVATE_KEY) {
    console.error('Missing DIMO_CLIENT_ID or DIMO_PRIVATE_KEY');
    process.exit(1);
  }

  const devJwt = await getDeveloperJwt();
  const inventory: Array<Record<string, unknown>> = [];

  for (const vehicle of FLEET) {
    try {
      const vehicleJwt = await getVehicleJwt(devJwt, vehicle.tokenId);

    const availResp = await gql(
      vehicleJwt,
      `query { availableSignals(tokenId: ${vehicle.tokenId}) }`,
    );
    const available: string[] = (availResp.data as { availableSignals?: string[] })?.availableSignals ?? [];

    const latestResp = await gql(
      vehicleJwt,
      `query {
        signalsLatest(tokenId: ${vehicle.tokenId}) {
          powertrainFuelSystemRelativeLevel { timestamp value }
          powertrainFuelSystemAbsoluteLevel { timestamp value }
        }
      }`,
    );
    const latest = (latestResp.data as { signalsLatest?: Record<string, { timestamp?: string; value?: number }> })
      ?.signalsLatest;

    const histResp = await gql(
      vehicleJwt,
      `query {
        signals(tokenId: ${vehicle.tokenId}, from: "${HIST_FROM}", to: "${HIST_TO}", interval: "10m") {
          timestamp
          powertrainFuelSystemRelativeLevel(agg: AVG)
          powertrainFuelSystemAbsoluteLevel(agg: AVG)
        }
      }`,
    );
    const samples = (histResp.data as { signals?: Array<Record<string, unknown>> })?.signals ?? [];
    const relSamples = samples.filter((s) => s.powertrainFuelSystemRelativeLevel != null).length;
    const absSamples = samples.filter((s) => s.powertrainFuelSystemAbsoluteLevel != null).length;

    const relativeListed = listed(available, 'powertrainFuelSystemRelativeLevel');
    const absoluteListed = listed(available, 'powertrainFuelSystemAbsoluteLevel');
    const relativeLatest = latest?.powertrainFuelSystemRelativeLevel?.value != null;
    const absoluteLatest = latest?.powertrainFuelSystemAbsoluteLevel?.value != null;

    let signalClass: 'A' | 'B' | 'C' | 'D';
    if (relativeListed && absoluteListed && (relSamples > 0 || absSamples > 0)) signalClass = 'A';
    else if (relativeListed && relSamples > 0) signalClass = 'B';
    else if (absoluteListed && absSamples > 0) signalClass = 'C';
    else signalClass = 'D';

    const calibrationCandidate =
      vehicle.powertrain === 'ICE' && signalClass !== 'D' && (relSamples > 0 || absSamples > 0);

    inventory.push({
      vehicle: vehicle.label,
      tokenId: vehicle.tokenId,
      providerDevice: vehicle.provider,
      powertrain: vehicle.powertrain,
      relativeFuelListed: relativeListed,
      absoluteFuelListed: absoluteListed,
      relativeFuelLatest: relativeLatest,
      absoluteFuelLatest: absoluteLatest,
      relativeFuelHistorySamples: relSamples,
      absoluteFuelHistorySamples: absSamples,
      signalClass,
      usableHistory: relSamples > 0 || absSamples > 0,
      calibrationCandidate,
    });
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      inventory.push({
        vehicle: vehicle.label,
        tokenId: vehicle.tokenId,
        providerDevice: vehicle.provider,
        powertrain: vehicle.powertrain,
        relativeFuelListed: null,
        absoluteFuelListed: null,
        relativeFuelLatest: null,
        absoluteFuelLatest: null,
        relativeFuelHistorySamples: 0,
        absoluteFuelHistorySamples: 0,
        signalClass: 'D',
        usableHistory: false,
        calibrationCandidate: false,
        accessError: status === 403 ? 'DIMO_TOKEN_EXCHANGE_FORBIDDEN' : 'DIMO_TOKEN_EXCHANGE_FAILED',
      });
    }
  }

  const payload = { generatedAt: new Date().toISOString(), window: { from: HIST_FROM, to: HIST_TO }, inventory };
  const outPath = '/opt/cursor/artifacts/e2_fleet_fuel_signal_inventory.json';
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
