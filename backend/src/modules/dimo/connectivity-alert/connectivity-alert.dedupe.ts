import type {
  ConnectivityAlertDedupeParts,
  ConnectivityAlertType,
} from './connectivity-alert.types';

/** Canonical dedupe key for connectivity alerts. */
export function buildConnectivityAlertDedupeKey(
  parts: ConnectivityAlertDedupeParts,
): string {
  return [
    parts.organizationId,
    parts.vehicleId,
    parts.provider,
    parts.deviceBindingId ?? '-',
    parts.episodeId ?? '-',
    parts.alertType,
    parts.stateVersion ?? 1,
  ].join(':');
}

export function episodeConditionVariant(episodeId: string): string {
  return `episode:${episodeId}`;
}

export function buildEpisodeScopedConditionCode(
  baseConditionCode: string,
  episodeId: string,
): string {
  return `${baseConditionCode}:${episodeConditionVariant(episodeId)}`;
}

export function mapRecoverySourceToPolicy(
  source: string | undefined,
): 'plug_webhook' | 'snapshot_obd' | 'telemetry_resumed' | 'duplicate_recovery' {
  switch (source) {
    case 'plug_webhook':
    case 'explicit_plug_webhook':
      return 'plug_webhook';
    case 'telemetry_resumed':
      return 'telemetry_resumed';
    case 'duplicate_recovery':
      return 'duplicate_recovery';
    default:
      return 'snapshot_obd';
  }
}

export function alertTypeUsesEpisodeScope(
  alertType: ConnectivityAlertType,
): boolean {
  return (
    alertType === 'DEVICE_UNPLUGGED' || alertType === 'DEVICE_RECONNECTED'
  );
}
