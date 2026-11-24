const MAX_IN_FLIGHT = 32;

let inFlight = 0;

export function getHmObservationInFlightCount(): number {
  return inFlight;
}

export function resetHmObservationConcurrencyForTests(): void {
  inFlight = 0;
}

export async function withHmObservationConcurrency<T>(
  fn: () => Promise<T>,
): Promise<T | 'OBSERVATION_OVERLOAD'> {
  if (inFlight >= MAX_IN_FLIGHT) {
    return 'OBSERVATION_OVERLOAD';
  }
  inFlight += 1;
  try {
    return await fn();
  } finally {
    inFlight -= 1;
  }
}

export const HM_OBSERVATION_TIMEOUT_MS = 15_000;

export async function withHmObservationTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs = HM_OBSERVATION_TIMEOUT_MS,
): Promise<T | 'OBSERVATION_TIMEOUT'> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<'OBSERVATION_TIMEOUT'>((resolve) => {
        timer = setTimeout(() => resolve('OBSERVATION_TIMEOUT'), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}