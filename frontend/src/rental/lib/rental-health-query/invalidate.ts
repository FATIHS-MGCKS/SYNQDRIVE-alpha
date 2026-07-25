export const RENTAL_HEALTH_INVALIDATE_EVENT = 'rental-health:invalidate' as const;

export type RentalHealthInvalidationReason =
  | 'health-mutation'
  | 'document-confirmed'
  | 'handover'
  | 'manual'
  | 'operational';

export interface RentalHealthInvalidationDetail {
  orgId: string;
  vehicleId?: string;
  reason: RentalHealthInvalidationReason;
}

export interface RentalHealthInvalidationEvent
  extends CustomEvent<RentalHealthInvalidationDetail> {}

const orgReloadHandlers = new Map<string, Set<() => void>>();
const vehicleReloadHandlers = new Map<string, Set<() => void>>();

function vehicleHandlerKey(orgId: string, vehicleId: string): string {
  return `${orgId}:${vehicleId}`;
}

export function registerRentalHealthReloadHandler(
  orgId: string,
  handler: () => void,
): () => void {
  const set = orgReloadHandlers.get(orgId) ?? new Set();
  set.add(handler);
  orgReloadHandlers.set(orgId, set);
  return () => {
    set.delete(handler);
    if (set.size === 0) orgReloadHandlers.delete(orgId);
  };
}

export function registerRentalHealthVehicleReloadHandler(
  orgId: string,
  vehicleId: string,
  handler: () => void,
): () => void {
  const key = vehicleHandlerKey(orgId, vehicleId);
  const set = vehicleReloadHandlers.get(key) ?? new Set();
  set.add(handler);
  vehicleReloadHandlers.set(key, set);
  return () => {
    set.delete(handler);
    if (set.size === 0) vehicleReloadHandlers.delete(key);
  };
}

function dispatchReloadHandlers(detail: RentalHealthInvalidationDetail): void {
  for (const handler of orgReloadHandlers.get(detail.orgId) ?? []) {
    handler();
  }

  if (detail.vehicleId) {
    for (const handler of vehicleReloadHandlers.get(vehicleHandlerKey(detail.orgId, detail.vehicleId)) ?? []) {
      handler();
    }
  }
}

export function invalidateRentalHealthQueries(
  detail: RentalHealthInvalidationDetail,
): void {
  if (!detail.orgId) return;
  dispatchReloadHandlers(detail);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<RentalHealthInvalidationDetail>(RENTAL_HEALTH_INVALIDATE_EVENT, {
        detail,
      }),
    );
  }
}

export function invalidateRentalHealthForVehicle(
  orgId: string,
  vehicleId: string,
  reason: RentalHealthInvalidationReason = 'health-mutation',
): void {
  invalidateRentalHealthQueries({ orgId, vehicleId, reason });
}

export function subscribeRentalHealthInvalidation(
  listener: (detail: RentalHealthInvalidationDetail) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => {
    const custom = event as RentalHealthInvalidationEvent;
    if (custom.detail) listener(custom.detail);
  };
  window.addEventListener(RENTAL_HEALTH_INVALIDATE_EVENT, handler);
  return () => window.removeEventListener(RENTAL_HEALTH_INVALIDATE_EVENT, handler);
}

/** Test-only reset. */
export function resetRentalHealthReloadHandlers(): void {
  orgReloadHandlers.clear();
  vehicleReloadHandlers.clear();
}
