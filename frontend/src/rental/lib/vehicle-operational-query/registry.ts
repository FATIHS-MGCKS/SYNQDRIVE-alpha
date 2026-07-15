import { queryKeyMatches } from './keys';
import type { VehicleOperationalInvalidationContext } from './types';

export type VehicleOperationalInvalidationHandler = (
  context: VehicleOperationalInvalidationContext,
) => void | Promise<void>;

interface RegisteredHandler {
  keyPrefix: readonly unknown[];
  handler: VehicleOperationalInvalidationHandler;
}

const handlers: RegisteredHandler[] = [];

/**
 * Register a refetch/recompute handler for query keys sharing `keyPrefix`.
 * Returns an unsubscribe function.
 */
export function registerVehicleOperationalInvalidationHandler(
  keyPrefix: readonly unknown[],
  handler: VehicleOperationalInvalidationHandler,
): () => void {
  const entry: RegisteredHandler = { keyPrefix, handler };
  handlers.push(entry);
  return () => {
    const idx = handlers.indexOf(entry);
    if (idx >= 0) handlers.splice(idx, 1);
  };
}

export function getHandlersForKeys(
  keys: readonly (readonly unknown[])[],
): VehicleOperationalInvalidationHandler[] {
  const matched = new Set<VehicleOperationalInvalidationHandler>();

  for (const key of keys) {
    for (const { keyPrefix, handler } of handlers) {
      if (queryKeyMatches(keyPrefix, key)) {
        matched.add(handler);
      }
    }
  }

  return [...matched];
}

/** Test-only reset. */
export function resetVehicleOperationalInvalidationHandlers(): void {
  handlers.length = 0;
}
