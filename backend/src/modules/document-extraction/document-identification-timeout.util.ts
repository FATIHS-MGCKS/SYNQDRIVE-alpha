export class DocumentIdentificationTimeoutError extends Error {
  constructor(message = 'File identification timed out') {
    super(message);
    this.name = 'DocumentIdentificationTimeoutError';
  }
}

export async function withIdentificationTimeout<T>(
  task: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return task();
  }

  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      task(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new DocumentIdentificationTimeoutError()),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
