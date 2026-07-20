import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';

/**
 * Fleet Health Service Prometheus metrics — bounded labels only (no vehicleId/orgId).
 */
@Injectable()
export class FleetHealthMetricsService {
  readonly rentalHealthRequestDuration: Histogram<string>;
  readonly fleetSummaryDuration: Histogram<string>;
  readonly moduleStatusTotal: Counter<string>;
  readonly availabilityTotal: Counter<string>;
  readonly technicalBlockadeTotal: Counter<string>;
  readonly staleModuleTotal: Counter<string>;
  readonly serviceCaseTotal: Counter<string>;
  readonly blockingServiceCaseTotal: Counter<string>;
  readonly taskApiErrorsTotal: Counter<string>;
  readonly caseApiErrorsTotal: Counter<string>;
  readonly vendorApiErrorsTotal: Counter<string>;
  readonly refreshPartialFailureTotal: Counter<string>;
  readonly healthTaskAmbiguousLegacyMatchTotal: Counter<string>;
  readonly batteryPublicationCoverageRatio: Gauge<string>;

  constructor(private readonly tripMetrics: TripMetricsService) {
    const register = this.tripMetrics.registry;

    this.rentalHealthRequestDuration = new Histogram({
      name: 'synqdrive_fleet_health_rental_health_request_duration_seconds',
      help: 'Rental health API request duration',
      labelNames: ['route', 'result'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20],
      registers: [register],
    });

    this.fleetSummaryDuration = new Histogram({
      name: 'synqdrive_fleet_health_fleet_summary_duration_seconds',
      help: 'Fleet health summary read-model duration',
      labelNames: ['operation', 'result'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
      registers: [register],
    });

    this.moduleStatusTotal = new Counter({
      name: 'synqdrive_fleet_health_module_status_total',
      help: 'Rental health module states observed in fleet summaries',
      labelNames: ['module', 'state'],
      registers: [register],
    });

    this.availabilityTotal = new Counter({
      name: 'synqdrive_fleet_health_availability_total',
      help: 'Fleet health read-model availability classification per vehicle row',
      labelNames: ['level'],
      registers: [register],
    });

    this.technicalBlockadeTotal = new Counter({
      name: 'synqdrive_fleet_health_technical_blockade_total',
      help: 'Technical rental blockades observed in fleet health rows',
      labelNames: ['source'],
      registers: [register],
    });

    this.staleModuleTotal = new Counter({
      name: 'synqdrive_fleet_health_stale_module_total',
      help: 'Stale rental health modules observed in fleet summaries',
      labelNames: ['module'],
      registers: [register],
    });

    this.serviceCaseTotal = new Counter({
      name: 'synqdrive_fleet_health_service_case_total',
      help: 'Service cases observed via fleet health APIs',
      labelNames: ['status'],
      registers: [register],
    });

    this.blockingServiceCaseTotal = new Counter({
      name: 'synqdrive_fleet_health_blocking_service_case_total',
      help: 'Rental-blocking service cases observed via fleet health APIs',
      registers: [register],
    });

    this.taskApiErrorsTotal = new Counter({
      name: 'synqdrive_fleet_health_task_api_errors_total',
      help: 'Task API errors surfaced to fleet health surfaces',
      labelNames: ['operation', 'error_code'],
      registers: [register],
    });

    this.caseApiErrorsTotal = new Counter({
      name: 'synqdrive_fleet_health_case_api_errors_total',
      help: 'Service case API errors surfaced to fleet health surfaces',
      labelNames: ['operation', 'error_code'],
      registers: [register],
    });

    this.vendorApiErrorsTotal = new Counter({
      name: 'synqdrive_fleet_health_vendor_api_errors_total',
      help: 'Vendor API errors surfaced to fleet health surfaces',
      labelNames: ['operation', 'error_code'],
      registers: [register],
    });

    this.refreshPartialFailureTotal = new Counter({
      name: 'synqdrive_fleet_health_refresh_partial_failure_total',
      help: 'Partial refresh failures when loading fleet health aggregates',
      labelNames: ['source'],
      registers: [register],
    });

    this.healthTaskAmbiguousLegacyMatchTotal = new Counter({
      name: 'synqdrive_fleet_health_health_task_ambiguous_legacy_match_total',
      help: 'Ambiguous health-to-task legacy match detections',
      labelNames: ['outcome'],
      registers: [register],
    });

    this.batteryPublicationCoverageRatio = new Gauge({
      name: 'synqdrive_fleet_health_battery_publication_coverage_ratio',
      help: 'Share of battery-applicable fleet rows with publication coverage (0-1)',
      labelNames: ['scope'],
      registers: [register],
    });
  }
}
