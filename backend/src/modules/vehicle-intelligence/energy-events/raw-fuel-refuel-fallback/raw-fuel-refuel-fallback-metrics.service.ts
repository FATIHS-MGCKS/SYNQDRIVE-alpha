import { Injectable } from '@nestjs/common';
import { Counter } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';

@Injectable()
export class RawFuelRefuelFallbackMetricsService {
  readonly branchInvocationTotal: Counter<string>;
  readonly masterDisabledTotal: Counter<string>;
  readonly persistWithoutMasterTotal: Counter<string>;
  readonly capabilitySkipTotal: Counter<string>;
  readonly sampleFetchSuccessTotal: Counter<string>;
  readonly sampleFetchFailureTotal: Counter<string>;
  readonly detectorInvocationTotal: Counter<string>;
  readonly zeroObservationsTotal: Counter<string>;
  readonly observationsTotal: Counter<string>;
  readonly persistAttemptTotal: Counter<string>;
  readonly persistCreatedTotal: Counter<string>;
  readonly persistRediscoveredTotal: Counter<string>;
  readonly persistSkippedFlagOffTotal: Counter<string>;
  readonly candidateErrorsTotal: Counter<string>;
  readonly branchErrorTotal: Counter<string>;
  readonly nonFiniteSampleExclusionTotal: Counter<string>;

  constructor(private readonly tripMetrics: TripMetricsService) {
    const register = this.tripMetrics.registry;

    this.branchInvocationTotal = new Counter({
      name: 'synqdrive_rfrf_branch_invocation_total',
      help: 'Raw fuel refuel fallback dark branch invocations (master enabled, scan entered)',
      registers: [register],
    });

    this.masterDisabledTotal = new Counter({
      name: 'synqdrive_rfrf_master_disabled_total',
      help: 'RFRF scans skipped because master flag is off',
      registers: [register],
    });

    this.persistWithoutMasterTotal = new Counter({
      name: 'synqdrive_rfrf_persist_without_master_total',
      help: 'RFRF fail-closed: persist flag set without master',
      registers: [register],
    });

    this.capabilitySkipTotal = new Counter({
      name: 'synqdrive_rfrf_capability_skip_total',
      help: 'RFRF scans skipped due to fuel capability gate',
      labelNames: ['capability'],
      registers: [register],
    });

    this.sampleFetchSuccessTotal = new Counter({
      name: 'synqdrive_rfrf_sample_fetch_success_total',
      help: 'RFRF fuel sample provider fetch succeeded (including legitimate empty telemetry)',
      registers: [register],
    });

    this.sampleFetchFailureTotal = new Counter({
      name: 'synqdrive_rfrf_sample_fetch_failure_total',
      help: 'RFRF fuel sample provider/auth fetch failures',
      labelNames: ['error_class'],
      registers: [register],
    });

    this.detectorInvocationTotal = new Counter({
      name: 'synqdrive_rfrf_detector_invocation_total',
      help: 'RFRF F3 detectRawFuelRises invocations',
      registers: [register],
    });

    this.zeroObservationsTotal = new Counter({
      name: 'synqdrive_rfrf_zero_observations_total',
      help: 'RFRF detector runs that emitted zero persistable observations',
      registers: [register],
    });

    this.observationsTotal = new Counter({
      name: 'synqdrive_rfrf_observations_total',
      help: 'Raw fuel rise observations emitted by F3 in dark runtime',
      labelNames: ['lifecycle'],
      registers: [register],
    });

    this.persistAttemptTotal = new Counter({
      name: 'synqdrive_rfrf_persist_attempt_total',
      help: 'RFRF F2 candidate persist attempts',
      registers: [register],
    });

    this.persistCreatedTotal = new Counter({
      name: 'synqdrive_rfrf_persist_created_total',
      help: 'RFRF F2 candidates created',
      registers: [register],
    });

    this.persistRediscoveredTotal = new Counter({
      name: 'synqdrive_rfrf_persist_rediscovered_total',
      help: 'RFRF F2 candidates semantically rediscovered',
      registers: [register],
    });

    this.persistSkippedFlagOffTotal = new Counter({
      name: 'synqdrive_rfrf_persist_skipped_flag_off_total',
      help: 'RFRF observations skipped because persist flag is off',
      registers: [register],
    });

    this.candidateErrorsTotal = new Counter({
      name: 'synqdrive_rfrf_candidate_errors_total',
      help: 'Per-candidate errors during dark runtime persistence',
      registers: [register],
    });

    this.branchErrorTotal = new Counter({
      name: 'synqdrive_rfrf_branch_error_total',
      help: 'RFRF branch-level isolated failures',
      registers: [register],
    });

    this.nonFiniteSampleExclusionTotal = new Counter({
      name: 'synqdrive_rfrf_non_finite_sample_exclusion_total',
      help: 'F3 normalizer invalid_sample exclusions surfaced from dark runtime',
      registers: [register],
    });
  }

  recordBranchInvocation(): void {
    this.branchInvocationTotal.inc();
  }

  recordMasterDisabled(): void {
    this.masterDisabledTotal.inc();
  }

  recordPersistWithoutMaster(): void {
    this.persistWithoutMasterTotal.inc();
  }

  recordCapabilitySkip(capability: string): void {
    this.capabilitySkipTotal.inc({ capability });
  }

  recordSampleFetchSuccess(): void {
    this.sampleFetchSuccessTotal.inc();
  }

  recordSampleFetchFailure(errorClass: string): void {
    this.sampleFetchFailureTotal.inc({ error_class: errorClass });
  }

  recordDetectorInvocation(): void {
    this.detectorInvocationTotal.inc();
  }

  recordZeroObservations(): void {
    this.zeroObservationsTotal.inc();
  }

  recordObservation(lifecycleState: string): void {
    this.observationsTotal.inc({ lifecycle: lifecycleState });
  }

  recordPersistAttempt(): void {
    this.persistAttemptTotal.inc();
  }

  recordPersistCreated(): void {
    this.persistCreatedTotal.inc();
  }

  recordPersistRediscovered(): void {
    this.persistRediscoveredTotal.inc();
  }

  recordPersistSkippedFlagOff(): void {
    this.persistSkippedFlagOffTotal.inc();
  }

  recordCandidateError(): void {
    this.candidateErrorsTotal.inc();
  }

  recordBranchError(): void {
    this.branchErrorTotal.inc();
  }

  recordNonFiniteSampleExclusion(count = 1): void {
    if (count > 0) this.nonFiniteSampleExclusionTotal.inc(count);
  }
}
