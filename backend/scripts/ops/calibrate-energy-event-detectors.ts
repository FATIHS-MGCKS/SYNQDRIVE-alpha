/**
 * Read-only E2 calibration: sweep DIMO refuel/recharge detector configs.
 *
 * Usage:
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/calibrate-energy-event-detectors.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { Wallet } from 'ethers';
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

const REFUEL_THRESHOLDS = [undefined, 2, 5] as const;
const RECHARGE_THRESHOLDS = [undefined, 1, 2, 3, 5] as const;

interface CalibrationVehicle {
  tokenId: number;
  label: string;
  from: string;
  to: string;
}

const VEHICLES: CalibrationVehicle[] = [
  {
    tokenId: KS_MX_2024_TOKEN_ID,
    label: 'KS MX 2024',
    from: KS_MX_2024_REFUEL_WINDOW.from,
    to: KS_MX_2024_REFUEL_WINDOW.to,
  },
  {
    tokenId: KS_MX_2024_TOKEN_ID,
    label: 'KS MX 2024 (Apr)',
    from: '2026-04-01T00:00:00.000Z',
    to: '2026-05-01T00:00:00.000Z',
  },
  {
    tokenId: KS_MX_2024_TOKEN_ID,
    label: 'KS MX 2024 (May)',
    from: '2026-05-01T00:00:00.000Z',
    to: '2026-06-01T00:00:00.000Z',
  },
  {
    tokenId: KS_MX_2024_TOKEN_ID,
    label: 'KS MX 2024 (Jun)',
    from: '2026-06-01T00:00:00.000Z',
    to: '2026-07-01T00:00:00.000Z',
  },
  {
    tokenId: KS_MX_2024_TOKEN_ID,
    label: 'KS MX 2024 (Jul)',
    from: '2026-07-01T00:00:00.000Z',
    to: '2026-08-01T00:00:00.000Z',
  },
  {
    tokenId: KS_MX_2024_TOKEN_ID,
    label: 'KS MX 2024 (Aug)',
    from: '2026-08-01T00:00:00.000Z',
    to: '2026-08-27T00:00:00.000Z',
  },
  {
    tokenId: 186946,
    label: 'KS FH 660E (Tesla EV)',
    from: '2026-08-01T00:00:00.000Z',
    to: '2026-08-27T00:00:00.000Z',
  },
];

function renderRefuelConfig(config?: { minIncreasePercent?: number }): string {
  if (!config?.minIncreasePercent) return '';
  return `\n        config: { minIncreasePercent: ${config.minIncreasePercent} }`;
}

function renderRechargeConfig(config?: { minIncreasePercent?: number }): string {
  if (!config?.minIncreasePercent) return '';
  return `\n        config: { minIncreasePercent: ${config.minIncreasePercent} }`;
}

function buildRefuelQuery(
  tokenId: number,
  fromIso: string,
  toIso: string,
  config?: { minIncreasePercent?: number },
): string {
  return `
    query RefuelCalibration {
      segments(
        tokenId: ${tokenId}
        from: "${fromIso}"
        to: "${toIso}"
        mechanism: refuel${renderRefuelConfig(config)}
        signalRequests: [
          { name: "powertrainTransmissionTravelledDistance", agg: MIN }
          { name: "powertrainTransmissionTravelledDistance", agg: MAX }
          { name: "powertrainFuelSystemAbsoluteLevel", agg: MIN }
          { name: "powertrainFuelSystemAbsoluteLevel", agg: MAX }
          { name: "powertrainFuelSystemRelativeLevel", agg: MIN }
          { name: "powertrainFuelSystemRelativeLevel", agg: MAX }
        ]
      ) {
        start { timestamp value { latitude longitude } }
        end { timestamp value { latitude longitude } }
        duration
        isOngoing
        startedBeforeRange
        signals { name value }
      }
    }
  `.trim();
}

function buildRechargeQuery(
  tokenId: number,
  fromIso: string,
  toIso: string,
  config?: { minIncreasePercent?: number },
): string {
  return `
    query RechargeCalibration {
      segments(
        tokenId: ${tokenId}
        from: "${fromIso}"
        to: "${toIso}"
        mechanism: recharge${renderRechargeConfig(config)}
        signalRequests: [
          { name: "powertrainTransmissionTravelledDistance", agg: MIN }
          { name: "powertrainTransmissionTravelledDistance", agg: MAX }
          { name: "powertrainTractionBatteryStateOfChargeCurrent", agg: MIN }
          { name: "powertrainTractionBatteryStateOfChargeCurrent", agg: MAX }
          { name: "powertrainTractionBatteryStateOfChargeCurrentEnergy", agg: MIN }
          { name: "powertrainTractionBatteryStateOfChargeCurrentEnergy", agg: MAX }
        ]
      ) {
        start { timestamp value { latitude longitude } }
        end { timestamp value { latitude longitude } }
        duration
        isOngoing
        startedBeforeRange
        signals { name value }
      }
    }
  `.trim();
}

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

function summarizeSegments(segments: any[] | undefined) {
  if (!Array.isArray(segments)) return [];
  return segments.map((segment) => {
    const rel = (segment?.signals ?? []).filter(
      (s: { name?: string }) => s?.name === 'powertrainFuelSystemRelativeLevel',
    );
    const soc = (segment?.signals ?? []).filter(
      (s: { name?: string }) => s?.name === 'powertrainTractionBatteryStateOfChargeCurrent',
    );
    const relValues = rel.map((s: { value?: number }) => s.value).filter((v: unknown) => typeof v === 'number');
    const socValues = soc.map((s: { value?: number }) => s.value).filter((v: unknown) => typeof v === 'number');
    return {
      start: segment?.start?.timestamp ?? null,
      end: segment?.end?.timestamp ?? null,
      duration: segment?.duration ?? null,
      fuelDeltaPercent:
        relValues.length >= 2 ? Math.max(...relValues) - Math.min(...relValues) : null,
      socDeltaPercent:
        socValues.length >= 2 ? Math.max(...socValues) - Math.min(...socValues) : null,
    };
  });
}

async function main() {
  if (!CLIENT_ID || !PRIVATE_KEY) {
    console.error('Missing DIMO_CLIENT_ID or DIMO_PRIVATE_KEY');
    process.exit(1);
  }

  const devJwt = await getDeveloperJwt();
  const matrix: Array<Record<string, unknown>> = [];

  for (const vehicle of VEHICLES) {
    const vehicleJwt = await getVehicleJwt(devJwt, vehicle.tokenId);

    for (const threshold of REFUEL_THRESHOLDS) {
      if (vehicle.label.includes('Tesla')) continue;
      const config = threshold ? { minIncreasePercent: threshold } : undefined;
      const query = buildRefuelQuery(vehicle.tokenId, vehicle.from, vehicle.to, config);
      const response = await gql(vehicleJwt, query);
      const segments = (response.data as { segments?: unknown[] } | undefined)?.segments;
      matrix.push({
        vehicle: vehicle.label,
        tokenId: vehicle.tokenId,
        mechanism: 'refuel',
        config: config ?? 'default',
        httpStatus: response.httpStatus,
        segmentCount: Array.isArray(segments) ? segments.length : 0,
        segments: summarizeSegments(segments as any[]),
        errors: response.errors,
      });
    }

    for (const threshold of RECHARGE_THRESHOLDS) {
      if (!vehicle.label.includes('Tesla') && vehicle.tokenId === KS_MX_2024_TOKEN_ID) continue;
      const config = threshold ? { minIncreasePercent: threshold } : undefined;
      const query = buildRechargeQuery(vehicle.tokenId, vehicle.from, vehicle.to, config);
      const response = await gql(vehicleJwt, query);
      const segments = (response.data as { segments?: unknown[] } | undefined)?.segments;
      matrix.push({
        vehicle: vehicle.label,
        tokenId: vehicle.tokenId,
        mechanism: 'recharge',
        config: config ?? 'default',
        httpStatus: response.httpStatus,
        segmentCount: Array.isArray(segments) ? segments.length : 0,
        segments: summarizeSegments(segments as any[]),
        errors: response.errors,
      });
    }
  }

  const payload = { generatedAt: new Date().toISOString(), matrix };
  const outPath = '/opt/cursor/artifacts/e2_energy_detector_calibration_matrix.json';
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
