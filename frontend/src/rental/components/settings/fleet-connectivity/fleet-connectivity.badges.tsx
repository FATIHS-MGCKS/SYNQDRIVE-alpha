import type { FleetConnectivityStatus } from '../../../../lib/api';
import { StatusChip } from '../../../../components/patterns';
import {
  connectionStatusLabel,
  connectionStatusTone,
  readinessLabel,
  readinessTone,
  signalStateLabel,
  signalStateTone,
} from './fleet-connectivity.utils';
import type {
  FleetConnectivityReadinessLevel,
  FleetConnectivitySignalState,
} from '../../../../lib/api';

export function ConnectionStatusChip({
  status,
}: {
  status: FleetConnectivityStatus;
}) {
  return (
    <StatusChip tone={connectionStatusTone(status)} dot={status === 'online'}>
      {connectionStatusLabel(status)}
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
    <StatusChip tone={readinessTone(level)} title="Telemetry readiness — data confidence, not vehicle health">
      {readinessLabel(level)} · {score}%
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
