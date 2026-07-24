import { Injectable } from '@nestjs/common';
import { Counter, Histogram } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';

/**
 * Vehicle Detail page Prometheus metrics — bounded labels only (no vehicleId/orgId/coordinates).
 */
@Injectable()
export class VehicleDetailMetricsService {
  readonly requestTotal: Counter<string>;
  readonly requestDuration: Histogram<string>;
  readonly providerOutcomeTotal: Counter<string>;
  readonly liveGpsSourceTotal: Counter<string>;
  readonly cacheOutcomeTotal: Counter<string>;
  readonly statusMutationTotal: Counter<string>;
  readonly permissionDeniedTotal: Counter<string>;

  constructor(private readonly tripMetrics: TripMetricsService) {
    const register = this.tripMetrics.registry;

    this.requestTotal = new Counter({
      name: 'synqdrive_vehicle_detail_request_total',
      help: 'Vehicle detail API requests by endpoint and result',
      labelNames: ['endpoint', 'result'],
      registers: [register],
    });

    this.requestDuration = new Histogram({
      name: 'synqdrive_vehicle_detail_request_duration_seconds',
      help: 'Vehicle detail API request duration',
      labelNames: ['endpoint', 'result'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20],
      registers: [register],
    });

    this.providerOutcomeTotal = new Counter({
      name: 'synqdrive_vehicle_detail_provider_outcome_total',
      help: 'Telemetry/GPS provider outcomes for vehicle detail polling endpoints',
      labelNames: ['endpoint', 'outcome'],
      registers: [register],
    });

    this.liveGpsSourceTotal = new Counter({
      name: 'synqdrive_vehicle_detail_live_gps_source_total',
      help: 'Live GPS response source classification',
      labelNames: ['source'],
      registers: [register],
    });

    this.cacheOutcomeTotal = new Counter({
      name: 'synqdrive_vehicle_detail_cache_outcome_total',
      help: 'Fleet-map cache outcomes relevant to vehicle detail surfaces',
      labelNames: ['outcome'],
      registers: [register],
    });

    this.statusMutationTotal = new Counter({
      name: 'synqdrive_vehicle_detail_status_mutation_total',
      help: 'Vehicle detail status mutation outcomes',
      labelNames: ['field', 'result'],
      registers: [register],
    });

    this.permissionDeniedTotal = new Counter({
      name: 'synqdrive_vehicle_detail_permission_denied_total',
      help: 'Tenant/permission denials on vehicle detail endpoints',
      labelNames: ['endpoint'],
      registers: [register],
    });
  }
}
