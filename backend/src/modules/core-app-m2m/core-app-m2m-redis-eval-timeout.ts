export class CoreAppM2mRedisEvalTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`CORE_APP_M2M_REDIS_EVAL_TIMEOUT_${timeoutMs}ms`);
    this.name = 'CoreAppM2mRedisEvalTimeoutError';
  }
}

export async function runWithBoundedTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new CoreAppM2mRedisEvalTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}