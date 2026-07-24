import type { VehicleDetailMetricsService } from './vehicle-detail-metrics.service';

export type VehicleDetailEndpoint =
  | 'telemetry'
  | 'live_gps'
  | 'device_connection'
  | 'status_patch';

export type VehicleDetailRequestResult =
  | 'success'
  | 'not_found'
  | 'forbidden'
  | 'error';

export type VehicleDetailLiveGpsSource = 'dimo' | 'cache';

export type VehicleDetailCacheOutcome = 'hit' | 'miss' | 'invalidate_fail';

export type VehicleDetailStatusField = 'cleaning_status' | 'operational_status' | 'health_status';

export function normalizeVehicleDetailErrorCode(err: unknown): string {
  if (!err || typeof err !== 'object') return 'unknown';
  const name = (err as { name?: string }).name;
  if (name === 'NotFoundException') return 'not_found';
  if (name === 'ForbiddenException') return 'forbidden';
  if (name === 'UnauthorizedException') return 'unauthorized';
  if (name === 'BadRequestException') return 'bad_request';
  return 'internal';
}

export function recordVehicleDetailRequest(
  metrics: VehicleDetailMetricsService,
  input: { endpoint: VehicleDetailEndpoint; result: VehicleDetailRequestResult },
  durationSeconds: number,
): void {
  metrics.requestTotal.inc({ endpoint: input.endpoint, result: input.result });
  metrics.requestDuration.observe(
    { endpoint: input.endpoint, result: input.result },
    durationSeconds,
  );
}

export function recordVehicleDetailProviderOutcome(
  metrics: VehicleDetailMetricsService,
  input: {
    endpoint: Extract<VehicleDetailEndpoint, 'telemetry' | 'live_gps'>;
    outcome: 'success' | 'cache_fallback' | 'provider_error' | 'timeout' | 'rate_limited';
  },
): void {
  metrics.providerOutcomeTotal.inc({
    endpoint: input.endpoint,
    outcome: input.outcome,
  });
}

export function recordVehicleDetailLiveGpsSource(
  metrics: VehicleDetailMetricsService,
  source: VehicleDetailLiveGpsSource,
): void {
  metrics.liveGpsSourceTotal.inc({ source });
}

export function recordVehicleDetailCacheOutcome(
  metrics: VehicleDetailMetricsService,
  outcome: VehicleDetailCacheOutcome,
): void {
  metrics.cacheOutcomeTotal.inc({ outcome });
}

export function recordVehicleDetailStatusMutation(
  metrics: VehicleDetailMetricsService,
  input: { field: VehicleDetailStatusField; result: 'success' | 'error' | 'forbidden' },
): void {
  metrics.statusMutationTotal.inc({ field: input.field, result: input.result });
}

export function recordVehicleDetailPermissionDenied(
  metrics: VehicleDetailMetricsService,
  input: { endpoint: VehicleDetailEndpoint },
): void {
  metrics.permissionDeniedTotal.inc({ endpoint: input.endpoint });
}
