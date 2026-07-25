import type { FleetChatResponseType, FleetChatStructuredPayload } from './fleet-chat-response.types';

const RESPONSE_TYPE_LABELS: Record<
  FleetChatResponseType,
  { de: string; en: string }
> = {
  DIRECT_ANSWER: { de: 'Direkte Antwort', en: 'Direct answer' },
  LOCATION_SUMMARY: { de: 'Positionsübersicht', en: 'Location summary' },
  HEALTH_SUMMARY: { de: 'Gesundheitsübersicht', en: 'Health summary' },
  OVERDUE_EXPLANATION: { de: 'Überfällige Rückgabe', en: 'Overdue return' },
  BOOKING_SUMMARY: { de: 'Buchungsübersicht', en: 'Booking summary' },
  COMBINED_SUMMARY: { de: 'Kombinierte Übersicht', en: 'Combined summary' },
  PARTIAL_DATA: { de: 'Teildaten', en: 'Partial data' },
  INCONSISTENT_STATE: { de: 'Inkonsistenter Zustand', en: 'Inconsistent state' },
  PERMISSION_RESTRICTED: { de: 'Berechtigung eingeschränkt', en: 'Permission restricted' },
  AMBIGUITY_QUESTION: { de: 'Rückfrage', en: 'Clarification' },
  TEMPORARY_UNAVAILABLE: { de: 'Vorübergehend nicht verfügbar', en: 'Temporarily unavailable' },
};

const FRESHNESS_LABELS: Record<string, { de: string; en: string }> = {
  live: { de: 'Live', en: 'Live' },
  standby: { de: 'Standby', en: 'Standby' },
  signal_delayed: { de: 'Signal verzögert', en: 'Signal delayed' },
  offline: { de: 'Offline', en: 'Offline' },
  no_signal: { de: 'Kein Signal', en: 'No signal' },
  unknown: { de: 'Unbekannt', en: 'Unknown' },
};

const INTERNAL_TOOL_PATTERN =
  /^(get_|explain_|ai_|fleet_)[a-z0-9_]+$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function fleetChatResponseTypeLabel(
  responseType: FleetChatResponseType,
  locale: 'de' | 'en' = 'de',
): string {
  const labels = RESPONSE_TYPE_LABELS[responseType];
  return locale === 'en' ? labels.en : labels.de;
}

export function isWarningResponseType(responseType: FleetChatResponseType): boolean {
  return (
    responseType === 'PARTIAL_DATA' ||
    responseType === 'INCONSISTENT_STATE' ||
    responseType === 'PERMISSION_RESTRICTED' ||
    responseType === 'TEMPORARY_UNAVAILABLE'
  );
}

export function sanitizeUserVisibleText(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9]+/gi, 'sk-[redacted]')
    .trim();
}

export function sanitizeSourceLabel(label: string, locale: 'de' | 'en' = 'de'): string {
  const trimmed = label.trim();
  if (!trimmed) return locale === 'en' ? 'Fleet data' : 'Flottendaten';
  if (INTERNAL_TOOL_PATTERN.test(trimmed)) {
    return locale === 'en' ? 'Fleet data' : 'Flottendaten';
  }
  if (trimmed.includes('(domain tool)')) {
    return trimmed.replace(' (domain tool)', '').trim();
  }
  return trimmed;
}

export function formatFleetDataAgeLabel(
  freshness: FleetChatStructuredPayload['dataFreshness'],
  locale: 'de' | 'en' = 'de',
): string {
  if (freshness.label?.trim()) {
    return freshness.label.trim();
  }

  const freshnessKey = freshness.freshness?.toLowerCase() ?? 'unknown';
  const freshnessLabel =
    FRESHNESS_LABELS[freshnessKey]?.[locale === 'en' ? 'en' : 'de'] ??
    (locale === 'en' ? 'Unknown' : 'Unbekannt');

  if (freshness.isLastKnown) {
    return locale === 'en'
      ? `Last known · ${freshnessLabel}`
      : `Letzte bekannte Position · ${freshnessLabel}`;
  }

  if (freshness.observedAt) {
    const observed = formatObservedAt(freshness.observedAt, locale);
    return locale === 'en'
      ? `Data from ${observed} · ${freshnessLabel}`
      : `Daten vom ${observed} · ${freshnessLabel}`;
  }

  return locale === 'en' ? `Data freshness: ${freshnessLabel}` : `Datenfrische: ${freshnessLabel}`;
}

function formatObservedAt(iso: string, locale: 'de' | 'en'): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ms));
}

export function formatVehicleRefLabel(
  vehicle: FleetChatStructuredPayload['vehicle'],
  locale: 'de' | 'en' = 'de',
): string | null {
  if (!vehicle) return null;
  const plate = vehicle.licensePlate?.trim();
  const name = vehicle.displayName?.trim();
  if (plate && name) return `${plate} · ${name}`;
  if (plate) return plate;
  if (name) return name;
  return null;
}

export function containsInternalId(text: string): boolean {
  return UUID_PATTERN.test(text);
}

export function mapProgressContent(type: string, content: string): string {
  if (content && !INTERNAL_TOOL_PATTERN.test(content)) {
    return content;
  }
  const fallback: Record<string, { de: string; en: string }> = {
    thinking: { de: 'Anfrage wird analysiert…', en: 'Analyzing request…' },
    routing: { de: 'Absicht wird erkannt…', en: 'Detecting intent…' },
    tools: { de: 'Flottendaten werden geladen…', en: 'Loading fleet data…' },
    composing: { de: 'Antwort wird zusammengestellt…', en: 'Composing response…' },
    token: { de: 'Antwort wird formuliert…', en: 'Composing answer…' },
  };
  return fallback[type]?.de ?? content;
}

export function buildSampleStructuredPayload(
  responseType: FleetChatResponseType,
  overrides: Partial<FleetChatStructuredPayload> = {},
): FleetChatStructuredPayload {
  return {
    responseType,
    vehicle: { displayName: 'Golf 1', licensePlate: 'B-XY 1234' },
    dataFreshness: {
      freshness: 'live',
      observedAt: '2026-07-24T10:00:00.000Z',
      isLastKnown: false,
      label: null,
    },
    sources: [{ label: 'Fahrzeug-Gesundheit' }],
    warnings: [],
    partial: false,
    generatedAt: '2026-07-24T10:05:00.000Z',
    usedDeterministicFallback: false,
    ...overrides,
  };
}
