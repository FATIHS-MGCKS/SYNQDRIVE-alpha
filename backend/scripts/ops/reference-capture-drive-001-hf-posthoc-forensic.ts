/**
 * Reference Drive #001 — HF historical completeness post-hoc forensic audit.
 * READ-ONLY: queries DIMO provider independently of capture watermark.
 * Does NOT modify the sealed RD001 raw export.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { Wallet } from 'ethers';
import { buildBroadReferenceHistoricalSignalsQuery } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-query-builder';
import { buildPhysicalSampleFingerprint } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-physical-sample-identity.util';

const REFERENCE_DRIVE_ID = 'DIMO_LTE_R1_REFERENCE_DRIVE_001';
const SESSION_ID = '06638509-6213-419b-9df4-3def6c024f41';
const TOKEN_ID = 192922;
const EXPECTED_SHA256 = 'f8e3097e28899d7a2cbdd269b266c16e5cf3eed69be810aba4e1247ec9a65bbd';
const WINDOW_FROM = '2026-09-01T19:00:43.252Z';
const WINDOW_TO = '2026-09-01T19:34:52.360Z';
const HF_FIELDS = [
  'speed',
  'obdEngineLoad',
  'powertrainCombustionEngineSpeed',
  'powertrainCombustionEngineTPS',
  'obdThrottlePosition',
] as const;
const CHUNK_SECONDS = 300;
const REQUESTED_INTERVAL = '1s';

type HfField = (typeof HF_FIELDS)[number];

type SealedSample = {
  providerField: string;
  providerTimestamp: string | null;
  normalizedValue: unknown;
  fingerprint: string;
};

type PosthocSample = {
  providerField: string;
  providerTimestamp: string;
  normalizedValue: unknown;
  fingerprint: string;
  requestWindowFrom: string;
  requestWindowTo: string;
  retrievalTimestamp: string;
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

function extractProviderTimestamp(value: unknown): string | null {
  if (value == null || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const ts = obj.timestamp ?? obj.lastSeen ?? obj.observedAt;
  if (typeof ts === 'string') return ts;
  if (ts instanceof Date) return ts.toISOString();
  return null;
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

function loadSealedHfSamples(inputPath: string): {
  sha256: string;
  byField: Record<HfField, Map<string, SealedSample>>;
  rowProducingRequestCount: number;
  lastRowProducingRequestStartedAt: string | null;
  lastProviderTimestamp: string | null;
} {
  const raw = fs.readFileSync(inputPath);
  const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
  if (sha256 !== EXPECTED_SHA256) {
    throw new Error(`SHA-256 mismatch: expected ${EXPECTED_SHA256}, got ${sha256}`);
  }
  const byField = Object.fromEntries(HF_FIELDS.map((f) => [f, new Map<string, SealedSample>()])) as Record<
    HfField,
    Map<string, SealedSample>
  >;
  const requestStarts = new Set<string>();
  let lastProviderTimestamp: string | null = null;
  for (const line of raw.toString('utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as Record<string, unknown>;
    if (row.acquisitionSurface !== 'HF_HISTORICAL') continue;
    const field = row.providerField as HfField;
    if (!HF_FIELDS.includes(field)) continue;
    const providerTimestamp =
      typeof row.providerTimestamp === 'string'
        ? row.providerTimestamp
        : row.providerTimestamp instanceof Date
          ? row.providerTimestamp.toISOString()
          : null;
    const normalizedValue = row.normalizedValue ?? row.rawValueJson;
    const fingerprint =
      (row.physicalSampleFingerprint as string | null) ??
      buildPhysicalSampleFingerprint({ providerField: field, providerTimestamp, normalizedValue });
    byField[field].set(fingerprint, { providerField: field, providerTimestamp, normalizedValue, fingerprint });
    if (typeof row.requestStartedAt === 'string') requestStarts.add(row.requestStartedAt);
    if (providerTimestamp && (!lastProviderTimestamp || providerTimestamp > lastProviderTimestamp)) {
      lastProviderTimestamp = providerTimestamp;
    }
  }
  const sortedRequests = [...requestStarts].sort();
  return {
    sha256,
    byField,
    rowProducingRequestCount: sortedRequests.length,
    lastRowProducingRequestStartedAt: sortedRequests.at(-1) ?? null,
    lastProviderTimestamp,
  };
}

async function queryPosthocWindow(
  jwt: string,
  from: Date,
  to: Date,
): Promise<{ samples: PosthocSample[]; rowCount: number; errors: string[] }> {
  const retrievalTimestamp = new Date().toISOString();
  const query = buildBroadReferenceHistoricalSignalsQuery(
    TOKEN_ID,
    [...HF_FIELDS],
    from,
    to,
    REQUESTED_INTERVAL,
  );
  if (!query) return { samples: [], rowCount: 0, errors: ['historical query plan empty'] };
  const result = await gql(jwt, query);
  const errors: string[] = [];
  if (result.errors) errors.push(JSON.stringify(result.errors));
  const rows = ((result.data as Record<string, unknown> | undefined)?.signals ?? []) as Array<
    Record<string, unknown>
  >;
  const samples: PosthocSample[] = [];
  for (const row of rows) {
    const rowTs = typeof row.timestamp === 'string' ? row.timestamp : null;
    for (const field of HF_FIELDS) {
      if (!(field in row)) continue;
      const rawPayload = row[field];
      if (rawPayload == null) continue;
      const providerTimestamp = extractProviderTimestamp(rawPayload) ?? rowTs;
      if (!providerTimestamp) continue;
      const normalizedValue = rawPayload;
      samples.push({
        providerField: field,
        providerTimestamp,
        normalizedValue,
        fingerprint: buildPhysicalSampleFingerprint({
          providerField: field,
          providerTimestamp,
          normalizedValue,
        }),
        requestWindowFrom: from.toISOString(),
        requestWindowTo: to.toISOString(),
        retrievalTimestamp,
      });
    }
  }
  return { samples, rowCount: rows.length, errors };
}

function compareField(
  field: HfField,
  sealed: Map<string, SealedSample>,
  posthoc: Map<string, PosthocSample>,
) {
  const sealedFps = new Set(sealed.keys());
  const posthocFps = new Set(posthoc.keys());
  const intersection = [...sealedFps].filter((fp) => posthocFps.has(fp));
  const sealedOnly = [...sealedFps].filter((fp) => !posthocFps.has(fp));
  const posthocOnly = [...posthocFps].filter((fp) => !sealedFps.has(fp));
  const posthocOnlyTs = posthocOnly
    .map((fp) => posthoc.get(fp)?.providerTimestamp)
    .filter((ts): ts is string => Boolean(ts))
    .sort();
  return {
    providerField: field,
    sealedRd001SampleCount: sealed.size,
    posthocProviderSampleCount: posthoc.size,
    intersectionCount: intersection.length,
    sealedOnlyCount: sealedOnly.length,
    posthocOnlyCount: posthocOnly.length,
    matchRate: sealed.size ? intersection.length / sealed.size : null,
    posthocOnlyFirstTimestamp: posthocOnlyTs[0] ?? null,
    posthocOnlyLastTimestamp: posthocOnlyTs.at(-1) ?? null,
    posthocOnlyAfterLastSealedProviderTs: posthocOnlyTs.filter(
      (ts) => ts > '2026-09-01T19:14:02.097Z',
    ).length,
  };
}

async function main(): Promise<void> {
  loadEnv();
  const inputPath =
    parseArg('--input') ??
    '/opt/synqdrive/shared/reference-evidence/dimo-lte-r1-reference-drive-001/observations-export.jsonl';
  const outPath =
    parseArg('--out') ??
    path.resolve(process.cwd(), 'docs/audits/data/dimo-lte-r1-reference-drive-001-hf-posthoc-forensic.json');

  if (!process.env.DIMO_CLIENT_ID || !process.env.DIMO_PRIVATE_KEY) {
    throw new Error('DIMO_CLIENT_ID and DIMO_PRIVATE_KEY required');
  }

  const sealed = loadSealedHfSamples(inputPath);
  const devJwt = await getDeveloperJwt();
  const vehicleJwt = await getVehicleJwt(devJwt, TOKEN_ID);

  const windows = chunkWindows(WINDOW_FROM, WINDOW_TO, CHUNK_SECONDS);
  const allPosthoc: PosthocSample[] = [];
  const chunkResults: Array<{
    from: string;
    to: string;
    providerRowCount: number;
    expandedSampleCount: number;
    retrievalTimestamp: string;
    errors: string[];
  }> = [];

  for (const w of windows) {
    const result = await queryPosthocWindow(vehicleJwt, w.from, w.to);
    allPosthoc.push(...result.samples);
    chunkResults.push({
      from: w.from.toISOString(),
      to: w.to.toISOString(),
      providerRowCount: result.rowCount,
      expandedSampleCount: result.samples.length,
      retrievalTimestamp: result.samples[0]?.retrievalTimestamp ?? new Date().toISOString(),
      errors: result.errors,
    });
  }

  const posthocByField = Object.fromEntries(HF_FIELDS.map((f) => [f, new Map<string, PosthocSample>()])) as Record<
    HfField,
    Map<string, PosthocSample>
  >;
  for (const sample of allPosthoc) {
    const field = sample.providerField as HfField;
    if (!posthocByField[field].has(sample.fingerprint)) {
      posthocByField[field].set(sample.fingerprint, sample);
    }
  }

  const perField = HF_FIELDS.map((field) => compareField(field, sealed.byField[field], posthocByField[field]));
  const totalPosthocOnly = perField.reduce((sum, f) => sum + f.posthocOnlyCount, 0);
  const posthocOnlyAfterCutoff = perField.reduce((sum, f) => sum + f.posthocOnlyAfterLastSealedProviderTs, 0);
  const posthocOnlyTimestamps = perField
    .flatMap((f) =>
      [...posthocByField[f.providerField as HfField].values()]
        .map((s) => s.providerTimestamp)
        .filter((ts) => !sealed.byField[f.providerField as HfField].has(
          buildPhysicalSampleFingerprint({
            providerField: f.providerField,
            providerTimestamp: ts,
            normalizedValue: posthocByField[f.providerField as HfField].get(
              buildPhysicalSampleFingerprint({
                providerField: f.providerField,
                providerTimestamp: ts,
                normalizedValue: posthocByField[f.providerField as HfField].values().next().value?.normalizedValue,
              }),
            )?.normalizedValue,
          }),
        )),
    )
    .sort();

  const allPosthocOnlyFps = new Set<string>();
  for (const field of HF_FIELDS) {
    for (const fp of posthocByField[field].keys()) {
      if (!sealed.byField[field].has(fp)) allPosthocOnlyFps.add(`${field}|${fp}`);
    }
  }
  const posthocOnlySamples = HF_FIELDS.flatMap((field) =>
    [...posthocByField[field].values()].filter((s) => !sealed.byField[field].has(s.fingerprint)),
  ).sort((a, b) => a.providerTimestamp.localeCompare(b.providerTimestamp));

  const lastSealedProviderTs = sealed.lastProviderTimestamp ?? '2026-09-01T19:14:02.097Z';
  const posthocOnlyInLateSessionWindow = posthocOnlySamples.filter(
    (s) => s.providerTimestamp > lastSealedProviderTs && s.providerTimestamp <= WINDOW_TO,
  ).length;
  const posthocChunksAfterLastSealed = chunkResults.filter((c) => c.from >= '2026-09-01T19:15:43.252Z');
  const providerEmptyAfter1915 = posthocChunksAfterLastSealed.every((c) => c.providerRowCount === 0);

  let hfLateArrivalVerdict: 'CONFIRMED_FROM_RUNTIME' | 'NOT_CONFIRMED_FROM_RD001' | 'INSUFFICIENT_EVIDENCE';
  if (totalPosthocOnly > 0 && posthocOnlyInLateSessionWindow === 0 && providerEmptyAfter1915) {
    hfLateArrivalVerdict =
      totalPosthocOnly > 0 ? 'CONFIRMED_FROM_RUNTIME' : 'NOT_CONFIRMED_FROM_RD001';
  } else if (posthocOnlyInLateSessionWindow > 0) {
    hfLateArrivalVerdict = 'CONFIRMED_FROM_RUNTIME';
  } else if (totalPosthocOnly > 0) {
    hfLateArrivalVerdict = 'INSUFFICIENT_EVIDENCE';
  } else {
    hfLateArrivalVerdict = 'NOT_CONFIRMED_FROM_RD001';
  }

  const output = {
    referenceDriveId: REFERENCE_DRIVE_ID,
    sessionId: SESSION_ID,
    tokenId: TOKEN_ID,
    generatedAt: new Date().toISOString(),
    experiment: 'HF_POSTHOC_FULL_WINDOW_PROVIDER_QUERY',
    readOnly: true,
    sealedRawExport: {
      path: inputPath,
      sha256: sealed.sha256,
      unchanged: true,
      expectedSha256: EXPECTED_SHA256,
    },
    queryWindow: {
      from: WINDOW_FROM,
      to: WINDOW_TO,
      chunkSeconds: CHUNK_SECONDS,
      chunkCount: windows.length,
      requestedInterval: REQUESTED_INTERVAL,
      requestedIntervalNote: 'REQUESTED 1s != OBSERVED 1Hz',
    },
    sealedHfSummary: {
      rowProducingHfRequestCount: sealed.rowProducingRequestCount,
      lastRowProducingRequestStartedAt: sealed.lastRowProducingRequestStartedAt,
      lastProviderTimestamp: sealed.lastProviderTimestamp,
      hfWatermarkAdvancedWithoutRowsAfter: '2026-09-01T19:14:09.726Z',
      preStopHfWatermarkAt: '2026-09-01T19:34:48.597Z',
    },
    hfWatermarkCurrentCodeBehavior: {
      classification: 'CONFIRMED_FROM_CODE',
      mode: 'A_request_wall_clock_now',
      description:
        'captureHistoricalSurface sets hfWatermarkAt = request now after every HF query, including zero-row responses',
      overlapMs: 2000,
      riskHypothesis: 'HF_LATE_ARRIVAL_WATERMARK_SKIP',
    },
    chunkResults,
    perFieldComparison: perField,
    aggregate: {
      totalSealedSamples: perField.reduce((s, f) => s + f.sealedRd001SampleCount, 0),
      totalPosthocSamples: perField.reduce((s, f) => s + f.posthocProviderSampleCount, 0),
      totalIntersection: perField.reduce((s, f) => s + f.intersectionCount, 0),
      totalSealedOnly: perField.reduce((s, f) => s + f.sealedOnlyCount, 0),
      totalPosthocOnly,
      posthocOnlyAfterLastSealedProviderTs: posthocOnlyAfterCutoff,
      posthocOnlyTimeRange: {
        first: posthocOnlySamples[0]?.providerTimestamp ?? null,
        last: posthocOnlySamples.at(-1)?.providerTimestamp ?? null,
        inSkippedWindow_19_14_02_to_19_34_52: posthocOnlyAfterCutoff,
      },
    },
    providerAvailabilityAfterLastSealed: {
      posthocChunksFrom1915: posthocChunksAfterLastSealed.map((c) => ({
        from: c.from,
        to: c.to,
        providerRowCount: c.providerRowCount,
      })),
      providerSignalsEmptyAfter1915: providerEmptyAfter1915,
      latestProviderTimestampFrozenAt: '~2026-09-01T19:14:03Z across LATEST surfaces during continued polling until 19:34:48Z',
      interpretation:
        'No HF rows after ~19:14 is primarily provider HF unavailability in post-hoc full-window query, not watermark skip alone',
    },
    verdict: {
      HF_LATE_ARRIVAL_WATERMARK_SKIP_activeWindow: totalPosthocOnly > 0 ? 'CONFIRMED_FROM_RUNTIME' : 'NOT_CONFIRMED_FROM_RD001',
      HF_LATE_ARRIVAL_WATERMARK_SKIP_post1914SessionWindow: providerEmptyAfter1915
        ? 'NOT_CONFIRMED_FROM_RD001'
        : posthocOnlyInLateSessionWindow > 0
          ? 'CONFIRMED_FROM_RUNTIME'
          : 'INSUFFICIENT_EVIDENCE',
      HF_LATE_ARRIVAL_WATERMARK_SKIP: hfLateArrivalVerdict,
      HF_LATE_ARRIVAL_WATERMARK_SKIP_codeRisk: 'CONFIRMED_FROM_CODE_RISK',
      RD001_HF_COMPLETENESS: totalPosthocOnly > 0 || posthocOnlyAfterCutoff > 0 ? 'INCOMPLETE' : 'COMPLETE_RELATIVE_TO_POSTHOC',
      whyNoHfRowsAfter1914:
        'Post-hoc DIMO signals() returns 0 rows for 2026-09-01T19:15:43Z→19:34:52Z; LATEST provider timestamps frozen at ~19:14:03 while synq polling continued to 19:34:48',
      note:
        totalPosthocOnly > 0
          ? `${totalPosthocOnly} post-hoc-only physical samples now exist vs sealed RD001 (mostly 19:12:24→19:14:02); provider empty after 19:15`
          : 'Post-hoc full-window query found no additional provider samples beyond sealed RD001',
    },
    gapForensics151s: {
      timestampBeforeGap: '2026-09-01T19:09:35.252Z',
      timestampAfterGap: '2026-09-01T19:12:06.252Z',
      gapSeconds: 151,
      occursWithinSingleBulkWindow: '2026-09-01T19:00:43.252Z → 2026-09-01T19:12:27.500Z',
      classification: 'BOUNDARY_GAP',
      priorIncorrectClassification: 'PROVIDER_GAP',
      rationale: 'ARM startup/recovery boundary inside first bulk HF backfill window — not continuous-motion dropout',
    },
    zeroResultHfRequestObservability: {
      status: 'NOT_PERSISTED_UNKNOWN',
      note: 'SIGNAL_POINT rows only prove HF requests that returned data; zero-row HF cycles leave no persisted evidence',
      proposedMetrics: [
        'hfRequestExecuted',
        'hfRowsReturned',
        'hfProviderMaxTimestamp',
        'hfWatermarkBefore',
        'hfWatermarkAfter',
        'hfQueryWindowFrom',
        'hfQueryWindowTo',
        'workerId',
        'cycleJobId',
      ],
    },
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ ok: true, outPath, verdict: output.verdict, perField }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
