import type {
  FleetConnectivityReadinessLevel,
  FleetConnectivitySignalState,
  FleetConnectivityStatus,
  FleetConnectivityVehicle,
  FleetDeviceConnectionDto,
} from '../../../../lib/api';
import type { StatusTone } from '../../../../components/patterns/status-utils';

export type FleetConnectionScopeFilter = 'all' | FleetConnectivityStatus | 'connected';
export type FleetReadinessFilter = 'all' | FleetConnectivityReadinessLevel;
export type FleetSignalFilter =
  | 'all'
  | 'obd_unplugged'
  | 'device_unplugged_webhook'
  | 'jamming'
  | 'missing_gps'
  | 'missing_odometer';

export const SIGNAL_MATRIX_LABELS: Record<
  keyof FleetConnectivityVehicle['signals'],
  string
> = {
  gps: 'GPS',
  odometer: 'Odometer',
  speed: 'Speed',
  fuel: 'Fuel',
  evSoc: 'EV SoC',
  dtc: 'DTC',
  obdPlug: 'OBD Plug',
  jamming: 'Jamming',
};

export function connectionStatusTone(
  status: FleetConnectivityStatus,
): StatusTone {
  if (status === 'online') return 'success';
  if (status === 'standby') return 'watch';
  if (status === 'offline') return 'critical';
  return 'noData';
}

export function connectionStatusLabel(status: FleetConnectivityStatus): string {
  switch (status) {
    case 'online':
      return 'Online';
    case 'standby':
      return 'Standby';
    case 'offline':
      return 'Offline';
    default:
      return 'Not Connected';
  }
}

export function readinessTone(level: FleetConnectivityReadinessLevel): StatusTone {
  switch (level) {
    case 'good':
      return 'success';
    case 'watch':
      return 'watch';
    case 'warning':
      return 'warning';
    default:
      return 'noData';
  }
}

export function readinessLabel(level: FleetConnectivityReadinessLevel): string {
  switch (level) {
    case 'good':
      return 'Good';
    case 'watch':
      return 'Watch';
    case 'warning':
      return 'Warning';
    default:
      return 'No data';
  }
}

export function signalStateTone(state: FleetConnectivitySignalState): StatusTone {
  if (state === 'available') return 'success';
  if (state === 'missing') return 'watch';
  return 'neutral';
}

export function signalStateLabel(state: FleetConnectivitySignalState): string {
  if (state === 'available') return 'Available';
  if (state === 'missing') return 'Missing';
  return 'Unknown';
}

export function obdPlugDisplay(plugged: boolean | null | undefined): {
  text: string;
  tone: StatusTone;
} {
  if (plugged === true) {
    return { text: 'OBD Device Plugged IN', tone: 'success' };
  }
  if (plugged === false) {
    return { text: 'OBD Device NOT plugged in', tone: 'critical' };
  }
  return { text: 'OBD plug-in: no snapshot data', tone: 'noData' };
}

export function jammingSnapshotSummary(
  count: number,
  jammingSignal: FleetConnectivitySignalState,
): string {
  if (count > 0) {
    return 'Possible jamming detected in latest telemetry snapshot';
  }
  if (jammingSignal !== 'unknown') {
    return 'No jamming indication in latest snapshot';
  }
  return 'No jamming snapshot data';
}

export function maskedIdentity(value: string | null | undefined): string {
  return value?.trim() ? value : '—';
}

export function vehicleSearchHaystack(v: FleetConnectivityVehicle): string {
  return [
    v.vin,
    v.licensePlate,
    v.make,
    v.model,
    v.station,
    v.maskedDeviceSerial,
    v.maskedDimoTokenId,
    v.maskedSyntheticTokenId,
    v.deviceSerial,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function filterFleetConnectivityVehicles(
  vehicles: FleetConnectivityVehicle[],
  opts: {
    search: string;
    statusFilter: FleetConnectionScopeFilter;
    readinessFilter: FleetReadinessFilter;
    signalFilter: FleetSignalFilter;
  },
): FleetConnectivityVehicle[] {
  const q = opts.search.trim().toLowerCase();
  return vehicles.filter((v) => {
    if (opts.statusFilter === 'connected') {
      if (v.connectionStatus === 'not_connected') return false;
    } else if (
      opts.statusFilter !== 'all' &&
      v.connectionStatus !== opts.statusFilter
    ) {
      return false;
    }

    if (
      opts.readinessFilter !== 'all' &&
      v.readinessLevel !== opts.readinessFilter
    ) {
      return false;
    }

    if (opts.signalFilter === 'obd_unplugged' && v.obdIsPluggedIn !== false) {
      return false;
    }
    if (
      opts.signalFilter === 'device_unplugged_webhook' &&
      !(v.deviceConnection?.eventSource === 'dimo_webhook' && v.deviceConnection.openUnpluggedEpisode)
    ) {
      return false;
    }
    if (opts.signalFilter === 'jamming' && v.jammingDetectedCount <= 0) {
      return false;
    }
    if (opts.signalFilter === 'missing_gps' && v.signals.gps !== 'missing') {
      return false;
    }
    if (
      opts.signalFilter === 'missing_odometer' &&
      v.signals.odometer !== 'missing'
    ) {
      return false;
    }

    if (q && !vehicleSearchHaystack(v).includes(q)) return false;
    return true;
  });
}

export function hasActiveFleetFilters(opts: {
  search: string;
  statusFilter: FleetConnectionScopeFilter;
  readinessFilter: FleetReadinessFilter;
  signalFilter: FleetSignalFilter;
}): boolean {
  return (
    opts.search.trim().length > 0 ||
    opts.statusFilter !== 'all' ||
    opts.readinessFilter !== 'all' ||
    opts.signalFilter !== 'all'
  );
}

export function deviceConnectionSeverityTone(
  device: FleetDeviceConnectionDto | null | undefined,
): 'success' | 'warning' | 'critical' | 'neutral' {
  if (!device || device.eventSource !== 'dimo_webhook') return 'neutral';
  if (device.severity === 'critical') return 'critical';
  if (device.severity === 'warning') return 'warning';
  if (device.severity === 'info') return 'success';
  return 'neutral';
}

export function deviceConnectionRowLabel(
  device: FleetDeviceConnectionDto | null | undefined,
): string {
  if (!device || device.eventSource !== 'dimo_webhook') return '—';
  if (device.openUnpluggedEpisode) return 'Unplugged (Webhook)';
  if (device.currentDeviceConnectionStatus === 'plugged') return 'Plugged (Webhook)';
  return 'Webhook';
}

/** Guardrail: ensure no write-action labels appear in this read-only surface. */
export const FORBIDDEN_FLEET_CONNECTIVITY_ACTIONS = [
  'connect',
  'remap',
  'unlink',
  'sync',
  'refresh snapshot',
  'create task',
  'pair',
] as const;
