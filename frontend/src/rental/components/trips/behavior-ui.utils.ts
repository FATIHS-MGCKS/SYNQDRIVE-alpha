import type {
  TripAssessmentReasonCategory,
  TripAssessmentStatus,
  TripBehaviorEvent,
  TripEvidenceCase,
  TripEvidenceCaseSource,
  TripEvidenceConfidence,
  TripEvidenceLevel,
} from '../../../lib/api';
import type { TripTimelineTrip } from './timeline.types';
import { formatTripAssessmentReviewHint } from './trip-assessment-reason-copy';
import { formatTripTimeWithSeconds } from './utils/tripFormatters';
import { shouldRenderContextBlock } from './event-context-ui';

export type BehaviorSeverityLevel = 'neutral' | 'watch' | 'notable' | 'critical' | 'abuse';
export type BehaviorOverallStatus =
  | 'unremarkable'
  | 'not_assessable'
  | 'watch'
  | 'notable'
  | 'critical'
  | 'abuse_suspect';

/** Canonical Gesamtbewertung labels from backend tripAssessment.status. */
export const TRIP_ASSESSMENT_STATUS_LABEL: Record<TripAssessmentStatus, string> = {
  UNAUFFAELLIG: 'Unauffällig',
  BEOBACHTEN: 'Beobachten',
  AUFFAELLIG: 'Auffällig',
  KRITISCH: 'Kritisch',
  PRUEFHINWEIS: 'Prüfhinweis',
  NICHT_BEWERTBAR: 'Nicht bewertbar',
};

/** Fallback Gesamtbewertung labels when tripAssessment is not yet on the trip. */
export const GESAMTBEWERTUNG_FALLBACK_LABEL: Record<BehaviorOverallStatus, string> = {
  unremarkable: 'Unauffällig',
  not_assessable: 'Nicht bewertbar',
  watch: 'Beobachten',
  notable: 'Auffällig',
  critical: 'Kritisch',
  abuse_suspect: 'Prüfhinweis',
};

export const BEHAVIOR_STATUS_LABEL: Record<BehaviorOverallStatus, string> = {
  unremarkable: 'Unauffällig',
  not_assessable: 'Nicht belastbar bewertet',
  watch: 'Beobachten',
  notable: 'Auffälliges Fahrverhalten',
  critical: 'Kritisches Fahrverhalten',
  abuse_suspect: 'Prüfhinweis',
};

export const EVIDENCE_LEVEL_LABEL: Record<TripEvidenceLevel, string> = {
  NONE: 'Keine',
  INFO: 'Info',
  CHECK_RECOMMENDED: 'Prüfung empfohlen',
  MISUSE_SUSPECTED: 'Verdacht',
  DAMAGE_RISK: 'Technisches Risiko',
  CRITICAL_DAMAGE_RISK: 'Kritisch',
};

export const EVIDENCE_LEVEL_CARD_TITLE: Record<
  Exclude<TripEvidenceLevel, 'NONE' | 'INFO'>,
  string
> = {
  CHECK_RECOMMENDED: 'Auffälliges Fahrmuster',
  MISUSE_SUSPECTED: 'Missbrauchsverdacht',
  DAMAGE_RISK: 'Schadenverdacht',
  CRITICAL_DAMAGE_RISK: 'Kritischer Schadenverdacht',
};

export const EVIDENCE_SOURCE_LABEL: Record<TripEvidenceCaseSource, string> = {
  NATIVE_EVENT: 'Natives Ereignis',
  HF_RECONSTRUCTION: 'HF-Rekonstruktion',
  CONTEXT_ENRICHMENT: 'Ereigniskontext',
  MIXED: 'Gemischte Quellen',
};

export const REVIEW_HINT_DEFAULT =
  'Hinweis zur Prüfung — kein automatisierter Vorwurf.';

export function evidenceConfidenceLabel(confidence: TripEvidenceConfidence): string {
  switch (confidence) {
    case 'HIGH':
      return 'Hohe Sicherheit';
    case 'MEDIUM':
      return 'Mittlere Sicherheit';
    default:
      return 'Geringe Sicherheit';
  }
}

export function resolveEvidenceCardTitle(evidenceCase: TripEvidenceCase | null | undefined): string {
  if (!evidenceCase) return 'Prüfhinweis';
  if (
    evidenceCase.evidenceLevel === 'CHECK_RECOMMENDED' ||
    evidenceCase.evidenceLevel === 'MISUSE_SUSPECTED' ||
    evidenceCase.evidenceLevel === 'DAMAGE_RISK' ||
    evidenceCase.evidenceLevel === 'CRITICAL_DAMAGE_RISK'
  ) {
    return evidenceCase.title || EVIDENCE_LEVEL_CARD_TITLE[evidenceCase.evidenceLevel];
  }
  return evidenceCase.title || 'Prüfhinweis';
}

export function formatEvidenceMeasurements(
  measurements: TripEvidenceCase['measurements'],
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  if (measurements.rpm != null) rows.push({ label: 'Max Drehzahl', value: `${measurements.rpm} rpm` });
  if (measurements.throttle != null) {
    rows.push({ label: 'Max Gaspedal', value: `${measurements.throttle} %` });
  }
  if (measurements.engineLoad != null) {
    rows.push({ label: 'Max Motorlast', value: `${measurements.engineLoad} %` });
  }
  if (measurements.coolant != null) {
    rows.push({ label: 'Kühlmittel', value: `${measurements.coolant} °C` });
  }
  if (measurements.speedBeforeAfter) {
    rows.push({ label: 'Geschwindigkeit', value: measurements.speedBeforeAfter });
  }
  if (measurements.durationMs != null) {
    rows.push({
      label: 'Dauer',
      value: `${Math.max(1, Math.round(measurements.durationMs / 1000))} s`,
    });
  }
  return rows;
}


export const SEVERITY_LABEL: Record<BehaviorSeverityLevel, string> = {
  neutral: 'Neutral',
  watch: 'Beobachten',
  notable: 'Auffällig',
  critical: 'Kritisch',
  abuse: 'Prüfhinweis',
};

const CLASSIFICATION_RANK: Record<string, number> = {
  LIGHT: 1,
  MODERATE: 2,
  WARNING: 3,
  HARD: 4,
  SEVERE: 5,
  EXTREME: 6,
  CRITICAL: 7,
};

export function classificationToSeverity(
  classification: TripBehaviorEvent['classification'],
  category?: TripBehaviorEvent['eventCategory'],
): BehaviorSeverityLevel {
  if (category === 'ABUSE') return 'abuse';
  if (classification === 'EXTREME' || classification === 'CRITICAL' || classification === 'SEVERE') {
    return 'critical';
  }
  if (classification === 'HARD' || classification === 'WARNING') return 'notable';
  if (classification === 'MODERATE') return 'watch';
  return 'neutral';
}

export function severityRank(level: BehaviorSeverityLevel): number {
  switch (level) {
    case 'abuse': return 5;
    case 'critical': return 4;
    case 'notable': return 3;
    case 'watch': return 2;
    default: return 1;
  }
}

export function eventTypeLabel(event: TripBehaviorEvent): string {
  const type = event.eventType.toLowerCase();
  // Concrete abuse suspicion types first (operator-facing, specific).
  if (type.includes('cold_engine')) return 'Kaltmotor-Missbrauch';
  if (type.includes('overheat')) return 'Überhitzung';
  if (type.includes('impact')) return 'Möglicher Aufprall';
  if (type.includes('kickdown')) return 'Kickdown';
  if (type.includes('high_rpm')) return 'Hohe Drehzahl';
  if (type.includes('launch')) return 'Launch-Start';
  if (type.includes('idle')) return 'Langer Leerlauf';
  if (type.includes('harsh_brak') || type.includes('hard_brak') || type.includes('full_brak')) {
    return 'Harte Bremsung';
  }
  if (type.includes('brak')) return 'Bremsereignis';
  if (type.includes('harsh_accel') || type.includes('hard_accel')) return 'Starke Beschleunigung';
  if (type.includes('accel')) return 'Beschleunigungsereignis';
  if (event.eventCategory === 'ABUSE') return 'Missbrauchsrelevantes Ereignis';
  if (event.eventCategory === 'BRAKING') return 'Harte Bremsung';
  if (event.eventCategory === 'ACCELERATION') return 'Starke Beschleunigung';
  return event.eventType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function eventExplanation(event: TripBehaviorEvent): string {
  const type = event.eventType.toLowerCase();
  if (type.includes('cold_engine')) {
    if (type.includes('rpm')) return 'Hohe Drehzahl bei kaltem Motor erkannt.';
    if (type.includes('throttle')) return 'Volllast bei kaltem Motor erkannt.';
    return 'Hohe Last bei kaltem Motor erkannt.';
  }
  if (type.includes('overheat')) return 'Motorüberhitzung erkannt.';
  if (type.includes('impact')) return 'Möglicher Aufprall erkannt.';
  if (type.includes('kickdown')) return 'Starkes Kickdown-Manöver erkannt.';
  if (type.includes('high_rpm')) return 'Dauerhaft hohe Drehzahl erkannt.';
  if (type.includes('idle')) return 'Langer Leerlauf erkannt.';
  const label = eventTypeLabel(event);
  if (event.eventCategory === 'ABUSE') return `${label} während der Fahrt erkannt.`;
  if (event.classification === 'HARD' || event.classification === 'EXTREME') {
    return `${label} mit erhöhter Intensität.`;
  }
  return `${label} im Fahrtverlauf registriert.`;
}

export interface EventEvidenceItem {
  label: string;
  value: string;
}

/**
 * Legacy point-in-time ingest values (rpm/throttle/coolant at event time).
 * Not the T±30s context window — use only as fallback or under "Messwerte".
 */
export function formatLegacyMeasurements(event: TripBehaviorEvent): EventEvidenceItem[] {
  const items: EventEvidenceItem[] = [];
  const legacy = event.legacyIngestEvidence;
  const rpm = legacy?.rpm ?? event.maxEngineRpm;
  const throttle = legacy?.throttlePct ?? event.maxThrottlePos;
  const coolant =
    legacy?.coolantC ??
    event.maxCoolantTemp ??
    (typeof event.metadataJson?.coolantC === 'number' ? event.metadataJson.coolantC : null);

  if (rpm != null) {
    items.push({ label: 'Drehzahl', value: `${Math.round(rpm)} rpm` });
  }
  if (throttle != null) {
    items.push({ label: 'Gaspedal', value: `${Math.round(throttle)} %` });
  }
  if (coolant != null) {
    items.push({ label: 'Kühlmittel', value: `${Math.round(coolant)} °C` });
  }
  return items;
}

/**
 * Concrete, non-fabricated evidence metrics for a behavior event.
 * Legacy rpm/throttle/coolant are omitted when a context assessment is present —
 * those values are shown under Kontextbewertung or secondary "Messwerte".
 */
export function formatEventEvidence(event: TripBehaviorEvent): EventEvidenceItem[] {
  const items: EventEvidenceItem[] = [];
  const hasContext = shouldRenderContextBlock(event.contextAssessment);

  if (!hasContext) {
    items.push(...formatLegacyMeasurements(event));
  }

  if (event.durationMs != null && event.durationMs > 0) {
    items.push({ label: 'Dauer', value: `${Math.max(1, Math.round(event.durationMs / 1000))} s` });
  }
  return items;
}

/** Whether legacy ingest measurements exist on the event row. */
export function hasLegacyMeasurements(event: TripBehaviorEvent): boolean {
  return formatLegacyMeasurements(event).length > 0;
}

export function hfQualityLabel(trip: TripTimelineTrip): string {
  if (trip.tripAnalysisLabel) return trip.tripAnalysisLabel;
  const status = trip.behaviorEnrichmentStatus;
  if (status === 'SKIPPED_NO_HF_DATA') return 'Nicht verfügbar';
  if (trip.detailsLimited) return 'Eingeschränkt';
  if (trip.behaviorReady) return 'Telemetrie verfügbar';
  if (trip.analysisInProgress || status === 'PENDING' || status === 'IN_PROGRESS') {
    return 'Analyse läuft noch';
  }
  return 'Unbekannt';
}

export function isTripAnalysisRunning(trip: TripTimelineTrip): boolean {
  if (trip.analysisInProgress === true) return true;
  const status = trip.tripAnalysisStatus;
  if (status === 'PENDING' || status === 'IN_PROGRESS') return true;
  if (!trip.behaviorReady && status === 'PARTIAL') return false;
  return trip.behaviorEnrichmentStatus === 'PENDING' || trip.behaviorEnrichmentStatus === 'IN_PROGRESS';
}

/**
 * Optional data-quality gate. When provided and `assessable === false`, an
 * otherwise-clean trip is reported as "Nicht belastbar bewertet" instead of
 * "Unauffällig" — we never claim a trip is clean without a reliable source.
 */
export interface BehaviorOverallStatusOptions {
  assessable?: boolean;
}

export function deriveBehaviorOverallStatus(
  trip: TripTimelineTrip,
  events: TripBehaviorEvent[],
  options?: BehaviorOverallStatusOptions,
): BehaviorOverallStatus {
  const abuseInTrip = (trip.abuseEvents ?? trip.abuseEventCount ?? 0) > 0;
  const abuseInList = events.some((e) => e.eventCategory === 'ABUSE');
  if (abuseInTrip || abuseInList) return 'abuse_suspect';

  const worst = events.reduce<BehaviorSeverityLevel>((acc, ev) => {
    const level = classificationToSeverity(ev.classification, ev.eventCategory);
    return severityRank(level) > severityRank(acc) ? level : acc;
  }, 'neutral');

  if (worst === 'critical') return 'critical';
  if (worst === 'notable' || worst === 'abuse') return 'notable';
  if (worst === 'watch') return 'watch';

  if (events.length === 0) {
    return 'not_assessable';
  }

  // Loaded behavior events with no concerning severity — conduct unremarkable.
  return 'unremarkable';
}

export function findSeverestEvent(events: TripBehaviorEvent[]): TripBehaviorEvent | null {
  if (!events.length) return null;
  return [...events].sort((a, b) => {
    const rankA = CLASSIFICATION_RANK[a.classification] ?? 0;
    const rankB = CLASSIFICATION_RANK[b.classification] ?? 0;
    if (rankB !== rankA) return rankB - rankA;
    if (a.eventCategory === 'ABUSE' && b.eventCategory !== 'ABUSE') return -1;
    if (b.eventCategory === 'ABUSE' && a.eventCategory !== 'ABUSE') return 1;
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  })[0];
}

export function countCriticalEvents(events: TripBehaviorEvent[]): number {
  return events.filter(
    (e) =>
      e.classification === 'EXTREME' ||
      e.classification === 'CRITICAL' ||
      e.classification === 'SEVERE' ||
      e.eventCategory === 'ABUSE',
  ).length;
}

export function formatBehaviorTime(iso: string): string {
  return formatTripTimeWithSeconds(iso);
}

export function enrichmentStatusLabel(
  trip: TripTimelineTrip,
): string | null {
  if (trip.tripAnalysisLabel) {
    if (trip.tripAnalysisStatus === 'COMPLETED') return null;
    return trip.tripAnalysisLabel;
  }
  const status = trip.behaviorEnrichmentStatus;
  switch (status) {
    case 'PENDING':
    case 'IN_PROGRESS':
      return 'Analyse läuft noch';
    case 'COMPLETED':
      return null;
    case 'SKIPPED_NO_HF_DATA':
      return 'Nicht genügend Daten';
    case 'FAILED_TRANSIENT':
    case 'FAILED_PERMANENT':
      return 'Analyse fehlgeschlagen';
    default:
      return null;
  }
}

export function sortBehaviorEvents(events: TripBehaviorEvent[]): TripBehaviorEvent[] {
  return [...events].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

export interface GesamtbewertungDisplay {
  label: string;
  primaryReason: string | null;
  reasonCategory: TripAssessmentReasonCategory | null;
  /** True when served from backend tripAssessment (Phase 1 canonical truth). */
  fromBackend: boolean;
}

/** Gesamtbewertung — prefers backend tripAssessment, falls back to legacy UI derivation. */
export function resolveGesamtbewertungDisplay(
  trip: TripTimelineTrip,
  events: TripBehaviorEvent[],
  options?: BehaviorOverallStatusOptions,
): GesamtbewertungDisplay {
  if (trip.tripAssessment) {
    return {
      label: trip.tripAssessment.label,
      primaryReason: trip.tripAssessment.primaryReason,
      reasonCategory: trip.tripAssessment.reasonCategory ?? null,
      fromBackend: true,
    };
  }

  const status = deriveBehaviorOverallStatus(trip, events, options);
  return {
    label: GESAMTBEWERTUNG_FALLBACK_LABEL[status],
    primaryReason: null,
    reasonCategory: null,
    fromBackend: false,
  };
}

/** Fahrverhalten summary — event/behavior layer only (not Gesamtbewertung, not Missbrauch). */
export function deriveDrivingBehaviorLabel(events: TripBehaviorEvent[]): string {
  const drivingEvents = events.filter((event) => event.eventCategory !== 'ABUSE');

  if (events.length === 0) return 'Keine Auffälligkeiten';

  const worst = drivingEvents.reduce<BehaviorSeverityLevel>((acc, ev) => {
    const level = classificationToSeverity(ev.classification, ev.eventCategory);
    return severityRank(level) > severityRank(acc) ? level : acc;
  }, 'neutral');

  if (drivingEvents.length === 0) {
    return events.some((event) => event.abuseRelevant)
      ? 'Missbrauchsrelevante Ereignisse erkannt'
      : 'Keine Auffälligkeiten';
  }

  if (worst === 'critical') return 'Kritisches Fahrverhalten';
  if (worst === 'notable') return 'Auffälliges Fahrverhalten';
  if (worst === 'watch') return 'Unauffällig';
  return 'Keine Auffälligkeiten';
}

/** Prüfhinweise summary for Trip Analyse / evidence rows. */
export function deriveReviewHintSummary(
  trip: TripTimelineTrip,
  events: TripBehaviorEvent[],
): string | null {
  if (trip.tripAssessment?.status === 'PRUEFHINWEIS') {
    return formatTripAssessmentReviewHint(
      trip.tripAssessment.reasonCategory,
      trip.tripAssessment.primaryReason,
    );
  }

  const misuseCases = trip.tripAssessment?.signals.misuseCases ?? 0;
  const abuseRelevant = events.filter((event) => event.abuseRelevant).length;
  if (misuseCases > 0 || abuseRelevant > 0) {
    return 'Prüfung empfohlen — kein automatisierter Vorwurf';
  }

  return null;
}

export function hasReviewHints(trip: TripTimelineTrip, events: TripBehaviorEvent[]): boolean {
  return deriveReviewHintSummary(trip, events) != null;
}
