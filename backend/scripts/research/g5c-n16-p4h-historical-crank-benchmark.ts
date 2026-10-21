/**
 * G5C-N16 P4H — controlled historical crank benchmark (research only, not production pipeline).
 *
 * P4H_HISTORICAL_CRANK_OWNER_AUTHORIZED=1 \
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/research/g5c-n16-p4h-historical-crank-benchmark.ts
 */
import axios from 'axios';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { Wallet } from 'ethers';
import { buildBatteryCrankQuery } from '../../src/modules/dimo/queries/battery-crank.query';
import {
  evaluateStartProxyCadenceGate,
  START_PROXY_CADENCE_GATE_VERSION,
} from '../../src/modules/vehicle-intelligence/battery-health/lv-start-proxy/battery-start-proxy-cadence-gate';
import { sanitizeStartProxyVoltages } from '../../src/modules/vehicle-intelligence/battery-health/lv-start-proxy/battery-start-proxy.policy';
import {
  archiveFileNameForTrip,
  buildP4hRawArchiveInput,
  sealP4hRawArchive,
} from '../../src/modules/vehicle-intelligence/battery-health/lv-start-proxy/research/p4h-raw-archive.v1';
import { evaluateP4hArchivedTrip } from '../../src/modules/vehicle-intelligence/battery-health/lv-start-proxy/research/p4h-offline-trip-evaluation';

const ARTIFACT_DIR = '/opt/cursor/artifacts/p4h';
const RAW_ARCHIVE_DIR = `${ARTIFACT_DIR}/raw`;
const MANIFEST_PATH = `${ARTIFACT_DIR}/P4H_TRIP_MANIFEST.json`;
const TELEMETRY_URL =
  process.env.DIMO_TELEMETRY_API_URL ?? 'https://telemetry-api.dimo.zone/query';
const TOKEN_EXCHANGE_URL =
  process.env.DIMO_TOKEN_EXCHANGE_URL ?? 'https://token-exchange-api.dimo.zone';
const VEHICLE_NFT =
  process.env.DIMO_VEHICLE_NFT_CONTRACT ??
  '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';
const EXTRACTOR_VERSION = START_PROXY_CADENCE_GATE_VERSION;

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
      timeout: 15_000,
    },
  );
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
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15_000 },
  );
  const token = submitRes.data.developer_jwt ?? submitRes.data.access_token;
  if (!token) throw new Error('developer JWT missing from submit_challenge');
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
      timeout: 15_000,
    },
  );
  const jwt = res.data.token ?? res.data.access_token;
  if (!jwt) throw new Error(`vehicle JWT missing for tokenId=${tokenId}`);
  return jwt;
}

type ManifestRow = {
  vehicle_label: string;
  vehicle_id: string;
  dimo_token_id: number;
  trip_id: string;
  trip_start_utc: string;
  query_window_from_utc: string;
  query_window_to_utc: string;
};

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function computeIntervalsMs(timestamps: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    out.push(timestamps[i] - timestamps[i - 1]);
  }
  return out;
}

async function fetchCrankSignalsOnce(
  vehicleJwt: string,
  tokenId: number,
  from: Date,
  to: Date,
): Promise<{
  status: 'ok' | 'error';
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
        timeout: 15_000,
        validateStatus: () => true,
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
    return { status: 'ok', points };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'error', points: [], error: message };
  }
}

function mapRejection(
  gate: ReturnType<typeof evaluateStartProxyCadenceGate>,
  requestStatus: string,
) {
  if (requestStatus !== 'ok') return 'provider_request_failed';
  if (!gate.ok) {
    switch (gate.reasonCode) {
      case 'no_data':
        return 'no_historical_data';
      case 'insufficient_cadence':
        return 'too_coarse_sampling';
      case 'insufficient_coverage':
        return 'provider_gap';
      case 'provider_delay':
        return 'provider_gap';
      case 'timestamp_inconsistent':
        return 'invalid_provenance';
      default:
        return 'extractor_quality_gate';
    }
  }
  const v = gate.values;
  if (!v || v.vPreCrank == null) return 'pre_crank_missing';
  if (v.vMinCrank == null) return 'no_plausible_dip';
  return null;
}

function evidenceGrade(
  requestStatus: string,
  gate: ReturnType<typeof evaluateStartProxyCadenceGate>,
): string {
  if (requestStatus !== 'ok') return 'NONE';
  if (!gate.ok) return 'REJECTED';
  const v = gate.values;
  if (v?.vPreCrank != null && v?.vMinCrank != null) return 'VALIDATED_PROXY';
  if (v?.vMinCrank != null) return 'PARTIAL_DIP';
  return 'LOW';
}

async function main() {
  if (process.env.P4H_HISTORICAL_CRANK_OWNER_AUTHORIZED !== '1') {
    throw new Error(
      'Refusing live benchmark: set P4H_HISTORICAL_CRANK_OWNER_AUTHORIZED=1',
    );
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  mkdirSync(RAW_ARCHIVE_DIR, { recursive: true });
  const manifest: ManifestRow[] = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  if (manifest.length !== 30) {
    throw new Error(`Expected 30 manifest rows, got ${manifest.length}`);
  }

  const developerJwt = await fetchDeveloperJwt();
  const jwtByToken = new Map<number, string>();

  const results: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  const rawArchiveIndex: Array<{
    trip_id: string;
    file: string;
    integrity_sha256: string;
    sample_count: number;
  }> = [];
  let providerRequestsSent = 0;

  for (const row of manifest) {
    const tokenId = Number(row.dimo_token_id);
    let vehicleJwt = jwtByToken.get(tokenId);
    if (!vehicleJwt) {
      const jwt = await fetchVehicleJwt(developerJwt, tokenId);
      vehicleJwt = jwt;
      jwtByToken.set(tokenId, jwt);
    }

    const from = new Date(row.query_window_from_utc);
    const to = new Date(row.query_window_to_utc);
    const tripStart = new Date(row.trip_start_utc);

    const fetch = await fetchCrankSignalsOnce(vehicleJwt, tokenId, from, to);
    providerRequestsSent += 1;

    audits.push({
      trip_id: row.trip_id,
      vehicle_id: row.vehicle_id,
      dimo_token_id: tokenId,
      telemetry_url: TELEMETRY_URL,
      query_interval: '5s',
      query_window_from_utc: row.query_window_from_utc,
      query_window_to_utc: row.query_window_to_utc,
      request_index: providerRequestsSent,
      http_status: fetch.httpStatus ?? (fetch.status === 'ok' ? 200 : null),
      request_status: fetch.status,
      error: fetch.error ?? null,
      retries: 0,
    });

    const capturedAtUtc = new Date().toISOString();
    const archivePayload = buildP4hRawArchiveInput({
      capturedAtUtc,
      extractorGateVersion: EXTRACTOR_VERSION,
      vehicleLabel: row.vehicle_label,
      vehicleId: row.vehicle_id,
      tripId: row.trip_id,
      tripStartUtc: row.trip_start_utc,
      telemetryUrl: TELEMETRY_URL,
      windowFromUtc: row.query_window_from_utc,
      windowToUtc: row.query_window_to_utc,
      requestIndex: providerRequestsSent,
      httpStatus: fetch.httpStatus ?? (fetch.status === 'ok' ? 200 : null),
      requestStatus: fetch.status,
      errorMessage: fetch.error ?? null,
      retries: 0,
      points: fetch.points,
    });
    const sealedArchive = sealP4hRawArchive(archivePayload);
    const archiveFile = archiveFileNameForTrip(row.trip_id);
    writeFileSync(
      `${RAW_ARCHIVE_DIR}/${archiveFile}`,
      JSON.stringify(sealedArchive, null, 2),
    );
    rawArchiveIndex.push({
      trip_id: row.trip_id,
      file: archiveFile,
      integrity_sha256: sealedArchive.integrity.digest,
      sample_count: fetch.points.length,
    });

    const offline = evaluateP4hArchivedTrip(sealedArchive, {
      liveIngestAt: new Date(),
    });
    const liveEval = offline.evaluations.find((e) => e.mode === 'LIVE_INGEST');
    const histEval = offline.evaluations.find((e) => e.mode === 'HISTORICAL_REPLAY');

    const gate = evaluateStartProxyCadenceGate({
      points: fetch.points,
      tripStartAt: tripStart,
      evaluatedAt: new Date(),
    });

    const tsMs = fetch.points.map((p) => new Date(p.timestamp).getTime());
    const intervals = computeIntervalsMs(tsMs);
    const tripStartMs = tripStart.getTime();
    let minOffsetS: number | null = null;
    if (fetch.points.length > 0) {
      let minV = Infinity;
      let minAt: number | null = null;
      for (const p of fetch.points) {
        if (p.voltage != null && p.voltage < minV) {
          minV = p.voltage;
          minAt = new Date(p.timestamp).getTime();
        }
      }
      if (minAt != null) minOffsetS = (minAt - tripStartMs) / 1000;
    }

    const sanitized = gate.values
      ? sanitizeStartProxyVoltages({
          vPreCrank: gate.values.vPreCrank,
          vMinCrank: gate.values.vMinCrank,
          vRecovery5s: gate.values.vRecovery5s,
          vRecovery30s: gate.values.vRecovery30s,
        })
      : null;

    const vPre = sanitized?.vPreCrank ?? null;
    const vMin = sanitized?.vMinCrank ?? null;
    const vPost = gate.values?.vRecovery5s ?? gate.values?.vRecovery30s ?? null;
    const drop = vPre != null && vMin != null ? vPre - vMin : null;
    const recovery =
      vPre != null && vPost != null && vMin != null ? vPost - vMin : null;

    const rejection = mapRejection(gate, fetch.status);
    const dipDetected =
      gate.ok && vMin != null && vPre != null && drop != null && drop > 0.1;

    results.push({
      vehicle: row.vehicle_label,
      trip_id: row.trip_id,
      trip_start_utc: row.trip_start_utc,
      query_window_utc: `${row.query_window_from_utc}..${row.query_window_to_utc}`,
      request_status: fetch.status,
      sample_count: fetch.points.length,
      median_interval_s:
        intervals.length > 0 ? median(intervals)! / 1000 : null,
      max_gap_s: intervals.length > 0 ? Math.max(...intervals) / 1000 : null,
      v_pre_crank: vPre,
      v_min: vMin,
      v_post: vPost,
      voltage_drop_v: drop,
      recovery_delta_v: recovery,
      min_offset_to_trip_start_s: minOffsetS,
      coverage: gate.metrics.coverageRatio,
      extractor_result: gate.ok ? 'valid_proxy' : gate.reasonCode,
      rejection_reason: rejection,
      evidence_grade: evidenceGrade(fetch.status, gate),
      start_dip_detected: dipDetected,
      provider_timestamps: fetch.points.map((p) => p.timestamp).join('|'),
      extractor_version: EXTRACTOR_VERSION,
      raw_archive_file: archiveFile,
      raw_archive_sha256: sealedArchive.integrity.digest,
      live_ingest_gate: liveEval?.reasonCode ?? null,
      historical_replay_gate: histEval?.reasonCode ?? null,
      bucket_coherence: offline.bucketCoherence.assessment,
    });
  }

  writeFileSync(
    `${ARTIFACT_DIR}/P4H_RAW_ARCHIVE_INDEX.v1.json`,
    JSON.stringify(
      {
        schemaVersion: 'p4h-raw-archive-index.v1',
        tripCount: rawArchiveIndex.length,
        archives: rawArchiveIndex,
      },
      null,
      2,
    ),
  );

  const csvCols = Object.keys(results[0] ?? {});
  writeFileSync(
    `${ARTIFACT_DIR}/P4H_CRANKING_RESULTS.csv`,
    [
      csvCols.join(','),
      ...results.map((r) => csvCols.map((c) => JSON.stringify(r[c] ?? '')).join(',')),
    ].join('\n'),
  );
  writeFileSync(
    `${ARTIFACT_DIR}/P4H_PROVIDER_QUERY_AUDIT.csv`,
    [
      Object.keys(audits[0]).join(','),
      ...audits.map((a) => Object.values(a).map((v) => JSON.stringify(v ?? '')).join(',')),
    ].join('\n'),
  );

  console.log(
    JSON.stringify({
      trips_queried: results.length,
      provider_requests_sent: providerRequestsSent,
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
