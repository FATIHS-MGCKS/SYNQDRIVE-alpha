import type { FleetHealthMetricsService } from './fleet-health-metrics.service';
import type { FleetVehicleHealthRow } from '@modules/rental-health/rental-health-summary.types';
import type { HealthState, ModuleHealth, VehicleHealth } from '@modules/rental-health/rental-health.types';

export type FleetHealthRentalRoute = 'vehicle_detail' | 'fleet_legacy_batch' | 'fleet_page';
export type FleetHealthSummaryOperation = 'row' | 'batch' | 'page';
export type FleetHealthAvailabilityLevel = 'ready' | 'partial' | 'unavailable';
export type FleetHealthRefreshSource = 'health' | 'service' | 'summary_batch';

const MODULE_KEYS = [
  'battery',
  'tires',
  'brakes',
  'error_codes',
  'service_compliance',
  'complaints',
  'vehicle_alerts',
] as const;

type ModuleKey = (typeof MODULE_KEYS)[number];

export function normalizeFleetHealthErrorCode(err: unknown): string {
  if (!err || typeof err !== 'object') return 'unknown';
  const name = (err as { name?: string }).name;
  if (name === 'NotFoundException') return 'not_found';
  if (name === 'BadRequestException') return 'bad_request';
  if (name === 'UnauthorizedException') return 'unauthorized';
  if (name === 'ForbiddenException') return 'forbidden';
  return 'internal';
}

export function classifyFleetHealthAvailability(
  row: Pick<FleetVehicleHealthRow, 'data_partial' | 'cache_stale' | '_error'>,
): FleetHealthAvailabilityLevel {
  if (row._error) return 'unavailable';
  if (row.data_partial || row.cache_stale) return 'partial';
  return 'ready';
}

function batteryPublicationCoverageState(module: ModuleHealth): 'covered' | 'legacy_unverified' | 'missing' | 'not_applicable' {
  if (module.state === 'n_a') return 'not_applicable';
  if (module.evidence_type === 'legacy_unverified') return 'legacy_unverified';
  if (module.state === 'unknown' || module.data_stale) return 'missing';
  return 'covered';
}

export function recordRentalHealthRequest(
  metrics: FleetHealthMetricsService,
  input: { route: FleetHealthRentalRoute; result: 'success' | 'error' | 'not_found' },
  durationSeconds: number,
): void {
  metrics.rentalHealthRequestDuration.observe(
    { route: input.route, result: input.result },
    durationSeconds,
  );
}

export function recordFleetSummaryDuration(
  metrics: FleetHealthMetricsService,
  input: { operation: FleetHealthSummaryOperation; result: 'success' | 'error' },
  durationSeconds: number,
): void {
  metrics.fleetSummaryDuration.observe(
    { operation: input.operation, result: input.result },
    durationSeconds,
  );
}

export function recordFleetHealthRows(
  metrics: FleetHealthMetricsService,
  rows: FleetVehicleHealthRow[],
  scope: 'fleet_summary' | 'fleet_page' = 'fleet_summary',
): void {
  let batteryApplicable = 0;
  let batteryCovered = 0;

  for (const row of rows) {
    const availability = classifyFleetHealthAvailability(row);
    metrics.availabilityTotal.inc({ level: availability });

    if (row._error) {
      metrics.refreshPartialFailureTotal.inc({ source: 'summary_batch' });
    }

    if (row.rental_blocked) {
      metrics.technicalBlockadeTotal.inc({ source: 'rental_health' });
    }

    for (const moduleKey of MODULE_KEYS) {
      const module = row.modules[moduleKey as ModuleKey] as ModuleHealth;
      metrics.moduleStatusTotal.inc({ module: moduleKey, state: module.state });
      if (module.data_stale) {
        metrics.staleModuleTotal.inc({ module: moduleKey });
      }
    }

    const battery = row.modules.battery;
    const publicationState = batteryPublicationCoverageState(battery);
    if (publicationState !== 'not_applicable') {
      batteryApplicable += 1;
      if (publicationState === 'covered') batteryCovered += 1;
    }
  }

  if (batteryApplicable > 0) {
    metrics.batteryPublicationCoverageRatio.set(
      { scope },
      batteryCovered / batteryApplicable,
    );
  }
}

export function recordVehicleHealthSnapshot(
  metrics: FleetHealthMetricsService,
  health: VehicleHealth,
): void {
  recordFleetHealthRows(metrics, [health as FleetVehicleHealthRow]);
}

export function recordServiceCasesSnapshot(
  metrics: FleetHealthMetricsService,
  cases: Array<{ status: string; blocksRental: boolean }>,
): void {
  for (const serviceCase of cases) {
    metrics.serviceCaseTotal.inc({ status: serviceCase.status });
    if (serviceCase.blocksRental) {
      metrics.blockingServiceCaseTotal.inc();
    }
  }
}

export function recordTaskApiError(
  metrics: FleetHealthMetricsService,
  operation: string,
  err: unknown,
): void {
  metrics.taskApiErrorsTotal.inc({
    operation,
    error_code: normalizeFleetHealthErrorCode(err),
  });
}

export function recordCaseApiError(
  metrics: FleetHealthMetricsService,
  operation: string,
  err: unknown,
): void {
  metrics.caseApiErrorsTotal.inc({
    operation,
    error_code: normalizeFleetHealthErrorCode(err),
  });
}

export function recordVendorApiError(
  metrics: FleetHealthMetricsService,
  operation: string,
  err: unknown,
): void {
  metrics.vendorApiErrorsTotal.inc({
    operation,
    error_code: normalizeFleetHealthErrorCode(err),
  });
}

export function recordRefreshPartialFailure(
  metrics: FleetHealthMetricsService,
  source: FleetHealthRefreshSource,
): void {
  metrics.refreshPartialFailureTotal.inc({ source });
}

export function recordHealthTaskAmbiguousLegacyMatches(
  metrics: FleetHealthMetricsService,
  count: number,
): void {
  if (count <= 0) return;
  metrics.healthTaskAmbiguousLegacyMatchTotal.inc({ outcome: 'ambiguous' }, count);
}

export function recordHealthTaskLegacyMatchOutcome(
  metrics: FleetHealthMetricsService,
  outcome: string,
): void {
  metrics.healthTaskAmbiguousLegacyMatchTotal.inc({ outcome });
}

export function isHealthState(value: string): value is HealthState {
  return ['good', 'warning', 'critical', 'unknown', 'n_a'].includes(value);
}
