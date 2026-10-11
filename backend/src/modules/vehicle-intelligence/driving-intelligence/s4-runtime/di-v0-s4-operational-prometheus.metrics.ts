import type { Registry } from 'prom-client';
import { Gauge } from 'prom-client';
import type { DiV0S4fObservabilitySnapshotV1 } from '../s4f-observability/di-v0-s4f-observability-contract';

export const DI_V0_S4_OPERATIONAL_METRICS = {
  globalNotKilled: 'synqdrive_di_v0_s4_global_not_killed',
  workItems: 'synqdrive_di_v0_s4_work_items',
  expiredLeased: 'synqdrive_di_v0_s4_expired_leased_work_items',
  attemptsExhausted: 'synqdrive_di_v0_s4_attempts_exhausted_work_items',
  allowlistViolation: 'synqdrive_di_v0_s4_allowlist_violation_work_items',
  pinRequiredMissing: 'synqdrive_di_v0_s4_pin_required_missing_work_items',
  controlPlaneReadable: 'synqdrive_di_v0_s4_control_plane_readable',
  activitySignal: 'synqdrive_di_v0_s4_activity_signal',
  shadowPlaneEngaged: 'synqdrive_di_v0_s4_shadow_plane_engaged',
  refreshLeader: 'synqdrive_di_v0_s4_operational_refresh_leader',
  lastSuccessUnixtime: 'synqdrive_di_v0_s4_operational_last_success_unixtime',
  refreshError: 'synqdrive_di_v0_s4_operational_refresh_error',
} as const;

/** Prometheus alert staleness threshold (seconds) — must exceed refresh interval + scrape slack. */
export const DI_V0_S4_OPERATIONAL_REFRESH_INTERVAL_SECONDS = 60;
export const DI_V0_S4_OPERATIONAL_STALE_AFTER_SECONDS = 180;

export interface DiV0S4OperationalPrometheusHandles {
  globalNotKilled: Gauge<string>;
  workItems: Gauge<'status'>;
  expiredLeased: Gauge<string>;
  attemptsExhausted: Gauge<string>;
  allowlistViolation: Gauge<string>;
  pinRequiredMissing: Gauge<string>;
  controlPlaneReadable: Gauge<string>;
  activitySignal: Gauge<string>;
  shadowPlaneEngaged: Gauge<string>;
  refreshLeader: Gauge<string>;
  lastSuccessUnixtime: Gauge<string>;
  refreshError: Gauge<string>;
}

export function registerDiV0S4OperationalPrometheusMetrics(registry: Registry): DiV0S4OperationalPrometheusHandles {
  return {
    globalNotKilled: new Gauge({
      name: DI_V0_S4_OPERATIONAL_METRICS.globalNotKilled,
      help: '1 when di_v0_s4_control GLOBAL is NOT_KILLED, else 0',
      registers: [registry],
    }),
    workItems: new Gauge({
      name: DI_V0_S4_OPERATIONAL_METRICS.workItems,
      help: 'DI V0 S4 work item counts by lifecycle status (fleet-wide aggregate)',
      labelNames: ['status'],
      registers: [registry],
    }),
    expiredLeased: new Gauge({
      name: DI_V0_S4_OPERATIONAL_METRICS.expiredLeased,
      help: 'Work items in LEASED status with expired lease (clock_timestamp)',
      registers: [registry],
    }),
    attemptsExhausted: new Gauge({
      name: DI_V0_S4_OPERATIONAL_METRICS.attemptsExhausted,
      help: 'Leased work items at or beyond max attempt count with expired lease',
      registers: [registry],
    }),
    allowlistViolation: new Gauge({
      name: DI_V0_S4_OPERATIONAL_METRICS.allowlistViolation,
      help: 'Work items outside configured DI_V0_S4 org/vehicle allowlists (0 when allowlists empty)',
      registers: [registry],
    }),
    pinRequiredMissing: new Gauge({
      name: DI_V0_S4_OPERATIONAL_METRICS.pinRequiredMissing,
      help: 'Work items missing required evidence pin state',
      registers: [registry],
    }),
    controlPlaneReadable: new Gauge({
      name: DI_V0_S4_OPERATIONAL_METRICS.controlPlaneReadable,
      help: '1 when di_v0_s4_control GLOBAL row is readable, else 0',
      registers: [registry],
    }),
    activitySignal: new Gauge({
      name: DI_V0_S4_OPERATIONAL_METRICS.activitySignal,
      help: '1 when S4 shadow plane requires operational monitoring (mirrors shadow_plane_engaged on success)',
      registers: [registry],
    }),
    shadowPlaneEngaged: new Gauge({
      name: DI_V0_S4_OPERATIONAL_METRICS.shadowPlaneEngaged,
      help: '1 while shadow plane is engaged; retained across refresh failures until a successful refresh clears it',
      registers: [registry],
    }),
    refreshLeader: new Gauge({
      name: DI_V0_S4_OPERATIONAL_METRICS.refreshLeader,
      help: '1 on the scheduler leader replica publishing operational metrics, else 0',
      registers: [registry],
    }),
    lastSuccessUnixtime: new Gauge({
      name: DI_V0_S4_OPERATIONAL_METRICS.lastSuccessUnixtime,
      help: 'Unix time of last successful leader operational metrics refresh (0 when not leader or never succeeded)',
      registers: [registry],
    }),
    refreshError: new Gauge({
      name: DI_V0_S4_OPERATIONAL_METRICS.refreshError,
      help: '1 when the last leader refresh attempt failed, else 0',
      registers: [registry],
    }),
  };
}

/** In-flight / actionable work only — terminal history must not keep a KILLED plane "active". */
export function sumInFlightShadowWorkItems(snapshot: DiV0S4fObservabilitySnapshotV1): number {
  const wl = snapshot.operational.workLifecycle;
  return wl.PENDING + wl.LEASED + wl.FAILED_RETRYABLE + wl.FAILED_TERMINAL;
}

/**
 * Dormant when GLOBAL_KILL=KILLED and no in-flight shadow work.
 * Staged config alone does not engage monitoring while KILLED.
 * NOT_KILLED + staged is normal authorized pilot — not an incident signal.
 */
export function computeDiV0S4ShadowPlaneEngaged(
  runtimeAttestationStaged: boolean,
  killState: 'KILLED' | 'NOT_KILLED' | 'UNKNOWN',
  inFlightWorkItemCount: number,
): number {
  if (inFlightWorkItemCount > 0) return 1;
  if (killState !== 'NOT_KILLED') return 0;
  return runtimeAttestationStaged ? 1 : 0;
}

/** @deprecated alias for tests — use computeDiV0S4ShadowPlaneEngaged */
export function computeDiV0S4ActivitySignal(
  runtimeAttestationStaged: boolean,
  killState: 'KILLED' | 'NOT_KILLED' | 'UNKNOWN',
  inFlightOrLegacySum: number,
): number {
  return computeDiV0S4ShadowPlaneEngaged(runtimeAttestationStaged, killState, inFlightOrLegacySum);
}

export function resetDiV0S4OperationalPrometheusMetrics(handles: DiV0S4OperationalPrometheusHandles): void {
  clearOperationalAggregateGauges(handles);
  handles.activitySignal.set(0);
  handles.shadowPlaneEngaged.set(0);
  handles.refreshLeader.set(0);
  handles.lastSuccessUnixtime.set(0);
  handles.refreshError.set(0);
}

function clearOperationalAggregateGauges(handles: DiV0S4OperationalPrometheusHandles): void {
  handles.globalNotKilled.set(0);
  handles.controlPlaneReadable.set(0);
  handles.workItems.reset();
  handles.expiredLeased.set(0);
  handles.attemptsExhausted.set(0);
  handles.pinRequiredMissing.set(0);
  handles.allowlistViolation.set(0);
}

export function publishDiV0S4OperationalPrometheusMetrics(
  handles: DiV0S4OperationalPrometheusHandles,
  snapshot: DiV0S4fObservabilitySnapshotV1,
  allowlistViolationCount: number,
  runtimeAttestationStaged: boolean,
  refreshUnixtime: number,
): number {
  const cp = snapshot.operational.controlPlane;
  handles.globalNotKilled.set(cp.killState === 'NOT_KILLED' ? 1 : 0);
  handles.controlPlaneReadable.set(cp.readability === 'READABLE' ? 1 : 0);

  handles.workItems.reset();
  for (const [status, value] of Object.entries(snapshot.operational.workLifecycle)) {
    handles.workItems.labels({ status }).set(value);
  }

  handles.expiredLeased.set(snapshot.operational.leaseHealth.expiredLeasedCount);
  handles.attemptsExhausted.set(snapshot.operational.leaseHealth.t10ExhaustedCandidateCount);
  handles.pinRequiredMissing.set(snapshot.operational.evidenceStorage.pinRequiredButMissingCount);
  handles.allowlistViolation.set(allowlistViolationCount);

  const engaged = computeDiV0S4ShadowPlaneEngaged(
    runtimeAttestationStaged,
    cp.killState,
    sumInFlightShadowWorkItems(snapshot),
  );
  handles.activitySignal.set(engaged);
  handles.shadowPlaneEngaged.set(engaged);

  handles.refreshLeader.set(1);
  handles.lastSuccessUnixtime.set(refreshUnixtime);
  handles.refreshError.set(0);
  return engaged;
}

/** Clears aggregate gauges but retains shadow_plane_engaged so stale/failure alerts can still fire. */
export function markDiV0S4OperationalRefreshFailed(
  handles: DiV0S4OperationalPrometheusHandles,
  retainedShadowPlaneEngaged: number,
): void {
  clearOperationalAggregateGauges(handles);
  handles.refreshLeader.set(1);
  handles.refreshError.set(1);
  handles.lastSuccessUnixtime.set(0);
  handles.activitySignal.set(retainedShadowPlaneEngaged);
  handles.shadowPlaneEngaged.set(retainedShadowPlaneEngaged);
}
