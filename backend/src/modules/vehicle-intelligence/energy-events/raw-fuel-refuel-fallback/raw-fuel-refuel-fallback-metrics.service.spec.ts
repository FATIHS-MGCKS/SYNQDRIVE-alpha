import { FuelType } from '@prisma/client';
import { Registry } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { RawFuelRefuelFallbackMetricsService } from './raw-fuel-refuel-fallback-metrics.service';

describe('RawFuelRefuelFallbackMetricsService minimum contract', () => {
  let metrics: RawFuelRefuelFallbackMetricsService;
  let registry: Registry;

  beforeEach(() => {
    registry = new Registry();
    metrics = new RawFuelRefuelFallbackMetricsService({
      registry,
    } as TripMetricsService);
  });

  async function counterValue(name: string, labels?: Record<string, string>) {
    const all = await registry.getMetricsAsJSON();
    const metric = all.find((m) => m.name === name);
    if (!metric) return 0;
    const sample = metric.values.find((v) =>
      labels
        ? Object.entries(labels).every(([k, val]) => v.labels?.[k] === val)
        : true,
    );
    return sample?.value ?? 0;
  }

  it('records every minimum dark-runtime contract counter', async () => {
    metrics.recordBranchInvocation();
    metrics.recordMasterDisabled();
    metrics.recordPersistWithoutMaster();
    metrics.recordCapabilitySkip('UNKNOWN');
    metrics.recordSampleFetchSuccess();
    metrics.recordSampleFetchFailure('PROVIDER_QUERY_FAILED');
    metrics.recordDetectorInvocation();
    metrics.recordZeroObservations();
    metrics.recordObservation('OBSERVED');
    metrics.recordPersistAttempt();
    metrics.recordPersistCreated();
    metrics.recordPersistRediscovered();
    metrics.recordPersistSkippedFlagOff();
    metrics.recordCandidateError();
    metrics.recordBranchError();
    metrics.recordNonFiniteSampleExclusion(2);

    expect(await counterValue('synqdrive_rfrf_branch_invocation_total')).toBe(1);
    expect(await counterValue('synqdrive_rfrf_master_disabled_total')).toBe(1);
    expect(await counterValue('synqdrive_rfrf_persist_without_master_total')).toBe(1);
    expect(await counterValue('synqdrive_rfrf_capability_skip_total', { capability: 'UNKNOWN' })).toBe(1);
    expect(await counterValue('synqdrive_rfrf_sample_fetch_success_total')).toBe(1);
    expect(await counterValue('synqdrive_rfrf_sample_fetch_failure_total', { error_class: 'PROVIDER_QUERY_FAILED' })).toBe(1);
    expect(await counterValue('synqdrive_rfrf_detector_invocation_total')).toBe(1);
    expect(await counterValue('synqdrive_rfrf_zero_observations_total')).toBe(1);
    expect(await counterValue('synqdrive_rfrf_observations_total', { lifecycle: 'OBSERVED' })).toBe(1);
    expect(await counterValue('synqdrive_rfrf_persist_attempt_total')).toBe(1);
    expect(await counterValue('synqdrive_rfrf_persist_created_total')).toBe(1);
    expect(await counterValue('synqdrive_rfrf_persist_rediscovered_total')).toBe(1);
    expect(await counterValue('synqdrive_rfrf_persist_skipped_flag_off_total')).toBe(1);
    expect(await counterValue('synqdrive_rfrf_candidate_errors_total')).toBe(1);
    expect(await counterValue('synqdrive_rfrf_branch_error_total')).toBe(1);
    expect(await counterValue('synqdrive_rfrf_non_finite_sample_exclusion_total')).toBe(2);
  });
});
