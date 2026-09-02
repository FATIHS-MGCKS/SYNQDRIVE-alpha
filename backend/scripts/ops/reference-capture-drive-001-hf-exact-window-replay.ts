/**
 * Reference Drive #001 — grid-controlled HF aggregate bucket replay.
 * Re-queries DIMO with EXACT original hfWindowFrom/hfWindowTo per row-producing request.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { Wallet } from 'ethers';
import { buildBroadReferenceHistoricalSignalsQuery } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-query-builder';

const TOKEN_ID = 192922;
const EXPECTED_SHA256 = 'f8e3097e28899d7a2cbdd269b266c16e5cf3eed69be810aba4e1247ec9a65bbd';
const HF_FIELDS = [
  'speed',
  'obdEngineLoad',
  'powertrainCombustionEngineSpeed',
  'powertrainCombustionEngineTPS',
  'obdThrottlePosition',
] as const;
const REQUESTED_INTERVAL = '1s';
const AGGREGATOR = 'AVG';

type HfField = (typeof HF_FIELDS)[number];

type BucketKey = string;

type AggregateBucket = {
  providerField: HfField;
  bucketTimestamp: string;
  avgValue: number;
  hfWindowFrom: string;
  hfWindowTo: string;
  requestStartedAt: string;
};

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

function bucketKey(field: string, bucketTimestamp: string): BucketKey {
  return `${field}|${bucketTimestamp}`;
}

function extractAvgValue(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw != null && typeof raw === 'object' && 'value' in (raw as object)) {
    const v = (raw as { value?: unknown }).value;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

function loadOriginalBuckets(inputPath: string): {
  sha256: string;
  windows: Array<{ hfWindowFrom: string; hfWindowTo: string; requestStartedAt: string }>;
  bucketsByWindow: Map<string, Map<BucketKey, AggregateBucket>>;
  bucketsByField: Record<HfField, Map<BucketKey, AggregateBucket>>;
} {
  const raw = fs.readFileSync(inputPath);
  const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
  if (sha256 !== EXPECTED_SHA256) {
    throw new Error(`SHA-256 mismatch: expected ${EXPECTED_SHA256}, got ${sha256}`);
  }

  const windowSet = new Map<string, { hfWindowFrom: string; hfWindowTo: string; requestStartedAt: string }>();
  const bucketsByWindow = new Map<string, Map<BucketKey, AggregateBucket>>();
  const bucketsByField = Object.fromEntries(HF_FIELDS.map((f) => [f, new Map<BucketKey, AggregateBucket>()])) as Record<
    HfField,
    Map<BucketKey, AggregateBucket>
  >;

  for (const line of raw.toString('utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as Record<string, unknown>;
    if (row.acquisitionSurface !== 'HF_HISTORICAL') continue;
    const field = row.providerField as HfField;
    if (!HF_FIELDS.includes(field)) continue;
    const prov = (row.provenanceJson ?? {}) as Record<string, string>;
    const hfWindowFrom = prov.hfWindowFrom;
    const hfWindowTo = prov.hfWindowTo;
    const requestStartedAt = String(row.requestStartedAt ?? '');
    if (!hfWindowFrom || !hfWindowTo || !requestStartedAt) continue;
    const windowId = `${hfWindowFrom}|${hfWindowTo}|${requestStartedAt}`;
    windowSet.set(windowId, { hfWindowFrom, hfWindowTo, requestStartedAt });
    const avgValue = extractAvgValue(row.rawValueJson);
    const bucketTimestamp =
      typeof row.providerTimestamp === 'string'
        ? row.providerTimestamp
        : row.providerTimestamp instanceof Date
          ? row.providerTimestamp.toISOString()
          : null;
    if (avgValue == null || !bucketTimestamp) continue;
    const bucket: AggregateBucket = {
      providerField: field,
      bucketTimestamp,
      avgValue,
      hfWindowFrom,
      hfWindowTo,
      requestStartedAt,
    };
    if (!bucketsByWindow.has(windowId)) bucketsByWindow.set(windowId, new Map());
    const key = bucketKey(field, bucketTimestamp);
    bucketsByWindow.get(windowId)!.set(key, bucket);
    bucketsByField[field].set(key, bucket);
  }

  const windows = [...windowSet.values()].sort((a, b) => a.requestStartedAt.localeCompare(b.requestStartedAt));
  return { sha256, windows, bucketsByWindow, bucketsByField };
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

async function getVehicleJwt(devJwt: string): Promise<string> {
  const TOKEN_EXCHANGE_URL = process.env.DIMO_TOKEN_EXCHANGE_URL ?? 'https://token-exchange-api.dimo.zone';
  const NFT_CONTRACT =
    process.env.DIMO_VEHICLE_NFT_CONTRACT_ADDRESS ??
    '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';
  const resp = await axios.post(
    `${TOKEN_EXCHANGE_URL}/v1/tokens/exchange`,
    { nftContractAddress: NFT_CONTRACT, privileges: [1, 2, 3, 4, 5, 6], tokenId: TOKEN_ID },
    { headers: { Authorization: `Bearer ${devJwt}`, 'Content-Type': 'application/json' }, timeout: 30000 },
  );
  const d = resp.data as Record<string, string>;
  return d.token ?? d.access_token ?? d.jwt;
}

async function gql(jwt: string, query: string): Promise<Record<string, unknown>> {
  const TELEMETRY_URL = process.env.DIMO_TELEMETRY_API_URL ?? 'https://telemetry-api.dimo.zone/query';
  const resp = await axios.post(
    TELEMETRY_URL,
    { query },
    { headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, timeout: 120000 },
  );
  return resp.data as Record<string, unknown>;
}

function parseReplayBuckets(
  rows: Array<Record<string, unknown>>,
  window: { hfWindowFrom: string; hfWindowTo: string; requestStartedAt: string },
): Map<BucketKey, AggregateBucket> {
  const out = new Map<BucketKey, AggregateBucket>();
  for (const row of rows) {
    const rowTs = typeof row.timestamp === 'string' ? row.timestamp : null;
    for (const field of HF_FIELDS) {
      if (!(field in row)) continue;
      const avgValue = extractAvgValue(row[field]);
      if (avgValue == null) continue;
      const bucketTimestamp = rowTs;
      if (!bucketTimestamp) continue;
      const key = bucketKey(field, bucketTimestamp);
      out.set(key, {
        providerField: field,
        bucketTimestamp,
        avgValue,
        hfWindowFrom: window.hfWindowFrom,
        hfWindowTo: window.hfWindowTo,
        requestStartedAt: window.requestStartedAt,
      });
    }
  }
  return out;
}

function compareBuckets(original: Map<BucketKey, AggregateBucket>, replay: Map<BucketKey, AggregateBucket>) {
  let unchanged = 0;
  let changedValue = 0;
  let removed = 0;
  let added = 0;
  const changedExamples: Array<{ key: BucketKey; original: number; replay: number }> = [];
  const newExamples: AggregateBucket[] = [];
  for (const [key, ob] of original.entries()) {
    const rb = replay.get(key);
    if (!rb) {
      removed++;
      continue;
    }
    if (Math.abs(ob.avgValue - rb.avgValue) < 1e-9) unchanged++;
    else {
      changedValue++;
      if (changedExamples.length < 5) changedExamples.push({ key, original: ob.avgValue, replay: rb.avgValue });
    }
  }
  for (const [key, rb] of replay.entries()) {
    if (!original.has(key)) {
      added++;
      if (newExamples.length < 5) newExamples.push(rb);
    }
  }
  return {
    originalBucketCount: original.size,
    replayBucketCount: replay.size,
    unchangedBucketCount: unchanged,
    newBucketCount: added,
    removedBucketCount: removed,
    changedValueCount: changedValue,
    changedValueExamples: changedExamples,
    newBucketExamples: newExamples,
  };
}

async function main(): Promise<void> {
  loadEnv();
  const inputPath = parseArg('--input') ?? '/tmp/rd001-observations.jsonl';
  const outPath =
    parseArg('--out') ??
    path.resolve(process.cwd(), 'docs/audits/data/dimo-lte-r1-reference-drive-001-hf-exact-window-replay.json');

  if (!process.env.DIMO_CLIENT_ID || !process.env.DIMO_PRIVATE_KEY) {
    throw new Error('DIMO_CLIENT_ID and DIMO_PRIVATE_KEY required');
  }

  const original = loadOriginalBuckets(inputPath);
  const devJwt = await getDeveloperJwt();
  const vehicleJwt = await getVehicleJwt(devJwt);

  const perWindow: Array<ReturnType<typeof compareBuckets> & {
    hfWindowFrom: string;
    hfWindowTo: string;
    requestStartedAt: string;
    providerRowCount: number;
  }> = [];
  const perFieldTotals = Object.fromEntries(
    HF_FIELDS.map((f) => [
      f,
      {
        originalAggregateBuckets: 0,
        replayAggregateBuckets: 0,
        unchangedBucketCount: 0,
        newBucketCount: 0,
        removedBucketCount: 0,
        changedValueCount: 0,
      },
    ]),
  ) as Record<
    HfField,
    {
      originalAggregateBuckets: number;
      replayAggregateBuckets: number;
      unchangedBucketCount: number;
      newBucketCount: number;
      removedBucketCount: number;
      changedValueCount: number;
    }
  >;

  for (const window of original.windows) {
    const windowId = `${window.hfWindowFrom}|${window.hfWindowTo}|${window.requestStartedAt}`;
    const query = buildBroadReferenceHistoricalSignalsQuery(
      TOKEN_ID,
      [...HF_FIELDS],
      new Date(window.hfWindowFrom),
      new Date(window.hfWindowTo),
      REQUESTED_INTERVAL,
    );
    if (!query) throw new Error(`No historical query for window ${windowId}`);
    const result = await gql(vehicleJwt, query);
    const rows = ((result.data as Record<string, unknown> | undefined)?.signals ?? []) as Array<
      Record<string, unknown>
    >;
    const replayBuckets = parseReplayBuckets(rows, window);
    const originalBuckets = original.bucketsByWindow.get(windowId) ?? new Map();
    const cmp = compareBuckets(originalBuckets, replayBuckets);
    perWindow.push({
      ...window,
      providerRowCount: rows.length,
      ...cmp,
    });
    for (const field of HF_FIELDS) {
      const origField = new Map(
        [...originalBuckets.entries()].filter(([k]) => k.startsWith(`${field}|`)),
      );
      const replayField = new Map([...replayBuckets.entries()].filter(([k]) => k.startsWith(`${field}|`)));
      const fieldCmp = compareBuckets(origField, replayField);
      const t = perFieldTotals[field];
      t.originalAggregateBuckets += fieldCmp.originalBucketCount;
      t.replayAggregateBuckets += fieldCmp.replayBucketCount;
      t.unchangedBucketCount += fieldCmp.unchangedBucketCount;
      t.newBucketCount += fieldCmp.newBucketCount;
      t.removedBucketCount += fieldCmp.removedBucketCount;
      t.changedValueCount += fieldCmp.changedValueCount;
    }
  }

  const aggregate = Object.values(perFieldTotals).reduce(
    (acc, f) => ({
      originalAggregateBuckets: acc.originalAggregateBuckets + f.originalAggregateBuckets,
      replayAggregateBuckets: acc.replayAggregateBuckets + f.replayAggregateBuckets,
      unchangedBucketCount: acc.unchangedBucketCount + f.unchangedBucketCount,
      newBucketCount: acc.newBucketCount + f.newBucketCount,
      removedBucketCount: acc.removedBucketCount + f.removedBucketCount,
      changedValueCount: acc.changedValueCount + f.changedValueCount,
    }),
    {
      originalAggregateBuckets: 0,
      replayAggregateBuckets: 0,
      unchangedBucketCount: 0,
      newBucketCount: 0,
      removedBucketCount: 0,
      changedValueCount: 0,
    },
  );

  const hfLateArrivalAggregateBucket =
    aggregate.newBucketCount > 0 ? 'CONFIRMED_FROM_RUNTIME' : 'NOT_CONFIRMED_FROM_RD001';

  const output = {
    referenceDriveId: 'DIMO_LTE_R1_REFERENCE_DRIVE_001',
    generatedAt: new Date().toISOString(),
    experiment: 'HF_EXACT_WINDOW_AGGREGATE_BUCKET_REPLAY',
    semantics: {
      HF_AGGREGATION_SEMANTICS: 'CONFIRMED_FROM_CODE_AND_PROVIDER_SOURCE',
      observationType: 'HF_AGGREGATE_BUCKET_OBSERVATION',
      dimoHistoricalSurface: 'DIMO_AGGREGATED_HISTORICAL_1S',
      aggregator: AGGREGATOR,
      interval: REQUESTED_INTERVAL,
      bucketTimestampMeaning: 'INTERVAL_START_ANCHORED_TO_QUERY_FROM',
      bucketOriginAuthority:
        'DIMO-Network/dq internal/service/duck/aggregations.go — epoch-aligned buckets with origin = aggArgs.FromTS',
      synqDriveSelection:
        'reference-capture-signal-schema.registry.ts buildHistoricalSelectionForField() => field(agg: AVG)',
      physicalSampleFingerprintSemanticDebt:
        'physicalSampleFingerprint on HF_HISTORICAL fingerprints (field, bucketTimestamp, AVG) — aggregate bucket identity, not raw physical LTE_R1 sample',
      prior225PosthocClaim: 'INVALIDATED_BY_AGGREGATION_GRID_MISMATCH',
    },
    sealedRawExport: { path: inputPath, sha256: original.sha256, unchanged: true },
    rowProducingRequestCount: original.windows.length,
    perWindowReplay: perWindow,
    perFieldTotals,
    aggregate,
    verdict: {
      HF_LATE_ARRIVAL_WATERMARK_RISK: 'CONFIRMED_FROM_CODE_RISK',
      HF_LATE_ARRIVAL_RUNTIME_SKIP: 'UNKNOWN_REQUIRES_VALIDATION',
      HF_LATE_ARRIVAL_AGGREGATE_BUCKET: hfLateArrivalAggregateBucket,
      RD001_HF_COMPLETENESS: aggregate.newBucketCount > 0 ? 'INCOMPLETE' : 'UNKNOWN_REQUIRES_VALIDATION',
      note:
        aggregate.newBucketCount > 0
          ? 'Exact-window replay found aggregate buckets not present in original sealed response'
          : 'Exact-window replay found no new aggregate buckets vs sealed RD001 at same from/to boundaries',
    },
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ ok: true, outPath, aggregate, verdict: output.verdict, perFieldTotals }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
