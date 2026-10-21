/**
 * G5C-N16 P4H-R3 — owner-authorized 12-trip historical DIMO crank benchmark.
 *
 * P4H_HISTORICAL_CRANK_OWNER_AUTHORIZED=1 \
 * P4H_R3_ARCHIVE_ROOT=/workspace/.research/p4h-r3 \
 * MAX_PROVIDER_REQUESTS=12 \
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/research/g5c-n16-p4h-r3-execution.ts
 */
import axios from 'axios';
import { createHash } from 'crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { Wallet } from 'ethers';

import { buildBatteryCrankQuery } from '../../src/modules/dimo/queries/battery-crank.query';
import { START_PROXY_CADENCE_GATE_VERSION } from '../../src/modules/vehicle-intelligence/battery-health/lv-start-proxy/battery-start-proxy-cadence-gate';
import {
  archiveFileNameForTrip,
  buildP4hRawArchiveInput,
  sealP4hRawArchive,
} from '../../src/modules/vehicle-intelligence/battery-health/lv-start-proxy/research/p4h-raw-archive.v1';
import { evaluateP4hArchivedTrip } from '../../src/modules/vehicle-intelligence/battery-health/lv-start-proxy/research/p4h-offline-trip-evaluation';
import {
  atomicWriteJson,
  persistencePreflight,
  sha256FileHex,
  verifyArchiveFile,
} from '../../src/modules/vehicle-intelligence/battery-health/lv-start-proxy/research/p4h-persistence';
import { classifyScientificEvidence } from '../../src/modules/vehicle-intelligence/battery-health/lv-start-proxy/research/p4h-scientific-evidence';

const ARCHIVE_ROOT =
  process.env.P4H_R3_ARCHIVE_ROOT ?? '/workspace/.research/p4h-r3';
const RAW_DIR = join(ARCHIVE_ROOT, 'raw');
const MAX_REQUESTS = Number(process.env.MAX_PROVIDER_REQUESTS ?? '12');
const MANIFEST_SOURCE =
  process.env.P4H_TRIP_MANIFEST_PATH ??
  '/workspace/.research/p4h-archive/P4H_TRIP_MANIFEST.json';

const TELEMETRY_URL =
  process.env.DIMO_TELEMETRY_API_URL ?? 'https://telemetry-api.dimo.zone/query';
const TOKEN_EXCHANGE_URL =
  process.env.DIMO_TOKEN_EXCHANGE_URL ?? 'https://token-exchange-api.dimo.zone';
const VEHICLE_NFT =
  process.env.DIMO_VEHICLE_NFT_CONTRACT ??
  '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';

/** Fixed cohort from G5C_N16_P4H_R2_REQUERY_PLAN.md — do not mutate after seal. */
const PLANNED_TRIP_IDS = [
  '98113ec4-59b4-4a61-8f38-b4f16ed91298',
  'ec93e749-2465-419f-82ce-e4d2aae88d51',
  '3fd4f006-41ec-4349-bebd-11a322a9d9dc',
  '8e83f3a8-4eab-4213-8451-f6b1d1585fe4',
  '2cc2bced-b6b2-488b-bf16-c09657696eaf',
  '1ff9f47b-1152-4d69-8882-a6661e0811ff',
  '1698898d-fcd6-43f2-b43d-558a186857b6',
  'e9208508-7277-4db6-90cc-10fb2133e563',
  '7c0594ee-a0a8-48ce-b147-c460aa244187',
  'ca141ac2-4a72-4072-a36a-10bb97e911e8',
  '26121555-27fd-4aa5-8477-dd497cd70260',
  '62d04fbc-2515-4293-a41d-378591290cad',
];

const EXPECTED_VEHICLES: Record<
  string,
  { vehicleId: string; tokenId: number; label: string }
> = {
  '19fedd4b-c4e8-4de8-a125-dab293326e7e': {
    vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
    tokenId: 192922,
    label: 'VW Tiguan WOB L 7503',
  },
  'c10351f8-b6a2-4258-947f-631aeaa6d359': {
    vehicleId: 'c10351f8-b6a2-4258-947f-631aeaa6d359',
    tokenId: 187361,
    label: 'Audi A4 KS MS 661',
  },
  '8c850ff1-4201-432b-af2e-2711dbc7ca48': {
    vehicleId: '8c850ff1-4201-432b-af2e-2711dbc7ca48',
    tokenId: 187784,
    label: 'VW Arteon HMÜ C 215',
  },
};

type ManifestRow = {
  vehicle_label: string;
  vehicle_id: string;
  dimo_token_id: number;
  trip_id: string;
  trip_start_utc: string;
  query_window_from_utc: string;
  query_window_to_utc: string;
};

type LedgerEntry = {
  requestNumber: number;
  tripId: string;
  vehicleId: string;
  reservedAtUtc: string;
  queryFingerprint: string;
  status: 'RESERVED' | 'SENT' | 'COMPLETED' | 'FAILED' | 'UNCERTAIN';
  sentAtUtc?: string;
  completedAtUtc?: string;
  httpStatus?: number | null;
  error?: string | null;
  archiveFile?: string;
};

type Ledger = {
  schemaVersion: 'p4h-r3-request-ledger.v1';
  maxRequests: number;
  telemetryPostsSent: number;
  entries: LedgerEntry[];
  halted?: boolean;
  haltReason?: string;
};

function queryFingerprint(row: ManifestRow, tokenId: number): string {
  const q = buildBatteryCrankQuery(
    tokenId,
    new Date(row.query_window_from_utc),
    new Date(row.query_window_to_utc),
  );
  return createHash('sha256').update(q).digest('hex').slice(0, 16);
}

async function fetchDeveloperJwt(): Promise<string> {
  const clientId = process.env.DIMO_CLIENT_ID ?? '';
  const privateKey = process.env.DIMO_PRIVATE_KEY ?? '';
  const domain =
    process.env.DIMO_REDIRECT_URI ||
    process.env.DIMO_DOMAIN ||
    'https://app.synqdrive.eu/auth/dimo/callback';
  if (!clientId || !privateKey) {
    throw new Error('DIMO_CLIENT_ID and DIMO_PRIVATE_KEY required');
  }
  const challengeRes = await axios.post<{ challenge: string; state: string }>(
    'https://auth.dimo.zone/auth/web3/generate_challenge',
    null,
    {
      params: {
        client_id: clientId,
        domain,
        scope: 'openid email',
        response_type: 'code',
        address: clientId,
      },
      timeout: 20_000,
      maxRedirects: 0,
      validateStatus: () => true,
    },
  );
  if (challengeRes.status >= 400) {
    throw new Error(`generate_challenge HTTP ${challengeRes.status}`);
  }
  const { challenge, state } = challengeRes.data;
  const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  const wallet = new Wallet(normalizedKey);
  const signature = await wallet.signMessage(challenge);
  const submitBody = new URLSearchParams({
    client_id: clientId,
    domain,
    grant_type: 'authorization_code',
    state,
    signature,
  });
  const submitRes = await axios.post<{ developer_jwt?: string; access_token?: string }>(
    'https://auth.dimo.zone/auth/web3/submit_challenge',
    submitBody.toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 20_000,
      maxRedirects: 0,
      validateStatus: () => true,
    },
  );
  if (submitRes.status >= 400) {
    throw new Error(`submit_challenge HTTP ${submitRes.status}`);
  }
  const token = submitRes.data.developer_jwt ?? submitRes.data.access_token;
  if (!token) throw new Error('developer JWT missing');
  return token;
}

async function fetchVehicleJwt(developerJwt: string, tokenId: number): Promise<string> {
  const res = await axios.post<{ token?: string; access_token?: string }>(
    `${TOKEN_EXCHANGE_URL}/v1/tokens/exchange`,
    {
      nftContractAddress: VEHICLE_NFT,
      privileges: [1, 2, 3, 4, 5, 6],
      tokenId,
    },
    {
      headers: {
        Authorization: `Bearer ${developerJwt}`,
        'Content-Type': 'application/json',
      },
      timeout: 20_000,
      maxRedirects: 0,
      validateStatus: () => true,
    },
  );
  if (res.status >= 400) {
    throw new Error(`token exchange HTTP ${res.status} tokenId=${tokenId}`);
  }
  const jwt = res.data.token ?? res.data.access_token;
  if (!jwt) throw new Error(`vehicle JWT missing tokenId=${tokenId}`);
  return jwt;
}

async function fetchCrankSignalsOnce(
  vehicleJwt: string,
  tokenId: number,
  from: Date,
  to: Date,
): Promise<{
  status: 'ok' | 'error' | 'uncertain';
  points: Array<{ timestamp: string; voltage: number | null; rpm: number | null }>;
  error?: string;
  httpStatus?: number;
}> {
  const query = buildBatteryCrankQuery(tokenId, from, to);
  try {
    const res = await axios.post(
      TELEMETRY_URL,
      { query },
      {
        headers: {
          Authorization: `Bearer ${vehicleJwt}`,
          'Content-Type': 'application/json',
        },
        timeout: 20_000,
        maxRedirects: 0,
        validateStatus: () => true,
        transitional: { clarifyTimeoutError: true },
      },
    );
    if (res.status < 200 || res.status >= 300) {
      return {
        status: 'error',
        points: [],
        error: `HTTP ${res.status}`,
        httpStatus: res.status,
      };
    }
    const signals: Array<Record<string, unknown>> = res.data?.data?.signals ?? [];
    const points = signals
      .filter((s) => s?.timestamp)
      .map((s) => ({
        timestamp: String(s.timestamp),
        voltage:
          typeof s.lowVoltageBatteryCurrentVoltage === 'number'
            ? s.lowVoltageBatteryCurrentVoltage
            : null,
        rpm:
          typeof s.powertrainCombustionEngineSpeed === 'number'
            ? s.powertrainCombustionEngineSpeed
            : null,
      }))
      .sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
    return { status: 'ok', points, httpStatus: res.status };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const uncertain =
      message.includes('timeout') ||
      message.includes('ETIMEDOUT') ||
      message.includes('ECONNRESET');
    return {
      status: uncertain ? 'uncertain' : 'error',
      points: [],
      error: message,
    };
  }
}

function loadLedger(): Ledger {
  const path = join(ARCHIVE_ROOT, 'P4H_R3_REQUEST_LEDGER.json');
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, 'utf8')) as Ledger;
  }
  return {
    schemaVersion: 'p4h-r3-request-ledger.v1',
    maxRequests: MAX_REQUESTS,
    telemetryPostsSent: 0,
    entries: [],
  };
}

function saveLedger(ledger: Ledger): void {
  atomicWriteJson(join(ARCHIVE_ROOT, 'P4H_R3_REQUEST_LEDGER.json'), ledger);
}

function writeVoltageSvg(
  path: string,
  tripStartUtc: string,
  points: Array<{ timestamp: string; voltage: number | null }>,
): void {
  const withV = points.filter((p) => p.voltage != null);
  if (withV.length < 2) return;
  const startMs = new Date(tripStartUtc).getTime();
  const xs = withV.map((p) => (new Date(p.timestamp).getTime() - startMs) / 1000);
  const ys = withV.map((p) => p.voltage as number);
  const minY = Math.min(...ys) - 0.2;
  const maxY = Math.max(...ys) + 0.2;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const w = 640;
  const h = 240;
  const pad = 30;
  const scaleX = (x: number) =>
    pad + ((x - minX) / Math.max(1, maxX - minX)) * (w - 2 * pad);
  const scaleY = (y: number) =>
    h - pad - ((y - minY) / Math.max(0.01, maxY - minY)) * (h - 2 * pad);
  const poly = withV
    .map((p, i) => `${scaleX(xs[i])},${scaleY(ys[i])}`)
    .join(' ');
  const tripX = scaleX(0);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <line x1="${tripX}" y1="${pad}" x2="${tripX}" y2="${h - pad}" stroke="#c00" stroke-dasharray="4"/>
  <text x="${tripX + 4}" y="${pad + 12}" font-size="10">trip start</text>
  <polyline fill="none" stroke="#06c" stroke-width="2" points="${poly}"/>
  <text x="${pad}" y="16" font-size="11">LV voltage (V) vs seconds from trip start</text>
</svg>`;
  writeFileSync(path, svg, 'utf8');
}

function halt(ledger: Ledger, reason: string): never {
  ledger.halted = true;
  ledger.haltReason = reason;
  saveLedger(ledger);
  console.error(JSON.stringify({ halt: reason, ledger }));
  process.exit(3);
}

async function main() {
  if (process.env.P4H_HISTORICAL_CRANK_OWNER_AUTHORIZED !== '1') {
    throw new Error('Set P4H_HISTORICAL_CRANK_OWNER_AUTHORIZED=1 for this run only');
  }

  const preflight = persistencePreflight(ARCHIVE_ROOT);
  if (!preflight.ok) {
    console.error(
      JSON.stringify({ PRE_EXECUTION_VERDICT: 'STOP_NO_PERSISTENT_ARCHIVE', reason: preflight.reason }),
    );
    process.exit(4);
  }

  const allManifest: ManifestRow[] = JSON.parse(readFileSync(MANIFEST_SOURCE, 'utf8'));
  const plannedRows: ManifestRow[] = [];
  for (const tripId of PLANNED_TRIP_IDS) {
    const row = allManifest.find((m) => m.trip_id === tripId);
    if (!row) {
      throw new Error(`Missing manifest row for planned trip ${tripId}`);
    }
    const expected = EXPECTED_VEHICLES[row.vehicle_id];
    if (!expected || expected.tokenId !== Number(row.dimo_token_id)) {
      throw new Error(`Vehicle identity mismatch for trip ${tripId}`);
    }
    plannedRows.push(row);
  }

  const sealedManifest = {
    schemaVersion: 'p4h-r3-sealed-manifest.v1',
    sealedAtUtc: new Date().toISOString(),
    ownerAuthorization: '12_HISTORICAL_DIMO_REQUESTS',
    trips: plannedRows.map((r) => ({
      trip_id: r.trip_id,
      vehicle_id: r.vehicle_id,
      vehicle_label: r.vehicle_label,
      dimo_token_id: r.dimo_token_id,
      trip_start_utc: r.trip_start_utc,
      query_window_from_utc: r.query_window_from_utc,
      query_window_to_utc: r.query_window_to_utc,
    })),
  };
  atomicWriteJson(join(ARCHIVE_ROOT, 'P4H_R3_SEALED_MANIFEST.json'), sealedManifest);

  let ledger = loadLedger();
  if (ledger.halted) {
    throw new Error(`Ledger halted: ${ledger.haltReason}`);
  }

  const developerJwt = await fetchDeveloperJwt();
  const jwtByToken = new Map<number, string>();

  const results: Record<string, unknown>[] = [];
  const evidenceRows: Record<string, unknown>[] = [];
  const rawIndex: Array<Record<string, unknown>> = [];
  const fetchStartedAt = new Date().toISOString();

  function processArchive(
    row: ManifestRow,
    sealed: ReturnType<typeof sealP4hRawArchive>,
    archiveFile: string,
    verified: { ok: boolean; digest: string },
    fetch: {
      status: string;
      points: Array<{ timestamp: string; voltage: number | null; rpm: number | null }>;
    },
    requestNumber: number,
  ): void {
    const offline = evaluateP4hArchivedTrip(sealed, {
      liveIngestAt: new Date(),
      primaryMode: 'HISTORICAL_REPLAY',
    });
    const scientific = classifyScientificEvidence(offline);
    const hist = offline.evaluations.find((e) => e.mode === 'HISTORICAL_REPLAY');
    mkdirSync(join(ARCHIVE_ROOT, 'charts'), { recursive: true });
    writeVoltageSvg(
      join(ARCHIVE_ROOT, 'charts', `${row.trip_id}_voltage.svg`),
      row.trip_start_utc,
      fetch.points,
    );
    const voltageSamples = fetch.points.filter((p) => p.voltage != null).length;
    const rpmSamples = fetch.points.filter((p) => p.rpm != null).length;
    results.push({
      vehicle: row.vehicle_label,
      trip_id: row.trip_id,
      trip_start_utc: row.trip_start_utc,
      query_window_utc: `${row.query_window_from_utc}..${row.query_window_to_utc}`,
      provider_request_number: requestNumber,
      provider_status: fetch.status,
      raw_archive_file: archiveFile,
      sha256_file: verified.digest,
      sha256_payload: sealed.integrity.digest,
      voltage_sample_count: voltageSamples,
      rpm_sample_count: rpmSamples,
      median_interval_s: offline.metrics.medianIntervalS,
      max_gap_s: offline.metrics.maxGapS,
      window_coverage: hist?.coverageRatio ?? null,
      v_pre_crank: offline.metrics.vPreCrank,
      v_min: offline.metrics.vMinCrank,
      v_post: offline.metrics.vPostStart,
      voltage_drop_v: offline.metrics.voltageDropV,
      recovery_delta_v: offline.metrics.recoveryDeltaV,
      trip_start_to_minimum_s: offline.metrics.minVoltageOffsetFromTripStartS,
      extractor_result: hist?.reasonCode ?? 'unknown',
      extractor_gate_ok: hist?.gateOk ?? false,
      rejection_reason: offline.rejectionReason,
      provider_fetch_utc: fetchStartedAt,
      historical_evaluated_at_utc: hist?.evaluatedAtUtc,
    });
    evidenceRows.push({
      trip_id: row.trip_id,
      technical_extractor_pass: hist?.gateOk ?? false,
      technical_grade: offline.evidence.grade,
      scientific_evidence_class: scientific.scientificClass,
      scientific_rationale: scientific.rationale,
      bucket_coherence: offline.bucketCoherence.assessment,
      plausible_start_dip: offline.evidence.plausibleStartDip,
    });
    rawIndex.push({
      trip_id: row.trip_id,
      file: archiveFile,
      integrity_sha256: sealed.integrity.digest,
      file_sha256: verified.digest,
      sample_count: fetch.points.length,
    });
  }

  for (const row of plannedRows) {
    const existing = ledger.entries.find((e) => e.tripId === row.trip_id);
    if (existing?.status === 'COMPLETED' && existing.archiveFile) {
      const archivePath = join(RAW_DIR, existing.archiveFile);
      if (existsSync(archivePath)) {
        const sealed = JSON.parse(readFileSync(archivePath, 'utf8')) as ReturnType<
          typeof sealP4hRawArchive
        >;
        const verified = verifyArchiveFile(archivePath);
        processArchive(
          row,
          sealed,
          existing.archiveFile,
          verified,
          {
            status: sealed.request.status,
            points: sealed.samples.map((s) => ({
              timestamp: s.timestampUtc,
              voltage: s.voltageVolts,
              rpm: s.rpm,
            })),
          },
          existing.requestNumber,
        );
        continue;
      }
    }
    if (ledger.telemetryPostsSent >= MAX_REQUESTS) {
      halt(ledger, 'request_budget_exhausted');
    }

    const tokenId = Number(row.dimo_token_id);
    const fingerprint = queryFingerprint(row, tokenId);
    const requestNumber = ledger.entries.length + 1;
    const entry: LedgerEntry = {
      requestNumber,
      tripId: row.trip_id,
      vehicleId: row.vehicle_id,
      reservedAtUtc: new Date().toISOString(),
      queryFingerprint: fingerprint,
      status: 'RESERVED',
    };
    ledger.entries.push(entry);
    saveLedger(ledger);

    let vehicleJwt = jwtByToken.get(tokenId);
    if (!vehicleJwt) {
      vehicleJwt = await fetchVehicleJwt(developerJwt, tokenId);
      jwtByToken.set(tokenId, vehicleJwt);
    }

    entry.status = 'SENT';
    entry.sentAtUtc = new Date().toISOString();
    ledger.telemetryPostsSent += 1;
    saveLedger(ledger);

    const from = new Date(row.query_window_from_utc);
    const to = new Date(row.query_window_to_utc);
    const fetch = await fetchCrankSignalsOnce(vehicleJwt, tokenId, from, to);

    if (fetch.status === 'uncertain') {
      entry.status = 'UNCERTAIN';
      entry.error = fetch.error;
      saveLedger(ledger);
      halt(ledger, `uncertain_network_trip_${row.trip_id}`);
    }

    entry.httpStatus = fetch.httpStatus ?? null;
    entry.status = fetch.status === 'ok' ? 'COMPLETED' : 'FAILED';
    entry.completedAtUtc = new Date().toISOString();
    entry.error = fetch.error ?? null;
    saveLedger(ledger);

    const archivePayload = buildP4hRawArchiveInput({
      capturedAtUtc: new Date().toISOString(),
      extractorGateVersion: START_PROXY_CADENCE_GATE_VERSION,
      vehicleLabel: row.vehicle_label,
      vehicleId: row.vehicle_id,
      tripId: row.trip_id,
      tripStartUtc: row.trip_start_utc,
      telemetryUrl: TELEMETRY_URL,
      windowFromUtc: row.query_window_from_utc,
      windowToUtc: row.query_window_to_utc,
      requestIndex: requestNumber,
      httpStatus: fetch.httpStatus ?? (fetch.status === 'ok' ? 200 : null),
      requestStatus: fetch.status === 'ok' ? 'ok' : 'error',
      errorMessage: fetch.error ?? null,
      retries: 0,
      points: fetch.points,
    });
    const sealed = sealP4hRawArchive(archivePayload);
    const archiveFile = archiveFileNameForTrip(row.trip_id);
    const archivePath = join(RAW_DIR, archiveFile);
    atomicWriteJson(archivePath, sealed);
    const verified = verifyArchiveFile(archivePath);
    if (!verified.ok) {
      halt(ledger, `archive_integrity_failed_${row.trip_id}`);
    }
    entry.archiveFile = archiveFile;
    saveLedger(ledger);

    processArchive(row, sealed, archiveFile, verified, fetch, requestNumber);
  }

  atomicWriteJson(join(ARCHIVE_ROOT, 'P4H_R3_RAW_INDEX.json'), {
    schemaVersion: 'p4h-r3-raw-index.v1',
    archives: rawIndex,
  });

  const csvCols = Object.keys(results[0] ?? {});
  writeFileSync(
    join(ARCHIVE_ROOT, 'P4H_R3_CRANKING_RESULTS.csv'),
    [csvCols.join(','), ...results.map((r) => csvCols.map((c) => JSON.stringify(r[c] ?? '')).join(','))].join('\n'),
  );
  const evCols = Object.keys(evidenceRows[0] ?? {});
  writeFileSync(
    join(ARCHIVE_ROOT, 'P4H_R3_EVIDENCE_CLASSIFICATION.csv'),
    [evCols.join(','), ...evidenceRows.map((r) => evCols.map((c) => JSON.stringify(r[c] ?? '')).join(','))].join('\n'),
  );

  // Offline replay verification (no provider)
  const replayOk = readdirSync(RAW_DIR)
    .filter((f) => f.endsWith('.p4h-raw.v1.json') && !f.startsWith('_'))
    .every((f) => verifyArchiveFile(join(RAW_DIR, f)).ok);

  console.log(
    JSON.stringify({
      trips_queried: ledger.telemetryPostsSent,
      provider_requests_sent: ledger.telemetryPostsSent,
      archive_root: ARCHIVE_ROOT,
      offline_replay_integrity: replayOk,
      results_rows: results.length,
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
