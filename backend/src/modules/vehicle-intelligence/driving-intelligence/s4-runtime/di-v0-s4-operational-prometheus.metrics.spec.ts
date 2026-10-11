import { Registry } from 'prom-client';
import {
  DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1,
  type DiV0S4fObservabilitySnapshotV1,
} from '../s4f-observability/di-v0-s4f-observability-contract';
import { DI_V0_S4F_KEYSET_CURSOR_AUTHORITY } from '../s4f-observability/di-v0-s4f-keyset-cursor';
import { DI_V0_S4F_OPERATIONAL_AGGREGATE_INDEX_NOTES, DI_V0_S4F_OPERATIONAL_AGGREGATE_SCAN_KIND } from '../s4f-observability/di-v0-s4f-operational-aggregates';
import {
  computeDiV0S4ActivitySignal,
  computeDiV0S4ShadowPlaneEngaged,
  DI_V0_S4_OPERATIONAL_METRICS,
  markDiV0S4OperationalRefreshFailed,
  publishDiV0S4OperationalPrometheusMetrics,
  registerDiV0S4OperationalPrometheusMetrics,
  resetDiV0S4OperationalPrometheusMetrics,
  sumInFlightShadowWorkItems,
} from './di-v0-s4-operational-prometheus.metrics';

function emptySnapshot(): DiV0S4fObservabilitySnapshotV1 {
  return {
    contractVersion: DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1,
    s4aContractVersion: 'test',
    observedAt: new Date().toISOString(),
    timeAuthority: 'DB_CLOCK_TIMESTAMP',
    organizationScope: 'ALL',
    reconciliation: {
      readOnly: true,
      diagnosticReconciliation: {
        bounded: true,
        cursorAuthority: DI_V0_S4F_KEYSET_CURSOR_AUTHORITY,
        scanWatermarkCreatedAt: null,
        partial: false,
      },
      operationalAggregates: {
        bounded: false,
        scanKind: DI_V0_S4F_OPERATIONAL_AGGREGATE_SCAN_KIND,
        indexNotes: DI_V0_S4F_OPERATIONAL_AGGREGATE_INDEX_NOTES,
      },
    },
    operational: {
      workLifecycle: {
        PENDING: 1,
        LEASED: 0,
        FAILED_RETRYABLE: 0,
        FAILED_TERMINAL: 2,
        SUPERSEDED: 0,
        COMPLETED: 0,
        SKIPPED_INELIGIBLE: 0,
      },
      leaseHealth: {
        expiredLeasedCount: 3,
        activeLeasedCount: 0,
        retryableDueClaimableCount: 0,
        retryableFutureCount: 0,
        t10ExhaustedCandidateCount: 1,
        oldestPendingAgeSeconds: 10,
        oldestRetryableDueAgeSeconds: null,
      },
      pipelineHealth: {
        activeRegistryCount: 0,
        retiredRegistryCount: 0,
        retiredNonterminalWorkCount: 0,
        retiredPendingPrimaryClassAViolationCount: 0,
        retiredValidUnexpiredLeasedCount: 0,
        retiredExpiredLeasedT12EligibleCount: 0,
        retiredNonterminalProvenanceUnknownCount: 0,
      },
      evidenceStorage: {
        snapshotCount: 0,
        totalCompressedBytes: 0,
        totalUncompressedBytes: 0,
        retentionDueCount: 0,
        oldestSnapshotAgeSeconds: null,
        workItemsWithPinCount: 0,
        pinRequiredButMissingCount: 2,
      },
      beyondHorizon: {
        beyondDriftHorizonBoundaryMismatchCount: 0,
        beyondDriftHorizonScopeCorruptionCount: 0,
        beyondHorizonScannedCount: 0,
        cursor: { scanWatermarkCreatedAt: null, settlementAnchorAt: null, workItemId: null },
      },
      executorLiveness: {
        signal: 'NO_EXECUTOR_REGISTERED',
        localExecutorReady: false,
        activePipelineCount: 0,
        globalExecutorLivenessAuthorityPresent: false,
      },
      controlPlane: { readability: 'READABLE', killState: 'KILLED', killReason: 'DB_KILL_ACTIVE' },
    },
    anomalySamples: {},
  };
}

describe('DiV0S4 operational Prometheus metrics', () => {
  it('publishes low-cardinality gauges from reconciliation snapshot', async () => {
    const registry = new Registry();
    const handles = registerDiV0S4OperationalPrometheusMetrics(registry);
    publishDiV0S4OperationalPrometheusMetrics(handles, emptySnapshot(), 4, false, 1_700_000_000);

    const text = await registry.metrics();
    expect(text).toContain(DI_V0_S4_OPERATIONAL_METRICS.globalNotKilled);
    expect(text).toContain(`${DI_V0_S4_OPERATIONAL_METRICS.workItems}{status="FAILED_TERMINAL"} 2`);
    expect(text).toContain(`${DI_V0_S4_OPERATIONAL_METRICS.expiredLeased} 3`);
    expect(text).toContain(`${DI_V0_S4_OPERATIONAL_METRICS.allowlistViolation} 4`);
    expect(text).toContain(`${DI_V0_S4_OPERATIONAL_METRICS.activitySignal} 1`);
    expect(text).toContain(`${DI_V0_S4_OPERATIONAL_METRICS.lastSuccessUnixtime} 1700000000`);
    expect(text).not.toMatch(/vehicle_id=/);
  });

  it('shadow plane engaged stays 0 when KILLED with no in-flight work (dormant staged config)', () => {
    expect(computeDiV0S4ShadowPlaneEngaged(true, 'KILLED', 0)).toBe(0);
    expect(computeDiV0S4ShadowPlaneEngaged(true, 'NOT_KILLED', 0)).toBe(1);
    expect(computeDiV0S4ActivitySignal(true, 'KILLED', 0)).toBe(0);
  });

  it('COMPLETED history alone does not engage shadow plane while KILLED', () => {
    const snapshot = emptySnapshot();
    snapshot.operational.workLifecycle = {
      PENDING: 0,
      LEASED: 0,
      FAILED_RETRYABLE: 0,
      FAILED_TERMINAL: 0,
      SUPERSEDED: 0,
      COMPLETED: 99,
      SKIPPED_INELIGIBLE: 0,
    };
    expect(sumInFlightShadowWorkItems(snapshot)).toBe(0);
    expect(computeDiV0S4ShadowPlaneEngaged(true, 'KILLED', sumInFlightShadowWorkItems(snapshot))).toBe(0);
  });

  it('retains shadow_plane_engaged on refresh failure so stale alert is not self-suppressed', async () => {
    const registry = new Registry();
    const handles = registerDiV0S4OperationalPrometheusMetrics(registry);
    publishDiV0S4OperationalPrometheusMetrics(handles, emptySnapshot(), 1, true, 1_700_000_000);
    markDiV0S4OperationalRefreshFailed(handles, 1);
    const text = await registry.metrics();
    expect(text).toContain(`${DI_V0_S4_OPERATIONAL_METRICS.shadowPlaneEngaged} 1`);
    expect(text).toContain(`${DI_V0_S4_OPERATIONAL_METRICS.refreshError} 1`);
    expect(text).toContain(`${DI_V0_S4_OPERATIONAL_METRICS.activitySignal} 1`);
    expect(text).toContain(`${DI_V0_S4_OPERATIONAL_METRICS.lastSuccessUnixtime} 0`);
    publishDiV0S4OperationalPrometheusMetrics(handles, emptySnapshot(), 1, true, 1_700_000_100);
    const recovered = await registry.metrics();
    expect(recovered).toContain(`${DI_V0_S4_OPERATIONAL_METRICS.refreshError} 0`);
    expect(recovered).toContain(`${DI_V0_S4_OPERATIONAL_METRICS.lastSuccessUnixtime} 1700000100`);
  });

  it('clears follower gauges on reset', async () => {
    const registry = new Registry();
    const handles = registerDiV0S4OperationalPrometheusMetrics(registry);
    publishDiV0S4OperationalPrometheusMetrics(handles, emptySnapshot(), 1, true, 100);
    resetDiV0S4OperationalPrometheusMetrics(handles);
    const text = await registry.metrics();
    expect(text).toContain(`${DI_V0_S4_OPERATIONAL_METRICS.activitySignal} 0`);
    expect(text).toContain(`${DI_V0_S4_OPERATIONAL_METRICS.lastSuccessUnixtime} 0`);
  });
});
