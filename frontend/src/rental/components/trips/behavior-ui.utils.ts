import type { TripBehaviorEvent } from '../../../lib/api';
import { getStressLevel, resolveDrivingStressScore } from '../../lib/scoreFormat';
import type { TripTimelineTrip } from './timeline.types';
import { countTripEvents } from './trips-map.utils';
import { formatTripTimeWithSeconds } from './utils/tripFormatters';

export type BehaviorSeverityLevel = 'neutral' | 'watch' | 'notable' | 'critical' | 'abuse';
export type BehaviorOverallStatus =
  | 'unremarkable'
  | 'watch'
  | 'notable'
  | 'critical'
  | 'abuse_suspect';

export const BEHAVIOR_STATUS_LABEL: Record<BehaviorOverallStatus, string> = {
  unremarkable: 'Unauffällig',
  watch: 'Beobachten',
  notable: 'Auffällige Fahrweise',
  critical: 'Kritisch',
  abuse_suspect: 'Missbrauchsverdacht',
};

export const SEVERITY_LABEL: Record<BehaviorSeverityLevel, string> = {
  neutral: 'Neutral',
  watch: 'Beobachten',
  notable: 'Auffällig',
  critical: 'Kritisch',
  abuse: 'Missbrauchsverdacht',
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
  if (type.includes('harsh_brak') || type.includes('hard_brak') || type.includes('full_brak')) {
    return 'Harte Bremsung';
  }
  if (type.includes('brak')) return 'Bremsereignis';
  if (type.includes('harsh_accel') || type.includes('hard_accel')) return 'Starke Beschleunigung';
  if (type.includes('accel')) return 'Beschleunigungsereignis';
  if (type.includes('impact')) return 'Missbrauchsverdacht — möglicher Aufprall';
  if (type.includes('kickdown')) return 'Auffällige Belastung — Kickdown';
  if (type.includes('idle')) return 'Auffällige Belastung — langes Leerlauf';
  if (event.eventCategory === 'ABUSE') return 'Missbrauchsverdacht';
  if (event.eventCategory === 'BRAKING') return 'Harte Bremsung';
  if (event.eventCategory === 'ACCELERATION') return 'Starke Beschleunigung';
  return event.eventType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function eventExplanation(event: TripBehaviorEvent): string {
  const label = eventTypeLabel(event);
  if (event.eventCategory === 'ABUSE') {
    return `${label} während der Fahrt erkannt.`;
  }
  if (event.classification === 'HARD' || event.classification === 'EXTREME') {
    return `${label} mit erhöhter Intensität.`;
  }
  return `${label} im Fahrtverlauf registriert.`;
}

export function hfQualityLabel(trip: TripTimelineTrip): string {
  const status = trip.behaviorEnrichmentStatus;
  if (status === 'SKIPPED_NO_HF_DATA') return 'Nicht verfügbar';
  if (trip.detailsLimited) return 'Eingeschränkt';
  if (trip.behaviorReady) return 'HF verfügbar';
  if (status === 'PENDING' || status === 'IN_PROGRESS') return 'Analyse läuft';
  return 'Unbekannt';
}

export function deriveBehaviorOverallStatus(
  trip: TripTimelineTrip,
  events: TripBehaviorEvent[],
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

  const stress = trip.stressLevel ?? getStressLevel(resolveDrivingStressScore(trip));
  if (stress === 'critical' || stress === 'high') return 'notable';
  if (stress === 'moderate' || worst === 'watch') return 'watch';

  const count = countTripEvents(trip) ?? events.length;
  if (count === 0) return 'unremarkable';
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
  status: TripTimelineTrip['behaviorEnrichmentStatus'],
): string | null {
  switch (status) {
    case 'PENDING':
      return 'Analyse ausstehend';
    case 'IN_PROGRESS':
      return 'Analyse läuft';
    case 'COMPLETED':
      return null;
    case 'SKIPPED_NO_HF_DATA':
      return 'Nicht analysierbar';
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
