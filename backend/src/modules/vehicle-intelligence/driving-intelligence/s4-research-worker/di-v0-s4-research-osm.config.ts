export const DI_V0_S4_RESEARCH_OSM_ENV = {
  overpassEnabled: 'DI_V0_S4_RESEARCH_OSM_OVERPASS_ENABLED',
  overpassEndpoint: 'DI_V0_S4_RESEARCH_OSM_OVERPASS_ENDPOINT',
  maxBboxSpanDeg: 'DI_V0_S4_RESEARCH_OSM_MAX_BBOX_SPAN_DEG',
  requestTimeoutMs: 'DI_V0_S4_RESEARCH_OSM_REQUEST_TIMEOUT_MS',
  maxUncompressedBytes: 'DI_V0_S4_RESEARCH_OSM_MAX_UNCOMPRESSED_BYTES',
  maxResponseBytes: 'DI_V0_S4_RESEARCH_OSM_MAX_RESPONSE_BYTES',
  maxConcurrentFetches: 'DI_V0_S4_RESEARCH_OSM_MAX_CONCURRENT_FETCHES',
  fetchRetryBudget: 'DI_V0_S4_RESEARCH_OSM_FETCH_RETRY_BUDGET',
} as const;

export const DI_V0_S4_RESEARCH_OSM_TUNING = {
  defaultOverpassEndpoint: 'https://overpass-api.de/api/interpreter',
  defaultMaxBboxSpanDeg: 0.08,
  defaultRequestTimeoutMs: 25_000,
  defaultMaxUncompressedBytes: 8_000_000,
  defaultMaxResponseBytes: 12_000_000,
  defaultMaxConcurrentFetches: 1,
  defaultFetchRetryBudget: 1,
  overpassPollMs: 50,
} as const;

export interface DiV0S4ResearchOsmRuntimeConfig {
  overpassEnabled: boolean;
  overpassEndpoint: string;
  maxBboxSpanDeg: number;
  requestTimeoutMs: number;
  maxUncompressedBytes: number;
  maxResponseBytes: number;
  maxConcurrentFetches: number;
  fetchRetryBudget: number;
}

export function parseDiV0S4ResearchOsmRuntimeConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DiV0S4ResearchOsmRuntimeConfig {
  const flag = env[DI_V0_S4_RESEARCH_OSM_ENV.overpassEnabled]?.trim().toLowerCase();
  const overpassEnabled = flag === '1' || flag === 'true' || flag === 'yes';
  const endpoint = env[DI_V0_S4_RESEARCH_OSM_ENV.overpassEndpoint]?.trim() || DI_V0_S4_RESEARCH_OSM_TUNING.defaultOverpassEndpoint;
  const span = Number.parseFloat(env[DI_V0_S4_RESEARCH_OSM_ENV.maxBboxSpanDeg] ?? '');
  const timeout = Number.parseInt(env[DI_V0_S4_RESEARCH_OSM_ENV.requestTimeoutMs] ?? '', 10);
  const maxUncompressed = Number.parseInt(env[DI_V0_S4_RESEARCH_OSM_ENV.maxUncompressedBytes] ?? '', 10);
  const maxResponse = Number.parseInt(env[DI_V0_S4_RESEARCH_OSM_ENV.maxResponseBytes] ?? '', 10);
  const maxConcurrent = Number.parseInt(env[DI_V0_S4_RESEARCH_OSM_ENV.maxConcurrentFetches] ?? '', 10);
  const retryBudget = Number.parseInt(env[DI_V0_S4_RESEARCH_OSM_ENV.fetchRetryBudget] ?? '', 10);
  return {
    overpassEnabled,
    overpassEndpoint: endpoint,
    maxBboxSpanDeg: Number.isFinite(span) ? span : DI_V0_S4_RESEARCH_OSM_TUNING.defaultMaxBboxSpanDeg,
    requestTimeoutMs: Number.isFinite(timeout) ? timeout : DI_V0_S4_RESEARCH_OSM_TUNING.defaultRequestTimeoutMs,
    maxUncompressedBytes: Number.isFinite(maxUncompressed)
      ? maxUncompressed
      : DI_V0_S4_RESEARCH_OSM_TUNING.defaultMaxUncompressedBytes,
    maxResponseBytes: Number.isFinite(maxResponse) ? maxResponse : DI_V0_S4_RESEARCH_OSM_TUNING.defaultMaxResponseBytes,
    maxConcurrentFetches: Number.isFinite(maxConcurrent)
      ? Math.max(1, maxConcurrent)
      : DI_V0_S4_RESEARCH_OSM_TUNING.defaultMaxConcurrentFetches,
    fetchRetryBudget: Number.isFinite(retryBudget)
      ? Math.max(0, retryBudget)
      : DI_V0_S4_RESEARCH_OSM_TUNING.defaultFetchRetryBudget,
  };
}
