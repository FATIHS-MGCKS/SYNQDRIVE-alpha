import { CANONICAL_MAX_SAME_TRIP_QUALIFIED_STOP_MS } from './trip-qualified-stop-duration.policy';

export function parseNonNegativeIntMs(
  raw: string | undefined,
): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export type MaxSameTripQualifiedStopConfigSource =
  | 'TRIP_SAME_TRIP_MAX_STOP_MS'
  | 'TRIP_MID_GAP_SPLIT_MS_LEGACY'
  | 'CANONICAL_DEFAULT';

export interface ResolvedMaxSameTripQualifiedStopConfig {
  resolvedMaxSameTripQualifiedStopMs: number;
  configSource: MaxSameTripQualifiedStopConfigSource;
}

/**
 * Single runtime duration authority for qualified-stop same-trip vs split.
 *
 * Precedence:
 * 1. TRIP_SAME_TRIP_MAX_STOP_MS (canonical env)
 * 2. TRIP_MID_GAP_SPLIT_MS (legacy env — same semantic after V1 migration)
 * 3. CANONICAL_MAX_SAME_TRIP_QUALIFIED_STOP_MS (300000)
 */
export function resolveMaxSameTripQualifiedStopMsConfig(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedMaxSameTripQualifiedStopConfig {
  const canonical = parseNonNegativeIntMs(env.TRIP_SAME_TRIP_MAX_STOP_MS);
  if (canonical != null) {
    return {
      resolvedMaxSameTripQualifiedStopMs: canonical,
      configSource: 'TRIP_SAME_TRIP_MAX_STOP_MS',
    };
  }
  const legacy = parseNonNegativeIntMs(env.TRIP_MID_GAP_SPLIT_MS);
  if (legacy != null) {
    return {
      resolvedMaxSameTripQualifiedStopMs: legacy,
      configSource: 'TRIP_MID_GAP_SPLIT_MS_LEGACY',
    };
  }
  return {
    resolvedMaxSameTripQualifiedStopMs: CANONICAL_MAX_SAME_TRIP_QUALIFIED_STOP_MS,
    configSource: 'CANONICAL_DEFAULT',
  };
}

export function resolveMaxSameTripQualifiedStopMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return resolveMaxSameTripQualifiedStopMsConfig(env)
    .resolvedMaxSameTripQualifiedStopMs;
}

/** Nest worker.config mirror — keeps detector/orchestration on one runtime value. */
export function readMaxSameTripQualifiedStopMsFromWorkerConfig(config: {
  get: (key: string) => unknown;
}): number {
  const fromWorker =
    (config.get('worker.tripSameTripMaxQualifiedStopMs') as number | undefined) ??
    (config.get('worker.tripMidGapSplitMs') as number | undefined);
  if (typeof fromWorker === 'number' && Number.isFinite(fromWorker)) {
    return fromWorker;
  }
  return resolveMaxSameTripQualifiedStopMs();
}

export function readMaxSameTripQualifiedStopConfigFromWorkerConfig(config: {
  get: (key: string) => unknown;
}): ResolvedMaxSameTripQualifiedStopConfig {
  const value = readMaxSameTripQualifiedStopMsFromWorkerConfig(config);
  const source = config.get('worker.tripSameTripMaxQualifiedStopMsConfigSource') as
    | MaxSameTripQualifiedStopConfigSource
    | undefined;
  if (
    source === 'TRIP_SAME_TRIP_MAX_STOP_MS' ||
    source === 'TRIP_MID_GAP_SPLIT_MS_LEGACY' ||
    source === 'CANONICAL_DEFAULT'
  ) {
    return { resolvedMaxSameTripQualifiedStopMs: value, configSource: source };
  }
  return resolveMaxSameTripQualifiedStopMsConfig();
}
