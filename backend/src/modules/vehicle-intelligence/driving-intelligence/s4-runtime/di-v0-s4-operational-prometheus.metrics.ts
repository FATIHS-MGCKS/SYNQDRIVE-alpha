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
} as const;

export interface DiV0S4OperationalPrometheusHandles {
  globalNotKilled: Gauge<string>;
  workItems: Gauge<'status'>;
  expiredLeased: Gauge<string>;
  attemptsExhausted: Gauge<string>;
  allowlistViolation: Gauge<string>;
  pinRequiredMissing: Gauge<string>;
  controlPlaneReadable: Gauge<string>;
  activitySignal: Gauge<string>;
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
      help: '1 when S4 shadow plane shows staged config or any work items exist (gates alert noise)',
      registers: [registry],
    }),
  };
}

function sumWorkItems(snapshot: DiV0S4fObservabilitySnapshotV1): number {
  const wl = snapshot.operational.workLifecycle;
  return (
    wl.PENDING +
    wl.LEASED +
    wl.FAILED_RETRYABLE +
    wl.FAILED_TERMINAL +
    wl.SUPERSEDED +
    wl.COMPLETED +
    wl.SKIPPED_INELIGIBLE
  );
}

export function publishDiV0S4OperationalPrometheusMetrics(
  handles: DiV0S4OperationalPrometheusHandles,
  snapshot: DiV0S4fObservabilitySnapshotV1,
  allowlistViolationCount: number,
  runtimeAttestationStaged: boolean,
): void {
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

  const activity = runtimeAttestationStaged || sumWorkItems(snapshot) > 0 ? 1 : 0;
  handles.activitySignal.set(activity);
}
