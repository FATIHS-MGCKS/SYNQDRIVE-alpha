/**
 * Standalone read-only DIMO energy-event fetch for ops scripts (no Nest/DB).
 * Uses production E2 query builders and segment normalization.
 */
import axios from 'axios';
import { Wallet } from 'ethers';
import { buildEnergyEventSegmentsQuery } from '../../src/modules/dimo/queries/energy-event-segments.query';
import { buildDimoRechargeSegmentsQuery } from '../../src/modules/dimo/recharge-segments/dimo-recharge-segments.query';
import {
  DIMO_PRODUCTION_REFUEL_DETECTOR_CONFIG,
  DIMO_PRODUCTION_RECHARGE_DETECTOR_CONFIG,
} from '../../src/modules/dimo/energy-events/dimo-energy-detector.config';
import { classifyMechanismFetchStatus } from '../../src/modules/dimo/energy-events/energy-mechanism-fetch.types';
import type { DimoEnergyEventSegment } from '../../src/modules/dimo/dimo-segments.service';
import type { EnergyMechanismFetchOutcome } from '../../src/modules/dimo/energy-events/energy-mechanism-fetch.types';
import { parseDimoEnergyEventSegment } from '../../src/modules/dimo/energy-events/parse-energy-event-segment';
import { mapRechargeSegmentToEnergyEvent } from '../../src/modules/dimo/recharge-segments/dimo-recharge-segments.mapper';
import { normalizeDimoRechargeSegments } from '../../src/modules/dimo/recharge-segments/dimo-recharge-segments.normalizer';
import { isRetryableDimoAxiosError } from '../../src/modules/dimo/recharge-segments/dimo-recharge-segments.graphql';
import { buildAvailableSignalsQuery } from '../../src/modules/dimo/queries/available-signals.query';
import {
  mechanismsForEnergyClass,
  type AuditedFleetSignalProfile,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery.constants';
import type {
  DimoRequestAccounting,
  EnergyVehicleEnergyClass,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery.types';

const AUTH_URL = 'https://auth.dimo.zone';
const TOKEN_EXCHANGE_URL =
  process.env.DIMO_TOKEN_EXCHANGE_URL ?? 'https://token-exchange-api.dimo.zone';
const TELEMETRY_URL =
  process.env.DIMO_TELEMETRY_API_URL ?? 'https://telemetry-api.dimo.zone/query';
const NFT_CONTRACT =
  process.env.DIMO_VEHICLE_NFT_CONTRACT_ADDRESS ??
  '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';

let cachedDevJwt: string | null = null;
const vehicleJwtCache = new Map<number, string>();
const dimoAccessCache = new Map<number, boolean>();

async function getDeveloperJwt(): Promise<string> {
  if (cachedDevJwt) return cachedDevJwt;
  const CLIENT_ID = process.env.DIMO_CLIENT_ID!;
  const PRIVATE_KEY = process.env.DIMO_PRIVATE_KEY!;
  const DOMAIN =
    process.env.DIMO_DOMAIN ?? process.env.DIMO_REDIRECT_URI ?? 'https://auth.dimo.zone';

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
  cachedDevJwt = d.developer_jwt ?? d.access_token ?? d.token;
  return cachedDevJwt;
}

export async function probeDimoTokenAccess(
  tokenId: number,
  profile?: AuditedFleetSignalProfile,
): Promise<boolean> {
  if (profile?.knownDimoAccessFailure) {
    dimoAccessCache.set(tokenId, false);
    return false;
  }
  const cached = dimoAccessCache.get(tokenId);
  if (cached != null) return cached;

  try {
    await getVehicleJwt(tokenId);
    dimoAccessCache.set(tokenId, true);
    return true;
  } catch {
    dimoAccessCache.set(tokenId, false);
    return false;
  }
}

async function getVehicleJwt(
  tokenId: number,
  accounting?: DimoRequestAccounting,
): Promise<string> {
  const cached = vehicleJwtCache.get(tokenId);
  if (cached) return cached;

  if (accounting) {
    accounting.tokenExchangeRequests += 1;
  }
  const devJwt = await getDeveloperJwt();
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
      validateStatus: () => true,
    },
  );
  if (resp.status >= 400) {
    throw new Error(`DIMO_TOKEN_EXCHANGE_${resp.status}`);
  }
  const d = resp.data as Record<string, string>;
  const jwt = d.token ?? d.access_token ?? d.jwt;
  vehicleJwtCache.set(tokenId, jwt);
  return jwt;
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
    errors: resp.data?.errors,
  };
}

function emptyAccounting(): DimoRequestAccounting {
  return {
    telemetryGraphqlRequests: 0,
    tokenExchangeRequests: 0,
    mechanismRequests: 0,
    retries: 0,
  };
}

export async function fetchEnergyEventSegmentsStandalone(
  tokenId: number,
  from: Date,
  to: Date,
  energyClass: EnergyVehicleEnergyClass,
): Promise<{
  segments: DimoEnergyEventSegment[];
  outcomes: EnergyMechanismFetchOutcome[];
  accounting: DimoRequestAccounting;
}> {
  const windowFrom = from.toISOString();
  const windowTo = to.toISOString();
  const outcomes: EnergyMechanismFetchOutcome[] = [];
  const segments: DimoEnergyEventSegment[] = [];
  const accounting = emptyAccounting();
  const mechanisms = mechanismsForEnergyClass(energyClass);

  if (mechanisms.length === 0) {
    return { segments, outcomes, accounting };
  }

  let vehicleJwt: string;
  try {
    vehicleJwt = await getVehicleJwt(tokenId, accounting);
  } catch (error) {
    for (const mechanism of mechanisms) {
      outcomes.push({
        mechanism,
        status: 'FAILED',
        segments: [],
        windowFrom,
        windowTo,
        tokenId,
        error: {
          message: error instanceof Error ? error.message : String(error),
          httpStatus: 403,
          retryable: false,
        },
      });
    }
    return { segments, outcomes, accounting };
  }

  for (const mechanism of mechanisms) {
    accounting.mechanismRequests += 1;
    const query =
      mechanism === 'refuel'
        ? buildEnergyEventSegmentsQuery(
            tokenId,
            from,
            to,
            'refuel',
            DIMO_PRODUCTION_REFUEL_DETECTOR_CONFIG,
          )
        : buildDimoRechargeSegmentsQuery({
            tokenId,
            fromIso: windowFrom,
            toIso: windowTo,
            detectorConfig: DIMO_PRODUCTION_RECHARGE_DETECTOR_CONFIG,
          });

    try {
      accounting.telemetryGraphqlRequests += 1;
      const response = await gql(vehicleJwt, query);
      if (response.httpStatus !== 200 || response.errors) {
        outcomes.push({
          mechanism,
          status: 'FAILED',
          segments: [],
          windowFrom,
          windowTo,
          tokenId,
          error: {
            message: JSON.stringify(response.errors ?? response.httpStatus),
            httpStatus: response.httpStatus,
            retryable: response.httpStatus === 429,
          },
        });
        continue;
      }

      const rawSegments = (response.data as { segments?: unknown[] })?.segments ?? [];
      const parsed =
        mechanism === 'refuel'
          ? rawSegments
              .map((segment) => parseDimoEnergyEventSegment(tokenId, mechanism, segment))
              .filter((s): s is DimoEnergyEventSegment => s != null)
          : normalizeDimoRechargeSegments(tokenId, rawSegments).map(
              mapRechargeSegmentToEnergyEvent,
            );

      outcomes.push({
        mechanism,
        status: classifyMechanismFetchStatus(parsed, false),
        segments: parsed,
        windowFrom,
        windowTo,
        tokenId,
      });
      segments.push(...parsed);
    } catch (error) {
      outcomes.push({
        mechanism,
        status: 'FAILED',
        segments: [],
        windowFrom,
        windowTo,
        tokenId,
        error: {
          message: error instanceof Error ? error.message : String(error),
          retryable: isRetryableDimoAxiosError(error),
        },
      });
    }
  }

  return { segments, outcomes, accounting };
}

export async function probeAvailableSignals(
  tokenId: number,
  accounting?: DimoRequestAccounting,
): Promise<string[] | null> {
  try {
    const vehicleJwt = await getVehicleJwt(tokenId, accounting);
    if (accounting) {
      accounting.telemetryGraphqlRequests += 1;
    }
    const response = await gql(vehicleJwt, buildAvailableSignalsQuery(tokenId));
    if (response.httpStatus !== 200 || response.errors) {
      return null;
    }
    const available = (response.data as { availableSignals?: string[] })
      ?.availableSignals;
    return Array.isArray(available) ? available : null;
  } catch {
    return null;
  }
}

export async function probeAvailableSignalsForTokenIds(
  tokenIds: number[],
): Promise<Record<number, string[] | null>> {
  const accounting = emptyAccounting();
  const results: Record<number, string[] | null> = {};
  const uniqueTokenIds = [...new Set(tokenIds)];

  for (const tokenId of uniqueTokenIds) {
    results[tokenId] = await probeAvailableSignals(tokenId, accounting);
  }

  return results;
}

export async function probeDimoAccessForTokenIds(
  tokenIds: number[],
): Promise<Record<number, boolean>> {
  const { QUICK_MODE_AUDIT_FLEET_PROFILES } = await import(
    '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery.constants'
  );
  const access: Record<number, boolean> = {};
  const uniqueTokenIds = [...new Set(tokenIds)];
  for (const tokenId of uniqueTokenIds) {
    const profile = QUICK_MODE_AUDIT_FLEET_PROFILES.find(
      (entry) => entry.tokenId === tokenId,
    );
    access[tokenId] = await probeDimoTokenAccess(tokenId, profile);
  }
  return access;
}

export async function probeFleetDimoAccess(): Promise<Record<number, boolean>> {
  const { QUICK_MODE_AUDIT_FLEET_PROFILES } = await import(
    '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery.constants'
  );
  return probeDimoAccessForTokenIds(
    QUICK_MODE_AUDIT_FLEET_PROFILES.map((profile) => profile.tokenId),
  );
}
