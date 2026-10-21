export function runTripObservabilitySafely(
  logger: { warn: (message: string) => void } | undefined,
  name: string,
  fn: () => void,
): void {
  try {
    fn();
  } catch (err) {
    try {
      logger?.warn(
        `Trip observability ${name} failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } catch {
      // Warning path must never rethrow.
    }
  }
}
