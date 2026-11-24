const MAX_IN_FLIGHT = 32;

let inFlight = 0;

export function getHmObservationInFlightCount(): number {
  return inFlight;
}

export function resetHmObservationConcurrencyForTests(): void {
  inFlight = 0;
}

export const HM_OBSERVATION_TIMEOUT_MS = 15_000;

export type HmObservationRunOutcome<T> =
  | { status: 'OK'; value: T }
  | { status: 'OVERLOAD' }
  | { status: 'TIMEOUT' };

/**
 * Holds a concurrency slot until `fn()` fully settles (success or failure).
 * On timeout the caller gets TIMEOUT immediately; the slot stays held until work completes.
 * Late success/rejection after timeout is discarded; late rejection is absorbed.
 */
export async function runHmObservationEvaluation<T>(
  fn: () => Promise<T>,
  options?: { timeoutMs?: number },
): Promise<HmObservationRunOutcome<T>> {
  if (inFlight >= MAX_IN_FLIGHT) {
    return { status: 'OVERLOAD' };
  }

  inFlight += 1;
  const timeoutMs = options?.timeoutMs ?? HM_OBSERVATION_TIMEOUT_MS;

  let outcome: 'ok' | 'err' | null = null;
  let value!: T;
  let error: unknown;

  const work = fn()
    .then((v) => {
      outcome = 'ok';
      value = v;
    })
    .catch((e) => {
      outcome = 'err';
      error = e;
    })
    .finally(() => {
      inFlight = Math.max(0, inFlight - 1);
    });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<'timeout'>((resolve) => {
    timeoutId = setTimeout(() => resolve('timeout'), timeoutMs);
  });

  try {
    const race = await Promise.race([work.then(() => 'done' as const), timer]);

    if (race === 'timeout') {
      void work.catch(() => {
        /* late rejection after timeout — slot released in work.finally */
      });
      return { status: 'TIMEOUT' };
    }

    if (outcome === 'ok') {
      return { status: 'OK', value };
    }
    if (outcome === 'err') {
      throw error;
    }
    throw new Error('OBSERVATION_INTERNAL_ERROR');
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

/** @deprecated use runHmObservationEvaluation */
export async function withHmObservationConcurrency<T>(
  fn: () => Promise<T>,
): Promise<T | 'OBSERVATION_OVERLOAD'> {
  const result = await runHmObservationEvaluation(fn);
  if (result.status === 'OVERLOAD') return 'OBSERVATION_OVERLOAD';
  if (result.status === 'TIMEOUT') throw new Error('OBSERVATION_TIMEOUT');
  return result.value;
}

/** @deprecated use runHmObservationEvaluation */
export async function withHmObservationTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs = HM_OBSERVATION_TIMEOUT_MS,
): Promise<T | 'OBSERVATION_TIMEOUT'> {
  const result = await runHmObservationEvaluation(fn, { timeoutMs });
  if (result.status === 'TIMEOUT') return 'OBSERVATION_TIMEOUT';
  if (result.status === 'OVERLOAD') throw new Error('OBSERVATION_OVERLOAD');
  return result.value;
}