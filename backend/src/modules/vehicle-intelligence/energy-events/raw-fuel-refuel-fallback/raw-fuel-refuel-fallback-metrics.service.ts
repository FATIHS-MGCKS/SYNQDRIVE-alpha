import { Injectable } from '@nestjs/common';
import { Counter } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';

export type RawFuelRefuelFallbackMetricOutcome =
  | 'invoked'
  | 'skipped_master_off'
  | 'skipped_persist_without_master'
  | 'skipped_no_token'
  | 'skipped_capability'
  | 'skipped_fetch'
  | 'skipped_no_samples'
  | 'success'
  | 'branch_error';

@Injectable()
export class RawFuelRefuelFallbackMetricsService {
  readonly scanTotal: Counter<string>;
  readonly observationsTotal: Counter<string>;
  readonly persistTotal: Counter<string>;
  readonly candidateErrorsTotal: Counter<string>;

  constructor(private readonly tripMetrics: TripMetricsService) {
    const register = this.tripMetrics.registry;

    this.scanTotal = new Counter({
      name: 'synqdrive_rfrf_scan_total',
      help: 'Raw fuel refuel fallback dark scan outcomes',
      labelNames: ['outcome', 'capability'],
      registers: [register],
    });

    this.observationsTotal = new Counter({
      name: 'synqdrive_rfrf_observations_total',
      help: 'Raw fuel rise observations emitted by F3 in dark runtime',
      labelNames: ['lifecycle'],
      registers: [register],
    });

    this.persistTotal = new Counter({
      name: 'synqdrive_rfrf_candidate_persist_total',
      help: 'Raw refuel candidate F2 persistence outcomes',
      labelNames: ['result'],
      registers: [register],
    });

    this.candidateErrorsTotal = new Counter({
      name: 'synqdrive_rfrf_candidate_errors_total',
      help: 'Per-candidate errors during dark runtime persistence',
      registers: [register],
    });
  }

  recordScan(outcome: RawFuelRefuelFallbackMetricOutcome, capability = 'n/a'): void {
    this.scanTotal.inc({ outcome, capability });
  }

  recordObservation(lifecycleState: string): void {
    this.observationsTotal.inc({ lifecycle: lifecycleState });
  }

  recordPersist(result: 'created' | 'rediscovered' | 'skipped_flag_off' | 'skipped_not_ready'): void {
    this.persistTotal.inc({ result });
  }

  recordCandidateError(): void {
    this.candidateErrorsTotal.inc();
  }
}
