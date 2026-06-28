import type {
  DeviceConnectionEventView,
  DeviceConnectionSeverity,
  DeviceConnectionStatus,
  DeviceConnectionSummary,
  DeviceConnectionWebhookStatus,
  FleetDeviceConnectionDto,
  TripDeviceConnectionEvidenceItem,
} from '../../lib/api';

export const DEVICE_CONNECTION_LABELS = {
  lteR1Connected: 'DIMO LTE_R1 verbunden',
  deviceUnplugged: 'DIMO-Gerät abgezogen',
  devicePluggedIn: 'DIMO-Gerät wieder eingesteckt',
  telematicsInterruption: 'Telematik-Unterbrechung',
  tamperHint: 'Manipulationshinweis',
  duringActiveBooking: 'Während aktiver Buchung',
  reconnected: 'Wieder verbunden',
  noOpenInterruption: 'Keine offene Unterbrechung',
  openInterruptionSince: 'Offene Telematik-Unterbrechung seit',
  snapshotObd: 'OBD-Snapshot (nicht Webhook)',
  webhookEvent: 'DIMO Vehicle Trigger',
  tripEvidenceTitle: 'Telematikgerät während Buchung getrennt',
  evidenceStatusOpen: 'Offen',
  evidenceStatusRecovered: 'Wieder verbunden',
} as const;

export function deviceConnectionStatusLabel(
  status: DeviceConnectionStatus,
): string {
  if (status === 'plugged') return DEVICE_CONNECTION_LABELS.reconnected;
  if (status === 'unplugged') return DEVICE_CONNECTION_LABELS.deviceUnplugged;
  return 'Unbekannt';
}

export function deviceConnectionSeverityTone(
  severity: DeviceConnectionSeverity | null | undefined,
): 'success' | 'warning' | 'critical' | 'info' | 'neutral' {
  if (severity === 'critical') return 'critical';
  if (severity === 'warning') return 'warning';
  if (severity === 'info') return 'success';
  return 'neutral';
}

export function deviceConnectionEventLabel(eventType: string): string {
  if (eventType === 'OBD_DEVICE_UNPLUGGED') {
    return DEVICE_CONNECTION_LABELS.deviceUnplugged;
  }
  if (eventType === 'OBD_DEVICE_PLUGGED_IN') {
    return DEVICE_CONNECTION_LABELS.devicePluggedIn;
  }
  return eventType;
}

export function webhookConfiguredLabel(
  status: DeviceConnectionWebhookStatus,
): string {
  if (status === 'active') return 'Webhook aktiv';
  if (status === 'not_configured') return 'Webhook nicht konfiguriert';
  return 'Webhook unbekannt';
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return '—';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours < 24) return rem > 0 ? `${hours} Std. ${rem} Min.` : `${hours} Std.`;
  const days = Math.floor(hours / 24);
  const hr = hours % 24;
  return hr > 0 ? `${days} T. ${hr} Std.` : `${days} T.`;
}

export function formatDeviceConnectionTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('de-DE');
  } catch {
    return iso;
  }
}

export function shouldShowVehicleDeviceConnection(
  summary: DeviceConnectionSummary | null | undefined,
): boolean {
  if (!summary) return false;
  return summary.lteR1Capable || summary.recentEvents.length > 0;
}

export function fleetDeviceUnpluggedViaWebhook(
  device: FleetDeviceConnectionDto | null | undefined,
): boolean {
  return (
    device?.eventSource === 'dimo_webhook' &&
    device.currentDeviceConnectionStatus === 'unplugged'
  );
}

export function summarizeFleetDeviceConnection(
  device: FleetDeviceConnectionDto | null | undefined,
): string {
  if (!device || device.eventSource !== 'dimo_webhook') {
    return 'Kein Webhook-Ereignis';
  }
  if (device.openUnpluggedEpisode) {
    return DEVICE_CONNECTION_LABELS.telematicsInterruption;
  }
  if (device.currentDeviceConnectionStatus === 'plugged') {
    return DEVICE_CONNECTION_LABELS.reconnected;
  }
  return deviceConnectionStatusLabel(device.currentDeviceConnectionStatus);
}

export function tripEvidenceHeadline(
  item: TripDeviceConnectionEvidenceItem,
): string {
  if (item.rentalRelevant) {
    return DEVICE_CONNECTION_LABELS.tripEvidenceTitle;
  }
  return DEVICE_CONNECTION_LABELS.deviceUnplugged;
}

export function tripEvidenceStatusLabel(
  status: TripDeviceConnectionEvidenceItem['evidenceStatus'],
): string {
  return status === 'recovered'
    ? DEVICE_CONNECTION_LABELS.evidenceStatusRecovered
    : DEVICE_CONNECTION_LABELS.evidenceStatusOpen;
}

export function sortDeviceConnectionEvents(
  events: DeviceConnectionEventView[],
): DeviceConnectionEventView[] {
  return [...events].sort(
    (a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime(),
  );
}
