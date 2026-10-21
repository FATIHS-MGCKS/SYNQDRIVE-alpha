/**
 * Read-only live DIMO validation for E1 energy-event queries.
 *
 * Usage:
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/validate-energy-event-dimo-queries.ts [tokenId...]
 */
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { Wallet } from 'ethers';
import { buildDimoRechargeSegmentsQuery } from '../../src/modules/dimo/recharge-segments/dimo-recharge-segments.query';
import { buildEnergyEventSegmentsQuery } from '../../src/modules/dimo/queries/energy-event-segments.query';
import {
  DIMO_PRODUCTION_REFUEL_DETECTOR_CONFIG,
  DIMO_PRODUCTION_RECHARGE_DETECTOR_CONFIG,
} from '../../src/modules/dimo/energy-events/dimo-energy-detector.config';
import {
  KS_MX_2024_REFUEL_WINDOW,
  KS_MX_2024_TOKEN_ID,
} from '../../src/modules/dimo/fixtures/ks-mx-2024-refuel.fixture';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

const TOKEN_IDS = process.argv.slice(2).map(Number).filter((n) => n > 0).length
  ? process.argv.slice(2).map(Number).filter((n) => n > 0)
  : [187336, 186946];

const KS_MX_FROM = new Date(KS_MX_2024_REFUEL_WINDOW.from);
const KS_MX_TO = new Date(KS_MX_2024_REFUEL_WINDOW.to);
const TESLA_RECHARGE_FROM = new Date('2026-06-15T00:00:00.000Z');
const TESLA_RECHARGE_TO = new Date('2026-07-16T00:00:00.000Z');
const DEFAULT_FROM = new Date('2026-08-20T00:00:00.000Z');
const DEFAULT_TO = new Date('2026-08-27T00:00:00.000Z');

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

async function gql(jwt: string, query: string): Promise<{
  httpStatus: number;
  data?: unknown;
  errors?: unknown;
}> {
  try {
    const resp = await axios.post(TELEMETRY_URL, { query }, {
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      timeout: 30000,
      validateStatus: () => true,
    });
    return {
      httpStatus: resp.status,
      data: resp.data?.data,
      errors: resp.data?.errors,
    };
  } catch (error: unknown) {
    const axiosError = error as { response?: { status?: number; data?: unknown }; message?: string };
    return {
      httpStatus: axiosError.response?.status ?? 0,
      errors: axiosError.response?.data ?? axiosError.message,
    };
  }
}

async function main() {
  if (!CLIENT_ID || !PRIVATE_KEY) {
    console.error('Missing DIMO_CLIENT_ID or DIMO_PRIVATE_KEY');
    process.exit(1);
  }

  const devJwt = await getDeveloperJwt();
  const results: Array<Record<string, unknown>> = [];

  for (const tokenId of TOKEN_IDS) {
    const vehicleJwt = await getVehicleJwt(devJwt, tokenId);

    const refuelFrom = tokenId === KS_MX_2024_TOKEN_ID ? KS_MX_FROM : DEFAULT_FROM;
    const refuelTo = tokenId === KS_MX_2024_TOKEN_ID ? KS_MX_TO : DEFAULT_TO;
    const rechargeFrom = tokenId === 186946 ? TESLA_RECHARGE_FROM : DEFAULT_FROM;
    const rechargeTo = tokenId === 186946 ? TESLA_RECHARGE_TO : DEFAULT_TO;

    for (const mechanism of ['refuel', 'recharge'] as const) {
      const query =
        mechanism === 'refuel'
          ? buildEnergyEventSegmentsQuery(
              tokenId,
              refuelFrom,
              refuelTo,
              'refuel',
              DIMO_PRODUCTION_REFUEL_DETECTOR_CONFIG,
            )
          : buildDimoRechargeSegmentsQuery({
              tokenId,
              fromIso: rechargeFrom.toISOString(),
              toIso: rechargeTo.toISOString(),
              detectorConfig: DIMO_PRODUCTION_RECHARGE_DETECTOR_CONFIG,
            });

      const response = await gql(vehicleJwt, query);
      const segments = (response.data as { segments?: unknown[] } | undefined)?.segments;
      results.push({
        tokenId,
        mechanism,
        detectorConfig:
          mechanism === 'refuel'
            ? DIMO_PRODUCTION_REFUEL_DETECTOR_CONFIG
            : DIMO_PRODUCTION_RECHARGE_DETECTOR_CONFIG ?? 'default',
        window: {
          from: (mechanism === 'refuel' ? refuelFrom : rechargeFrom).toISOString(),
          to: (mechanism === 'refuel' ? refuelTo : rechargeTo).toISOString(),
        },
        httpStatus: response.httpStatus,
        segmentCount: Array.isArray(segments) ? segments.length : 0,
        segments: Array.isArray(segments)
          ? segments.slice(0, 3).map((segment: any) => ({
              start: segment?.start?.timestamp,
              end: segment?.end?.timestamp,
              duration: segment?.duration,
            }))
          : [],
        errors: response.errors ?? null,
      });
    }
  }

  const payload = {
    detectorConfigVersion: 'e2-2026-08',
    results,
  };
  console.log(JSON.stringify(payload, null, 2));

  const failed = results.filter((row) => row.httpStatus !== 200);
  if (failed.length > 0) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
