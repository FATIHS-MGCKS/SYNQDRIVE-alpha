export class ClickHouseQueryTimeoutError extends Error {
  readonly code = 'CLICKHOUSE_QUERY_TIMEOUT';

  constructor(timeoutMs: number) {
    super(`ClickHouse query timed out after ${timeoutMs}ms`);
    this.name = 'ClickHouseQueryTimeoutError';
  }
}

export class ClickHouseCircuitOpenError extends Error {
  readonly code = 'CLICKHOUSE_CIRCUIT_OPEN';

  constructor() {
    super('ClickHouse circuit breaker is open');
    this.name = 'ClickHouseCircuitOpenError';
  }
}

/** Race an async operation against a hard timeout. */
export async function withQueryTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new ClickHouseQueryTimeoutError(timeoutMs)),
          timeoutMs,
        );
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
