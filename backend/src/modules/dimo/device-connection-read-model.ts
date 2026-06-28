/**
 * Pure read-model helpers for DIMO OBD device connection / tamper events.
 * UI-facing only — no detection, no misuse case creation.
 */
import { DimoDeviceConnectionEventType } from '@prisma/client';

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
  webhookConfigured: DeviceConnectionWebhookStatus;
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
}

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
  } = input;

  const sorted = [...events].sort(
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

  const openUnpluggedEpisode =
    !!lastUnplug &&
    (!lastPlug || lastUnplug.observedAt.getTime() > lastPlug.observedAt.getTime());

  let currentDeviceConnectionStatus: DeviceConnectionStatus = 'unknown';
  if (openUnpluggedEpisode) currentDeviceConnectionStatus = 'unplugged';
  else if (lastPlug && (!lastUnplug || lastPlug.observedAt >= lastUnplug.observedAt)) {
    currentDeviceConnectionStatus = 'plugged';
  }

  const activeBooking = findActiveBookingNow(bookings, nowMs);
  const openSince = openUnpluggedEpisode ? lastUnplug!.observedAt : null;
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
  let webhookConfigured: DeviceConnectionWebhookStatus = 'unknown';
  if (sorted.length > 0) webhookConfigured = 'active';
  else if (dimoLinked) webhookConfigured = 'not_configured';

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
    lastDeviceUnpluggedAt: lastUnplug?.observedAt.toISOString() ?? null,
    lastDevicePluggedInAt: lastPlug?.observedAt.toISOString() ?? null,
    currentDeviceConnectionStatus,
    openUnpluggedEpisode,
    openUnpluggedSince: openSince?.toISOString() ?? null,
    openUnpluggedDurationMs: openDurationMs,
    severity,
    rentalRelevant,
    activeBookingId: activeBooking?.id ?? null,
    webhookConfigured,
    lastWebhookReceivedAt,
    unpluggedCount24h,
    unpluggedCount7d,
    pluggedCount24h,
    pluggedCount7d,
    recentEvents,
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
  };
}
