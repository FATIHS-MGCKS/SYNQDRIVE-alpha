/**
 * Client-side technical observability for Vehicle Detail (no analytics product).
 * Counters are in-memory only; logs are DEV-only and never include coordinates/tokens/PII.
 */
export type VehicleDetailClientSignal =
  | 'telemetry_poll_success'
  | 'telemetry_poll_error'
  | 'gps_poll_success'
  | 'gps_poll_error'
  | 'telemetry_poll_aborted'
  | 'gps_poll_aborted'
  | 'polling_bound'
  | 'polling_unbound'
  | 'polling_paused'
  | 'polling_resumed'
  | 'map_init_success'
  | 'map_init_error'
  | 'map_token_missing'
  | 'device_connection_error'
  | 'status_mutation_error';

type ClientCounterMap = Record<VehicleDetailClientSignal, number>;

const counters: ClientCounterMap = {
  telemetry_poll_success: 0,
  telemetry_poll_error: 0,
  gps_poll_success: 0,
  gps_poll_error: 0,
  telemetry_poll_aborted: 0,
  gps_poll_aborted: 0,
  polling_bound: 0,
  polling_unbound: 0,
  polling_paused: 0,
  polling_resumed: 0,
  map_init_success: 0,
  map_init_error: 0,
  map_token_missing: 0,
  device_connection_error: 0,
  status_mutation_error: 0,
};

const FORBIDDEN_DETAIL_KEYS = new Set([
  'latitude',
  'longitude',
  'lat',
  'lng',
  'token',
  'authorization',
  'email',
  'name',
  'licensePlate',
  'vin',
]);

export function resetVehicleDetailClientSignals(): void {
  for (const key of Object.keys(counters) as VehicleDetailClientSignal[]) {
    counters[key] = 0;
  }
}

export function getVehicleDetailClientSignalCount(signal: VehicleDetailClientSignal): number {
  return counters[signal] ?? 0;
}

export function recordVehicleDetailClientSignal(
  signal: VehicleDetailClientSignal,
  detail?: Record<string, string | number | boolean | null | undefined>,
): void {
  counters[signal] = (counters[signal] ?? 0) + 1;

  if (!import.meta.env.DEV) return;

  const safeDetail: Record<string, string | number | boolean | null | undefined> = {};
  if (detail) {
    for (const [key, value] of Object.entries(detail)) {
      if (FORBIDDEN_DETAIL_KEYS.has(key)) continue;
      if (key.toLowerCase().includes('token') || key.toLowerCase().includes('secret')) continue;
      safeDetail[key] = value;
    }
  }

  console.debug('[vehicle-detail:obs]', signal, safeDetail);
}
