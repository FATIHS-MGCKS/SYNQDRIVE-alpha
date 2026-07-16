#!/usr/bin/env ts-node
/**
 * Tire Health DIMO Signal Audit — read-only.
 *
 * Queries DIMO Telemetry API (availableSignals, signalsLatest, historical signals)
 * for fleet vehicles. NO triggers/subscriptions. NO GPS queries. NO raw timeseries in output.
 *
 * Usage (from repo root, supervised production):
 *   cd backend && npx ts-node -r tsconfig-paths/register ../scripts/audits/audit-tire-health-dimo-signals.ts
 *   cd backend && npx ts-node -r tsconfig-paths/register ../scripts/audits/audit-tire-health-dimo-signals.ts --days=60 --output-dir=../docs/audits/data
 *
 * Environment (loaded from backend/.env if present):
 *   DATABASE_URL, DIMO_CLIENT_ID, DIMO_PRIVATE_KEY, DIMO_* URLs
 *   TIRE_HEALTH_DIMO_AUDIT_ALLOW_PROD=1  required for production DB + DIMO
 */
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

const scriptDir = path.resolve(path.dirname(process.argv[1] ?? '.'));
const backendRoot = path.resolve(scriptDir, '..', '..', 'backend');
const requireFromBackend = createRequire(path.join(backendRoot, 'package.json'));
const axios = requireFromBackend('axios');
const { Wallet } = requireFromBackend('ethers');

// ── Load backend .env ─────────────────────────────────────────────────────────
{
  const envPath = path.resolve(backendRoot, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

const AUDIT_ID = 'tire-health-dimo-signals-2026-07';

interface SignalSpec {
  signalName: string;
  documentedInDimoSchema: boolean;
  dimoUnit: string | null;
  synqDriveField: string | null;
  synqDriveUsesInTireHealth: boolean;
  pressureSignal?: boolean;
  tpmsWarning?: boolean;
}

const SIGNAL_SPECS: SignalSpec[] = [
  { signalName: 'powertrainTransmissionTravelledDistance', documentedInDimoSchema: true, dimoUnit: 'km', synqDriveField: 'odometer_km', synqDriveUsesInTireHealth: true },
  { signalName: 'isIgnitionOn', documentedInDimoSchema: true, dimoUnit: '0/1', synqDriveField: 'is_ignition_on', synqDriveUsesInTireHealth: false },
  { signalName: 'speed', documentedInDimoSchema: true, dimoUnit: 'km/h', synqDriveField: 'speed_kmh', synqDriveUsesInTireHealth: true },
  { signalName: 'angularVelocityYaw', documentedInDimoSchema: true, dimoUnit: 'deg/s', synqDriveField: null, synqDriveUsesInTireHealth: false },
  { signalName: 'exteriorAirTemperature', documentedInDimoSchema: true, dimoUnit: 'degC', synqDriveField: null, synqDriveUsesInTireHealth: true },
  { signalName: 'obdBarometricPressure', documentedInDimoSchema: true, dimoUnit: 'kPa', synqDriveField: null, synqDriveUsesInTireHealth: false },
  { signalName: 'obdDTCList', documentedInDimoSchema: true, dimoUnit: 'list', synqDriveField: null, synqDriveUsesInTireHealth: false },
  { signalName: 'chassisAxleRow1WheelLeftTirePressure', documentedInDimoSchema: true, dimoUnit: 'kPa', synqDriveField: 'tire_pressure_fl', synqDriveUsesInTireHealth: true, pressureSignal: true },
  { signalName: 'chassisAxleRow1WheelRightTirePressure', documentedInDimoSchema: true, dimoUnit: 'kPa', synqDriveField: 'tire_pressure_fr', synqDriveUsesInTireHealth: true, pressureSignal: true },
  { signalName: 'chassisAxleRow2WheelLeftTirePressure', documentedInDimoSchema: true, dimoUnit: 'kPa', synqDriveField: 'tire_pressure_rl', synqDriveUsesInTireHealth: true, pressureSignal: true },
  { signalName: 'chassisAxleRow2WheelRightTirePressure', documentedInDimoSchema: true, dimoUnit: 'kPa', synqDriveField: 'tire_pressure_rr', synqDriveUsesInTireHealth: true, pressureSignal: true },
  { signalName: 'chassisTireSystemIsWarningOn', documentedInDimoSchema: true, dimoUnit: '0/1', synqDriveField: null, synqDriveUsesInTireHealth: false, tpmsWarning: true },
  { signalName: 'chassisAxleRow1WheelLeftSpeed', documentedInDimoSchema: true, dimoUnit: 'km/h', synqDriveField: null, synqDriveUsesInTireHealth: false },
  { signalName: 'chassisAxleRow1WheelRightSpeed', documentedInDimoSchema: true, dimoUnit: 'km/h', synqDriveField: null, synqDriveUsesInTireHealth: false },
  { signalName: 'chassisAxleRow2WheelLeftSpeed', documentedInDimoSchema: false, dimoUnit: null, synqDriveField: null, synqDriveUsesInTireHealth: false },
  { signalName: 'chassisAxleRow2WheelRightSpeed', documentedInDimoSchema: false, dimoUnit: null, synqDriveField: null, synqDriveUsesInTireHealth: false },
];

const NOT_DOCUMENTED_SIGNALS = [
  'Tire Temperature',
  'Tread Depth',
  'Tire Identification',
  'Wheel Slip',
  'Vehicle Mass',
  'Recommended Tire Pressure',
  'ABS Events',
  'Traction-Control Events',
];

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((s, v) => s + v, 0);
  return {
    count: n,
    min: n ? sorted[0] : null,
    max: n ? sorted[n - 1] : null,
    median: n ? percentile(sorted, 50) : null,
    p01: n ? percentile(sorted, 1) : null,
    p99: n ? percentile(sorted, 99) : null,
    mean: n ? sum / n : null,
  };
}

function cadenceStats(timestamps: string[]): {
  medianCadenceSeconds: number | null;
  p95CadenceSeconds: number | null;
  maximumGapSeconds: number | null;
} {
  if (timestamps.length < 2) {
    return { medianCadenceSeconds: null, p95CadenceSeconds: null, maximumGapSeconds: null };
  }
  const ms = timestamps.map((t) => new Date(t).getTime()).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < ms.length; i++) gaps.push((ms[i] - ms[i - 1]) / 1000);
  const sorted = [...gaps].sort((a, b) => a - b);
  return {
    medianCadenceSeconds: percentile(sorted, 50),
    p95CadenceSeconds: percentile(sorted, 95),
    maximumGapSeconds: sorted[sorted.length - 1] ?? null,
  };
}

function classifyPressureValue(v: number): 'plausible_kpa' | 'suspect_bar_stored_as_kpa' | 'invalid' {
  if (v <= 0 || v > 500) return 'invalid';
  if (v >= 1.5 && v <= 4.5) return 'suspect_bar_stored_as_kpa';
  if (v >= 150 && v <= 350) return 'plausible_kpa';
  return 'invalid';
}

async function getDeveloperJwt(): Promise<string> {
  const AUTH_URL = 'https://auth.dimo.zone';
  const CLIENT_ID = process.env.DIMO_CLIENT_ID!;
  const PRIVATE_KEY = process.env.DIMO_PRIVATE_KEY!;
  const DOMAIN = process.env.DIMO_REDIRECT_URI ?? 'https://auth.dimo.zone';
  const challenge = await axios.post(`${AUTH_URL}/auth/web3/generate_challenge`, null, {
    params: { client_id: CLIENT_ID, domain: DOMAIN, scope: 'openid email', response_type: 'code', address: CLIENT_ID },
    timeout: 20000,
  });
  const { state, challenge: msg } = challenge.data as { state: string; challenge: string };
  const normalizedKey = PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`;
  const wallet = new Wallet(normalizedKey);
  const signature = await wallet.signMessage(msg);
  const submit = await axios.post(
    `${AUTH_URL}/auth/web3/submit_challenge`,
    new URLSearchParams({ client_id: CLIENT_ID, domain: DOMAIN, grant_type: 'authorization_code', state, signature }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000 },
  );
  const d = submit.data as Record<string, string>;
  return d.developer_jwt ?? d.access_token ?? d.token;
}

async function getVehicleJwt(devJwt: string, tokenId: number): Promise<string> {
  const TOKEN_EXCHANGE_URL = process.env.DIMO_TOKEN_EXCHANGE_URL ?? 'https://token-exchange-api.dimo.zone';
  const NFT_CONTRACT = process.env.DIMO_VEHICLE_NFT_CONTRACT_ADDRESS ?? '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';
  const resp = await axios.post(
    `${TOKEN_EXCHANGE_URL}/v1/tokens/exchange`,
    { nftContractAddress: NFT_CONTRACT, privileges: [1, 2, 3, 4, 5, 6], tokenId },
    { headers: { Authorization: `Bearer ${devJwt}`, 'Content-Type': 'application/json' }, timeout: 30000 },
  );
  const d = resp.data as Record<string, string>;
  return d.token ?? d.access_token ?? d.jwt;
}

async function gql(jwt: string, query: string, retries = 3): Promise<any> {
  const TELEMETRY_URL = process.env.DIMO_TELEMETRY_API_URL ?? 'https://telemetry-api.dimo.zone/query';
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const resp = await axios.post(TELEMETRY_URL, { query }, {
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        timeout: 45000,
      });
      if (resp.data?.errors?.length && !resp.data?.data) {
        throw new Error(resp.data.errors.map((e: any) => e.message).join('; '));
      }
      return resp.data;
    } catch (e) {
      if (attempt === retries - 1) throw e;
      await sleep(1000 * (attempt + 1));
    }
  }
}

async function loadVehicles(): Promise<{ anonId: string; tokenId: number; provider: string; powertrain: string }[]> {
  const { execFileSync } = await import('child_process');
  const url = process.env.DATABASE_URL?.split('?')[0];
  if (!url) throw new Error('DATABASE_URL required');
  const raw = execFileSync(
    'psql',
    [url, '-At', '-F', ',', '-c', `
      SELECT row_number() OVER (ORDER BY v.id),
        dv.token_id,
        CASE WHEN v.dimo_vehicle_id IS NOT NULL THEN 'dimo' ELSE 'manual' END,
        coalesce(v.fuel_type::text,'unknown')
      FROM vehicles v
      JOIN dimo_vehicles dv ON dv.id = v.dimo_vehicle_id
      WHERE dv.token_id IS NOT NULL
      ORDER BY v.id
    `],
    { encoding: 'utf8' },
  ).trim();
  if (!raw) return [];
  return raw.split('\n').map((line) => {
    const [rank, tokenId, provider, powertrain] = line.split(',');
    return {
      anonId: `VEHICLE_${String(rank).padStart(3, '0')}`,
      tokenId: Number(tokenId),
      provider,
      powertrain,
    };
  });
}

async function queryAvailableSignals(jwt: string, tokenId: number): Promise<string[]> {
  const r = await gql(jwt, `query { availableSignals(tokenId: ${tokenId}) }`);
  return (r?.data?.availableSignals ?? []) as string[];
}

async function querySignalsLatest(jwt: string, tokenId: number, fields: string[]): Promise<Record<string, any>> {
  const body = fields.map((f) => `${f} { timestamp value }`).join('\n');
  const r = await gql(jwt, `query { signalsLatest(tokenId: ${tokenId}) { lastSeen ${body} } }`);
  return r?.data?.signalsLatest ?? {};
}

async function queryHistorical(
  jwt: string,
  tokenId: number,
  signalName: string,
  from: string,
  to: string,
  interval: string,
): Promise<{ timestamp: string; value: number | null }[]> {
  const r = await gql(
    jwt,
    `query {
      signals(tokenId: ${tokenId}, from: "${from}", to: "${to}", interval: "${interval}") {
        timestamp
        v: ${signalName}(agg: AVG)
      }
    }`,
  );
  const rows = (r?.data?.signals ?? []) as { timestamp: string; v: number | null }[];
  return rows.map((row) => ({ timestamp: row.timestamp, value: row.v }));
}

function buildHistoricalWindows(fromMs: number, toMs: number, chunkDays: number): { from: string; to: string }[] {
  const windows: { from: string; to: string }[] = [];
  let cursor = fromMs;
  while (cursor < toMs) {
    const end = Math.min(toMs, cursor + chunkDays * 24 * 60 * 60 * 1000);
    windows.push({ from: new Date(cursor).toISOString(), to: new Date(end).toISOString() });
    cursor = end;
  }
  return windows;
}

async function analyzeSignalHistory(
  jwt: string,
  tokenId: number,
  signalName: string,
  from60: Date,
  to: Date,
  interval: string,
): Promise<{
  samples: { timestamp: string; value: number | null }[];
  queryCount: number;
}> {
  const windows = buildHistoricalWindows(from60.getTime(), to.getTime(), 7);
  const samples: { timestamp: string; value: number | null }[] = [];
  let queryCount = 0;
  for (const w of windows) {
    queryCount++;
    const chunk = await queryHistorical(jwt, tokenId, signalName, w.from, w.to, interval);
    for (const s of chunk) {
      if (s.value != null && !Number.isNaN(s.value)) samples.push(s);
    }
    await sleep(250);
  }
  return { samples, queryCount };
}

function usabilityForSignal(
  spec: SignalSpec,
  listed: boolean,
  latestVal: number | null,
  sampleCount: number,
  coveragePercent: number,
  invalidRate: number,
): { usability: string; reason: string; recommendation: string } {
  if (!spec.documentedInDimoSchema) {
    return { usability: 'NOT_QUERIED', reason: 'NOT_DOCUMENTED', recommendation: 'DO_NOT_USE' };
  }
  if (!listed) {
    return { usability: 'DOCUMENTED_NOT_AVAILABLE', reason: 'Not in availableSignals', recommendation: 'DO_NOT_USE' };
  }
  if (sampleCount === 0 && latestVal == null) {
    return { usability: 'AVAILABLE_BUT_NO_HISTORICAL', reason: 'No samples in window', recommendation: 'LATER' };
  }
  if (spec.pressureSignal && latestVal != null) {
    const cls = classifyPressureValue(latestVal);
    if (cls === 'suspect_bar_stored_as_kpa') {
      return { usability: 'INVALID_OR_IMPLAUSIBLE', reason: 'Value 1.5-4.5 suggests bar not kPa; SynqDrive stores raw', recommendation: 'LATER' };
    }
    if (cls === 'invalid') {
      return { usability: 'INVALID_OR_IMPLAUSIBLE', reason: 'Out of plausible kPa range', recommendation: 'DO_NOT_USE' };
    }
  }
  if (coveragePercent < 5) {
    return { usability: 'SPORADIC', reason: `Coverage ${coveragePercent.toFixed(1)}%`, recommendation: 'LATER' };
  }
  if (invalidRate > 0.2) {
    return { usability: 'INVALID_OR_IMPLAUSIBLE', reason: `Invalid rate ${(invalidRate * 100).toFixed(0)}%`, recommendation: 'LATER' };
  }
  if (spec.synqDriveUsesInTireHealth && sampleCount > 10) {
    return { usability: 'USABLE', reason: 'Documented, covered, persisted path exists', recommendation: 'MVP' };
  }
  if (spec.tpmsWarning && sampleCount > 0) {
    return { usability: 'USABLE', reason: 'TPMS warning timeseries present', recommendation: 'MVP' };
  }
  if (spec.signalName === 'exteriorAirTemperature' && sampleCount > 20) {
    return { usability: 'USABLE', reason: 'Ambient context for season mismatch', recommendation: 'MVP' };
  }
  if (sampleCount > 0) {
    return { usability: 'SPORADIC', reason: 'Limited coverage or not wired', recommendation: 'LATER' };
  }
  return { usability: 'AVAILABLE_NO_LATEST_VALUE', reason: 'Listed but empty', recommendation: 'LATER' };
}

async function main(): Promise<void> {
  if (process.env.TIRE_HEALTH_DIMO_AUDIT_ALLOW_PROD !== '1') {
    throw new Error('Set TIRE_HEALTH_DIMO_AUDIT_ALLOW_PROD=1 for supervised read-only DIMO audit.');
  }

  const days = Number(parseArg('--days') ?? '60');
  const outputDir = path.resolve(parseArg('--output-dir') ?? path.join(scriptDir, '..', '..', 'docs', 'audits', 'data'));
  const now = new Date();
  const from60 = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const from14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const vehicles = await loadVehicles();
  const devJwt = await getDeveloperJwt();

  const capabilityRows: Record<string, string | number | boolean>[] = [];
  const timeseriesRows: Record<string, string | number | boolean | null>[] = [];
  let totalQueries = 0;

  const documentedSignals = SIGNAL_SPECS.filter((s) => s.documentedInDimoSchema);

  for (const vehicle of vehicles) {
    const jwt = await getVehicleJwt(devJwt, vehicle.tokenId);
    await sleep(300);

    const available = await queryAvailableSignals(jwt, vehicle.tokenId);
    totalQueries++;

    const latestFields = documentedSignals.map((s) => s.signalName);
    const latest = await querySignalsLatest(jwt, vehicle.tokenId, latestFields);
    totalQueries++;

    const dataSummary = await gql(jwt, `query { dataSummary(tokenId: ${vehicle.tokenId}) { firstSeen lastSeen numberOfSignals signalDataSummary { name numberOfSignals firstSeen lastSeen } } }`);
    totalQueries++;
    const summaryByName = new Map<string, { numberOfSignals: number; firstSeen: string; lastSeen: string }>();
    for (const row of dataSummary?.data?.dataSummary?.signalDataSummary ?? []) {
      summaryByName.set(row.name, row);
    }

    for (const spec of SIGNAL_SPECS) {
      const listed = available.includes(spec.signalName);
      const latestNode = latest[spec.signalName];
      const latestVal = latestNode?.value != null ? Number(latestNode.value) : null;
      const latestTs = latestNode?.timestamp ?? null;
      const ds = summaryByName.get(spec.signalName);

      let sampleCount60 = ds?.numberOfSignals != null ? Number(ds.numberOfSignals) : 0;
      let sampleCount14 = 0;
      let values60: number[] = [];
      let invalidCount = 0;
      let zeroCount = 0;
      let histQueries = 0;
      let firstSeen: string | null = ds?.firstSeen ?? null;
      let lastSeen: string | null = ds?.lastSeen ?? null;
      let medianCadence: number | null = null;
      let p95Cadence: number | null = null;
      let maxGap: number | null = null;
      let coveragePercent: number | null = null;

      const needsDeepHistory =
        spec.pressureSignal ||
        spec.tpmsWarning ||
        spec.signalName === 'exteriorAirTemperature' ||
        spec.signalName === 'speed' ||
        spec.signalName === 'powertrainTransmissionTravelledDistance';

      if (spec.documentedInDimoSchema && listed) {
        const interval = spec.pressureSignal || spec.tpmsWarning ? '3m' : spec.signalName === 'speed' ? '1m' : '15m';

        if (needsDeepHistory) {
          const hist60 = await analyzeSignalHistory(jwt, vehicle.tokenId, spec.signalName, from60, now, interval);
          histQueries += hist60.queryCount;
          totalQueries += hist60.queryCount;
          values60 = hist60.samples.map((s) => s.value as number);
          if (hist60.samples.length > 0) {
            sampleCount60 = Math.max(sampleCount60, hist60.samples.length);
            firstSeen = firstSeen ?? hist60.samples[0].timestamp;
            lastSeen = lastSeen ?? hist60.samples[hist60.samples.length - 1].timestamp;
            const cadence = cadenceStats(hist60.samples.map((s) => s.timestamp));
            medianCadence = cadence.medianCadenceSeconds;
            p95Cadence = cadence.p95CadenceSeconds;
            maxGap = cadence.maximumGapSeconds;
            const windowSec = (now.getTime() - from60.getTime()) / 1000;
            const bucketSec = interval === '1m' ? 60 : interval === '3m' ? 180 : 900;
            coveragePercent = windowSec > 0 ? Math.min(100, (hist60.samples.length / (windowSec / bucketSec)) * 100) : null;
          }
        } else if (ds?.numberOfSignals) {
          const windowSec = (now.getTime() - from60.getTime()) / 1000;
          coveragePercent = Math.min(100, (Number(ds.numberOfSignals) / (windowSec / 900)) * 100);
        }

        if (needsDeepHistory || listed) {
          const hist14 = await analyzeSignalHistory(jwt, vehicle.tokenId, spec.signalName, from14, now, interval);
          totalQueries += hist14.queryCount;
          histQueries += hist14.queryCount;
          sampleCount14 = hist14.samples.length;
          if (values60.length === 0 && hist14.samples.length > 0) {
            values60 = hist14.samples.map((s) => s.value as number);
            const cadence = cadenceStats(hist14.samples.map((s) => s.timestamp));
            medianCadence = cadence.medianCadenceSeconds;
            p95Cadence = cadence.p95CadenceSeconds;
            maxGap = cadence.maximumGapSeconds;
          }
        }
        for (const v of values60) {
          if (v === 0) zeroCount++;
          if (spec.pressureSignal && classifyPressureValue(v) === 'invalid') invalidCount++;
          if (spec.tpmsWarning && (v < 0 || v > 1)) invalidCount++;
        }
        await sleep(150);
      }

      const st = stats(values60);
      const invalidRate = sampleCount60 > 0 ? invalidCount / sampleCount60 : 0;
      const { usability, reason, recommendation } = usabilityForSignal(
        spec, listed, latestVal, sampleCount60, coveragePercent ?? 0, invalidRate,
      );

      capabilityRows.push({
        anonymizedVehicleId: vehicle.anonId,
        provider: vehicle.provider,
        powertrain: vehicle.powertrain,
        signalName: spec.signalName,
        documentedInDimoSchema: spec.documentedInDimoSchema,
        listedInAvailableSignals: listed,
        latestValueAvailable: latestVal != null,
        latestValue: latestVal != null ? Math.round(latestVal * 100) / 100 : '',
        latestTimestamp: latestTs ?? '',
        historicalValuesAvailable: sampleCount60 > 0,
        dataSummarySignalCount: ds?.numberOfSignals ?? 0,
        classification: usability,
        synqDrivePersistsSignal: spec.synqDriveField != null,
        synqDriveUsesSignal: spec.synqDriveUsesInTireHealth,
        dimoDocumentedUnit: spec.dimoUnit ?? 'NOT_DOCUMENTED',
        recommendation,
      });

      timeseriesRows.push({
        anonymizedVehicleId: vehicle.anonId,
        provider: vehicle.provider,
        powertrain: vehicle.powertrain,
        signalName: spec.signalName,
        documentedInDimoSchema: spec.documentedInDimoSchema,
        listedInAvailableSignals: listed,
        latestValueAvailable: latestVal != null,
        historicalValuesAvailable: sampleCount60 > 0,
        analysisWindowStart: from60.toISOString(),
        analysisWindowEnd: now.toISOString(),
        firstSeen: firstSeen ?? '',
        lastSeen: lastSeen ?? '',
        sampleCount60d: sampleCount60,
        sampleCount14d: sampleCount14,
        coveragePercent: coveragePercent != null ? Math.round(coveragePercent * 10) / 10 : '',
        medianCadenceSeconds: medianCadence != null ? Math.round(medianCadence) : '',
        p95CadenceSeconds: p95Cadence != null ? Math.round(p95Cadence) : '',
        maximumGapSeconds: maxGap != null ? Math.round(maxGap) : '',
        invalidRate: Math.round(invalidRate * 1000) / 1000,
        zeroValueCount: zeroCount,
        minimum: st.min != null ? Math.round(st.min * 100) / 100 : '',
        maximum: st.max != null ? Math.round(st.max * 100) / 100 : '',
        median: st.median != null ? Math.round(st.median * 100) / 100 : '',
        unit: spec.dimoUnit ?? 'NOT_DOCUMENTED',
        synqDrivePersistsSignal: spec.synqDriveField != null,
        synqDriveUsesSignal: spec.synqDriveUsesInTireHealth,
        tireHealthUsability: usability,
        finding: reason,
        recommendation,
      });
    }
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const capHeader = Object.keys(capabilityRows[0] ?? {});
  const capCsv = [capHeader.join(','), ...capabilityRows.map((r) => capHeader.map((h) => String(r[h] ?? '')).join(','))].join('\n');
  const tsHeader = Object.keys(timeseriesRows[0] ?? {});
  const tsCsv = [tsHeader.join(','), ...timeseriesRows.map((r) => tsHeader.map((h) => String(r[h] ?? '')).join(','))].join('\n');

  const capPath = path.join(outputDir, 'tire-health-dimo-signal-capability-2026-07.csv');
  const tsPath = path.join(outputDir, 'tire-health-dimo-timeseries-coverage-2026-07.csv');
  fs.writeFileSync(capPath, capCsv, 'utf8');
  fs.writeFileSync(tsPath, tsCsv, 'utf8');

  const summary = {
    auditId: AUDIT_ID,
    completedAt: now.toISOString(),
    vehiclesAnalyzed: vehicles.length,
    totalDimoQueries: totalQueries,
    signalsPerVehicle: SIGNAL_SPECS.length,
    notDocumentedSignalConcepts: NOT_DOCUMENTED_SIGNALS,
    outputFiles: [capPath, tsPath],
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
