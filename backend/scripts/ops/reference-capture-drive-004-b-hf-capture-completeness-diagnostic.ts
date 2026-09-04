/**
 * DI-EV-0035B.4 — RD004-B HF_HISTORICAL capture completeness diagnostic.
 * READ-ONLY: broad DIMO density requery (diagnostic only) + optional exact-window replay summary.
 * Does NOT modify sealed Segment A/B source bytes.
 */
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { Wallet } from 'ethers';
import { stableStringify } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-alignment';
import { assertSafeOutputPath } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-export';
import {
  buildHfCaptureCompletenessDiagnostic,
  extractSealedHfSpeedPhysicalTimestamps,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd004-b-hf-capture-completeness';
import {
  filterRowsByProviderTimestampEnvelope,
  loadRd004Jsonl,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd004-a-segment-a';
import {
  SEGMENT_B_CONSTANTS,
  toRepoRelativePath,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd004-b-segment-b';
import { buildBroadReferenceHistoricalSignalsQuery } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-query-builder';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const TOKEN_ID = SEGMENT_B_CONSTANTS.tokenId;
const WINDOW_FROM = SEGMENT_B_CONSTANTS.queryEnvelopeStartUtc;
const WINDOW_TO = SEGMENT_B_CONSTANTS.queryEnvelopeEndUtc;
const CHUNK_SECONDS = 300;
const REQUESTED_INTERVAL = '1s';

function loadEnv(): void {
  const candidates = [
    process.env.SYNQDRIVE_BACKEND_ENV,
    '/opt/synqdrive/shared/backend.env',
    path.resolve(__dirname, '../../.env'),
  ].filter(Boolean) as string[];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function parseArg(prefix: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${prefix}=`));
  if (eq) return eq.split('=').slice(1).join('=').trim() || undefined;
  const idx = process.argv.indexOf(prefix);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1].trim();
  return undefined;
}

function chunkWindows(fromIso: string, toIso: string, chunkSeconds: number): Array<{ from: Date; to: Date }> {
  const windows: Array<{ from: Date; to: Date }> = [];
  let cursor = new Date(fromIso);
  const end = new Date(toIso);
  while (cursor < end) {
    const next = new Date(Math.min(end.getTime(), cursor.getTime() + chunkSeconds * 1000));
    windows.push({ from: new Date(cursor), to: next });
    cursor = next;
  }
  return windows;
}

async function getDeveloperJwt(): Promise<string> {
  const AUTH_URL = 'https://auth.dimo.zone';
  const CLIENT_ID = process.env.DIMO_CLIENT_ID!;
  const PRIVATE_KEY = process.env.DIMO_PRIVATE_KEY!;
  const DOMAIN = process.env.DIMO_REDIRECT_URI ?? process.env.DIMO_DOMAIN ?? 'https://auth.dimo.zone';
  const challenge = await axios.post(`${AUTH_URL}/auth/web3/generate_challenge`, null, {
    params: {
      client_id: CLIENT_ID,
      domain: DOMAIN,
      scope: 'openid email',
      response_type: 'code',
      address: CLIENT_ID,
    },
    timeout: 30000,
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
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 },
  );
  const d = submit.data as Record<string, string>;
  return d.developer_jwt ?? d.access_token ?? d.token;
}

async function getVehicleJwt(devJwt: string, tokenId: number): Promise<string> {
  const TOKEN_EXCHANGE_URL = process.env.DIMO_TOKEN_EXCHANGE_URL ?? 'https://token-exchange-api.dimo.zone';
  const NFT_CONTRACT =
    process.env.DIMO_VEHICLE_NFT_CONTRACT_ADDRESS ??
    '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';
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

async function gql(jwt: string, query: string): Promise<Record<string, unknown>> {
  const TELEMETRY_URL = process.env.DIMO_TELEMETRY_API_URL ?? 'https://telemetry-api.dimo.zone/query';
  const resp = await axios.post(
    TELEMETRY_URL,
    { query },
    {
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      timeout: 120000,
    },
  );
  return resp.data as Record<string, unknown>;
}

function extractSpeedTimestamp(row: Record<string, unknown>): string | null {
  const rowTs = typeof row.timestamp === 'string' ? row.timestamp : null;
  const speedPayload = row.speed;
  if (speedPayload != null && typeof speedPayload === 'object' && 'timestamp' in (speedPayload as object)) {
    const ts = (speedPayload as { timestamp?: unknown }).timestamp;
    if (typeof ts === 'string') return ts;
  }
  return rowTs;
}

function extractSpeedValue(row: Record<string, unknown>): number | null {
  const speedPayload = row.speed;
  if (typeof speedPayload === 'number' && Number.isFinite(speedPayload)) return speedPayload;
  if (speedPayload != null && typeof speedPayload === 'object' && 'value' in (speedPayload as object)) {
    const v = (speedPayload as { value?: unknown }).value;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

async function querySpeedTimestamps(jwt: string, from: Date, to: Date): Promise<string[]> {
  const query = buildBroadReferenceHistoricalSignalsQuery(
    TOKEN_ID,
    ['speed'],
    from,
    to,
    REQUESTED_INTERVAL,
  );
  if (!query) return [];
  const result = await gql(jwt, query);
  const rows = ((result.data as Record<string, unknown> | undefined)?.signals ?? []) as Array<
    Record<string, unknown>
  >;
  const timestamps: string[] = [];
  for (const row of rows) {
    const ts = extractSpeedTimestamp(row);
    const value = extractSpeedValue(row);
    if (ts && value != null) timestamps.push(ts);
  }
  return timestamps;
}

async function main(): Promise<void> {
  loadEnv();
  const segmentBPath =
    parseArg('--segment-b-observations') ??
    path.join(REPO_ROOT, 'docs/audits/data/rd004-segment-b/source-observations.jsonl');
  const fullSessionPath =
    parseArg('--full-session-observations') ??
    path.join(REPO_ROOT, 'docs/audits/data/rd004-segment-a/source-observations.jsonl');
  const outPath =
    parseArg('--out') ??
    path.join(REPO_ROOT, 'docs/audits/data/rd004-segment-b/rd004-b-hf-capture-completeness-diagnostic.json');
  const exactReplayPath =
    parseArg('--exact-replay') ??
    path.join(REPO_ROOT, 'docs/audits/data/rd004-segment-b/rd004-b-hf-exact-window-replay.json');
  const skipLive = process.argv.includes('--skip-live-requery');

  assertSafeOutputPath(outPath);
  const segmentBRows = loadRd004Jsonl(fs.readFileSync(segmentBPath, 'utf8'));
  const fullSessionRows = fs.existsSync(fullSessionPath)
    ? loadRd004Jsonl(fs.readFileSync(fullSessionPath, 'utf8'))
    : segmentBRows;
  const envelopeRows = filterRowsByProviderTimestampEnvelope(
    segmentBRows,
    WINDOW_FROM,
    WINDOW_TO,
  );

  let requeryTimestamps: string[] | null = null;
  let liveRequeryError: string | null = null;

  if (!skipLive) {
    if (!process.env.DIMO_CLIENT_ID || !process.env.DIMO_PRIVATE_KEY) {
      liveRequeryError = 'DIMO_CLIENT_ID and DIMO_PRIVATE_KEY not configured — sealed-only audit';
    } else {
      try {
        const devJwt = await getDeveloperJwt();
        const vehicleJwt = await getVehicleJwt(devJwt, TOKEN_ID);
        const windows = chunkWindows(WINDOW_FROM, WINDOW_TO, CHUNK_SECONDS);
        const all: string[] = [];
        for (const w of windows) {
          const chunkTs = await querySpeedTimestamps(vehicleJwt, w.from, w.to);
          all.push(...chunkTs);
        }
        requeryTimestamps = [...new Set(all)].sort();
      } catch (err) {
        liveRequeryError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  let exactWindowReplay: {
    HF_SPARSE_CADENCE_ORIGIN: string;
    HF_CAPTURE_COMPLETENESS_VALIDATED: 'YES' | 'NO' | 'PARTIAL';
    RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED: string;
    HF_CAPTURE_ROOT_CAUSE: import('../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd004-b-hf-exact-window-replay').HfCaptureRootCause;
    aggregate?: Record<string, number>;
    watermarkRecoveryAnalysis?: Record<string, unknown>;
  } | null = null;
  if (fs.existsSync(exactReplayPath)) {
    const replay = JSON.parse(fs.readFileSync(exactReplayPath, 'utf8')) as {
      HF_SPARSE_CADENCE_ORIGIN: string;
      HF_CAPTURE_COMPLETENESS_VALIDATED: 'YES' | 'NO' | 'PARTIAL';
      RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED: string;
      HF_CAPTURE_ROOT_CAUSE: import('../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd004-b-hf-exact-window-replay').HfCaptureRootCause;
      aggregate: Record<string, number>;
      watermarkRecoveryAnalysis: Record<string, unknown>;
    };
    exactWindowReplay = {
      HF_SPARSE_CADENCE_ORIGIN: replay.HF_SPARSE_CADENCE_ORIGIN,
      HF_CAPTURE_COMPLETENESS_VALIDATED: replay.HF_CAPTURE_COMPLETENESS_VALIDATED,
      RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED: replay.RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED,
      HF_CAPTURE_ROOT_CAUSE: replay.HF_CAPTURE_ROOT_CAUSE,
      aggregate: replay.aggregate,
      watermarkRecoveryAnalysis: replay.watermarkRecoveryAnalysis,
    };
  }

  const diagnostic = buildHfCaptureCompletenessDiagnostic({
    allRows: fullSessionRows,
    envelopeRows,
    queryEnvelope: { startUtc: WINDOW_FROM, endUtc: WINDOW_TO },
    requeryTimestamps,
    liveRequeryError,
    exactWindowReplay,
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, stableStringify(diagnostic));

  console.log(
    JSON.stringify(
      {
        ok: true,
        out: toRepoRelativePath(outPath, REPO_ROOT),
        HF_SPARSE_CADENCE_ORIGIN: diagnostic.HF_SPARSE_CADENCE_ORIGIN,
        HF_CAPTURE_COMPLETENESS_VALIDATED: diagnostic.HF_CAPTURE_COMPLETENESS_VALIDATED,
        SEALED_HF_SPEED_COUNT: diagnostic.broadRequery.comparison?.SEALED_HF_SPEED_COUNT ??
          extractSealedHfSpeedPhysicalTimestamps(envelopeRows).length,
        DIAGNOSTIC_REQUERY_HF_SPEED_COUNT:
          diagnostic.broadRequery.comparison?.DIAGNOSTIC_REQUERY_HF_SPEED_COUNT ?? null,
        liveRequeryAttempted: diagnostic.broadRequery.attempted,
        liveRequerySucceeded: diagnostic.broadRequery.succeeded,
        liveRequeryError: diagnostic.broadRequery.error,
        CROSS_ORIGIN_BUCKET_IDENTITY_COMPARISON_VALID: diagnostic.CROSS_ORIGIN_BUCKET_IDENTITY_COMPARISON_VALID,
        B3_BROAD_REQUERY_SAMPLE_LOSS_PROOF_VALID: diagnostic.B3_BROAD_REQUERY_SAMPLE_LOSS_PROOF_VALID,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
