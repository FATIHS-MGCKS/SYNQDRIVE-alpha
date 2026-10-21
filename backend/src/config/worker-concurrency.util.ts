/**
 * Bounded worker concurrency from environment variables.
 * Used at module load for BullMQ @Processor decorators.
 */

const DEFAULT_MAX = 200;

export function readWorkerConcurrency(
  envKey: string,
  fallback: number,
  max: number = DEFAULT_MAX,
): number {
  const parsed = parseInt(process.env[envKey] ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export function readWorkerPositiveInt(
  envKey: string,
  fallback: number,
  max: number = Number.MAX_SAFE_INTEGER,
): number {
  const parsed = parseInt(process.env[envKey] ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

/** 0 = unlimited */
export function readWorkerNonNegativeInt(
  envKey: string,
  fallback: number,
): number {
  const parsed = parseInt(process.env[envKey] ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}
