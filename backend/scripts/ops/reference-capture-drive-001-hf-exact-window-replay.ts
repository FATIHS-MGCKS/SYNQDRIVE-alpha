/**
 * Reference Drive #001 — grid-controlled HF aggregate bucket replay (normalized).
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { Wallet } from 'ethers';
import { buildBroadReferenceHistoricalSignalsQuery } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-query-builder';
import {
  aggregateBucketKey,
  bucketIntervalBoundsMs,
  canonicalizeBucketTimestamp,
  classifyBucketClosureAtOriginalResponse,
  classifyWatermarkExclusion,
  compareAggregateBucketMaps,
  computeAvailabilityLagLowerBoundSeconds,
  countDefinitelyExcludedUniqueBucketTimestamps,
  DIMO_PROVIDER_SOURCE_AUTHORITY,
  summarizeLagSeconds,
  type AggregateBucketObservation,
  type HfLateArrivalDifferentialRow,
  type WatermarkExclusionClassification,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-hf-aggregate-bucket-analysis';

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
const PRIOR_NORMALIZED_TOTALS = {
  originalAggregateBuckets: 1333,
  replayAggregateBuckets: 1455,
  unchangedBucketCount: 1318,
  newBucketCount: 137,
  removedBucketCount: 15,
  changedValueCount: 0,
};
const PRIOR_PROBLEMATIC_WINDOW = {
  hfWindowFrom: '2026-09-01T19:12:25.500Z',
  hfWindowTo: '2026-09-01T19:12:34.201Z',
  unchangedBucketCount: 0,
  removedBucketCount: 15,
  newBucketCount: 25,
};

type HfField = (typeof HF_FIELDS)[number];

type RequestWindow = {
  hfWindowFrom: string;
  hfWindowTo: string;
  requestStartedAt: string;
  requestCompletedAt: string | null;
};

type LoadedWindow = RequestWindow & {
  windowId: string;
  originalBuckets: Map<string, AggregateBucketObservation>;
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

function extractAvgValue(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw != null && typeof raw === 'object' && 'value' in (raw as object)) {
    const v = (raw as { value?: unknown }).value;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

function loadOriginalWindows(inputPath: string): { sha256: string; windows: LoadedWindow[] } {
  const raw = fs.readFileSync(inputPath);
  const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
  if (sha256 !== EXPECTED_SHA256) {
    throw new Error(`SHA-256 mismatch: expected ${EXPECTED_SHA256}, got ${sha256}`);
  }

  const windowMeta = new Map<string, RequestWindow & { completedCandidates: string[] }>();
  const bucketsByWindow = new Map<string, Map<string, AggregateBucketObservation>>();

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
    if (!windowMeta.has(windowId)) {
      windowMeta.set(windowId, {
        hfWindowFrom,
        hfWindowTo,
        requestStartedAt,
        requestCompletedAt: null,
        completedCandidates: [],
      });
      bucketsByWindow.set(windowId, new Map());
    }
    const meta = windowMeta.get(windowId)!;
    if (typeof row.requestCompletedAt === 'string') meta.completedCandidates.push(row.requestCompletedAt);

    const avgValue = extractAvgValue(row.rawValueJson);
    const providerTimestamp =
      typeof row.providerTimestamp === 'string'
        ? row.providerTimestamp
        : row.providerTimestamp instanceof Date
          ? row.providerTimestamp.toISOString()
          : null;
    if (avgValue == null || !providerTimestamp) continue;

    const bucketTimestamp = canonicalizeBucketTimestamp(providerTimestamp);
    bucketsByWindow.get(windowId)!.set(aggregateBucketKey(field, bucketTimestamp), {
      providerField: field,
      bucketTimestamp,
      avgValue,
    });
  }

  const windows: LoadedWindow[] = [...windowMeta.entries()]
    .map(([windowId, meta]) => {
      const completed = meta.completedCandidates
        .map((v) => Date.parse(v))
        .filter((ms) => Number.isFinite(ms))
        .sort((a, b) => b - a);
      return {
        windowId,
        hfWindowFrom: meta.hfWindowFrom,
        hfWindowTo: meta.hfWindowTo,
        requestStartedAt: meta.requestStartedAt,
        requestCompletedAt: completed.length ? new Date(completed[0]).toISOString() : null,
        originalBuckets: bucketsByWindow.get(windowId) ?? new Map(),
      };
    })
    .sort((a, b) => a.requestStartedAt.localeCompare(b.requestStartedAt));

  return { sha256, windows };
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
): Map<string, AggregateBucketObservation> {
  const out = new Map<string, AggregateBucketObservation>();
  for (const row of rows) {
    const rowTs = typeof row.timestamp === 'string' ? row.timestamp : null;
    if (!rowTs) continue;
    const bucketTimestamp = canonicalizeBucketTimestamp(rowTs);
    for (const field of HF_FIELDS) {
      if (!(field in row)) continue;
      const avgValue = extractAvgValue(row[field]);
      if (avgValue == null) continue;
      out.set(aggregateBucketKey(field, bucketTimestamp), {
        providerField: field,
        bucketTimestamp,
        avgValue,
      });
    }
  }
  return out;
}

function emptyFieldTotals(): Record<HfField, ReturnType<typeof compareAggregateBucketMaps>> {
  return Object.fromEntries(
    HF_FIELDS.map((f) => [
      f,
      {
        originalBucketObservations: 0,
        replayBucketObservations: 0,
        unchangedBucketObservations: 0,
        newBucketObservations: 0,
        removedBucketObservations: 0,
        changedValueBucketObservations: 0,
      },
    ]),
  ) as Record<HfField, ReturnType<typeof compareAggregateBucketMaps>>;
}

function emptyWatermarkCounts(): Record<WatermarkExclusionClassification, number> {
  return {
    DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK: 0,
    PARTIALLY_OVERLAPPED_BY_NEXT_WINDOW: 0,
    POTENTIALLY_REQUERYABLE: 0,
    NO_NEXT_WINDOW_EVIDENCE: 0,
  };
}

function hashCanonicalJson(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function main(): Promise<void> {
  loadEnv();
  const inputPath = parseArg('--input') ?? '/tmp/rd001-observations.jsonl';
  const outPath =
    parseArg('--out') ??
    path.resolve(__dirname, '../../../docs/audits/data/dimo-lte-r1-reference-drive-001-hf-exact-window-replay.json');
  const differentialPath =
    parseArg('--differential-out') ??
    path.resolve(__dirname, '../../../docs/audits/data/dimo-lte-r1-reference-drive-001-hf-late-arrival-differential.json');
  const replayExperimentGeneratedAt = new Date().toISOString();

  if (!process.env.DIMO_CLIENT_ID || !process.env.DIMO_PRIVATE_KEY) {
    throw new Error('DIMO_CLIENT_ID and DIMO_PRIVATE_KEY required');
  }

  const original = loadOriginalWindows(inputPath);
  const devJwt = await getDeveloperJwt();
  const vehicleJwt = await getVehicleJwt(devJwt);

  const perWindow: Array<
    ReturnType<typeof compareAggregateBucketMaps> & {
      hfWindowFrom: string;
      hfWindowTo: string;
      requestStartedAt: string;
      requestCompletedAt: string | null;
      providerRowCount: number;
      perField: Record<HfField, ReturnType<typeof compareAggregateBucketMaps>>;
    }
  > = [];
  const perFieldTotals = emptyFieldTotals();
  const watermarkByField = Object.fromEntries(HF_FIELDS.map((f) => [f, emptyWatermarkCounts()])) as Record<
    HfField,
    Record<WatermarkExclusionClassification, number>
  >;
  const watermarkTotal = emptyWatermarkCounts();
  const differentialRows: HfLateArrivalDifferentialRow[] = [];
  let bucketNotClosedAtOriginalResponseCount = 0;
  let closedBucketNotAvailableCount = 0;
  const closedBucketLagSeconds: number[] = [];

  for (let i = 0; i < original.windows.length; i++) {
    const window = original.windows[i];
    const nextWindow = original.windows[i + 1] ?? null;
    const query = buildBroadReferenceHistoricalSignalsQuery(
      TOKEN_ID,
      [...HF_FIELDS],
      new Date(window.hfWindowFrom),
      new Date(window.hfWindowTo),
      REQUESTED_INTERVAL,
    );
    if (!query) throw new Error(`No historical query for window ${window.windowId}`);
    const result = await gql(vehicleJwt, query);
    const rows = ((result.data as Record<string, unknown> | undefined)?.signals ?? []) as Array<
      Record<string, unknown>
    >;
    const replayBuckets = parseReplayBuckets(rows);
    const cmp = compareAggregateBucketMaps(window.originalBuckets, replayBuckets);
    const perField = emptyFieldTotals();

    for (const field of HF_FIELDS) {
      const origField = new Map(
        [...window.originalBuckets.entries()].filter(([k]) => k.startsWith(`${field}|`)),
      );
      const replayField = new Map([...replayBuckets.entries()].filter(([k]) => k.startsWith(`${field}|`)));
      const fieldCmp = compareAggregateBucketMaps(origField, replayField);
      perField[field] = fieldCmp;
      const t = perFieldTotals[field];
      t.originalBucketObservations += fieldCmp.originalBucketObservations;
      t.replayBucketObservations += fieldCmp.replayBucketObservations;
      t.unchangedBucketObservations += fieldCmp.unchangedBucketObservations;
      t.newBucketObservations += fieldCmp.newBucketObservations;
      t.removedBucketObservations += fieldCmp.removedBucketObservations;
      t.changedValueBucketObservations += fieldCmp.changedValueBucketObservations;
    }

    for (const [key, bucket] of replayBuckets.entries()) {
      if (window.originalBuckets.has(key)) continue;
      const classification = classifyWatermarkExclusion({
        bucketTimestamp: bucket.bucketTimestamp,
        nextWindowFrom: nextWindow?.hfWindowFrom ?? null,
      });
      watermarkTotal[classification]++;
      watermarkByField[bucket.providerField as HfField][classification]++;

      const closure = classifyBucketClosureAtOriginalResponse({
        bucketTimestamp: bucket.bucketTimestamp,
        requestCompletedAt: window.requestCompletedAt,
      });
      if (closure.bucketClosureClassification === 'BUCKET_NOT_CLOSED_AT_ORIGINAL_RESPONSE') {
        bucketNotClosedAtOriginalResponseCount++;
      } else if (closure.bucketClosureClassification === 'CLOSED_BUCKET_NOT_AVAILABLE_AT_ORIGINAL_RESPONSE') {
        closedBucketNotAvailableCount++;
      }

      const lagSeconds = computeAvailabilityLagLowerBoundSeconds({
        bucketTimestamp: bucket.bucketTimestamp,
        requestCompletedAt: window.requestCompletedAt,
      });
      if (lagSeconds != null) closedBucketLagSeconds.push(lagSeconds);

      const { endMs } = bucketIntervalBoundsMs(bucket.bucketTimestamp);
      differentialRows.push({
        observationType: 'HF_AGGREGATE_BUCKET_OBSERVATION',
        providerField: bucket.providerField,
        bucketStart: bucket.bucketTimestamp,
        bucketEnd: new Date(endMs).toISOString(),
        avgValue: bucket.avgValue,
        originalHfWindowFrom: window.hfWindowFrom,
        originalHfWindowTo: window.hfWindowTo,
        originalRequestStartedAt: window.requestStartedAt,
        originalRequestCompletedAt: window.requestCompletedAt,
        nextKnownHfWindowFrom: nextWindow?.hfWindowFrom ?? null,
        watermarkClassification: classification,
        bucketClosureAtOriginalResponse: closure.bucketClosureAtOriginalResponse,
        availabilityLagLowerBoundSeconds: lagSeconds,
        replayExperimentGeneratedAt,
      });
    }

    perWindow.push({
      hfWindowFrom: window.hfWindowFrom,
      hfWindowTo: window.hfWindowTo,
      requestStartedAt: window.requestStartedAt,
      requestCompletedAt: window.requestCompletedAt,
      providerRowCount: rows.length,
      perField,
      ...cmp,
    });
  }

  const aggregate = Object.values(perFieldTotals).reduce(
    (acc, f) => ({
      aggregateBucketObservationsAcrossRequestWindows_original: acc.aggregateBucketObservationsAcrossRequestWindows_original + f.originalBucketObservations,
      aggregateBucketObservationsAcrossRequestWindows_replay: acc.aggregateBucketObservationsAcrossRequestWindows_replay + f.replayBucketObservations,
      unchangedBucketObservations: acc.unchangedBucketObservations + f.unchangedBucketObservations,
      newBucketObservations: acc.newBucketObservations + f.newBucketObservations,
      removedBucketObservations: acc.removedBucketObservations + f.removedBucketObservations,
      changedValueBucketObservations: acc.changedValueBucketObservations + f.changedValueBucketObservations,
    }),
    {
      aggregateBucketObservationsAcrossRequestWindows_original: 0,
      aggregateBucketObservationsAcrossRequestWindows_replay: 0,
      unchangedBucketObservations: 0,
      newBucketObservations: 0,
      removedBucketObservations: 0,
      changedValueBucketObservations: 0,
    },
  );

  const problematicWindow = perWindow.find(
    (w) => w.hfWindowFrom === PRIOR_PROBLEMATIC_WINDOW.hfWindowFrom && w.hfWindowTo === PRIOR_PROBLEMATIC_WINDOW.hfWindowTo,
  );

  const definitelyExcluded = watermarkTotal.DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK;
  const definitelyExcludedUniqueBucketTimestamps = countDefinitelyExcludedUniqueBucketTimestamps(differentialRows);
  const hfLateArrivalRuntimeSkip =
    definitelyExcluded > 0 ? 'CONFIRMED_FROM_RUNTIME' : aggregate.newBucketObservations > 0 ? 'UNKNOWN_REQUIRES_VALIDATION' : 'NOT_CONFIRMED_FROM_RD001';

  const differentialRowsCanonical = [...differentialRows].sort((a, b) => {
    const fieldCmp = a.providerField.localeCompare(b.providerField);
    if (fieldCmp !== 0) return fieldCmp;
    return a.bucketStart.localeCompare(b.bucketStart);
  });
  const differentialArtifact = {
    referenceDriveId: 'DIMO_LTE_R1_REFERENCE_DRIVE_001',
    evidenceId: 'DI-EV-0016',
    observationType: 'HF_AGGREGATE_BUCKET_OBSERVATION',
    generatedAt: replayExperimentGeneratedAt,
    sealedRawExportSha256: original.sha256,
    exactWindowReplayArtifact: path.basename(outPath),
    differentialRowCount: differentialRowsCanonical.length,
    rows: differentialRowsCanonical,
  };
  const differentialContentsSha256 = hashCanonicalJson(differentialRowsCanonical);

  const output = {
    referenceDriveId: 'DIMO_LTE_R1_REFERENCE_DRIVE_001',
    generatedAt: replayExperimentGeneratedAt,
    experiment: 'HF_EXACT_WINDOW_AGGREGATE_BUCKET_REPLAY_NORMALIZED',
    timestampCanonicalizationFixed: true,
    priorUnnormalizedTotals: PRIOR_NORMALIZED_TOTALS,
    problematicWindowAudit: {
      window: PRIOR_PROBLEMATIC_WINDOW,
      priorUnnormalizedResult: {
        unchangedBucketCount: PRIOR_PROBLEMATIC_WINDOW.unchangedBucketCount,
        removedBucketCount: PRIOR_PROBLEMATIC_WINDOW.removedBucketCount,
        newBucketCount: PRIOR_PROBLEMATIC_WINDOW.newBucketCount,
      },
      correctedNormalizedResult: problematicWindow
        ? {
            unchangedBucketObservations: problematicWindow.unchangedBucketObservations,
            removedBucketObservations: problematicWindow.removedBucketObservations,
            newBucketObservations: problematicWindow.newBucketObservations,
            changedValueBucketObservations: problematicWindow.changedValueBucketObservations,
          }
        : null,
    },
    semantics: {
      HF_AGGREGATION_SEMANTICS: 'CONFIRMED_FROM_CODE_AND_PROVIDER_SOURCE',
      observationType: 'HF_AGGREGATE_BUCKET_OBSERVATION',
      countingModel: 'AGGREGATE_BUCKET_OBSERVATIONS_ACROSS_REQUEST_WINDOWS',
      dimoHistoricalSurface: 'DIMO_AGGREGATED_HISTORICAL_1S',
      aggregator: AGGREGATOR,
      interval: REQUESTED_INTERVAL,
      bucketSemantics: DIMO_PROVIDER_SOURCE_AUTHORITY.bucketSemantics,
      bucketTimestampMeaning: DIMO_PROVIDER_SOURCE_AUTHORITY.bucketTimestampMeaning,
      dimoProviderSourceAuthority: DIMO_PROVIDER_SOURCE_AUTHORITY,
      synqDriveSelection:
        'reference-capture-signal-schema.registry.ts buildHistoricalSelectionForField() => field(agg: AVG)',
      deviceRawSampleCadence: 'UNKNOWN',
    },
    sealedRawExport: { path: inputPath, sha256: original.sha256, unchanged: true },
    rowProducingRequestCount: original.windows.length,
    perWindowReplay: perWindow,
    perFieldTotals,
    aggregate,
    watermarkCausality: {
      perField: watermarkByField,
      total: watermarkTotal,
      definitelyExcludedFieldBucketObservations: definitelyExcluded,
      definitelyExcludedUniqueBucketStartTimestamps: definitelyExcludedUniqueBucketTimestamps,
      interpretation:
        definitelyExcluded > 0
          ? 'Late-available DIMO aggregate source intervals were permanently excluded from subsequent Reference Capture HF windows by the 2-second wall-clock watermark overlap.'
          : 'No new replay buckets were classified as definitely excluded by the next incremental window boundary.',
    },
    providerAvailabilityLagLowerBoundSeconds: {
      note: 'Not network latency. Only CLOSED_BUCKET_NOT_AVAILABLE_AT_ORIGINAL_RESPONSE rows (bucketEnd <= requestCompletedAt).',
      newBucketObservationCount: aggregate.newBucketObservations,
      bucketNotClosedAtOriginalResponseCount,
      closedBucketNotAvailableAtOriginalResponseCount: closedBucketNotAvailableCount,
      closedBucketOnly: summarizeLagSeconds(closedBucketLagSeconds),
    },
    lateArrivalDifferentialArtifact: {
      path: differentialPath,
      differentialRowCount: differentialRowsCanonical.length,
      differentialContentsSha256,
    },
    verdict: {
      LATE_AGGREGATE_AVAILABILITY: aggregate.newBucketObservations > 0 ? 'CONFIRMED_FROM_RUNTIME' : 'NOT_CONFIRMED',
      HF_LATE_ARRIVAL_WATERMARK_RISK: 'CONFIRMED_FROM_CODE_RISK',
      HF_LATE_ARRIVAL_RUNTIME_SKIP: hfLateArrivalRuntimeSkip,
      HF_LATE_ARRIVAL_AGGREGATE_BUCKET: aggregate.newBucketObservations > 0 ? 'CONFIRMED_FROM_RUNTIME' : 'NOT_CONFIRMED_FROM_RD001',
      RD001_HF_COMPLETENESS: aggregate.newBucketObservations > 0 ? 'INCOMPLETE' : 'UNKNOWN_REQUIRES_VALIDATION',
      RD001_UPSTREAM_DATA_STALL_AFTER_1914: 'CONFIRMED_FROM_RUNTIME',
      UPSTREAM_DATA_STALL_ROOT_CAUSE: 'UNKNOWN_REQUIRES_VALIDATION',
      PHYSICAL_SAMPLE_FINGERPRINT_REMEDIATION_REQUIRED: 'YES',
      HF_WATERMARK_REMEDIATION_REQUIRED: definitelyExcluded > 0 ? 'YES' : 'REQUIRES_VALIDATION',
    },
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  fs.writeFileSync(
    differentialPath,
    JSON.stringify({ ...differentialArtifact, differentialContentsSha256 }, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        differentialPath,
        differentialContentsSha256,
        aggregate,
        problematicWindow: output.problematicWindowAudit,
        watermarkCausality: output.watermarkCausality,
        availabilityLag: output.providerAvailabilityLagLowerBoundSeconds,
        verdict: output.verdict,
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
