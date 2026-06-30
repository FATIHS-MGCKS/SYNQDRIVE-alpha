/**
 * Honest German copy for trip-level Fahrbelastung vs. Fahrverhalten.
 * Presentation only — no detection logic.
 */

import type { TripBehaviorEvent } from '../../../lib/api';
import type { TripTimelineTrip } from './trips.types';
import { hasNativeBehaviorEvents } from './event-context-ui';
import { resolveNotableEventCount } from './behavior-event-count.utils';

export const STRESS_SCORE_MISSING_GENERIC =
  'Für diese Auswertung liegen keine verwertbaren Fahrbelastungsdaten vor.';

export const STRESS_SCORE_MISSING_WITH_NATIVE_EVENTS =
  'Fahrbelastungs-Score nicht verfügbar. Native DIMO-Fahrereignisse wurden separat erkannt.';

export const STRESS_SCORE_MISSING_WITH_BEHAVIOR_EVENTS =
  'Kein belastbarer Fahrbelastungs-Score. Fahrverhalten wird über erkannte Fahrereignisse bewertet.';

export interface StressScoreMissingContext {
  behaviorEventCount?: number;
  hasNativeBehaviorEvents?: boolean;
}

/** Message for the Fahrbelastung panel when no stress score is available. */
export function getStressScoreMissingMessage(
  context: StressScoreMissingContext = {},
): string {
  if (context.hasNativeBehaviorEvents) {
    return STRESS_SCORE_MISSING_WITH_NATIVE_EVENTS;
  }
  if ((context.behaviorEventCount ?? 0) > 0) {
    return STRESS_SCORE_MISSING_WITH_BEHAVIOR_EVENTS;
  }
  return STRESS_SCORE_MISSING_GENERIC;
}

/** Prefer loaded unified event list over trip KPI counters. */
export function resolveBehaviorEventCount(
  events: TripBehaviorEvent[],
  trip?: TripTimelineTrip | null,
  behaviorEventsByTripId?: Record<string, TripBehaviorEvent[]>,
): number {
  const tripId = trip?.id;
  const eventsLoaded =
    tripId != null &&
    behaviorEventsByTripId != null &&
    Object.prototype.hasOwnProperty.call(behaviorEventsByTripId, tripId);
  const count = resolveNotableEventCount(
    trip ?? ({} as TripTimelineTrip),
    events,
    eventsLoaded,
  );
  return count ?? 0;
}

/** Event-count line for the Fahrverhalten summary — never framed as Fahrbelastung. */
export function formatBehaviorEventCountLabel(
  events: TripBehaviorEvent[],
  trip?: TripTimelineTrip | null,
): string {
  const count = resolveBehaviorEventCount(events, trip);
  if (count === 0) return 'Keine erkannten Ereignisse';

  const native = hasNativeBehaviorEvents(events);
  if (native) {
    return count === 1
      ? '1 erkanntes natives Fahrereignis'
      : `${count} erkannte native Fahrereignisse`;
  }

  return count === 1 ? '1 erkanntes Ereignis' : `${count} erkannte Ereignisse`;
}
