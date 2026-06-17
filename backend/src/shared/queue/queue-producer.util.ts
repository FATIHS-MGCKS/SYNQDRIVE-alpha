import { Logger } from '@nestjs/common';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';

/**
 * Returns false when Redis/workers were disabled at bootstrap — callers should
 * skip `.add()` instead of surfacing unhandled queue errors in request flows.
 */
export function canEnqueueQueue(logger?: Logger, context?: string): boolean {
  if (RuntimeStatusRegistry.getWorkersEnabled()) return true;
  if (logger) {
    logger.debug(
      `Queue enqueue skipped${context ? ` (${context})` : ''}: workers/redis disabled at bootstrap`,
    );
  }
  return false;
}
