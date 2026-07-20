import type { VehicleHealth } from './rental-health.types';

/**
 * Fleet rental-health read model — Redis cache-aside over canonical
 * {@link RentalHealthService.getVehicleHealth}. Detail routes bypass this layer.
 *
 * **TTL:** {@link RENTAL_HEALTH_SUMMARY_CACHE_TTL_SECONDS}s Redis expiry.
 * **Soft stale:** entries older than {@link RENTAL_HEALTH_SUMMARY_SOFT_STALE_MS}
 * are surfaced with `cache_stale: true` while still served from Redis.
 *
 * **Invalidation (event-driven):**
 * - tire / brake rental-health review override create + revoke
 * - booking create / update / cancel / no-show (vehicle-scoped)
 * - pickup / return handover (vehicle-scoped)
 */
export const RENTAL_HEALTH_SUMMARY_CACHE_KEY_VERSION = 'v1';

/** Redis TTL — fleet summaries only; detail endpoint is always live. */
export const RENTAL_HEALTH_SUMMARY_CACHE_TTL_SECONDS = 45;

/** UI soft-stale threshold while Redis entry is still valid. */
export const RENTAL_HEALTH_SUMMARY_SOFT_STALE_MS = 30_000;

export interface RentalHealthSummaryCacheEnvelope {
  health: VehicleHealth;
  cached_at: string;
}

/** Fleet list row — canonical VehicleHealth plus optional read-model meta. */
export interface FleetVehicleHealthRow extends VehicleHealth {
  cache_stale?: boolean;
  data_partial?: boolean;
  cached_at?: string | null;
  _error?: string;
}
