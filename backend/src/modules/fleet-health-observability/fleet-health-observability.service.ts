import { Injectable, Logger, Optional } from '@nestjs/common';
import { FleetHealthMetricsService } from './fleet-health-metrics.service';
import type { FleetVehicleHealthRow } from '@modules/rental-health/rental-health-summary.types';
import type { VehicleHealth } from '@modules/rental-health/rental-health.types';
import {
  countAmbiguousHealthTaskLegacyMatches,
  type FleetHealthTaskMatchInput,
} from './fleet-health-task-match.util';
import {
  recordCaseApiError,
  recordFleetHealthRows,
  recordFleetSummaryDuration,
  recordHealthTaskAmbiguousLegacyMatches,
  recordHealthTaskLegacyMatchOutcome,
  recordRefreshPartialFailure,
  recordRentalHealthRequest,
  recordServiceCasesSnapshot,
  recordTaskApiError,
  recordVendorApiError,
  recordVehicleHealthSnapshot,
  type FleetHealthRefreshSource,
  type FleetHealthRentalRoute,
  type FleetHealthSummaryOperation,
} from './fleet-health-prometheus.metrics';

/**
 * Structured fleet health observability — no PII labels (no vehicleId/orgId).
 */
@Injectable()
export class FleetHealthObservabilityService {
  private readonly logger = new Logger(FleetHealthObservabilityService.name);

  constructor(
    @Optional() private readonly metricsService: FleetHealthMetricsService | null,
  ) {}

  private get metrics(): FleetHealthMetricsService | null {
    return this.metricsService;
  }

  observeRentalHealthRequest(
    route: FleetHealthRentalRoute,
    result: 'success' | 'error' | 'not_found',
    durationSeconds: number,
  ): void {
    if (!this.metrics) return;
    recordRentalHealthRequest(this.metrics, { route, result }, durationSeconds);
  }

  observeFleetSummary(
    operation: FleetHealthSummaryOperation,
    result: 'success' | 'error',
    durationSeconds: number,
  ): void {
    if (!this.metrics) return;
    recordFleetSummaryDuration(this.metrics, { operation, result }, durationSeconds);
  }

  recordFleetRows(
    rows: FleetVehicleHealthRow[],
    scope: 'fleet_summary' | 'fleet_page' = 'fleet_summary',
  ): void {
    if (!this.metrics || rows.length === 0) return;
    recordFleetHealthRows(this.metrics, rows, scope);
  }

  recordVehicleHealth(health: VehicleHealth): void {
    if (!this.metrics) return;
    recordVehicleHealthSnapshot(this.metrics, health);
  }

  recordServiceCases(cases: Array<{ status: string; blocksRental: boolean }>): void {
    if (!this.metrics || cases.length === 0) return;
    recordServiceCasesSnapshot(this.metrics, cases);
  }

  recordTaskApiFailure(operation: string, err: unknown): void {
    if (!this.metrics) return;
    recordTaskApiError(this.metrics, operation, err);
    this.logger.warn({ msg: 'fleet_health.task_api_error', operation });
  }

  recordCaseApiFailure(operation: string, err: unknown): void {
    if (!this.metrics) return;
    recordCaseApiError(this.metrics, operation, err);
    this.logger.warn({ msg: 'fleet_health.case_api_error', operation });
  }

  recordVendorApiFailure(operation: string, err: unknown): void {
    if (!this.metrics) return;
    recordVendorApiError(this.metrics, operation, err);
    this.logger.warn({ msg: 'fleet_health.vendor_api_error', operation });
  }

  recordPartialRefreshFailure(source: FleetHealthRefreshSource): void {
    if (!this.metrics) return;
    recordRefreshPartialFailure(this.metrics, source);
  }

  recordHealthTaskMatches(tasks: FleetHealthTaskMatchInput[]): void {
    if (!this.metrics || tasks.length === 0) return;
    const ambiguous = countAmbiguousHealthTaskLegacyMatches(tasks);
    recordHealthTaskAmbiguousLegacyMatches(this.metrics, ambiguous);
    if (ambiguous === 0) {
      recordHealthTaskLegacyMatchOutcome(this.metrics, 'none');
    }
  }
}
