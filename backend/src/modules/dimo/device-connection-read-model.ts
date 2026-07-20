import { DimoConnectionStatus, DimoDeviceConnectionEventType } from '@prisma/client';
import {
  legacyWebhookConfiguredFromConfiguration,
  WebhookConfigurationStateEnum,
  type DeviceConnectionWebhookConfigurationView,
} from './device-connection-webhook-configuration/device-connection-webhook-configuration.types';

/** Short plug webhooks after unplug are often contact flutter — ignore unless DIMO confirms reconnect. */
export const DEVICE_CONNECTION_PLUG_IMPULSE_WINDOW_MS = 120_000;

export type DeviceConnectionStatus = 'plugged' | 'unplugged' | 'unknown';
export type DeviceConnectionSeverity = 'info' | 'warning' | 'critical';
export type DeviceConnectionWebhookStatus = 'active' | 'not_configured' | 'unknown';

export interface DeviceConnectionBookingWindow {
  id: string;
  startDate: Date;
  endDate: Date;
  status: string;
}

export interface DeviceConnectionTripWindow {
  id: string;
  startTime: Date;
  endTime: Date | null;
  assignedBookingId: string | null;
}

export interface DeviceConnectionEventRow {
  id: string;
  vehicleId: string;
  eventType: DimoDeviceConnectionEventType;
  observedAt: Date;
}

/** Live DIMO connectivity used to reconcile webhook-only state (Master Admin connection truth). */
export interface DeviceConnectionConnectivityAnchor {
  dimoConnectionStatus: DimoConnectionStatus | null;
  obdIsPluggedIn: boolean | null;
}

export function connectivityIndicatesUnplugged(
  anchor: DeviceConnectionConnectivityAnchor | null | undefined,
): boolean {
  if (!anchor) return false;
  if (anchor.obdIsPluggedIn === false) return true;
  return (
    anchor.dimoConnectionStatus === DimoConnectionStatus.DISCONNECTED ||
    anchor.dimoConnectionStatus === DimoConnectionStatus.ERROR ||
    anchor.dimoConnectionStatus === DimoConnectionStatus.PENDING
  );
}

export function connectivityIndicatesPlugged(
  anchor: DeviceConnectionConnectivityAnchor | null | undefined,
): boolean {
  if (!anchor) return false;
  if (anchor.obdIsPluggedIn === true) return true;
  return anchor.dimoConnectionStatus === DimoConnectionStatus.CONNECTED;
}

/**
 * Drop phantom plug-in webhooks when DIMO connectivity still reports unplugged/disconnected.
 * Primary read-time truth layer — fixes false "Wieder verbunden" after contact flutter.
 */
export function reconcileDeviceConnectionEvents<T extends DeviceConnectionEventRow>(
  events: T[],
  anchor?: DeviceConnectionConnectivityAnchor | null,
): T[] {
  const canonical = filterCanonicalDeviceConnectionEvents(events);
  if (!anchor || canonical.length === 0) return canonical;

  const sorted = [...canonical].sort(
    (a, b) => a.observedAt.getTime() - b.observedAt.getTime(),
  );
  const filtered: T[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i];
    const prev = i > 0 ? sorted[i - 1] : null;
    if (
      event.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN &&
      prev?.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED
    ) {
      const deltaMs = event.observedAt.getTime() - prev.observedAt.getTime();
      const isImpulse =
        deltaMs >= 0 && deltaMs <= DEVICE_CONNECTION_PLUG_IMPULSE_WINDOW_MS;
      if (isImpulse && connectivityIndicatesUnplugged(anchor)) {
        continue;
      }
    }
    filtered.push(event);
  }

  if (connectivityIndicatesUnplugged(anchor)) {
    while (
      filtered.length > 0 &&
      filtered[filtered.length - 1].eventType ===
        DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN
    ) {
      filtered.pop();
    }
  }

  return filtered;
}

/**
 * Intake gate: within impulse window after unplug, only persist plug when DIMO confirms reconnect.
 */
export function shouldIgnorePlugImpulseAfterUnplug(
  incomingPluggedIn: boolean,
  lastEvent:
    | { eventType: DimoDeviceConnectionEventType; observedAt: Date }
    | null
    | undefined,
  incomingObservedAt: Date,
  anchor: DeviceConnectionConnectivityAnchor | null | undefined,
): { ignore: boolean; reason?: string } {
  if (!incomingPluggedIn) return { ignore: false };
  if (
    !lastEvent ||
    lastEvent.eventType !== DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED
  ) {
    return { ignore: false };
  }

  const deltaMs = incomingObservedAt.getTime() - lastEvent.observedAt.getTime();
  if (deltaMs < 0 || deltaMs > DEVICE_CONNECTION_PLUG_IMPULSE_WINDOW_MS) {
    return { ignore: false };
  }

  if (connectivityIndicatesPlugged(anchor)) {
    return { ignore: false };
  }

  return { ignore: true, reason: 'plug_impulse_after_unplug' };
}

/**
 * Collapse consecutive events of the same type and drop leading baseline
 * PLUGGED_IN rows (device was already connected before monitoring started).
 * Matches `shouldPersistObdPlugStateChange` intake semantics.
 */
export function filterCanonicalDeviceConnectionEvents<T extends DeviceConnectionEventRow>(
  events: T[],
): T[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort(
    (a, b) => a.observedAt.getTime() - b.observedAt.getTime(),
  );
  const out: T[] = [];
  let current: 'plugged' | 'unplugged' | 'unknown' = 'unknown';

  for (const event of sorted) {
    const isPlug = event.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN;
    if (current === 'unknown') {
      if (isPlug) continue;
      out.push(event);
      current = 'unplugged';
      continue;
    }
    const incoming = isPlug ? 'plugged' : 'unplugged';
    if (current === incoming) continue;
    out.push(event);
    current = incoming;
  }
  return out;
}

/** @deprecated Use filterCanonicalDeviceConnectionEvents */
export function collapseConsecutiveDeviceConnectionEvents<T extends DeviceConnectionEventRow>(
  events: T[],
): T[] {
  return filterCanonicalDeviceConnectionEvents(events);
}

export interface DeviceConnectionEventView {
  id: string;
  eventType: DimoDeviceConnectionEventType;
  observedAt: string;
  severity: DeviceConnectionSeverity;
  rentalRelevant: boolean;
  bookingId: string | null;
  tripId: string | null;
}

export interface DeviceConnectionSummary {
  lteR1Capable: boolean;
  dimoLinked: boolean;
  lastDeviceUnpluggedAt: string | null;
  lastDevicePluggedInAt: string | null;
  currentDeviceConnectionStatus: DeviceConnectionStatus;
  openUnpluggedEpisode: boolean;
  openUnpluggedSince: string | null;
  openUnpluggedDurationMs: number | null;
  severity: DeviceConnectionSeverity | null;
  rentalRelevant: boolean;
  activeBookingId: string | null;
  /** @deprecated Use webhookConfiguration.unplugTriggerState — derived from trigger registry, not events. */
  webhookConfigured: DeviceConnectionWebhookStatus;
  webhookConfiguration: import('./device-connection-webhook-configuration/device-connection-webhook-configuration.types').DeviceConnectionWebhookConfigurationView;
  lastWebhookReceivedAt: string | null;
  unpluggedCount24h: number;
  unpluggedCount7d: number;
  pluggedCount24h: number;
  pluggedCount7d: number;
  recentEvents: DeviceConnectionEventView[];
}

export interface BuildDeviceConnectionSummaryInput {
  vehicleId: string;
  hardwareType: string | null;
  dimoLinked: boolean;
  nowMs: number;
  events: DeviceConnectionEventRow[];
  bookings: DeviceConnectionBookingWindow[];
  trips: DeviceConnectionTripWindow[];
  recentLimit?: number;
  connectivityAnchor?: DeviceConnectionConnectivityAnchor | null;
  /**
   * When provided (including explicit `null`), current open/closed device state is
   * sourced from persistent episodes — not reconstructed from the event window.
   */
  persistedOpenEpisode?: PersistedOpenEpisodeInput | null;
  /** Trigger registry snapshot — must not be inferred from event history. */
  webhookConfiguration?: DeviceConnectionWebhookConfigurationView;
}

export interface PersistedOpenEpisodeInput {
  id: string;
  openedAt: Date;
  deviceBindingId: string | null;
}

/** Per-trip flags for list/timeline surfaces (OBD plug/unplug during trip window). */
export interface TripDeviceConnectionFlags {
  hasDeviceConnectionEvent: boolean;
  deviceUnpluggedCount: number;
  devicePluggedInCount: number;
  hasOpenDeviceUnplug: boolean;
  deviceConnectionRentalRelevant: boolean;
  deviceConnectionSeverity: DeviceConnectionSeverity | null;
}

export const EMPTY_TRIP_DEVICE_CONNECTION_FLAGS: TripDeviceConnectionFlags = {
  hasDeviceConnectionEvent: false,
  deviceUnpluggedCount: 0,
  devicePluggedInCount: 0,
  hasOpenDeviceUnplug: false,
  deviceConnectionRentalRelevant: false,
  deviceConnectionSeverity: null,
};

const ACTIVE_BOOKING_STATUSES = new Set(['ACTIVE', 'CONFIRMED']);

export function isLteR1Hardware(hardwareType: string | null | undefined): boolean {
  return (hardwareType ?? '').trim().toUpperCase() === 'LTE_R1';
}

export function findBookingAtTime(
  bookings: DeviceConnectionBookingWindow[],
  at: Date,
): DeviceConnectionBookingWindow | null {
  const t = at.getTime();
  for (const b of bookings) {
    if (t >= b.startDate.getTime() && t <= b.endDate.getTime()) {
      if (b.status === 'CANCELLED' || b.status === 'NO_SHOW') continue;
      return b;
    }
  }
  return null;
}

export function findActiveBookingNow(
  bookings: DeviceConnectionBookingWindow[],
  nowMs: number,
): DeviceConnectionBookingWindow | null {
  return findBookingAtTime(bookings, new Date(nowMs));
}

export function findTripAtTime(
  trips: DeviceConnectionTripWindow[],
  at: Date,
): DeviceConnectionTripWindow | null {
  const t = at.getTime();
  for (const trip of trips) {
    const endMs = trip.endTime?.getTime() ?? Number.POSITIVE_INFINITY;
    if (t >= trip.startTime.getTime() && t <= endMs) return trip;
  }
  return null;
}

export function severityForUnplugEvent(rentalRelevant: boolean): DeviceConnectionSeverity {
  return rentalRelevant ? 'critical' : 'warning';
}

export function severityForPlugEvent(): DeviceConnectionSeverity {
  return 'info';
}

export function mapDeviceConnectionEventView(
  event: DeviceConnectionEventRow,
  bookings: DeviceConnectionBookingWindow[],
  trips: DeviceConnectionTripWindow[],
): DeviceConnectionEventView {
  const booking = findBookingAtTime(bookings, event.observedAt);
  const trip = findTripAtTime(trips, event.observedAt);
  const rentalRelevant =
    booking != null && ACTIVE_BOOKING_STATUSES.has(booking.status);
  const severity =
    event.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN
      ? severityForPlugEvent()
      : severityForUnplugEvent(rentalRelevant);

  return {
    id: event.id,
    eventType: event.eventType,
    observedAt: event.observedAt.toISOString(),
    severity,
    rentalRelevant,
    bookingId: booking?.id ?? trip?.assignedBookingId ?? null,
    tripId: trip?.id ?? null,
  };
}

export function buildDeviceConnectionSummary(
  input: BuildDeviceConnectionSummaryInput,
): DeviceConnectionSummary {
  const {
    hardwareType,
    dimoLinked,
    nowMs,
    events,
    bookings,
    trips,
    recentLimit = 10,
    connectivityAnchor = null,
    persistedOpenEpisode,
  } = input;

  const sorted = [...reconcileDeviceConnectionEvents(events, connectivityAnchor)].sort(
    (a, b) => b.observedAt.getTime() - a.observedAt.getTime(),
  );
  const since24h = nowMs - 24 * 60 * 60 * 1000;
  const since7d = nowMs - 7 * 24 * 60 * 60 * 1000;

  const lastUnplug = sorted.find(
    (e) => e.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
  );
  const lastPlug = sorted.find(
    (e) => e.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
  );

  const usePersistedEpisode = persistedOpenEpisode !== undefined;
  const openUnpluggedEpisode = usePersistedEpisode
    ? persistedOpenEpisode != null
    : !!lastUnplug &&
      (!lastPlug || lastUnplug.observedAt.getTime() > lastPlug.observedAt.getTime());

  let currentDeviceConnectionStatus: DeviceConnectionStatus = 'unknown';
  if (openUnpluggedEpisode) currentDeviceConnectionStatus = 'unplugged';
  else if (lastPlug && (!lastUnplug || lastPlug.observedAt >= lastUnplug.observedAt)) {
    currentDeviceConnectionStatus = 'plugged';
  }

  const activeBooking = findActiveBookingNow(bookings, nowMs);
  const openSince = openUnpluggedEpisode
    ? usePersistedEpisode
      ? persistedOpenEpisode!.openedAt
      : lastUnplug!.observedAt
    : null;
  const openDurationMs =
    openSince != null ? Math.max(0, nowMs - openSince.getTime()) : null;

  let severity: DeviceConnectionSeverity | null = null;
  if (openUnpluggedEpisode) {
    severity = activeBooking ? 'critical' : 'warning';
  } else if (lastPlug) {
    severity = 'info';
  }

  const recentEvents = sorted
    .slice(0, recentLimit)
    .map((e) => mapDeviceConnectionEventView(e, bookings, trips));

  const lastWebhookReceivedAt = sorted[0]?.observedAt.toISOString() ?? null;
  const webhookConfiguration =
    input.webhookConfiguration ??
    ({
      unplugTriggerState: {
        state: 'UNKNOWN',
        reasonCode: null,
        triggerId: null,
        eventType: 'OBD_DEVICE_UNPLUGGED',
        active: null,
        callbackUrl: null,
        failureCount: null,
      },
      plugTriggerState: {
        state: 'UNKNOWN',
        reasonCode: null,
        triggerId: null,
        eventType: 'OBD_DEVICE_PLUGGED_IN',
        active: null,
        callbackUrl: null,
        failureCount: null,
      },
      recoveryPolicy: 'UNPLUG_WEBHOOK_PLUG_SNAPSHOT',
      lastSuccessfulDeliveryAt: null,
      lastDeliveryErrorAt: null,
      configSyncedAt: null,
      configSource: 'DEPLOYMENT_POLICY',
    } satisfies DeviceConnectionWebhookConfigurationView);
  const webhookConfigured = legacyWebhookConfiguredFromConfiguration(webhookConfiguration);

  const unpluggedCount24h = sorted.filter(
    (e) =>
      e.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED &&
      e.observedAt.getTime() >= since24h,
  ).length;
  const unpluggedCount7d = sorted.filter(
    (e) =>
      e.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED &&
      e.observedAt.getTime() >= since7d,
  ).length;
  const pluggedCount24h = sorted.filter(
    (e) =>
      e.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN &&
      e.observedAt.getTime() >= since24h,
  ).length;
  const pluggedCount7d = sorted.filter(
    (e) =>
      e.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN &&
      e.observedAt.getTime() >= since7d,
  ).length;

  const rentalRelevant =
    openUnpluggedEpisode && activeBooking != null
      ? true
      : recentEvents.some((e) => e.rentalRelevant);

  return {
    lteR1Capable: isLteR1Hardware(hardwareType),
    dimoLinked,
    lastDeviceUnpluggedAt: openSince?.toISOString() ?? lastUnplug?.observedAt.toISOString() ?? null,
    lastDevicePluggedInAt: lastPlug?.observedAt.toISOString() ?? null,
    currentDeviceConnectionStatus,
    openUnpluggedEpisode,
    openUnpluggedSince: openSince?.toISOString() ?? null,
    openUnpluggedDurationMs: openDurationMs,
    severity,
    rentalRelevant,
    activeBookingId: activeBooking?.id ?? null,
    webhookConfigured,
    webhookConfiguration,
    lastWebhookReceivedAt,
    unpluggedCount24h,
    unpluggedCount7d,
    pluggedCount24h,
    pluggedCount7d,
    recentEvents,
  };
}

export function buildTripDeviceConnectionFlags(
  trip: DeviceConnectionTripWindow,
  events: DeviceConnectionEventRow[],
  bookings: DeviceConnectionBookingWindow[],
  nowMs: number,
  connectivityAnchor?: DeviceConnectionConnectivityAnchor | null,
): TripDeviceConnectionFlags {
  const startMs = trip.startTime.getTime();
  const endMs = trip.endTime?.getTime() ?? nowMs;

  const inWindow = reconcileDeviceConnectionEvents(
    events.filter((e) => {
      const t = e.observedAt.getTime();
      return t >= startMs && t <= endMs;
    }),
    connectivityAnchor,
  );

  if (inWindow.length === 0) {
    return { ...EMPTY_TRIP_DEVICE_CONNECTION_FLAGS };
  }

  const unplugged = inWindow.filter(
    (e) => e.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
  );
  const plugged = inWindow.filter(
    (e) => e.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
  );

  const lastUnplug = unplugged.sort(
    (a, b) => b.observedAt.getTime() - a.observedAt.getTime(),
  )[0];
  const lastPlug = plugged.sort(
    (a, b) => b.observedAt.getTime() - a.observedAt.getTime(),
  )[0];
  const hasOpenDeviceUnplug =
    !!lastUnplug &&
    (!lastPlug || lastUnplug.observedAt.getTime() > lastPlug.observedAt.getTime());

  const mapped = inWindow.map((e) => mapDeviceConnectionEventView(e, bookings, [trip]));
  const deviceConnectionRentalRelevant = mapped.some((e) => e.rentalRelevant);
  const severities = mapped.map((e) => e.severity);
  const deviceConnectionSeverity: DeviceConnectionSeverity | null =
    severities.includes('critical')
      ? 'critical'
      : severities.includes('warning')
        ? 'warning'
        : severities.includes('info')
          ? 'info'
          : null;

  return {
    hasDeviceConnectionEvent: true,
    deviceUnpluggedCount: unplugged.length,
    devicePluggedInCount: plugged.length,
    hasOpenDeviceUnplug,
    deviceConnectionRentalRelevant,
    deviceConnectionSeverity,
  };
}

/** Compact fleet-connectivity projection (no event list). */
export function buildFleetDeviceConnectionFields(
  summary: DeviceConnectionSummary,
): {
  lastDeviceUnpluggedAt: string | null;
  lastDevicePluggedInAt: string | null;
  currentDeviceConnectionStatus: DeviceConnectionStatus;
  openUnpluggedEpisode: boolean;
  openUnpluggedSince: string | null;
  openUnpluggedDurationMs: number | null;
  severity: DeviceConnectionSeverity | null;
  rentalRelevant: boolean;
  duringActiveBooking: boolean;
  eventSource: 'dimo_webhook' | 'none';
  unplugTriggerState: DeviceConnectionWebhookConfigurationView['unplugTriggerState'];
  plugTriggerState: DeviceConnectionWebhookConfigurationView['plugTriggerState'];
  recoveryPolicy: DeviceConnectionWebhookConfigurationView['recoveryPolicy'];
  lastSuccessfulDeliveryAt: string | null;
  lastDeliveryErrorAt: string | null;
} {
  return {
    lastDeviceUnpluggedAt: summary.lastDeviceUnpluggedAt,
    lastDevicePluggedInAt: summary.lastDevicePluggedInAt,
    currentDeviceConnectionStatus: summary.currentDeviceConnectionStatus,
    openUnpluggedEpisode: summary.openUnpluggedEpisode,
    openUnpluggedSince: summary.openUnpluggedSince,
    openUnpluggedDurationMs: summary.openUnpluggedDurationMs,
    severity: summary.severity,
    rentalRelevant: summary.rentalRelevant,
    duringActiveBooking:
      summary.openUnpluggedEpisode && summary.activeBookingId != null,
    eventSource: summary.lastWebhookReceivedAt ? 'dimo_webhook' : 'none',
    unplugTriggerState: summary.webhookConfiguration.unplugTriggerState,
    plugTriggerState: summary.webhookConfiguration.plugTriggerState,
    recoveryPolicy: summary.webhookConfiguration.recoveryPolicy,
    lastSuccessfulDeliveryAt: summary.webhookConfiguration.lastSuccessfulDeliveryAt,
    lastDeliveryErrorAt: summary.webhookConfiguration.lastDeliveryErrorAt,
  };
}
