#!/usr/bin/env ts-node
/**
 * Brake Health DIMO Signal Audit — read-only.
 *
 * Queries DIMO Telemetry API (availableSignals, signalsLatest, dataSummary,
 * historical signals, native events) for fleet vehicles. NO triggers/subscriptions.
 * NO GPS queries. NO raw timeseries in Git output.
 *
 * Usage (from repo root, supervised production):
 *   cd backend && BRAKE_HEALTH_DIMO_AUDIT_ALLOW_PROD=1 \
 *     npx ts-node -r tsconfig-paths/register ../scripts/audits/audit-brake-health-dimo-signals.ts
 *   cd backend && BRAKE_HEALTH_DIMO_AUDIT_ALLOW_PROD=1 \
 *     npx ts-node -r tsconfig-paths/register ../scripts/audits/audit-brake-health-dimo-signals.ts \
 *     --days=60 --output-dir=../docs/audits/data
 *
 * Environment (loaded from backend/.env if present):
 *   DATABASE_URL, DIMO_CLIENT_ID, DIMO_PRIVATE_KEY, DIMO_* URLs
 *   BRAKE_HEALTH_DIMO_AUDIT_ALLOW_PROD=1  required for production DB + DIMO
 */
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

const scriptDir = path.resolve(path.dirname(process.argv[1] ?? '.'));
const backendRoot = path.resolve(scriptDir, '..', '..', 'backend');
const requireFromBackend = createRequire(path.join(backendRoot, 'package.json'));
const axios = requireFromBackend('axios');
const { Wallet } = requireFromBackend('ethers');

{
  const envPath = path.resolve(backendRoot, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

const AUDIT_ID = 'brake-health-dimo-signals-2026-07';

interface SignalSpec {
  signalName: string;
  documentedInDimoSchema: boolean;
  dimoUnit: string | null;
  synqDriveField: string | null;
  synqDrivePersists: boolean;
  synqDriveUsesInDrivingImpact: boolean;
  synqDriveUsesInBrakeHealth: boolean;
  brakeSignal?: boolean;
  pressureSignal?: boolean;
  binarySignal?: boolean;
  evSignal?: boolean;
  contextSignal?: boolean;
}

/** Verified against DIMO Telemetry API — Vehicle Signals (2026-07). */
const SIGNAL_SPECS: SignalSpec[] = [
  { signalName: 'chassisBrakeIsPedalPressed', documentedInDimoSchema: true, dimoUnit: '0/1', synqDriveField: null, synqDrivePersists: false, synqDriveUsesInDrivingImpact: false, synqDriveUsesInBrakeHealth: false, brakeSignal: true, binarySignal: true },
  { signalName: 'chassisBrakePedalPosition', documentedInDimoSchema: true, dimoUnit: 'percent', synqDriveField: null, synqDrivePersists: false, synqDriveUsesInDrivingImpact: false, synqDriveUsesInBrakeHealth: false, brakeSignal: true },
  { signalName: 'chassisParkingBrakeIsEngaged', documentedInDimoSchema: true, dimoUnit: '0/1', synqDriveField: null, synqDrivePersists: false, synqDriveUsesInDrivingImpact: false, synqDriveUsesInBrakeHealth: false, brakeSignal: true, binarySignal: true },
  { signalName: 'chassisBrakeABSIsWarningOn', documentedInDimoSchema: true, dimoUnit: '0/1', synqDriveField: null, synqDrivePersists: false, synqDriveUsesInDrivingImpact: false, synqDriveUsesInBrakeHealth: false, brakeSignal: true, binarySignal: true },
  { signalName: 'chassisBrakeCircuit1PressurePrimary', documentedInDimoSchema: true, dimoUnit: 'kPa', synqDriveField: null, synqDrivePersists: false, synqDriveUsesInDrivingImpact: false, synqDriveUsesInBrakeHealth: false, brakeSignal: true, pressureSignal: true },
  { signalName: 'chassisBrakeCircuit2PressurePrimary', documentedInDimoSchema: true, dimoUnit: 'kPa', synqDriveField: null, synqDrivePersists: false, synqDriveUsesInDrivingImpact: false, synqDriveUsesInBrakeHealth: false, brakeSignal: true, pressureSignal: true },
  { signalName: 'speed', documentedInDimoSchema: true, dimoUnit: 'km/h', synqDriveField: 'speed_kmh', synqDrivePersists: true, synqDriveUsesInDrivingImpact: true, synqDriveUsesInBrakeHealth: true, contextSignal: true },
  { signalName: 'angularVelocityYaw', documentedInDimoSchema: true, dimoUnit: 'deg/s', synqDriveField: null, synqDrivePersists: false, synqDriveUsesInDrivingImpact: false, synqDriveUsesInBrakeHealth: false, contextSignal: true },
  { signalName: 'powertrainTransmissionTravelledDistance', documentedInDimoSchema: true, dimoUnit: 'km', synqDriveField: 'odometer_km', synqDrivePersists: true, synqDriveUsesInDrivingImpact: true, synqDriveUsesInBrakeHealth: true, contextSignal: true },
  { signalName: 'isIgnitionOn', documentedInDimoSchema: true, dimoUnit: '0/1', synqDriveField: 'is_ignition_on', synqDrivePersists: true, synqDriveUsesInDrivingImpact: true, synqDriveUsesInBrakeHealth: false, contextSignal: true, binarySignal: true },
  { signalName: 'powertrainType', documentedInDimoSchema: true, dimoUnit: 'enum', synqDriveField: null, synqDrivePersists: false, synqDriveUsesInDrivingImpact: false, synqDriveUsesInBrakeHealth: false, contextSignal: true },
  { signalName: 'powertrainTractionBatteryCurrentPower', documentedInDimoSchema: true, dimoUnit: 'W', synqDriveField: 'traction_battery_power_kw', synqDrivePersists: true, synqDriveUsesInDrivingImpact: false, synqDriveUsesInBrakeHealth: false, evSignal: true, contextSignal: true },
  { signalName: 'obdDTCList', documentedInDimoSchema: true, dimoUnit: 'list', synqDriveField: 'obd_dtc_list', synqDrivePersists: true, synqDriveUsesInDrivingImpact: false, synqDriveUsesInBrakeHealth: false, contextSignal: true },
  { signalName: 'obdStatusDTCCount', documentedInDimoSchema: true, dimoUnit: 'count', synqDriveField: null, synqDrivePersists: false, synqDriveUsesInDrivingImpact: false, synqDriveUsesInBrakeHealth: false, contextSignal: true },
  { signalName: 'exteriorAirTemperature', documentedInDimoSchema: true, dimoUnit: 'degC', synqDriveField: null, synqDrivePersists: false, synqDriveUsesInDrivingImpact: false, synqDriveUsesInBrakeHealth: false, contextSignal: true },
  { signalName: 'powertrainTransmissionRetarderActualTorque', documentedInDimoSchema: true, dimoUnit: 'percent', synqDriveField: null, synqDrivePersists: false, synqDriveUsesInDrivingImpact: false, synqDriveUsesInBrakeHealth: false, brakeSignal: true },
  { signalName: 'powertrainTransmissionRetarderTorqueMode', documentedInDimoSchema: true, dimoUnit: 'enum', synqDriveField: null, synqDrivePersists: false, synqDriveUsesInDrivingImpact: false, synqDriveUsesInBrakeHealth: false, brakeSignal: true },
  { signalName: 'chassisAxleRow1WheelLeftSpeed', documentedInDimoSchema: true, dimoUnit: 'km/h', synqDriveField: null, synqDrivePersists: false, synqDriveUsesInDrivingImpact: false, synqDriveUsesInBrakeHealth: false, brakeSignal: true },
  { signalName: 'chassisAxleRow1WheelRightSpeed', documentedInDimoSchema: true, dimoUnit: 'km/h', synqDriveField: null, synqDrivePersists: false, synqDriveUsesInDrivingImpact: false, synqDriveUsesInBrakeHealth: false, brakeSignal: true },
  { signalName: 'chassisAxleRow3Weight', documentedInDimoSchema: true, dimoUnit: 'kg', synqDriveField: null, synqDrivePersists: false, synqDriveUsesInDrivingImpact: false, synqDriveUsesInBrakeHealth: false, contextSignal: true },
  { signalName: 'chassisAxleRow4Weight', documentedInDimoSchema: true, dimoUnit: 'kg', synqDriveField: null, synqDrivePersists: false, synqDriveUsesInDrivingImpact: false, synqDriveUsesInBrakeHealth: false, contextSignal: true },
  { signalName: 'chassisAxleRow5Weight', documentedInDimoSchema: true, dimoUnit: 'kg', synqDriveField: null, synqDrivePersists: false, synqDriveUsesInDrivingImpact: false, synqDriveUsesInBrakeHealth: false, contextSignal: true },
];

const NOT_DOCUMENTED_CONCEPTS = [
  'Rear Wheel Speeds (no chassisAxleRow2Wheel*Speed in DIMO schema)',
  'Brake Pad Wear Sensor',
  'Brake Pad Thickness',
  'Brake Disc Thickness',
  'Brake Fluid Status',
  'Brake Fluid Pressure',
  'Brake Temperature',
  'Brake Torque',
  'Friction Brake Torque',
  'Regenerative Brake Torque',
  'Master Cylinder Pressure',
  'ABS Active (only chassisBrakeABSIsWarningOn telltale documented)',
  'ESC Active',
  'Traction Control Active',
  'Brake Warning Light (generic)',
  'Electronic Parking Brake Fault',
  'Vehicle Mass (passenger)',
];

const DIMO_BRAKING_EVENTS = [
  'behavior.harshBraking',
  'behavior.extremeBraking',
  'behavior.extremeEmergency',
  'behavior.extremeEmergencyBraking',
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

function csvEscape(v: string | number | boolean | null | undefined): string {
  const s = v == null ? '' : String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(filePath: string, rows: Record<string, string | number | boolean | null>[]): void {
  if (rows.length === 0) {
    fs.writeFileSync(filePath, '', 'utf8');
    return;
  }
  const header = Object.keys(rows[0]);
  const lines = [header.join(','), ...rows.map((r) => header.map((h) => csvEscape(r[h])).join(','))];
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

function classifyPressureKpa(v: number): 'plausible' | 'invalid' | 'suspect_offset' {
  if (v < 0 || v > 30000) return 'invalid';
  if (v >= 50 && v <= 25000) return 'plausible';
  if (v > 0 && v < 50) return 'suspect_offset';
  return 'invalid';
}

function classifyPedalPercent(v: number): boolean {
  return v >= 0 && v <= 100;
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
        timeout: 60000,
      });
      if (resp.data?.errors?.length && !resp.data?.data) {
        throw new Error(resp.data.errors.map((e: any) => e.message).join('; '));
      }
      return resp.data;
    } catch (e) {
      if (attempt === retries - 1) throw e;
      await sleep(1500 * (attempt + 1));
    }
  }
}

interface FleetVehicle {
  anonId: string;
  tokenId: number;
  provider: string;
  powertrain: string;
  hardwareType: string;
  synqDriveBrakePadPercent: boolean;
  synqDriveObdDtc: boolean;
  synqDriveTractionPower: boolean;
  synqDriveHarshBraking60d: number;
  synqDriveExtremeBraking60d: number;
  synqDriveTripBehaviorBraking60d: number;
}

async function loadVehicles(from60: Date): Promise<FleetVehicle[]> {
  const { execFileSync } = await import('child_process');
  const url = process.env.DATABASE_URL?.split('?')[0];
  if (!url) throw new Error('DATABASE_URL required');
  const since = from60.toISOString();
  const raw = execFileSync(
    'psql',
    [url, '-At', '-F', '\t', '-c', `
      SELECT row_number() OVER (ORDER BY v.id),
        dv.token_id,
        CASE WHEN v.dimo_vehicle_id IS NOT NULL THEN 'dimo' ELSE 'manual' END,
        coalesce(v.fuel_type::text,'unknown'),
        coalesce(v.hardware_type::text,'unknown'),
        (vls.brake_pad_percent IS NOT NULL),
        (vls.obd_dtc_list IS NOT NULL AND vls.obd_dtc_list::text NOT IN ('null','[]','')),
        (vls.traction_battery_power_kw IS NOT NULL),
        coalesce((SELECT count(*) FROM driving_events de WHERE de.vehicle_id = v.id AND de.event_type = 'HARSH_BRAKING' AND de.recorded_at >= '${since}'::timestamptz), 0),
        coalesce((SELECT count(*) FROM driving_events de WHERE de.vehicle_id = v.id AND de.event_type = 'EXTREME_BRAKING' AND de.recorded_at >= '${since}'::timestamptz), 0),
        coalesce((SELECT count(*) FROM trip_behavior_events tbe WHERE tbe.vehicle_id = v.id AND tbe.event_category = 'BRAKING' AND tbe.started_at >= '${since}'::timestamptz), 0)
      FROM vehicles v
      JOIN dimo_vehicles dv ON dv.id = v.dimo_vehicle_id
      LEFT JOIN vehicle_latest_states vls ON vls.vehicle_id = v.id
      WHERE dv.token_id IS NOT NULL
      ORDER BY v.id
    `],
    { encoding: 'utf8' },
  ).trim();
  if (!raw) return [];
  return raw.split('\n').map((line) => {
    const [rank, tokenId, provider, powertrain, hardwareType, brakePad, obdDtc, traction, harsh, extreme, tripBeh] = line.split('\t');
    return {
      anonId: `VEHICLE_${String(rank).padStart(3, '0')}`,
      tokenId: Number(tokenId),
      provider,
      powertrain,
      hardwareType,
      synqDriveBrakePadPercent: brakePad === 't',
      synqDriveObdDtc: obdDtc === 't',
      synqDriveTractionPower: traction === 't',
      synqDriveHarshBraking60d: Number(harsh),
      synqDriveExtremeBraking60d: Number(extreme),
      synqDriveTripBehaviorBraking60d: Number(tripBeh),
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
  from: Date,
  to: Date,
  interval: string,
): Promise<{ samples: { timestamp: string; value: number }[]; queryCount: number }> {
  const windows = buildHistoricalWindows(from.getTime(), to.getTime(), 7);
  const samples: { timestamp: string; value: number }[] = [];
  let queryCount = 0;
  for (const w of windows) {
    queryCount++;
    try {
      const chunk = await queryHistorical(jwt, tokenId, signalName, w.from, w.to, interval);
      for (const s of chunk) {
        if (s.value != null && !Number.isNaN(s.value)) samples.push({ timestamp: s.timestamp, value: s.value });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('422')) throw err;
    }
    await sleep(300);
  }
  return { samples, queryCount };
}

function intervalForSignal(spec: SignalSpec): string {
  if (spec.signalName === 'speed' || spec.brakeSignal) return '1m';
  if (spec.pressureSignal) return '3m';
  if (spec.evSignal) return '1m';
  return '15m';
}

function bucketSeconds(interval: string): number {
  if (interval === '1m') return 60;
  if (interval === '3m') return 180;
  return 900;
}

function isHistoricallyQueryable(spec: SignalSpec, powertrain: string): boolean {
  if (!spec.documentedInDimoSchema) return false;
  if (
    spec.signalName === 'obdDTCList' ||
    spec.signalName === 'powertrainType' ||
    spec.signalName === 'powertrainTransmissionRetarderTorqueMode'
  ) {
    return false;
  }
  return (
    spec.brakeSignal ||
    spec.signalName === 'speed' ||
    (spec.evSignal && powertrain === 'ELECTRIC') ||
    spec.signalName === 'obdStatusDTCCount'
  );
}

type UsabilityClass =
  | 'NOT_DOCUMENTED'
  | 'DOCUMENTED_NOT_AVAILABLE'
  | 'AVAILABLE_NO_LATEST'
  | 'AVAILABLE_NO_HISTORY'
  | 'SPORADIC'
  | 'USABLE'
  | 'INVALID_OR_IMPLAUSIBLE';

function classifyUsability(
  spec: SignalSpec,
  listed: boolean,
  latestVal: number | null,
  sampleCount: number,
  coveragePercent: number,
  invalidRate: number,
  stuckBinary: boolean,
): { usability: UsabilityClass; reason: string; recommendation: string } {
  if (!spec.documentedInDimoSchema) {
    return { usability: 'NOT_DOCUMENTED', reason: 'NOT_DOCUMENTED', recommendation: 'DO_NOT_USE' };
  }
  if (!listed) {
    return { usability: 'DOCUMENTED_NOT_AVAILABLE', reason: 'Not in availableSignals', recommendation: 'DO_NOT_USE' };
  }
  if (latestVal == null && sampleCount === 0) {
    return { usability: 'AVAILABLE_NO_LATEST', reason: 'Listed but no latest or history', recommendation: 'LATER' };
  }
  if (sampleCount === 0) {
    return { usability: 'AVAILABLE_NO_HISTORY', reason: 'Latest exists but no retrievable 60d series', recommendation: 'LATER' };
  }
  if (stuckBinary) {
    return { usability: 'INVALID_OR_IMPLAUSIBLE', reason: 'Binary signal stuck at single value', recommendation: 'DO_NOT_USE' };
  }
  if (invalidRate > 0.15) {
    return { usability: 'INVALID_OR_IMPLAUSIBLE', reason: `Invalid rate ${(invalidRate * 100).toFixed(0)}%`, recommendation: 'LATER' };
  }
  if (coveragePercent < 5) {
    return { usability: 'SPORADIC', reason: `Coverage ${coveragePercent.toFixed(1)}%`, recommendation: 'LATER' };
  }
  if (spec.brakeSignal && sampleCount >= 20 && coveragePercent >= 5) {
    return { usability: 'USABLE', reason: 'Brake signal with adequate coverage', recommendation: 'MVP' };
  }
  if (spec.contextSignal && sampleCount >= 20) {
    return { usability: 'USABLE', reason: 'Context signal with historical series', recommendation: 'MVP' };
  }
  if (sampleCount > 0) {
    return { usability: 'SPORADIC', reason: 'Limited coverage or semantics unverified', recommendation: 'LATER' };
  }
  return { usability: 'AVAILABLE_NO_HISTORY', reason: 'No historical buckets', recommendation: 'LATER' };
}

interface DimoEventRow {
  timestamp: string;
  name: string;
  source: string;
}

async function queryDimoEvents(jwt: string, tokenId: number, from: Date, to: Date): Promise<DimoEventRow[]> {
  const namesJson = DIMO_BRAKING_EVENTS.map((n) => `"${n}"`).join(', ');
  const r = await gql(
    jwt,
    `query {
      events(tokenId: ${tokenId}, from: "${from.toISOString()}", to: "${to.toISOString()}", filter: { name: { in: [${namesJson}] } }) {
        timestamp name source
      }
    }`,
  );
  return (r?.data?.events ?? []) as DimoEventRow[];
}

function analyzeBinaryTransitions(samples: { timestamp: string; value: number }[]): {
  transitionCount: number;
  stuckAtZero: boolean;
  stuckAtOne: boolean;
  meanOnDurationSeconds: number | null;
} {
  if (samples.length === 0) return { transitionCount: 0, stuckAtZero: false, stuckAtOne: false, meanOnDurationSeconds: null };
  const vals = samples.map((s) => (s.value >= 0.5 ? 1 : 0));
  const unique = new Set(vals);
  let transitions = 0;
  const onDurations: number[] = [];
  let onStart: number | null = null;
  for (let i = 0; i < samples.length; i++) {
    if (i > 0 && vals[i] !== vals[i - 1]) transitions++;
    const t = new Date(samples[i].timestamp).getTime();
    if (vals[i] === 1) {
      if (onStart == null) onStart = t;
    } else if (onStart != null) {
      onDurations.push((t - onStart) / 1000);
      onStart = null;
    }
  }
  if (onStart != null && samples.length > 1) {
    const lastT = new Date(samples[samples.length - 1].timestamp).getTime();
    onDurations.push((lastT - onStart) / 1000);
  }
  return {
    transitionCount: transitions,
    stuckAtZero: unique.size === 1 && vals[0] === 0,
    stuckAtOne: unique.size === 1 && vals[0] === 1,
    meanOnDurationSeconds: onDurations.length ? onDurations.reduce((a, b) => a + b, 0) / onDurations.length : null,
  };
}

function correlateDecelerationWithSignal(
  speedSamples: { timestamp: string; value: number }[],
  signalSamples: { timestamp: string; value: number }[],
  signalThreshold: (v: number) => boolean,
  decelThresholdKmh = 3,
): {
  decelEvents: number;
  correlatedEvents: number;
  correlationRate: number | null;
} {
  const signalByTs = new Map(signalSamples.map((s) => [s.timestamp, s.value]));
  let decelEvents = 0;
  let correlated = 0;
  for (let i = 1; i < speedSamples.length; i++) {
    const prev = speedSamples[i - 1];
    const cur = speedSamples[i];
    if (prev.timestamp !== cur.timestamp && prev.value - cur.value >= decelThresholdKmh && cur.value > 2) {
      decelEvents++;
      const sig = signalByTs.get(cur.timestamp) ?? signalByTs.get(prev.timestamp);
      if (sig != null && signalThreshold(sig)) correlated++;
    }
  }
  return {
    decelEvents,
    correlatedEvents: correlated,
    correlationRate: decelEvents > 0 ? correlated / decelEvents : null,
  };
}

function analyzeEvRegenDuringDecel(
  speedSamples: { timestamp: string; value: number }[],
  powerSamples: { timestamp: string; value: number }[],
): {
  decelSamples: number;
  regenPositivePowerSamples: number;
  regenDuringDecelRate: number | null;
} {
  const powerByTs = new Map(powerSamples.map((s) => [s.timestamp, s.value]));
  let decel = 0;
  let regen = 0;
  for (let i = 1; i < speedSamples.length; i++) {
    const prev = speedSamples[i - 1];
    const cur = speedSamples[i];
    if (prev.value - cur.value >= 2 && cur.value > 2) {
      decel++;
      const p = powerByTs.get(cur.timestamp);
      if (p != null && p > 500) regen++;
    }
  }
  return {
    decelSamples: decel,
    regenPositivePowerSamples: regen,
    regenDuringDecelRate: decel > 0 ? regen / decel : null,
  };
}

function normalizedCorrectly(spec: SignalSpec, vehicle: FleetVehicle): boolean | null {
  if (!spec.synqDrivePersists) return null;
  if (spec.signalName === 'powertrainTractionBatteryCurrentPower') {
    return vehicle.synqDriveTractionPower;
  }
  if (spec.signalName === 'obdDTCList') {
    return vehicle.synqDriveObdDtc;
  }
  return true;
}

async function main(): Promise<void> {
  if (process.env.BRAKE_HEALTH_DIMO_AUDIT_ALLOW_PROD !== '1') {
    throw new Error('Set BRAKE_HEALTH_DIMO_AUDIT_ALLOW_PROD=1 for supervised read-only DIMO audit.');
  }

  const days = Number(parseArg('--days') ?? '60');
  const outputDir = path.resolve(parseArg('--output-dir') ?? path.join(scriptDir, '..', '..', 'docs', 'audits', 'data'));
  const now = new Date();
  const from60 = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const from14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const vehicles = await loadVehicles(from60);
  const devJwt = await getDeveloperJwt();

  const capabilityRows: Record<string, string | number | boolean | null>[] = [];
  const timeseriesRows: Record<string, string | number | boolean | null>[] = [];
  const correlationRows: Record<string, string | number | boolean | null>[] = [];
  let totalQueries = 0;

  const documentedSignals = SIGNAL_SPECS.filter((s) => s.documentedInDimoSchema);

  for (const vehicle of vehicles) {
    const jwt = await getVehicleJwt(devJwt, vehicle.tokenId);
    await sleep(400);

    const available = await queryAvailableSignals(jwt, vehicle.tokenId);
    totalQueries++;

    const latestFields = documentedSignals.filter((s) => available.includes(s.signalName)).map((s) => s.signalName);
    const latest =
      latestFields.length > 0
        ? await querySignalsLatest(jwt, vehicle.tokenId, latestFields)
        : ({} as Record<string, any>);
    totalQueries++;

    const dataSummary = await gql(
      jwt,
      `query { dataSummary(tokenId: ${vehicle.tokenId}) { firstSeen lastSeen numberOfSignals signalDataSummary { name numberOfSignals firstSeen lastSeen } eventDataSummary { name numberOfEvents firstSeen lastSeen } } }`,
    );
    totalQueries++;
    const summaryByName = new Map<string, { numberOfSignals: number; firstSeen: string; lastSeen: string }>();
    for (const row of dataSummary?.data?.dataSummary?.signalDataSummary ?? []) {
      summaryByName.set(row.name, row);
    }

    const dimoEvents60 = await queryDimoEvents(jwt, vehicle.tokenId, from60, now);
    totalQueries++;
    const dimoEvents14 = dimoEvents60.filter((e) => new Date(e.timestamp) >= from14);
    const eventCounts = new Map<string, number>();
    for (const e of dimoEvents60) {
      eventCounts.set(e.name, (eventCounts.get(e.name) ?? 0) + 1);
    }
    const duplicateEventTimestamps = (() => {
      const seen = new Set<string>();
      let dupes = 0;
      for (const e of dimoEvents60) {
        const key = `${e.name}|${e.timestamp}`;
        if (seen.has(key)) dupes++;
        else seen.add(key);
      }
      return dupes;
    })();

    const historyCache = new Map<string, { samples60: { timestamp: string; value: number }[]; samples14: { timestamp: string; value: number }[]; queryCount: number }>();
    const speedHistory60: { timestamp: string; value: number }[] = [];

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
      let stuckBinary = false;

      const shouldQueryHistory = listed && isHistoricallyQueryable(spec, vehicle.powertrain);

      if (shouldQueryHistory) {
        const interval = intervalForSignal(spec);
        const cacheKey = `${vehicle.tokenId}:${spec.signalName}`;
        let cached = historyCache.get(cacheKey);
        if (!cached) {
          const hist60 = await analyzeSignalHistory(jwt, vehicle.tokenId, spec.signalName, from60, now, interval);
          const hist14 = await analyzeSignalHistory(jwt, vehicle.tokenId, spec.signalName, from14, now, interval);
          cached = { samples60: hist60.samples, samples14: hist14.samples, queryCount: hist60.queryCount + hist14.queryCount };
          historyCache.set(cacheKey, cached);
          histQueries = cached.queryCount;
          totalQueries += cached.queryCount;
        } else {
          histQueries = cached.queryCount;
        }

        values60 = cached.samples60.map((s) => s.value);
        sampleCount14 = cached.samples14.length;
        if (cached.samples60.length > 0) {
          sampleCount60 = Math.max(sampleCount60, cached.samples60.length);
          firstSeen = firstSeen ?? cached.samples60[0].timestamp;
          lastSeen = lastSeen ?? cached.samples60[cached.samples60.length - 1].timestamp;
          const cadence = cadenceStats(cached.samples60.map((s) => s.timestamp));
          medianCadence = cadence.medianCadenceSeconds;
          p95Cadence = cadence.p95CadenceSeconds;
          maxGap = cadence.maximumGapSeconds;
          const windowSec = (now.getTime() - from60.getTime()) / 1000;
          coveragePercent = windowSec > 0 ? Math.min(100, (cached.samples60.length / (windowSec / bucketSeconds(interval))) * 100) : null;
        }
        if (spec.signalName === 'speed') {
          speedHistory60.push(...cached.samples60);
        }
        if (spec.binarySignal && cached.samples60.length > 0) {
          const bin = analyzeBinaryTransitions(cached.samples60);
          stuckBinary = bin.stuckAtZero || bin.stuckAtOne;
        }
        await sleep(150);
      } else if (ds?.numberOfSignals) {
        const windowSec = (now.getTime() - from60.getTime()) / 1000;
        coveragePercent = Math.min(100, (Number(ds.numberOfSignals) / (windowSec / 900)) * 100);
      }

      for (const v of values60) {
        if (v === 0) zeroCount++;
        if (spec.pressureSignal && classifyPressureKpa(v) === 'invalid') invalidCount++;
        if (spec.signalName === 'chassisBrakePedalPosition' && !classifyPedalPercent(v)) invalidCount++;
        if (spec.binarySignal && (v < 0 || v > 1)) invalidCount++;
      }

      const st = stats(values60);
      const invalidRate = values60.length > 0 ? invalidCount / values60.length : 0;
      const { usability, reason, recommendation } = classifyUsability(
        spec, listed, latestVal, sampleCount60, coveragePercent ?? 0, invalidRate, stuckBinary,
      );

      const synqUses = spec.synqDriveUsesInBrakeHealth || spec.synqDriveUsesInDrivingImpact;
      const brakeHealthUsability =
        spec.brakeSignal && usability === 'USABLE'
          ? 'BRAKE_LOAD_CANDIDATE'
          : spec.brakeSignal
            ? usability
            : spec.synqDriveUsesInBrakeHealth && usability === 'USABLE'
              ? 'CONTEXT_ONLY'
              : usability;

      capabilityRows.push({
        anonymizedVehicleId: vehicle.anonId,
        provider: vehicle.provider,
        powertrain: vehicle.powertrain,
        hardwareType: vehicle.hardwareType,
        signalName: spec.signalName,
        documentedInDimoSchema: spec.documentedInDimoSchema,
        listedInAvailableSignals: listed,
        latestValueAvailable: latestVal != null,
        latestValue: latestVal != null ? Math.round(latestVal * 100) / 100 : '',
        latestTimestamp: latestTs ?? '',
        historicalValuesAvailable: sampleCount60 > 0 && values60.length > 0,
        dataSummarySignalCount: ds?.numberOfSignals ?? 0,
        classification: usability,
        synqDrivePersists: spec.synqDrivePersists,
        synqDriveUses: synqUses,
        normalizedCorrectly: normalizedCorrectly(spec, vehicle) ?? '',
        dimoDocumentedUnit: spec.dimoUnit ?? 'NOT_DOCUMENTED',
        recommendation,
      });

      timeseriesRows.push({
        anonymizedVehicleId: vehicle.anonId,
        provider: vehicle.provider,
        powertrain: vehicle.powertrain,
        signalName: spec.signalName,
        documented: spec.documentedInDimoSchema,
        available: listed,
        latestAvailable: latestVal != null,
        historyAvailable: values60.length > 0,
        windowStart: from60.toISOString(),
        windowEnd: now.toISOString(),
        firstSeen: firstSeen ?? '',
        lastSeen: lastSeen ?? '',
        sampleCount: sampleCount60,
        sampleCount14d: sampleCount14,
        coveragePercent: coveragePercent != null ? Math.round(coveragePercent * 10) / 10 : '',
        medianCadenceSeconds: medianCadence != null ? Math.round(medianCadence) : '',
        p95CadenceSeconds: p95Cadence != null ? Math.round(p95Cadence) : '',
        maximumGapSeconds: maxGap != null ? Math.round(maxGap) : '',
        invalidRate: Math.round(invalidRate * 1000) / 1000,
        zeroRate: values60.length ? Math.round((zeroCount / values60.length) * 1000) / 1000 : '',
        min: st.min != null ? Math.round(st.min * 100) / 100 : '',
        max: st.max != null ? Math.round(st.max * 100) / 100 : '',
        median: st.median != null ? Math.round(st.median * 100) / 100 : '',
        p01: st.p01 != null ? Math.round(st.p01 * 100) / 100 : '',
        p99: st.p99 != null ? Math.round(st.p99 * 100) / 100 : '',
        unit: spec.dimoUnit ?? 'NOT_DOCUMENTED',
        sourceProvider: vehicle.hardwareType,
        synqDrivePersists: spec.synqDrivePersists,
        synqDriveUses: synqUses,
        brakeHealthUsability: brakeHealthUsability,
        finding: reason,
        recommendation,
      });
    }

    const speedSamples = historyCache.get(`${vehicle.tokenId}:speed`)?.samples60 ?? speedHistory60;
    const pedalPressed = historyCache.get(`${vehicle.tokenId}:chassisBrakeIsPedalPressed`)?.samples60 ?? [];
    const pedalPosition = historyCache.get(`${vehicle.tokenId}:chassisBrakePedalPosition`)?.samples60 ?? [];
    const circuit1 = historyCache.get(`${vehicle.tokenId}:chassisBrakeCircuit1PressurePrimary`)?.samples60 ?? [];
    const circuit2 = historyCache.get(`${vehicle.tokenId}:chassisBrakeCircuit2PressurePrimary`)?.samples60 ?? [];
    const absWarning = historyCache.get(`${vehicle.tokenId}:chassisBrakeABSIsWarningOn`)?.samples60 ?? [];
    const parkingBrake = historyCache.get(`${vehicle.tokenId}:chassisParkingBrakeIsEngaged`)?.samples60 ?? [];
    const wheelL = historyCache.get(`${vehicle.tokenId}:chassisAxleRow1WheelLeftSpeed`)?.samples60 ?? [];
    const wheelR = historyCache.get(`${vehicle.tokenId}:chassisAxleRow1WheelRightSpeed`)?.samples60 ?? [];
    const evPower = historyCache.get(`${vehicle.tokenId}:powertrainTractionBatteryCurrentPower`)?.samples60 ?? [];

    const pedalPressedBin = analyzeBinaryTransitions(pedalPressed);
    const absBin = analyzeBinaryTransitions(absWarning);
    const parkingBin = analyzeBinaryTransitions(parkingBrake);

    const decelPedalPressed = correlateDecelerationWithSignal(speedSamples, pedalPressed, (v) => v >= 0.5);
    const decelPedalPosition = correlateDecelerationWithSignal(speedSamples, pedalPosition, (v) => v >= 10);
    const decelCircuit1 = correlateDecelerationWithSignal(speedSamples, circuit1, (v) => v >= 100);
    const evRegen = vehicle.powertrain === 'ELECTRIC' ? analyzeEvRegenDuringDecel(speedSamples, evPower) : null;

    const wheelSync =
      wheelL.length > 0 && wheelR.length > 0
        ? (() => {
            const rMap = new Map(wheelR.map((s) => [s.timestamp, s.value]));
            const diffs: number[] = [];
            for (const l of wheelL) {
              const r = rMap.get(l.timestamp);
              if (r != null) diffs.push(Math.abs(l.value - r));
            }
            const med = diffs.length ? percentile([...diffs].sort((a, b) => a - b), 50) : null;
            return { pairs: diffs.length, medianAbsDiffKmh: med };
          })()
        : { pairs: 0, medianAbsDiffKmh: null as number | null };

    correlationRows.push({
      anonymizedVehicleId: vehicle.anonId,
      provider: vehicle.provider,
      powertrain: vehicle.powertrain,
      hardwareType: vehicle.hardwareType,
      analysisWindowDays: days,
      pedalPressedListed: available.includes('chassisBrakeIsPedalPressed'),
      pedalPressedSampleCount: pedalPressed.length,
      pedalPressedTransitions: pedalPressedBin.transitionCount,
      pedalPressedStuck: pedalPressedBin.stuckAtZero || pedalPressedBin.stuckAtOne,
      pedalPressedMeanOnDurationSec: pedalPressedBin.meanOnDurationSeconds != null ? Math.round(pedalPressedBin.meanOnDurationSeconds) : '',
      decelEventsTotal: decelPedalPressed.decelEvents,
      decelWithPedalPressedRate: decelPedalPressed.correlationRate != null ? Math.round(decelPedalPressed.correlationRate * 1000) / 1000 : '',
      pedalPositionSampleCount: pedalPosition.length,
      decelWithPedalPositionRate: decelPedalPosition.correlationRate != null ? Math.round(decelPedalPosition.correlationRate * 1000) / 1000 : '',
      circuit1SampleCount: circuit1.length,
      circuit2SampleCount: circuit2.length,
      decelWithCircuit1PressureRate: decelCircuit1.correlationRate != null ? Math.round(decelCircuit1.correlationRate * 1000) / 1000 : '',
      absWarningTransitions: absBin.transitionCount,
      absWarningActiveSamples: absWarning.filter((s) => s.value >= 0.5).length,
      parkingBrakeWhileMoving: (() => {
        if (!parkingBrake.length || !speedSamples.length) return '';
        const parkMap = new Map(parkingBrake.map((s) => [s.timestamp, s.value >= 0.5]));
        let count = 0;
        for (const sp of speedSamples) {
          if (sp.value > 5 && parkMap.get(sp.timestamp)) count++;
        }
        return count;
      })(),
      wheelSpeedPairs: wheelSync.pairs,
      wheelSpeedMedianAbsDiffKmh: wheelSync.medianAbsDiffKmh != null ? Math.round(wheelSync.medianAbsDiffKmh * 100) / 100 : '',
      evDecelSamples: evRegen?.decelSamples ?? '',
      evRegenDuringDecelRate: evRegen?.regenDuringDecelRate != null ? Math.round(evRegen.regenDuringDecelRate * 1000) / 1000 : '',
      dimoHarshBraking60d: eventCounts.get('behavior.harshBraking') ?? 0,
      dimoExtremeBraking60d: eventCounts.get('behavior.extremeBraking') ?? 0,
      dimoExtremeEmergency60d: (eventCounts.get('behavior.extremeEmergency') ?? 0) + (eventCounts.get('behavior.extremeEmergencyBraking') ?? 0),
      dimoEvents14d: dimoEvents14.length,
      dimoDuplicateEventTimestamps: duplicateEventTimestamps,
      synqDriveHarshBraking60d: vehicle.synqDriveHarshBraking60d,
      synqDriveExtremeBraking60d: vehicle.synqDriveExtremeBraking60d,
      synqDriveTripBehaviorBraking60d: vehicle.synqDriveTripBehaviorBraking60d,
      eventCorrelationNote:
        vehicle.synqDriveHarshBraking60d + vehicle.synqDriveExtremeBraking60d > 0 && dimoEvents60.length > 0
          ? 'Both_DIMO_and_SynqDrive_events_present'
          : dimoEvents60.length > 0
            ? 'DIMO_only'
            : vehicle.synqDriveHarshBraking60d + vehicle.synqDriveExtremeBraking60d > 0
              ? 'SynqDrive_only'
              : 'No_braking_events',
      brakeLoadFeasibility:
        pedalPressed.length > 20 || circuit1.length > 20
          ? 'MEASURED_PEDAL_OR_PRESSURE_POSSIBLE'
          : dimoEvents60.length > 0
            ? 'EVENT_PROXY_ONLY'
            : 'SPEED_DECEL_PROXY_ONLY',
      frictionRegenSplitFeasibility:
        vehicle.powertrain === 'ELECTRIC' && evRegen && evRegen.regenDuringDecelRate != null && evRegen.regenDuringDecelRate > 0.1
          ? 'REGEN_APPROX_ONLY'
          : 'NOT_DETERMINABLE',
    });
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const capPath = path.join(outputDir, 'brake-health-dimo-signal-capability-2026-07.csv');
  const tsPath = path.join(outputDir, 'brake-health-dimo-timeseries-coverage-2026-07.csv');
  const corrPath = path.join(outputDir, 'brake-health-dimo-braking-correlation-2026-07.csv');
  writeCsv(capPath, capabilityRows);
  writeCsv(tsPath, timeseriesRows);
  writeCsv(corrPath, correlationRows);

  const fleetSummary = {
    vehiclesWithPedalPressed: vehicles.filter((_, i) =>
      capabilityRows.some((r) => r.anonymizedVehicleId === vehicles[i].anonId && r.signalName === 'chassisBrakeIsPedalPressed' && r.listedInAvailableSignals),
    ).length,
    vehiclesWithPedalPosition: vehicles.filter((_, i) =>
      capabilityRows.some((r) => r.anonymizedVehicleId === vehicles[i].anonId && r.signalName === 'chassisBrakePedalPosition' && r.listedInAvailableSignals),
    ).length,
    vehiclesWithCircuitPressure: vehicles.filter((_, i) =>
      capabilityRows.some(
        (r) =>
          r.anonymizedVehicleId === vehicles[i].anonId &&
          (r.signalName === 'chassisBrakeCircuit1PressurePrimary' || r.signalName === 'chassisBrakeCircuit2PressurePrimary') &&
          r.listedInAvailableSignals,
      ),
    ).length,
    vehiclesWithAbsWarning: vehicles.filter((_, i) =>
      capabilityRows.some((r) => r.anonymizedVehicleId === vehicles[i].anonId && r.signalName === 'chassisBrakeABSIsWarningOn' && r.listedInAvailableSignals),
    ).length,
    vehiclesWithUsableWheelSpeeds: vehicles.filter((_, i) =>
      capabilityRows.some(
        (r) =>
          r.anonymizedVehicleId === vehicles[i].anonId &&
          (r.signalName === 'chassisAxleRow1WheelLeftSpeed' || r.signalName === 'chassisAxleRow1WheelRightSpeed') &&
          r.classification === 'USABLE',
      ),
    ).length,
    vehiclesWithEvRegenCorrelation: correlationRows.filter((r) => r.evRegenDuringDecelRate !== '' && Number(r.evRegenDuringDecelRate) > 0).length,
    dimoNativeBrakingEventsTotal: correlationRows.reduce((s, r) => s + Number(r.dimoHarshBraking60d ?? 0) + Number(r.dimoExtremeBraking60d ?? 0), 0),
  };

  const summary = {
    auditId: AUDIT_ID,
    completedAt: now.toISOString(),
    mode: 'read-only',
    vehiclesAnalyzed: vehicles.length,
    totalDimoQueries: totalQueries,
    signalsPerVehicle: SIGNAL_SPECS.length,
    notDocumentedConcepts: NOT_DOCUMENTED_CONCEPTS,
    fleetSummary,
    outputFiles: [capPath, tsPath, corrPath],
  };

  const summaryPath = path.join(outputDir, 'brake-health-dimo-audit-summary-2026-07.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
