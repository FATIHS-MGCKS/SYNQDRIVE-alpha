import type { FleetChatEvidenceApiResponse } from './fleet-chat-evidence-response/fleet-chat-evidence-response.types';
import type { FleetChatResponseType } from './fleet-chat-evidence-response/fleet-chat-evidence-response.enums';
import type { FleetChatToolExecutionRecord } from './fleet-chat-orchestrator.types';
import type { ChatFleetStructuredPayload } from './chat-fleet-structured.dto';
import type {
  FleetChatCompactFact,
  FleetChatCompactFactTone,
  FleetChatCompactSummary,
} from './chat-fleet-structured.dto';
import {
  getHealthData,
  getLocationData,
  getOverdueData,
  getToolData,
} from './fleet-chat-evidence-response/fleet-chat-evidence-context.util';
import type { AiGetVehicleHealthSummaryData } from '../tools/get-vehicle-health-summary/ai-get-vehicle-health-summary.types';
import type { AiGetVehicleTelemetryStatusData } from '../tools/get-vehicle-telemetry-status/ai-get-vehicle-telemetry-status.types';
import type { AiGetVehicleBookingContextData } from '../tools/get-vehicle-booking-context/ai-get-vehicle-booking-context.types';
import type { AiGetVehicleLocationData } from '../tools/get-vehicle-location/ai-get-vehicle-location.types';
import type { AiExplainOverdueReturnData } from '../tools/explain-overdue-return/ai-explain-overdue-return.types';

const REASON_LABELS_DE: Record<string, string> = {
  RETURN_DEADLINE_PASSED: 'Rückgabefrist überschritten',
  GRACE_PERIOD_EXCEEDED: 'Kulanzfrist überschritten',
  RETURN_NOT_COMPLETED: 'Rückgabe nicht abgeschlossen',
  NO_APPROVED_EXTENSION: 'Keine genehmigte Verlängerung',
  HANDOVER_STILL_ACTIVE: 'Übergabe noch aktiv',
  RETURN_HANDOVER_PENDING: 'Rückgabe-Übergabe ausstehend',
  PICKUP_HANDOVER_PENDING: 'Abhol-Übergabe ausstehend',
  PICKUP_OVERDUE: 'Abholung überfällig',
  RETURN_OVERDUE: 'Rückgabe überfällig',
  ACTIVE_RENTED: 'Aktiv vermietet',
  RESERVED_WINDOW: 'Reservierungsfenster',
  UPCOMING_BOOKING: 'Kommende Buchung',
  NO_OPEN_BOOKING: 'Keine offene Buchung',
  RETURN_COMPLETED: 'Rückgabe abgeschlossen',
  EXTENSION_APPLIED: 'Verlängerung angewendet',
  MULTIPLE_ACTIVE_BOOKINGS: 'Mehrere aktive Buchungen',
  RETURN_COMPLETED_BOOKING_STILL_ACTIVE: 'Rückgabe abgeschlossen, Buchung noch aktiv',
  RETURN_PROTOCOL_EXISTS_BUT_MARKED_OVERDUE: 'Rückgabeprotokoll vorhanden, aber überfällig markiert',
  FLEET_CONTEXT_DIVERGENCE: 'Flottenkontext weicht ab',
  FLEET_ACTIVE_IS_OVERDUE_DIVERGENCE: 'Flottenkontext: Überfälligkeit weicht ab',
  STATUS_WITHOUT_ACTIVE_BOOKING: 'Status ohne aktive Buchung',
  BOOKING_CANCELLED_BUT_MARKED_OVERDUE: 'Stornierte Buchung als überfällig markiert',
  RETURN_NOT_DUE_YET: 'Rückgabe noch nicht fällig',
  permission_denied: 'Fehlende Berechtigung',
  limited_data: 'Begrenzte Datenlage',
  last_known_position: 'Letzte bekannte Position',
  inconsistent_state: 'Inkonsistenter Datenstand',
};

function formatIso(iso: string | null | undefined, locale: 'de' | 'en'): string {
  if (!iso) return locale === 'en' ? 'Unknown' : 'Unbekannt';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ms));
}

function formatCoords(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null) return '—';
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function reasonLabel(code: string, locale: 'de' | 'en'): string {
  if (locale === 'en') return code.replace(/_/g, ' ').toLowerCase();
  return REASON_LABELS_DE[code] ?? code.replace(/_/g, ' ').toLowerCase();
}

function healthStatusLabel(status: string, locale: 'de' | 'en'): string {
  const de: Record<string, string> = {
    good: 'Gut',
    warning: 'Achtung',
    critical: 'Kritisch',
    unknown: 'Unbekannt',
    unavailable: 'Nicht verfügbar',
  };
  const en: Record<string, string> = {
    good: 'Good',
    warning: 'Warning',
    critical: 'Critical',
    unknown: 'Unknown',
    unavailable: 'Unavailable',
  };
  return (locale === 'en' ? en : de)[status] ?? status;
}

function healthTone(status: string): FleetChatCompactFactTone {
  if (status === 'good' || status === 'clean') return 'good';
  if (status === 'critical') return 'critical';
  if (status === 'warning' || status === 'watch') return 'warning';
  return 'neutral';
}

function pushFact(
  facts: FleetChatCompactFact[],
  id: string,
  label: string,
  value: string,
  tone?: FleetChatCompactFactTone,
): void {
  if (!value.trim() || value === '—') return;
  facts.push({ id, label, value, tone });
}

function buildLocationFacts(data: AiGetVehicleLocationData, locale: 'de' | 'en'): FleetChatCompactFact[] {
  const facts: FleetChatCompactFact[] = [];
  pushFact(facts, 'position', locale === 'en' ? 'Position' : 'Position', formatCoords(data.latitude, data.longitude));
  if (data.address?.trim()) {
    pushFact(facts, 'address', locale === 'en' ? 'Address' : 'Adresse', data.address.trim());
  }
  pushFact(
    facts,
    'observed_at',
    locale === 'en' ? 'Observed at' : 'Beobachtet',
    formatIso(data.observedAt, locale),
    data.isLastKnownLocation ? 'warning' : 'neutral',
  );
  pushFact(
    facts,
    'freshness',
    locale === 'en' ? 'Signal freshness' : 'Datenfrische',
    data.freshness,
    data.isLastKnownLocation ? 'warning' : 'info',
  );
  return facts;
}

function buildTelemetryFacts(
  data: AiGetVehicleTelemetryStatusData,
  locale: 'de' | 'en',
): FleetChatCompactFact[] {
  const facts: FleetChatCompactFact[] = [];
  pushFact(
    facts,
    'telemetry_state',
    locale === 'en' ? 'Telemetry state' : 'Telemetriezustand',
    data.telemetryState,
    data.isLastKnownTelemetry ? 'warning' : 'info',
  );
  pushFact(
    facts,
    'connectivity',
    locale === 'en' ? 'Connectivity' : 'Konnektivität',
    data.connectivityStatus,
  );
  pushFact(
    facts,
    'last_signal',
    locale === 'en' ? 'Last signal' : 'Letztes Signal',
    formatIso(data.lastSignalAt, locale),
    data.isLastKnownTelemetry ? 'warning' : 'neutral',
  );
  for (const code of data.reasonCodes.slice(0, 3)) {
    pushFact(facts, `reason_${code}`, locale === 'en' ? 'Reason' : 'Hinweis', reasonLabel(code, locale), 'info');
  }
  return facts;
}

function buildHealthFacts(data: AiGetVehicleHealthSummaryData, locale: 'de' | 'en'): FleetChatCompactFact[] {
  const facts: FleetChatCompactFact[] = [];
  pushFact(
    facts,
    'overall_status',
    locale === 'en' ? 'Overall health' : 'Gesundheitsstatus',
    healthStatusLabel(data.overallStatus, locale),
    healthTone(data.overallStatus),
  );
  pushFact(
    facts,
    'updated_at',
    locale === 'en' ? 'Last updated' : 'Zuletzt aktualisiert',
    formatIso(data.lastUpdatedAt, locale),
  );
  if (data.limitedData) {
    pushFact(
      facts,
      'limited_data',
      locale === 'en' ? 'Data coverage' : 'Datenabdeckung',
      locale === 'en' ? 'Limited data' : 'Begrenzte Datenlage',
      'warning',
    );
  }
  if (data.rentalBlocked) {
    pushFact(
      facts,
      'rental_blocked',
      locale === 'en' ? 'Rental blocked' : 'Mietblocker',
      locale === 'en' ? 'Yes' : 'Ja',
      'critical',
    );
  }
  for (const code of data.reasonCodes.slice(0, 4)) {
    pushFact(facts, `reason_${code}`, locale === 'en' ? 'Reason' : 'Hinweis', reasonLabel(code, locale), 'info');
  }
  for (const blocker of data.readyToRentBlockers.slice(0, 3)) {
    pushFact(facts, `blocker_${blocker}`, locale === 'en' ? 'Blocker' : 'Blocker', reasonLabel(blocker, locale), 'warning');
  }
  return facts;
}

function buildBookingFacts(data: AiGetVehicleBookingContextData, locale: 'de' | 'en'): FleetChatCompactFact[] {
  const facts: FleetChatCompactFact[] = [];
  const snapshot = data.currentBooking ?? data.reservedBooking ?? data.upcomingBooking ?? null;
  pushFact(
    facts,
    'context_kind',
    locale === 'en' ? 'Booking context' : 'Buchungskontext',
    data.contextKind,
    data.returnOverdue ? 'critical' : 'neutral',
  );
  if (snapshot) {
    pushFact(facts, 'booking_number', locale === 'en' ? 'Booking no.' : 'Buchungsnr.', snapshot.bookingNumber);
    pushFact(
      facts,
      'booking_status',
      locale === 'en' ? 'Status' : 'Status',
      snapshot.bookingStatus,
      snapshot.returnOverdue ? 'critical' : 'info',
    );
    pushFact(
      facts,
      'scheduled_return',
      locale === 'en' ? 'Scheduled return' : 'Geplante Rückgabe',
      formatIso(snapshot.scheduledReturnAt, locale),
      snapshot.returnOverdue ? 'critical' : 'neutral',
    );
    if (snapshot.customerDisplayName?.trim()) {
      pushFact(facts, 'customer', locale === 'en' ? 'Customer' : 'Kunde', snapshot.customerDisplayName.trim());
    }
  }
  for (const step of data.openProcessSteps.slice(0, 3)) {
    pushFact(facts, `step_${step}`, locale === 'en' ? 'Open step' : 'Offener Schritt', reasonLabel(step, locale), 'warning');
  }
  for (const code of data.reasonCodes.slice(0, 4)) {
    pushFact(facts, `reason_${code}`, locale === 'en' ? 'Reason' : 'Hinweis', reasonLabel(code, locale), 'info');
  }
  return facts;
}

function buildOverdueFacts(data: AiExplainOverdueReturnData, locale: 'de' | 'en'): FleetChatCompactFact[] {
  const facts: FleetChatCompactFact[] = [];
  pushFact(facts, 'booking_number', locale === 'en' ? 'Booking no.' : 'Buchungsnr.', data.bookingNumber);
  pushFact(
    facts,
    'overdue_since',
    locale === 'en' ? 'Overdue since' : 'Überfällig seit',
    formatIso(data.overdueSince, locale),
    'critical',
  );
  if (data.overdueDurationMinutes != null) {
    const hours = Math.round(data.overdueDurationMinutes / 60);
    pushFact(
      facts,
      'overdue_duration',
      locale === 'en' ? 'Overdue duration' : 'Überfälligkeitsdauer',
      locale === 'en' ? `${hours} h` : `${hours} Std.`,
      'critical',
    );
  }
  pushFact(
    facts,
    'handover_status',
    locale === 'en' ? 'Handover' : 'Übergabe',
    data.handoverStatus,
    'info',
  );
  for (const code of data.reasonCodes.slice(0, 4)) {
    pushFact(facts, `reason_${code}`, locale === 'en' ? 'Reason' : 'Hinweis', reasonLabel(code, locale), 'warning');
  }
  for (const flag of data.inconsistencyFlags.slice(0, 3)) {
    pushFact(
      facts,
      `inconsistency_${flag}`,
      locale === 'en' ? 'Inconsistency' : 'Inkonsistenz',
      reasonLabel(flag, locale),
      'warning',
    );
  }
  return facts;
}

function resolveStatusTone(
  responseType: FleetChatResponseType,
  structured: FleetChatEvidenceApiResponse,
): FleetChatCompactFactTone {
  if (responseType === 'PERMISSION_RESTRICTED' || responseType === 'TEMPORARY_UNAVAILABLE') {
    return 'critical';
  }
  if (responseType === 'INCONSISTENT_STATE' || responseType === 'PARTIAL_DATA' || structured.partial) {
    return 'warning';
  }
  if (structured.warnings.length > 0 || structured.dataFreshness.isLastKnown) {
    return 'warning';
  }
  return 'info';
}

export function buildFleetChatCompactSummary(
  structured: FleetChatEvidenceApiResponse,
  toolRecords: readonly FleetChatToolExecutionRecord[],
  locale: 'de' | 'en' = 'de',
): FleetChatCompactSummary {
  const responseType = structured.responseType;
  let facts: FleetChatCompactFact[] = [];
  let statusTone = resolveStatusTone(responseType, structured);

  switch (responseType) {
    case 'LOCATION_SUMMARY': {
      const location = getLocationData(toolRecords);
      if (location) {
        facts = buildLocationFacts(location, locale);
        if (location.isLastKnownLocation) statusTone = 'warning';
      }
      break;
    }
    case 'HEALTH_SUMMARY': {
      const health = getHealthData(toolRecords);
      if (health) {
        facts = buildHealthFacts(health, locale);
        statusTone = healthTone(health.overallStatus);
        if (health.limitedData) statusTone = 'warning';
      }
      break;
    }
    case 'BOOKING_SUMMARY': {
      const booking = getToolData<AiGetVehicleBookingContextData>(
        toolRecords,
        'get_vehicle_booking_context',
      );
      if (booking) {
        facts = buildBookingFacts(booking, locale);
        if (booking.returnOverdue) statusTone = 'critical';
      }
      break;
    }
    case 'OVERDUE_EXPLANATION': {
      const overdue = getOverdueData(toolRecords);
      if (overdue) {
        facts = buildOverdueFacts(overdue, locale);
        statusTone = 'critical';
      }
      break;
    }
    case 'COMBINED_SUMMARY': {
      const location = getLocationData(toolRecords);
      const health = getHealthData(toolRecords);
      const telemetry = getToolData<AiGetVehicleTelemetryStatusData>(
        toolRecords,
        'get_vehicle_telemetry_status',
      );
      const booking = getToolData<AiGetVehicleBookingContextData>(
        toolRecords,
        'get_vehicle_booking_context',
      );
      if (location) facts.push(...buildLocationFacts(location, locale).slice(0, 3));
      if (telemetry) facts.push(...buildTelemetryFacts(telemetry, locale).slice(0, 3));
      if (health) facts.push(...buildHealthFacts(health, locale).slice(0, 3));
      if (booking) facts.push(...buildBookingFacts(booking, locale).slice(0, 3));
      break;
    }
    default:
      break;
  }

  const seen = new Set<string>();
  facts = facts.filter((fact) => {
    if (seen.has(fact.id)) return false;
    seen.add(fact.id);
    return true;
  });

  const headline = structured.text.split('\n').find((line) => line.trim())?.trim()?.slice(0, 220);

  return { headline, statusTone, facts };
}

export function attachCompactSummaryToClientPayload(
  structured: ChatFleetStructuredPayload,
  apiResponse: FleetChatEvidenceApiResponse,
  toolRecords: readonly FleetChatToolExecutionRecord[],
  locale: 'de' | 'en' = 'de',
): ChatFleetStructuredPayload {
  return {
    ...structured,
    compactSummary: buildFleetChatCompactSummary(apiResponse, toolRecords, locale),
  };
}
