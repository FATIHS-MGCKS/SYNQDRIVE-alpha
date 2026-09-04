/**
 * DI-EV-0035B.4 — RD004-B exact-window HF aggregate bucket replay.
 * READ-ONLY: replays DIMO with identical hfWindowFrom/hfWindowTo per sealed provenance.
 */
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { Wallet } from 'ethers';
import { stableStringify } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-alignment';
import { assertSafeOutputPath } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-export';
import { loadRd004Jsonl } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd004-a-segment-a';
import {
  buildExactWindowReplayAnalysis,
  buildLateArrivalAnalysisArtifact,
  buildWatermarkRecoveryAnalysisArtifact,
  loadOriginalSpeedBucketsByWindow,
  parseReplaySpeedBuckets,
  reconstructOriginalHfQueryWindows,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd004-b-hf-exact-window-replay';
import {
  SEGMENT_B_CONSTANTS,
  toRepoRelativePath,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd004-b-segment-b';
import { buildBroadReferenceHistoricalSignalsQuery } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-query-builder';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const TOKEN_ID = SEGMENT_B_CONSTANTS.tokenId;
const SPEED_FIELD = 'speed';

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

async function main(): Promise<void> {
  loadEnv();
  const fullSessionPath =
    parseArg('--full-session-observations') ??
    path.join(REPO_ROOT, 'docs/audits/data/rd004-segment-a/source-observations.jsonl');
  const outDir =
    parseArg('--out-dir') ?? path.join(REPO_ROOT, 'docs/audits/data/rd004-segment-b');
  const replayOut =
    parseArg('--replay-out') ?? path.join(outDir, 'rd004-b-hf-exact-window-replay.json');
  const lateOut =
    parseArg('--late-out') ?? path.join(outDir, 'rd004-b-hf-late-arrival-analysis.json');
  const watermarkOut =
    parseArg('--watermark-out') ?? path.join(outDir, 'rd004-b-hf-watermark-recovery-analysis.json');
  const skipLive = process.argv.includes('--skip-live-replay');
  const maxWindows = parseInt(parseArg('--max-windows') ?? '0', 10);

  for (const p of [replayOut, lateOut, watermarkOut]) assertSafeOutputPath(p);

  const allRows = loadRd004Jsonl(fs.readFileSync(fullSessionPath, 'utf8'));
  const { ORIGINAL_HF_QUERY_WINDOWS } = reconstructOriginalHfQueryWindows(allRows);
  const originalBucketsByWindow = loadOriginalSpeedBucketsByWindow(allRows);
  const windows =
    maxWindows > 0 ? ORIGINAL_HF_QUERY_WINDOWS.slice(0, maxWindows) : ORIGINAL_HF_QUERY_WINDOWS;

  const replayBucketsByWindow = new Map<string, ReturnType<typeof parseReplaySpeedBuckets>>();
  let replayAttempted = !skipLive;
  let replaySucceeded = false;
  let replayError: string | null = null;

  if (!skipLive) {
    if (!process.env.DIMO_CLIENT_ID || !process.env.DIMO_PRIVATE_KEY) {
      replayError = 'DIMO_CLIENT_ID and DIMO_PRIVATE_KEY not configured';
    } else {
      try {
        const devJwt = await getDeveloperJwt();
        const vehicleJwt = await getVehicleJwt(devJwt, TOKEN_ID);
        for (let i = 0; i < windows.length; i++) {
          const w = windows[i]!;
          const replayTo = w.hfActualQueryTo ?? w.hfWindowTo;
          const query = buildBroadReferenceHistoricalSignalsQuery(
            TOKEN_ID,
            [SPEED_FIELD],
            new Date(w.hfWindowFrom),
            new Date(replayTo),
            w.requestedInterval || '1s',
          );
          if (!query) {
            replayBucketsByWindow.set(w.windowId, new Map());
            continue;
          }
          const result = await gql(vehicleJwt, query);
          const rows = ((result.data as Record<string, unknown> | undefined)?.signals ?? []) as Array<
            Record<string, unknown>
          >;
          replayBucketsByWindow.set(w.windowId, parseReplaySpeedBuckets(rows));
          if ((i + 1) % 10 === 0) {
            console.error(`[replay] ${i + 1}/${windows.length} windows`);
          }
        }
        replaySucceeded = true;
      } catch (err) {
        replayError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  const analysis = buildExactWindowReplayAnalysis({
    windows,
    originalBucketsByWindow,
    replayBucketsByWindow,
    replayAttempted,
    replaySucceeded,
    replayError,
  });

  fs.mkdirSync(path.dirname(replayOut), { recursive: true });
  fs.writeFileSync(replayOut, stableStringify(analysis));
  fs.writeFileSync(lateOut, stableStringify(buildLateArrivalAnalysisArtifact(analysis)));
  fs.writeFileSync(watermarkOut, stableStringify(buildWatermarkRecoveryAnalysisArtifact(analysis)));

  console.log(
    JSON.stringify(
      {
        ok: true,
        replayOut: toRepoRelativePath(replayOut, REPO_ROOT),
        lateOut: toRepoRelativePath(lateOut, REPO_ROOT),
        watermarkOut: toRepoRelativePath(watermarkOut, REPO_ROOT),
        EXACT_WINDOW_REPLAY_WINDOW_COUNT: windows.length,
        aggregate: analysis.aggregate,
        HF_CAPTURE_ROOT_CAUSE: analysis.HF_CAPTURE_ROOT_CAUSE,
        HF_SPARSE_CADENCE_ORIGIN: analysis.HF_SPARSE_CADENCE_ORIGIN,
        replaySucceeded,
        replayError,
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
