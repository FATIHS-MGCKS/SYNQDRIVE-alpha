#!/usr/bin/env ts-node
/**
 * Fleet Connectivity DIMO Capability Audit — read-only.
 *
 * Queries DIMO Telemetry API, Identity metadata (via DB mirror), and Vehicle Triggers API.
 * NO trigger create/update/delete. NO GPS historical queries. NO raw payloads in output.
 *
 * Usage:
 *   FLEET_CONNECTIVITY_DIMO_AUDIT_ALLOW_PROD=1 \
 *     cd backend && npx ts-node -r tsconfig-paths/register ../scripts/audits/audit-fleet-connectivity-dimo.ts
 *   ... --days=60 --output-dir=../docs/audits/data
 *
 * Environment (backend .env or VPS shared backend.env):
 *   DATABASE_URL, DIMO_CLIENT_ID, DIMO_PRIVATE_KEY, DIMO_TELEMETRY_API_URL,
 *   DIMO_TOKEN_EXCHANGE_URL, DIMO_VEHICLE_NFT_CONTRACT_ADDRESS, DIMO_WEBHOOK_BASE_URL
 */
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

const scriptDir = path.resolve(path.dirname(process.argv[1] ?? '.'));
const backendRoot = process.env.SYNQDRIVE_BACKEND_ROOT
  ? path.resolve(process.env.SYNQDRIVE_BACKEND_ROOT)
  : path.resolve(scriptDir, '..', '..', 'backend');
const requireFromBackend = createRequire(path.join(backendRoot, 'package.json'));
const axios = requireFromBackend('axios');
const { Wallet } = requireFromBackend('ethers');

const AUDIT_ID = 'fleet-connectivity-dimo-2026-07';

// ── Load backend .env (local dev) ─────────────────────────────────────────────
for (const envPath of [
  path.resolve(backendRoot, '.env'),
  '/opt/synqdrive/shared/backend.env',
]) {
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

interface ConnectivitySignalSpec {
  signalName: string;
  dimoCommonName: string;
  documented: boolean;
  valueType: 'boolean' | 'float' | 'string' | 'n/a';
  synqDriveUses: boolean;
  synqDriveField: string | null;
}

const CONNECTIVITY_SIGNALS: ConnectivitySignalSpec[] = [
  {
    signalName: 'obdIsPluggedIn',
    dimoCommonName: 'OBD Device Plugged In',
    documented: true,
    valueType: 'boolean',
    synqDriveUses: true,
    synqDriveField: 'rawPayloadJson.obdIsPluggedIn / device-connection webhook',
  },
  {
    signalName: 'connectivityCellularIsJammingDetected',
    dimoCommonName: 'Cellular Jamming Detected',
    documented: true,
    valueType: 'boolean',
    synqDriveUses: true,
    synqDriveField: 'jammingDetectedCount (snapshot only)',
  },
  {
    signalName: 'isIgnitionOn',
    dimoCommonName: 'Ignition On',
    documented: true,
    valueType: 'boolean',
    synqDriveUses: false,
    synqDriveField: 'vehicle_latest_states.is_ignition_on',
  },
  {
    signalName: 'speed',
    dimoCommonName: 'Speed',
    documented: true,
    valueType: 'float',
    synqDriveUses: true,
    synqDriveField: 'freshness proxy (lastSeen)',
  },
  {
    signalName: 'deviceConnected',
    dimoCommonName: 'Device Connected',
    documented: false,
    valueType: 'n/a',
    synqDriveUses: false,
    synqDriveField: null,
  },
  {
    signalName: 'devicePower',
    dimoCommonName: 'Device Power',
    documented: false,
    valueType: 'n/a',
    synqDriveUses: false,
    synqDriveField: null,
  },
  {
    signalName: 'deviceOnline',
    dimoCommonName: 'Device Online',
    documented: false,
    valueType: 'n/a',
    synqDriveUses: false,
    synqDriveField: null,
  },
  {
    signalName: 'dataSourceConnection',
    dimoCommonName: 'Data Source Connection',
    documented: false,
    valueType: 'n/a',
    synqDriveUses: false,
    synqDriveField: null,
  },
];

const EPISODE_WINDOWS: Record<string, { unplugAt: string; recoveryStart: string; recoveryEnd: string }> = {
  VEHICLE_005: {
    unplugAt: '2026-07-11T18:39:45.000Z',
    recoveryStart: '2026-07-11T18:39:45.000Z',
    recoveryEnd: '2026-07-12T18:39:45.000Z',
  },
  VEHICLE_006: {
    unplugAt: '2026-07-08T17:21:19.000Z',
    recoveryStart: '2026-07-08T17:21:19.000Z',
    recoveryEnd: '2026-07-09T17:21:19.000Z',
  },
};

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeCsv(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(file: string, headers: string[], rows: Record<string, unknown>[]): void {
  const lines = [headers.join(','), ...rows.map((r) => headers.map((h) => escapeCsv(r[h])).join(','))];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function cadenceFromTimestamps(timestamps: string[]): {
  medianCadenceSec: number | null;
  p95CadenceSec: number | null;
  maxGapSec: number | null;
} {
  if (timestamps.length < 2) {
    return { medianCadenceSec: null, p95CadenceSec: null, maxGapSec: null };
  }
  const ms = timestamps.map((t) => new Date(t).getTime()).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < ms.length; i++) {
    const g = (ms[i] - ms[i - 1]) / 1000;
    if (g > 0 && g < 7 * 24 * 3600) gaps.push(g);
  }
  if (!gaps.length) return { medianCadenceSec: null, p95CadenceSec: null, maxGapSec: null };
  const sorted = [...gaps].sort((a, b) => a - b);
  return {
    medianCadenceSec: percentile(sorted, 50),
    p95CadenceSec: percentile(sorted, 95),
    maxGapSec: sorted[sorted.length - 1] ?? null,
  };
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
  const NFT_CONTRACT =
    process.env.DIMO_VEHICLE_NFT_CONTRACT_ADDRESS ?? '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';
  const resp = await axios.post(
    `${TOKEN_EXCHANGE_URL}/v1/tokens/exchange`,
    { nftContractAddress: NFT_CONTRACT, privileges: [1, 2, 3, 4, 5, 6], tokenId },
    { headers: { Authorization: `Bearer ${devJwt}`, 'Content-Type': 'application/json' }, timeout: 30000 },
  );
  const d = resp.data as Record<string, string>;
  return d.token ?? d.access_token ?? d.jwt;
}

function tokenDid(tokenId: number): string {
  const NFT_CONTRACT =
    process.env.DIMO_VEHICLE_NFT_CONTRACT_ADDRESS ?? '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';
  return `did:erc721:137:${NFT_CONTRACT}:${tokenId}`;
}

async function gql(jwt: string, query: string): Promise<any> {
  const TELEMETRY_URL = process.env.DIMO_TELEMETRY_API_URL ?? 'https://telemetry-api.dimo.zone/query';
  const resp = await axios.post(TELEMETRY_URL, { query }, {
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    timeout: 45000,
  });
  if (resp.data?.errors?.length && !resp.data?.data) {
    throw new Error(resp.data.errors.map((e: any) => e.message).join('; '));
  }
  return resp.data;
}

async function loadVehiclesFromDb(): Promise<
  {
    anonId: string;
    tokenId: number;
    connectionStatus: string | null;
    hasAftermarket: boolean;
    hasSynthetic: boolean;
    hardwareType: string | null;
    powertrainType: string | null;
    aftermarketSerialPresent: boolean;
    syntheticTokenPresent: boolean;
  }[]
> {
  const { execFileSync } = await import('child_process');
  const url = process.env.DATABASE_URL?.split('?')[0];
  if (!url) throw new Error('DATABASE_URL required');
  const raw = execFileSync(
    'psql',
    [url, '-At', '-F', '|', '-c', `
      SELECT row_number() OVER (ORDER BY v.created_at, v.id),
        dv.token_id,
        dv.connection_status::text,
        (dv.raw_json->'aftermarketDevice' IS NOT NULL),
        (dv.raw_json->'syntheticDevice' IS NOT NULL),
        v.hardware_type,
        coalesce(dv.powertrain_type, 'UNKNOWN'),
        (dv.raw_json->'aftermarketDevice'->>'serial' IS NOT NULL),
        (dv.raw_json->'syntheticDevice'->>'tokenId' IS NOT NULL)
      FROM vehicles v
      JOIN dimo_vehicles dv ON dv.id = v.dimo_vehicle_id
      WHERE dv.token_id IS NOT NULL
      ORDER BY v.created_at, v.id
    `],
    { encoding: 'utf8' },
  ).trim();
  if (!raw) return [];
  return raw.split('\n').map((line) => {
    const p = line.split('|');
    return {
      anonId: `VEHICLE_${String(p[0]).padStart(3, '0')}`,
      tokenId: Number(p[1]),
      connectionStatus: p[2] || null,
      hasAftermarket: p[3] === 't',
      hasSynthetic: p[4] === 't',
      hardwareType: p[5] || null,
      powertrainType: p[6] || null,
      aftermarketSerialPresent: p[7] === 't',
      syntheticTokenPresent: p[8] === 't',
    };
  });
}

async function listWebhooks(devJwt: string): Promise<any[]> {
  const TRIGGERS_URL = 'https://vehicle-triggers-api.dimo.zone';
  try {
    const res = await axios.get(`${TRIGGERS_URL}/v1/webhooks`, {
      headers: { Authorization: `Bearer ${devJwt}` },
      timeout: 20000,
    });
    return Array.isArray(res.data) ? res.data : res.data?.webhooks ?? [];
  } catch {
    return [];
  }
}

async function listVehicleWebhookSubscriptions(devJwt: string, tokenId: number): Promise<any> {
  const TRIGGERS_URL = 'https://vehicle-triggers-api.dimo.zone';
  try {
    const res = await axios.get(`${TRIGGERS_URL}/v1/webhooks/vehicles/${tokenDid(tokenId)}`, {
      headers: { Authorization: `Bearer ${devJwt}` },
      timeout: 20000,
    });
    return res.data;
  } catch (e: any) {
    return { error: e?.response?.status ?? e.message };
  }
}

async function queryHistoricalObd(
  jwt: string,
  tokenId: number,
  from: string,
  to: string,
  interval: string,
): Promise<{ timestamp: string; value: number | null }[]> {
  const r = await gql(
    jwt,
    `query {
      signals(tokenId: ${tokenId}, from: "${from}", to: "${to}", interval: "${interval}") {
        timestamp
        v: obdIsPluggedIn(agg: LAST)
      }
    }`,
  );
  return ((r?.data?.signals ?? []) as { timestamp: string; v: number | null }[]).map((row) => ({
    timestamp: row.timestamp,
    value: row.v,
  }));
}

function classifyDeviceType(v: {
  hasAftermarket: boolean;
  hasSynthetic: boolean;
  hardwareType: string | null;
}): string {
  if (v.hasAftermarket && v.hardwareType === 'LTE_R1') return 'PHYSICAL_OBD_LTE_R1';
  if (v.hasAftermarket) return 'PHYSICAL_OBD_AFTERMARKET';
  if (v.hasSynthetic && !v.hasAftermarket) return 'SYNTHETIC_ONLY';
  if (v.hasAftermarket && v.hasSynthetic) return 'AFTERMARKET_AND_SYNTHETIC';
  return 'UNKNOWN';
}

function buildRecoveryPolicyMatrix(): Record<string, unknown>[] {
  return [
    {
      deviceType: 'PHYSICAL_OBD_LTE_R1',
      snapshotType: 'signalsLatest.obdIsPluggedIn',
      sameBindingRequired: 'tokenId + aftermarketDevice.serial (no binding episode ID)',
      canResolveUnplug: 'YES_WITH_POLICY',
      resolutionConfidence: 'HIGH',
      reason: 'DIMO documents obdIsPluggedIn for aftermarket OBD; SynqDrive already polls it; needs read-model closure not new signal',
    },
    {
      deviceType: 'PHYSICAL_OBD_AFTERMARKET',
      snapshotType: 'signalsLatest.obdIsPluggedIn',
      sameBindingRequired: 'tokenId stable',
      canResolveUnplug: 'YES_WITH_POLICY',
      resolutionConfidence: 'HIGH',
      reason: 'Same signal path as LTE_R1',
    },
    {
      deviceType: 'SYNTHETIC_ONLY',
      snapshotType: 'signalsLatest (no obdIsPluggedIn)',
      sameBindingRequired: 'syntheticDevice.tokenId',
      canResolveUnplug: 'NO',
      resolutionConfidence: 'N/A',
      reason: 'OBD unplug semantics not applicable; OEM/API may continue without physical OBD',
    },
    {
      deviceType: 'AFTERMARKET_AND_SYNTHETIC',
      snapshotType: 'signalsLatest.obdIsPluggedIn + identity pairing',
      sameBindingRequired: 'MUST verify snapshot producer/source',
      canResolveUnplug: 'CONDITIONAL',
      resolutionConfidence: 'MEDIUM',
      reason: 'Fleet has both device types in rawJson; must not close OBD episode from synthetic-only telemetry',
    },
    {
      deviceType: 'OEM_API',
      snapshotType: 'OEM signals without obdIsPluggedIn',
      sameBindingRequired: 'integrationId',
      canResolveUnplug: 'NO',
      resolutionConfidence: 'LOW',
      reason: 'No documented OBD plug signal for pure OEM path',
    },
  ];
}

async function main(): Promise<void> {
  if (process.env.FLEET_CONNECTIVITY_DIMO_AUDIT_ALLOW_PROD !== '1') {
    throw new Error('Set FLEET_CONNECTIVITY_DIMO_AUDIT_ALLOW_PROD=1 for supervised read-only DIMO audit.');
  }

  const days = Number(parseArg('--days') ?? '60');
  const outputDir = path.resolve(parseArg('--output-dir') ?? path.join(scriptDir, '..', '..', 'docs', 'audits', 'data'));
  const now = new Date();
  const from60 = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const from14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const vehicles = await loadVehiclesFromDb();
  const devJwt = await getDeveloperJwt();
  const webhooks = await listWebhooks(devJwt);

  const capabilityRows: Record<string, unknown>[] = [];
  const timeseriesRows: Record<string, unknown>[] = [];
  const triggerRows: Record<string, unknown>[] = [];

  const obdWebhooks = webhooks.filter((w: any) => {
    const metric = String(w.metricName ?? w.name ?? '').toLowerCase();
    const desc = String(w.description ?? w.displayName ?? '').toLowerCase();
    return metric.includes('obdispluggedin') || metric.includes('plug') || desc.includes('plug') || desc.includes('unplug');
  });

  for (const wh of webhooks) {
    triggerRows.push({
      scope: 'ORG_DEVELOPER_LICENSE',
      webhookId: wh.id ?? '',
      displayName: wh.displayName ?? wh.name ?? '',
      metricName: wh.metricName ?? '',
      condition: wh.condition ?? '',
      targetURL: wh.targetURL ?? wh.url ?? '',
      status: wh.status ?? 'UNKNOWN',
      failureCount: wh.failureCount ?? '',
      coolDownPeriod: wh.coolDownPeriod ?? '',
      classification:
        String(wh.metricName ?? '').toLowerCase().includes('obdispluggedin') ||
        String(wh.description ?? '').toLowerCase().includes('plug')
          ? 'OBD_PLUG_STATE'
          : 'OTHER',
      configState: wh.status === 'enabled' ? 'CONFIGURED' : wh.status === 'disabled' ? 'NOT_ACTIVE' : 'UNKNOWN',
    });
  }

  if (webhooks.length === 0) {
    triggerRows.push({
      scope: 'ORG_DEVELOPER_LICENSE',
      webhookId: '',
      displayName: '',
      metricName: '',
      condition: '',
      targetURL: process.env.DIMO_WEBHOOK_BASE_URL ?? '',
      status: 'UNKNOWN',
      failureCount: '',
      coolDownPeriod: '',
      classification: 'LIST_EMPTY_OR_API_ERROR',
      configState: 'UNKNOWN',
    });
  }

  for (const vehicle of vehicles) {
    const jwt = await getVehicleJwt(devJwt, vehicle.tokenId);
    await sleep(300);

    const available: string[] =
      (await gql(jwt, `query { availableSignals(tokenId: ${vehicle.tokenId}) }`))?.data?.availableSignals ?? [];

    const latest = (
      await gql(
        jwt,
        `query {
          signalsLatest(tokenId: ${vehicle.tokenId}) {
            lastSeen
            obdIsPluggedIn { timestamp value }
            isIgnitionOn { timestamp value }
            speed { timestamp value }
          }
        }`,
      )
    )?.data?.signalsLatest;

    const dataSummary = (
      await gql(
        jwt,
        `query {
          dataSummary(tokenId: ${vehicle.tokenId}) {
            firstSeen lastSeen numberOfSignals availableSignals
            signalDataSummary { name numberOfSignals firstSeen lastSeen }
          }
        }`,
      )
    )?.data?.dataSummary;

    const subs = await listVehicleWebhookSubscriptions(devJwt, vehicle.tokenId);
    const deviceType = classifyDeviceType(vehicle);

    const obdListed = available.includes('obdIsPluggedIn');
    const obdLatest = latest?.obdIsPluggedIn;
    const obdSummary = (dataSummary?.signalDataSummary ?? []).find((s: any) => s.name === 'obdIsPluggedIn');

    capabilityRows.push({
      anonymizedVehicleId: vehicle.anonId,
      tokenIdMasked: `***${String(vehicle.tokenId).slice(-3)}`,
      deviceType,
      dataSourceType: deviceType,
      physicalObd: vehicle.hasAftermarket,
      lteR1: vehicle.hardwareType === 'LTE_R1',
      syntheticDevice: vehicle.hasSynthetic,
      oemApiOnly: vehicle.hasSynthetic && !vehicle.hasAftermarket,
      multipleSources: vehicle.hasAftermarket && vehicle.hasSynthetic,
      dimoConnectionStatus: vehicle.connectionStatus ?? '',
      identityAftermarketSerial: vehicle.aftermarketSerialPresent,
      identitySyntheticToken: vehicle.syntheticTokenPresent,
      availableSignalsCount: available.length,
      obdIsPluggedInListed: obdListed,
      obdIsPluggedInLatestValue: obdLatest?.value ?? '',
      obdIsPluggedInLatestTimestamp: obdLatest?.timestamp ?? '',
      signalsLatestLastSeen: latest?.lastSeen ?? '',
      dataSummaryLastSeen: dataSummary?.lastSeen ?? '',
      dataSummaryFirstSeen: dataSummary?.firstSeen ?? '',
      obdHistoricalSampleCount: obdSummary?.numberOfSignals ?? 0,
      obdFirstSeen: obdSummary?.firstSeen ?? '',
      obdLastSeen: obdSummary?.lastSeen ?? '',
      snapshotSourceIdentifiable: 'PARTIAL_tokenId_only',
      bindingIdAvailable: false,
      bindingHistoryAvailable: false,
      usableForRecovery: obdListed && obdLatest?.value === 1 && deviceType.includes('PHYSICAL'),
      triggerSubscriptions: Array.isArray(subs) ? subs.length : subs?.webhookId ? 1 : 0,
      triggerStatus: obdWebhooks.length > 0 ? 'CONFIGURED_AT_ORG' : 'UNKNOWN',
      deviceConnectedDocumented: false,
      devicePowerDocumented: false,
      deviceOnlineDocumented: false,
      dataSourceConnectionDocumented: false,
      jammingListed: available.includes('connectivityCellularIsJammingDetected'),
      ignitionListed: available.includes('isIgnitionOn'),
      speedListed: available.includes('speed'),
    });

    const windows: { label: string; from: Date; to: Date }[] = [
      { label: '60d', from: from60, to: now },
      { label: '14d', from: from14, to: now },
    ];
    const ep = EPISODE_WINDOWS[vehicle.anonId];
    if (ep) {
      windows.push({
        label: 'episode_recovery',
        from: new Date(ep.recoveryStart),
        to: new Date(ep.recoveryEnd),
      });
    }

    if (obdListed) {
      for (const w of windows) {
        const samples = await queryHistoricalObd(
          jwt,
          vehicle.tokenId,
          w.from.toISOString(),
          w.to.toISOString(),
          w.label === 'episode_recovery' ? '30s' : '15m',
        );
        await sleep(250);
        const valid = samples.filter((s) => s.value != null);
        const invalidRate = samples.length ? (samples.length - valid.length) / samples.length : 0;
        const cadence = cadenceFromTimestamps(valid.map((s) => s.timestamp));
        const pluggedCount = valid.filter((s) => Number(s.value) >= 0.5).length;
        const unpluggedCount = valid.filter((s) => Number(s.value) < 0.5).length;

        timeseriesRows.push({
          anonymizedVehicleId: vehicle.anonId,
          signalName: 'obdIsPluggedIn',
          window: w.label,
          firstSeen: valid[0]?.timestamp ?? '',
          lastSeen: valid[valid.length - 1]?.timestamp ?? '',
          sampleCount: valid.length,
          medianCadenceSec: cadence.medianCadenceSec ?? '',
          p95CadenceSec: cadence.p95CadenceSec ?? '',
          maximumGapSec: cadence.maxGapSec ?? '',
          invalidRate: invalidRate.toFixed(4),
          sourceType: deviceType,
          bindingContinuity: 'tokenId_stable_no_episode_id',
          pluggedSamples: pluggedCount,
          unpluggedSamples: unpluggedCount,
          usableForRecovery:
            w.label === 'episode_recovery' && pluggedCount > 0 && unpluggedCount > 0 ? 'YES' : pluggedCount > 0 ? 'PARTIAL' : 'NO',
        });
      }
    }

    triggerRows.push({
      scope: vehicle.anonId,
      webhookId: Array.isArray(subs) ? subs.map((s: any) => s.webhookId).join(';') : subs?.webhookId ?? '',
      displayName: '',
      metricName: 'vehicle_subscriptions',
      condition: '',
      targetURL: '',
      status: subs?.error ? `ERROR_${subs.error}` : subs ? 'SUBSCRIBED_OR_EMPTY' : 'UNKNOWN',
      failureCount: '',
      coolDownPeriod: '',
      classification: 'PER_VEHICLE_SUBSCRIPTION',
      configState: subs?.error ? 'ERROR' : 'UNKNOWN',
    });
  }

  const recoveryMatrix = buildRecoveryPolicyMatrix();
  const capabilityPath = path.join(outputDir, 'fleet-connectivity-dimo-device-capability-2026-07.csv');
  const timeseriesPath = path.join(outputDir, 'fleet-connectivity-dimo-signal-timeseries-2026-07.csv');
  const triggerPath = path.join(outputDir, 'fleet-connectivity-dimo-trigger-status-2026-07.csv');
  const recoveryPath = path.join(outputDir, 'fleet-connectivity-recovery-policy-matrix-2026-07.csv');

  const capHeaders = [
    'anonymizedVehicleId',
    'tokenIdMasked',
    'deviceType',
    'dataSourceType',
    'physicalObd',
    'lteR1',
    'syntheticDevice',
    'oemApiOnly',
    'multipleSources',
    'dimoConnectionStatus',
    'availableSignalsCount',
    'obdIsPluggedInListed',
    'obdIsPluggedInLatestValue',
    'obdIsPluggedInLatestTimestamp',
    'signalsLatestLastSeen',
    'dataSummaryLastSeen',
    'obdHistoricalSampleCount',
    'snapshotSourceIdentifiable',
    'bindingIdAvailable',
    'bindingHistoryAvailable',
    'usableForRecovery',
    'triggerStatus',
    'jammingListed',
    'ignitionListed',
    'speedListed',
    'deviceConnectedDocumented',
    'devicePowerDocumented',
    'deviceOnlineDocumented',
    'dataSourceConnectionDocumented',
  ];
  writeCsv(capabilityPath, capHeaders, capabilityRows);

  writeCsv(
    timeseriesPath,
    [
      'anonymizedVehicleId',
      'signalName',
      'window',
      'firstSeen',
      'lastSeen',
      'sampleCount',
      'medianCadenceSec',
      'p95CadenceSec',
      'maximumGapSec',
      'invalidRate',
      'sourceType',
      'bindingContinuity',
      'pluggedSamples',
      'unpluggedSamples',
      'usableForRecovery',
    ],
    timeseriesRows,
  );

  writeCsv(
    triggerPath,
    [
      'scope',
      'webhookId',
      'displayName',
      'metricName',
      'condition',
      'targetURL',
      'status',
      'failureCount',
      'coolDownPeriod',
      'classification',
      'configState',
    ],
    triggerRows,
  );

  writeCsv(
    recoveryPath,
    [
      'deviceType',
      'snapshotType',
      'sameBindingRequired',
      'canResolveUnplug',
      'resolutionConfidence',
      'reason',
    ],
    recoveryMatrix,
  );

  const summary = {
    auditId: AUDIT_ID,
    completedAt: now.toISOString(),
    mode: 'read-only',
    dimoMcpStatus: 'UNAVAILABLE_used_official_docs_and_live_api',
    vehicles: vehicles.length,
    physicalObd: vehicles.filter((v) => v.hasAftermarket).length,
    synthetic: vehicles.filter((v) => v.hasSynthetic).length,
    lteR1: vehicles.filter((v) => v.hardwareType === 'LTE_R1').length,
    orgWebhooks: webhooks.length,
    obdRelatedWebhooks: obdWebhooks.length,
    artifacts: [capabilityPath, timeseriesPath, triggerPath, recoveryPath],
  };

  fs.writeFileSync(
    path.join(outputDir, 'fleet-connectivity-dimo-audit-summary-2026-07.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  );

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
