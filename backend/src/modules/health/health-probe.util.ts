const DEFAULT_PROBE_TIMEOUT_MS = 3_000;

export class ProbeTimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} probe timed out after ${timeoutMs}ms`);
    this.name = 'ProbeTimeoutError';
  }
}

/**
 * Runs a probe with a hard timeout so health endpoints stay fast and deterministic.
 */
export async function withProbeTimeout<T>(
  label: string,
  fn: () => Promise<T>,
  timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new ProbeTimeoutError(label, timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export { DEFAULT_PROBE_TIMEOUT_MS };
