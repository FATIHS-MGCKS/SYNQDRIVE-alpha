import type { Logger } from '@nestjs/common';

/**
 * Fail-open isolation for R9 forensic persistence (must not affect wake/snapshot/FSM).
 */
export async function runR9WakeForensicSafely(
  logger: Logger | undefined,
  operation: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    try {
      logger?.warn(
        `R9 wake forensic ${operation} failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } catch {
      // Warning path must never rethrow.
    }
  }
}

export function runR9WakeForensicSyncSafely(
  logger: Pick<Logger, 'warn'> | undefined,
  operation: string,
  fn: () => void,
): void {
  try {
    fn();
  } catch (err) {
    try {
      logger?.warn(
        `R9 wake forensic ${operation} failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } catch {
      // Warning path must never rethrow.
    }
  }
}
