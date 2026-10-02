import { Registry } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { PhysicalRefuelReconciliationMetricsService } from './physical-refuel-reconciliation-metrics.service';
import { mapRepositoryBacklogToRecoveryReasons } from './physical-refuel-reconciliation-metrics.types';

describe('PhysicalRefuelReconciliationMetricsService', () => {
  let registry: Registry;
  let metrics: PhysicalRefuelReconciliationMetricsService;

  beforeEach(() => {
    registry = new Registry();
    metrics = new PhysicalRefuelReconciliationMetricsService({
      registry,
    } as TripMetricsService);
  });

  async function gaugeValue(name: string, labels?: Record<string, string>) {
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

  async function counterValue(name: string, labels?: Record<string, string>) {
    return gaugeValue(name, labels);
  }

  it('registers F8 metric names on the shared registry', async () => {
    metrics.setRecoveryEnabled(true);
    metrics.setRecoveryBacklog({
      orphan_refuel: 1,
      settlement_due: 0,
      stale_enrichment: 0,
      lost_enqueue: 0,
      coordinate_initial: 0,
      coordinate_retry: 0,
    });
    metrics.recordRecoveryRun('success');

    const text = await registry.metrics();
    expect(text).toContain('synqdrive_physical_refuel_recovery_backlog');
    expect(text).toContain('synqdrive_physical_refuel_recovery_enabled');
    expect(text).toContain('synqdrive_physical_refuel_recovery_runs_total');
    expect(text).toContain('synqdrive_physical_refuel_recovery_last_success_unixtime');
    expect(text).toContain('synqdrive_physical_refuel_recovery_recovered_total');
  });

  it('resets all bounded backlog reason gauges including zero', async () => {
    metrics.setRecoveryBacklogFromRepository({
      orphanRefuels: 3,
      reconciliationDue: 2,
      staleEnrichment: 1,
      lostEnqueuePending: 0,
      coordinateInitialDue: 0,
      coordinateRetryDue: 0,
    });
    expect(await gaugeValue('synqdrive_physical_refuel_recovery_backlog', { reason: 'orphan_refuel' })).toBe(3);
    expect(await gaugeValue('synqdrive_physical_refuel_recovery_backlog', { reason: 'settlement_due' })).toBe(2);

    metrics.setRecoveryBacklogFromRepository({
      orphanRefuels: 0,
      reconciliationDue: 0,
      staleEnrichment: 0,
      lostEnqueuePending: 0,
      coordinateInitialDue: 0,
      coordinateRetryDue: 0,
    });
    expect(await gaugeValue('synqdrive_physical_refuel_recovery_backlog', { reason: 'orphan_refuel' })).toBe(0);
    expect(await gaugeValue('synqdrive_physical_refuel_recovery_backlog', { reason: 'settlement_due' })).toBe(0);
  });

  it('records scheduler-owned run outcomes exactly once per call', async () => {
    metrics.recordRecoveryRun('success');
    metrics.recordRecoveryRun('failure');
    metrics.recordRecoveryRun('overlap_skipped');

    expect(await counterValue('synqdrive_physical_refuel_recovery_runs_total', { result: 'success' })).toBe(1);
    expect(await counterValue('synqdrive_physical_refuel_recovery_runs_total', { result: 'failure' })).toBe(1);
    expect(await counterValue('synqdrive_physical_refuel_recovery_runs_total', { result: 'overlap_skipped' })).toBe(1);
    expect(await gaugeValue('synqdrive_physical_refuel_recovery_last_success_unixtime')).toBeGreaterThan(0);
  });

  it('does not advance last success on failure', async () => {
    const before = await gaugeValue('synqdrive_physical_refuel_recovery_last_success_unixtime');
    metrics.recordRecoveryRun('failure');
    expect(await gaugeValue('synqdrive_physical_refuel_recovery_last_success_unixtime')).toBe(before);
  });

  it('F8.1 initializes last-success series to semantic zero at lifecycle', async () => {
    metrics.initializeRecoverySchedulerObservability();
    expect(await gaugeValue('synqdrive_physical_refuel_recovery_last_success_unixtime')).toBe(0);
  });

  it('maps repository backlog keys to bounded reason labels', () => {
    expect(
      mapRepositoryBacklogToRecoveryReasons({
        orphanRefuels: 4,
        reconciliationDue: 1,
        staleEnrichment: 2,
        lostEnqueuePending: 3,
        coordinateInitialDue: 5,
        coordinateRetryDue: 6,
      }),
    ).toEqual({
      orphan_refuel: 4,
      settlement_due: 1,
      stale_enrichment: 2,
      lost_enqueue: 3,
      coordinate_initial: 5,
      coordinate_retry: 6,
    });
  });
});
