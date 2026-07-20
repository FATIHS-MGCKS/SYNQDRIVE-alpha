import type { VehicleHealth } from './rental-health.types';
import type { FleetVehicleHealthRow } from './rental-health-summary.types';
import { RENTAL_HEALTH_SUMMARY_SOFT_STALE_MS } from './rental-health-summary.types';

const READ_MODEL_META_KEYS = ['cache_stale', 'data_partial', 'cached_at', '_error'] as const;

export function isRentalHealthDataPartial(
  health: VehicleHealth & { _error?: string },
): boolean {
  if (health._error) return true;
  return Object.values(health.modules).some(
    (module) =>
      module.state === 'unknown' &&
      (module.data_stale || module.reason === 'Daten nicht verfügbar'),
  );
}

export function projectFleetHealthRow(
  health: VehicleHealth,
  options: {
    cachedAt: string | null;
    fromCache: boolean;
    now?: number;
  },
): FleetVehicleHealthRow {
  const now = options.now ?? Date.now();
  const cacheStale =
    options.fromCache &&
    options.cachedAt != null &&
    now - Date.parse(options.cachedAt) > RENTAL_HEALTH_SUMMARY_SOFT_STALE_MS;

  return {
    ...health,
    cache_stale: cacheStale,
    data_partial: isRentalHealthDataPartial(health),
    cached_at: options.cachedAt,
  };
}

/** Strip fleet read-model meta — must match canonical detail payload. */
export function stripFleetReadModelMeta(row: FleetVehicleHealthRow): VehicleHealth {
  const clone = { ...row } as Record<string, unknown>;
  for (const key of READ_MODEL_META_KEYS) {
    delete clone[key];
  }
  return clone as unknown as VehicleHealth;
}
