import type {
  FleetConnectivityStatus,
  FleetDataCoverageState,
  FleetDeviceConnectionDto,
  VehicleConnectivityRuntimeState,
} from '../../../lib/api';
import { StatusChip } from '../../../components/patterns';
import {
  connectionStatusLabel,
  connectionStatusTone,
  connectivityRuntimeTone,
  coverageStateLabel,
  coverageStateTone,
  deviceConnectionSeverityTone,
  overallConnectivityLabel,
  readinessLabel,
  readinessTone,
  signalStateLabel,
  signalStateTone,
} from './fleet-connectivity.utils';
import type {
  FleetConnectivityReadinessLevel,
  FleetConnectivitySignalState,
} from '../../../lib/api';

export function ConnectionStatusChip({
  status,
  runtime,
}: {
  status?: FleetConnectivityStatus;
  runtime?: VehicleConnectivityRuntimeState;
}) {
  if (runtime) {
    return (
      <StatusChip
        tone={connectivityRuntimeTone(runtime)}
        dot={runtime.overallState === 'TELEMETRY_ACTIVE'}
      >
        {overallConnectivityLabel(runtime.overallState)}
      </StatusChip>
    );
  }
  return (
    <StatusChip tone={connectionStatusTone(status!)} dot={status === 'online'}>
      {connectionStatusLabel(status!)}
    </StatusChip>
  );
}

/** Canonical connectivity dimension chip — replaces split OBD/webhook derivation. */
export function ConnectivityRuntimeChip({
  runtime,
}: {
  runtime: VehicleConnectivityRuntimeState;
}) {
  const physical =
    runtime.physicalDeviceState === 'UNPLUGGED_CONFIRMED'
      ? 'Unplugged'
      : runtime.physicalDeviceState === 'NOT_APPLICABLE'
        ? 'OEM'
        : runtime.physicalDeviceState === 'PLUGGED_CONFIRMED' ||
            runtime.physicalDeviceState === 'PLUGGED_INFERRED'
          ? 'Plugged'
          : 'Unknown';

  return (
    <StatusChip
      tone={connectivityRuntimeTone(runtime)}
      title={`${runtime.overallState} · ${runtime.physicalDeviceState} · ${runtime.recommendedAction}`}
    >
      {overallConnectivityLabel(runtime.overallState)} · {physical}
    </StatusChip>
  );
}

export function ReadinessChip({
  level,
  score,
}: {
  level: FleetConnectivityReadinessLevel;
  score: number;
}) {
  return (
    <StatusChip tone={readinessTone(level)} title="Deprecated readiness alias — use data coverage state">
      {readinessLabel(level)} · {score}%
    </StatusChip>
  );
}

export function CoverageStateChip({
  state,
  freshCount,
  expectedCount,
}: {
  state: FleetDataCoverageState;
  freshCount?: number;
  expectedCount?: number;
}) {
  const detail =
    freshCount != null && expectedCount != null && expectedCount > 0
      ? `${freshCount}/${expectedCount} fresh expected signals`
      : 'Capability-aware data coverage — freshness of expected signals';
  return (
    <StatusChip tone={coverageStateTone(state)} title={detail}>
      {coverageStateLabel(state)}
    </StatusChip>
  );
}

export function SignalStateChip({ state }: { state: FleetConnectivitySignalState }) {
  return (
    <StatusChip tone={signalStateTone(state)} className="text-[10px]">
      {signalStateLabel(state)}
    </StatusChip>
  );
}

export function ObdRowChip({ plugged }: { plugged: boolean | null | undefined }) {
  if (plugged === true) {
    return <StatusChip tone="success">Plugged in</StatusChip>;
  }
  if (plugged === false) {
    return <StatusChip tone="critical">Unplugged</StatusChip>;
  }
  return <StatusChip tone="noData">No data</StatusChip>;
}

export function JammingSnapshotChip({ count }: { count: number }) {
  if (count > 0) {
    return <StatusChip tone="watch">Snapshot · {count}</StatusChip>;
  }
  return <StatusChip tone="neutral">None</StatusChip>;
}

export function DeviceConnectionWebhookChip({
  device,
}: {
  device: FleetDeviceConnectionDto | null | undefined;
}) {
  if (!device || device.eventSource !== 'dimo_webhook') {
    return <StatusChip tone="noData">No webhook</StatusChip>;
  }
  if (device.openUnpluggedEpisode) {
    return (
      <StatusChip tone={deviceConnectionSeverityTone(device)} title="Explicit DIMO Vehicle Trigger — not offline/stale">
        Unplugged · Webhook
      </StatusChip>
    );
  }
  if (device.currentDeviceConnectionStatus === 'plugged') {
    return (
      <StatusChip tone="success" title="Recovery via DIMO Vehicle Trigger">
        Plugged · Webhook
      </StatusChip>
    );
  }
  return <StatusChip tone="neutral">Webhook</StatusChip>;
}
