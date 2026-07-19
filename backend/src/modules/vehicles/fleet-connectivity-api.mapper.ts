import type { ConnectivityReasonCode } from './connectivity/domain/connectivity-domain.types';
import type { FleetDeviceConnectionDto, FleetConnectivityVehicleDto } from './fleet-connectivity.types';
import type {
  FleetConnectivityCapabilitySignalDto,
  FleetConnectivityDetailDto,
  FleetConnectivityKpiSummaryDto,
  FleetConnectivityListItemDto,
  FleetConnectivityTimelineEventDto,
  FleetConnectivityTimelineEventType,
} from './fleet-connectivity-api.types';

const SIGNAL_KEYS = [
  'gps',
  'odometer',
  'speed',
  'fuel',
  'evSoc',
  'dtc',
] as const;

export function computeConnectivitySortPriority(
  overallState: FleetConnectivityListItemDto['overallState'],
  attentionState: FleetConnectivityListItemDto['attentionState'],
): number {
  if (attentionState === 'CRITICAL' || overallState === 'DEVICE_UNPLUGGED') return 10;
  if (attentionState === 'ACTION_REQUIRED' || overallState === 'AUTHORIZATION_REQUIRED') {
    return 20;
  }
  if (overallState === 'INTEGRATION_ERROR') return 25;
  if (overallState === 'OFFLINE') return 30;
  if (overallState === 'SOFT_OFFLINE') return 40;
  if (overallState === 'UNKNOWN') return 50;
  if (overallState === 'NO_ACTIVE_DATA_SOURCE') return 55;
  if (overallState === 'STANDBY') return 60;
  if (overallState === 'TELEMETRY_ACTIVE') return 70;
  return 80;
}

export function pickPrimaryReasonCode(
  reasonCodes: ConnectivityReasonCode[],
): ConnectivityReasonCode | null {
  const priority: ConnectivityReasonCode[] = [
    'DEVICE_UNPLUG_WEBHOOK',
    'TELEMETRY_OFFLINE',
    'TELEMETRY_SOFT_OFFLINE',
    'AUTHORIZATION_EXPIRED',
    'CONSENT_MISSING',
    'PROVIDER_REVOKED',
    'PROVIDER_ERROR',
    'DATA_COVERAGE_INSUFFICIENT',
    'DATA_COVERAGE_PARTIAL',
    'DEVICE_BINDING_CHANGED',
    'NO_TELEMETRY_TIMESTAMP',
    'TELEMETRY_STANDBY',
    'TELEMETRY_FRESH',
  ];
  for (const code of priority) {
    if (reasonCodes.includes(code)) return code;
  }
  return reasonCodes[0] ?? null;
}

function mapDeviceKind(connectionType: string): string {
  if (connectionType === 'Aftermarket Device') return 'aftermarket_obd';
  if (connectionType === 'Synthetic Device') return 'software';
  if (connectionType === 'DIMO') return 'factory_linked';
  return 'none';
}

function mapSignalFreshness(
  availability: 'available' | 'missing' | 'unknown',
  telemetryFresh: FleetConnectivityVehicleDto['telemetryFreshness'],
): FleetConnectivityCapabilitySignalDto['freshness'] {
  if (availability !== 'available') return 'unknown';
  if (telemetryFresh === 'live') return 'fresh';
  if (telemetryFresh === 'standby' || telemetryFresh === 'signal_delayed') return 'stale';
  return 'unknown';
}

function buildCapabilitySignals(
  vehicle: FleetConnectivityVehicleDto,
): FleetConnectivityCapabilitySignalDto[] {
  return SIGNAL_KEYS.map((key) => {
    const availability = vehicle.signals[key];
    const notApplicable = key === 'evSoc' && availability === 'missing' && vehicle.coverageState === 'GOOD';
    return {
      key,
      availability: notApplicable ? 'not_applicable' : availability,
      freshness: mapSignalFreshness(availability, vehicle.telemetryFreshness),
    };
  });
}

function mapTimelineType(code: ConnectivityReasonCode): FleetConnectivityTimelineEventType | null {
  switch (code) {
    case 'DEVICE_UNPLUG_WEBHOOK':
      return 'DEVICE_UNPLUGGED';
    case 'DEVICE_RECONNECTED_EXPLICIT':
    case 'DEVICE_RECONNECTED_SNAPSHOT':
    case 'DEVICE_RECONNECTED_TELEMETRY':
      return 'DEVICE_RECONNECTED';
    case 'DEVICE_BINDING_CHANGED':
      return 'BINDING_CHANGED';
    case 'AUTHORIZATION_EXPIRED':
    case 'CONSENT_MISSING':
    case 'PROVIDER_REVOKED':
      return 'AUTHORIZATION_CHANGED';
    case 'PROVIDER_ERROR':
    case 'WEBHOOK_PROCESSING_FAILED':
      return 'INTEGRATION_ERROR';
    case 'TELEMETRY_OFFLINE':
    case 'TELEMETRY_SOFT_OFFLINE':
      return 'TELEMETRY_RESUMED';
    default:
      return null;
  }
}

function buildTimeline(
  vehicle: FleetConnectivityVehicleDto,
  deviceConnection: FleetDeviceConnectionDto | null,
): FleetConnectivityTimelineEventDto[] {
  const runtime = vehicle.connectivityRuntime;
  const events: FleetConnectivityTimelineEventDto[] = [];

  if (deviceConnection?.lastDeviceUnpluggedAt) {
    events.push({
      id: 'unplug-last',
      type: 'DEVICE_UNPLUGGED',
      occurredAt: deviceConnection.lastDeviceUnpluggedAt,
      reasonCode: 'DEVICE_UNPLUG_WEBHOOK',
    });
  }
  if (deviceConnection?.lastDevicePluggedInAt) {
    events.push({
      id: 'plug-last',
      type: 'DEVICE_RECONNECTED',
      occurredAt: deviceConnection.lastDevicePluggedInAt,
      reasonCode: 'DEVICE_RECONNECTED_EXPLICIT',
    });
  }

  for (const code of runtime.reasonCodes) {
    const type = mapTimelineType(code);
    if (!type) continue;
    if (events.some((e) => e.type === type && e.reasonCode === code)) continue;
    const occurredAt =
      runtime.lastTelemetryAt ??
      runtime.lastProviderObservedAt ??
      runtime.calculatedAt;
    events.push({
      id: `reason-${code}`,
      type,
      occurredAt,
      reasonCode: code,
    });
  }

  return events
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, 12);
}

export function mapFleetConnectivityListItem(
  vehicle: FleetConnectivityVehicleDto,
): FleetConnectivityListItemDto {
  const runtime = vehicle.connectivityRuntime;
  const primaryReasonCode = pickPrimaryReasonCode(runtime.reasonCodes);
  const overallState = runtime.overallState;
  const attentionState = runtime.attentionState;

  return {
    vehicle: {
      vehicleId: vehicle.vehicleId,
      licensePlate: vehicle.licensePlate,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      station: vehicle.station,
    },
    overallState,
    telemetryState: runtime.telemetryState,
    attentionState,
    lastTelemetryAt: runtime.lastTelemetryAt,
    primaryReasonCode,
    recommendedAction: runtime.recommendedAction,
    requiresAction: runtime.requiresAction,
    sortPriority: computeConnectivitySortPriority(overallState, attentionState),
  };
}

export function mapFleetConnectivityDetail(
  vehicle: FleetConnectivityVehicleDto,
): FleetConnectivityDetailDto {
  const runtime = vehicle.connectivityRuntime;
  const list = mapFleetConnectivityListItem(vehicle);
  const deviceConnection = vehicle.deviceConnection;

  return {
    ...list,
    providerLinkState: runtime.providerLinkState,
    physicalDeviceState: runtime.physicalDeviceState,
    dataCoverageState: runtime.dataCoverageState,
    reasonCodes: [...runtime.reasonCodes],
    activeEpisode: deviceConnection?.openUnpluggedEpisode
      ? {
          episodeId: runtime.activeEpisodeId,
          open: true,
          openedAt: deviceConnection.openUnpluggedSince,
          durationMs: deviceConnection.openUnpluggedDurationMs,
          rentalRelevant: deviceConnection.rentalRelevant,
          recoveryMethod:
            runtime.reasonCodes.includes('DEVICE_RECONNECTED_TELEMETRY')
              ? 'TELEMETRY_RESUMED'
              : runtime.reasonCodes.includes('DEVICE_RECONNECTED_EXPLICIT')
                ? 'EXPLICIT_PLUG'
                : runtime.reasonCodes.includes('DEVICE_RECONNECTED_SNAPSHOT')
                  ? 'SNAPSHOT_PLUG'
                  : null,
        }
      : null,
    timeline: buildTimeline(vehicle, deviceConnection),
    provider: {
      providerLabel: vehicle.provider === 'DIMO' ? 'telematics' : vehicle.provider,
      deviceKind: mapDeviceKind(vehicle.connectionType),
      authorizationState: runtime.providerLinkState,
      consentGranted: runtime.providerLinkState === 'ACTIVE',
      triggerConfigured: runtime.evidence.webhookConfigured === true,
      lastSuccessfulFetchAt: runtime.lastReceivedAt,
    },
    capabilities: {
      coverageState: runtime.dataCoverageState,
      coveragePercent: vehicle.coveragePercent,
      freshSignalCount: vehicle.freshSignalCount,
      expectedSignalCount: vehicle.expectedSignalCount,
      signals: buildCapabilitySignals(vehicle),
    },
    timestamps: {
      lastTelemetryAt: runtime.lastTelemetryAt,
      lastProviderObservedAt: runtime.lastProviderObservedAt,
      lastReceivedAt: runtime.lastReceivedAt,
      calculatedAt: runtime.calculatedAt,
    },
    webhook: {
      configured: deviceConnection?.eventSource === 'dimo_webhook',
      lastEventAt:
        deviceConnection?.lastDevicePluggedInAt ??
        deviceConnection?.lastDeviceUnpluggedAt ??
        null,
      openEpisode: deviceConnection?.openUnpluggedEpisode ?? false,
    },
    odometerKm: vehicle.odometerKm,
    hasLocation: vehicle.latitude != null && vehicle.longitude != null,
  };
}

export function buildFleetConnectivityKpiSummary(
  items: FleetConnectivityListItemDto[],
): FleetConnectivityKpiSummaryDto {
  let actionRequired = 0;
  let actionRequiredOffline = 0;
  let actionRequiredSoftOffline = 0;
  let telemetryActive = 0;
  let standby = 0;
  let noActiveDataSource = 0;

  for (const item of items) {
    const needsAction =
      item.requiresAction ||
      item.attentionState === 'ACTION_REQUIRED' ||
      item.attentionState === 'CRITICAL' ||
      item.overallState === 'DEVICE_UNPLUGGED' ||
      item.overallState === 'AUTHORIZATION_REQUIRED' ||
      item.overallState === 'INTEGRATION_ERROR' ||
      item.overallState === 'OFFLINE' ||
      item.overallState === 'SOFT_OFFLINE';

    if (needsAction) {
      actionRequired += 1;
      if (item.overallState === 'OFFLINE') actionRequiredOffline += 1;
      if (item.overallState === 'SOFT_OFFLINE') actionRequiredSoftOffline += 1;
    }
    if (item.overallState === 'TELEMETRY_ACTIVE') telemetryActive += 1;
    if (item.overallState === 'STANDBY') standby += 1;
    if (item.overallState === 'NO_ACTIVE_DATA_SOURCE') noActiveDataSource += 1;
  }

  return {
    total: items.length,
    actionRequired,
    actionRequiredOffline,
    actionRequiredSoftOffline,
    telemetryActive,
    standby,
    noActiveDataSource,
  };
}

export function sortFleetConnectivityListItems(
  items: FleetConnectivityListItemDto[],
): FleetConnectivityListItemDto[] {
  return [...items].sort((a, b) => {
    if (a.sortPriority !== b.sortPriority) return a.sortPriority - b.sortPriority;
    const aTime = a.lastTelemetryAt ? Date.parse(a.lastTelemetryAt) : 0;
    const bTime = b.lastTelemetryAt ? Date.parse(b.lastTelemetryAt) : 0;
    return bTime - aTime;
  });
}
