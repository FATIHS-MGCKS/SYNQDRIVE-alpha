import { Injectable } from '@nestjs/common';
import { Counter } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';

@Injectable()
export class ChargingStationEnrichmentMetricsService {
  readonly enqueueTotal: Counter<string>;
  readonly workerTotal: Counter<string>;
  readonly resolutionTotal: Counter<string>;
  readonly coordinateSelectorTotal: Counter<string>;
  readonly recoveryTotal: Counter<string>;

  constructor(private readonly tripMetrics: TripMetricsService) {
    const registry = this.tripMetrics.registry;
    this.enqueueTotal = new Counter({
      name: 'synqdrive_charging_station_enrichment_enqueue_total',
      help: 'Charging station enrichment producer enqueue outcomes',
      labelNames: ['status', 'reason'],
      registers: [registry],
    });
    this.workerTotal = new Counter({
      name: 'synqdrive_charging_station_enrichment_worker_total',
      help: 'Charging station enrichment worker outcomes',
      labelNames: ['status', 'reason'],
      registers: [registry],
    });
    this.resolutionTotal = new Counter({
      name: 'synqdrive_charging_station_enrichment_resolution_total',
      help: 'Charging station enrichment resolution statuses',
      labelNames: ['resolution_status', 'confidence', 'trusted'],
      registers: [registry],
    });
    this.coordinateSelectorTotal = new Counter({
      name: 'synqdrive_charging_station_enrichment_coordinate_selector_total',
      help: 'Charging enrichment coordinate selector outcomes',
      labelNames: ['status'],
      registers: [registry],
    });
    this.recoveryTotal = new Counter({
      name: 'synqdrive_charging_station_enrichment_recovery_total',
      help: 'Charging station enrichment recovery outcomes',
      labelNames: ['status'],
      registers: [registry],
    });
  }

  recordEnqueue(status: string, reason: string): void {
    this.enqueueTotal.inc({ status, reason });
  }

  recordWorker(status: string, reason: string): void {
    this.workerTotal.inc({ status, reason });
  }

  recordResolution(input: {
    resolutionStatus: string;
    confidence: string;
    trusted: string;
  }): void {
    this.resolutionTotal.inc(input);
  }

  recordCoordinateSelector(status: string): void {
    this.coordinateSelectorTotal.inc({ status });
  }

  recordRecovery(status: string): void {
    this.recoveryTotal.inc({ status });
  }
}
