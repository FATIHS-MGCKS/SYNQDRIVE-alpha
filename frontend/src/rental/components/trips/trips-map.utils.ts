import type { TripBehaviorEvent } from '../../../lib/api';
import { getStressLabel, resolveDrivingStressScore } from '../../lib/scoreFormat';
import type { TripMapQualityFlags, TripMapTripData } from './trips-map.types';
import type { TripEnrichment } from './trips-map.types';
import {
  formatTripDistance,
  formatTripDuration,
  formatTripTime,
} from './utils/tripFormatters';

export { formatTripTime, formatTripDistance, formatTripDuration };

export function countTripEvents(trip: TripMapTripData): number | null {
  if (trip.behaviorReady === false) return null;
  if (trip.behaviorEnrichedAt || trip.behaviorReady) {
    return (
      (trip.totalAccelerationEvents ?? trip.accelerationEventCount ?? 0) +
      (trip.totalBrakingEvents ?? trip.brakingEventCount ?? 0) +
      (trip.abuseEvents ?? trip.abuseEventCount ?? 0)
    );
  }
  return (trip.harshBrakeCount ?? 0) + (trip.harshAccelCount ?? 0) + (trip.harshCornerCount ?? 0);
}

export function deriveTripMapQuality(
  trip: TripMapTripData | null,
  enrichment: TripEnrichment | undefined,
  routePointsCount: number,
  routeError: string | null,
  behaviorLoading: boolean,
): TripMapQualityFlags {
  const routeAvailable = routePointsCount > 0 && !routeError;
  const matchConfidence = enrichment?.mapMatchConfidence ?? 0;
  const hasMatched = (enrichment?.matchedGeometry?.length ?? 0) > 1;
  const hfStatus = trip?.behaviorEnrichmentStatus;

  return {
    routeAvailable,
    routeIncomplete: Boolean(routeError || trip?.detailsLimited || (routeAvailable && routePointsCount < 3)),
    mapMatched: matchConfidence > 0.5 && hasMatched,
    mapMatchConfidence: matchConfidence > 0 ? matchConfidence : null,
    hfAvailable: trip?.behaviorReady === true,
    hfLimited: hfStatus === 'SKIPPED_NO_HF_DATA' || trip?.detailsLimited === true,
    hfUnavailable: hfStatus === 'SKIPPED_NO_HF_DATA',
    hfAnalyzing: behaviorLoading || hfStatus === 'PENDING' || hfStatus === 'IN_PROGRESS' || trip?.behaviorReady === false,
    gpsGap: Boolean(trip?.gapEnded),
    routeUpdatedAt: enrichment?.enrichedAt ?? trip?.enrichedAt ?? null,
    hasMatchedGeometry: hasMatched,
  };
}

export function tripAssignmentLabel(trip: TripMapTripData): string | null {
  if (trip.isPrivateTrip || trip.assignmentStatus === 'PRIVATE_UNASSIGNED') {
    return 'Privat / nicht zugewiesen';
  }
  if (trip.driverName) return trip.driverName;
  if (trip.assignmentSubjectType === 'BOOKING_CUSTOMER') return 'Buchungskunde';
  if (trip.assignmentSubjectType === 'DRIVER') return 'Fahrer';
  return null;
}

export function tripStressStatusLabel(trip: TripMapTripData): string {
  const score = resolveDrivingStressScore(trip);
  return getStressLabel(score ?? trip.stressLevel, score != null);
}

export function eventOperatorLabel(event: TripBehaviorEvent): string {
  const type = event.eventType.toUpperCase();
  if (event.eventCategory === 'ABUSE') {
    if (type.includes('IMPACT')) return 'Missbrauchsverdacht — möglicher Aufprall';
    if (type.includes('KICKDOWN')) return 'Auffällige Belastung — Kickdown';
    if (type.includes('IDLE')) return 'Auffällige Belastung — langes Leerlauf';
    return 'Missbrauchsverdacht';
  }
  if (event.eventCategory === 'BRAKING') {
    if (event.classification === 'HARD' || event.classification === 'EXTREME') return 'Harte Bremsung';
    return 'Bremsereignis';
  }
  if (event.eventCategory === 'ACCELERATION') {
    if (event.classification === 'HARD' || event.classification === 'EXTREME') return 'Starke Beschleunigung';
    return 'Beschleunigungsereignis';
  }
  return event.eventType.replace(/_/g, ' ');
}

export function eventSeverityTone(
  classification: TripBehaviorEvent['classification'],
): 'muted' | 'watch' | 'critical' {
  if (classification === 'EXTREME' || classification === 'CRITICAL' || classification === 'SEVERE') {
    return 'critical';
  }
  if (classification === 'HARD' || classification === 'WARNING' || classification === 'MODERATE') {
    return 'watch';
  }
  return 'muted';
}

export function behaviorSectionKey(event: TripBehaviorEvent): string {
  if (event.eventCategory === 'ACCELERATION') return 'accel';
  if (event.eventCategory === 'BRAKING') return 'brake';
  return 'abuse';
}

export function createEndpointMarker(label: 'A' | 'B', accent: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'trips-map-endpoint-marker';
  el.innerHTML = `<span class="trips-map-endpoint-marker__label">${label}</span>`;
  el.style.setProperty('--endpoint-accent', accent);
  return el;
}

export function createDirectionMarker(bearingDeg: number): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'trips-map-direction-marker';
  el.innerHTML = '<span aria-hidden="true">›</span>';
  el.style.transform = `rotate(${bearingDeg}deg)`;
  return el;
}

export function bearingBetween(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function createEventMarkerElement(
  event: TripBehaviorEvent,
  isDark: boolean,
  onClick: () => void,
  isSelected = false,
): HTMLButtonElement {
  const isAbuse = event.eventCategory === 'ABUSE';
  const isAccel = event.eventCategory === 'ACCELERATION';
  const severity = eventSeverityTone(event.classification);
  const size = isAbuse && severity === 'critical' ? 22 : isAbuse ? 20 : 16;

  const el = document.createElement('button');
  el.type = 'button';
  el.className = `trips-map-event-marker trips-map-event-marker--${severity}${isAbuse ? ' trips-map-event-marker--abuse' : isAccel ? ' trips-map-event-marker--accel' : ' trips-map-event-marker--brake'}${isSelected ? ' trips-map-event-marker--selected' : ''}`;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.setAttribute('aria-label', eventOperatorLabel(event));
  el.innerHTML = isAbuse ? '!' : isAccel ? '▲' : '▼';
  if (isDark) el.classList.add('trips-map-event-marker--dark');
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return el;
}
